import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { escapeHtml, truncateUrl, getStatusClass, getAuthInfo } from "./utils";

import { C8yPact, isPact } from "../../../src/shared/c8ypact";
import type { C8yPactRecord } from "../../../src/shared/c8ypact";
import { get_i } from "../../../src/shared/util";
import { C8yDefaultPact } from "../../../src/shared/c8ypact/c8ydefaultpact";

interface PanelState {
  panel: vscode.WebviewPanel | null;
  currentDocument: vscode.TextDocument | null;
  isDisposed: boolean;
}

interface Stats {
  methods: Set<string>;
  statusCodes: Set<number>;
  userAliases: Set<string>;
  endpoints: Set<string>;
  totalRequests: number;
}

export function activate(context: vscode.ExtensionContext): void {
  console.log("C8yPact Analyzer is now active");

  // Store a single shared panel - use object so reference persists
  const panelState: PanelState = {
    panel: null,
    currentDocument: null,
    isDisposed: true,
  };

  const disposable = vscode.commands.registerCommand(
    "c8yPactAnalyzer.analyze",
    async function () {
      try {
        console.log("Command 'c8yPactAnalyzer.analyze' invoked");
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
          vscode.window.showErrorMessage("No active editor found");
          return;
        }

        const document = editor.document;
        console.log("Analyzing document:", document.uri.fsPath);
        await analyzePactDocument(document, context, panelState);
      } catch (error) {
        console.error("Error in c8yPactAnalyzer.analyze command:", error);
        vscode.window.showErrorMessage(
          `Command failed: ${(error as Error).message}`
        );
      }
    }
  );

  // Auto-update analyzer when switching between files, but only if panel is already open
  const autoAnalyzeDisposable = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      console.log("Active text editor changed:", editor?.document?.fileName);
      // Only auto-update if there's already a panel open
      if (!panelState.panel || panelState.isDisposed) {
        console.log("No panel open or panel disposed, skipping auto-analyze");
        return;
      }

      if (editor && editor.document.languageId === "json") {
        const document = editor.document;
        const filePath = document.uri.fsPath;
        console.log("Checking JSON file:", filePath);

        if (filePath.endsWith(".json")) {
          try {
            const fileContent = fs.readFileSync(filePath, "utf8");
            console.log("File content length:", fileContent.length);
            const p = C8yDefaultPact.from(fileContent);
            if (isPact(p)) {
              console.log("Valid pact found, analyzing...");
              analyzePactDocument(document, context, panelState);
            } else {
              console.log("Not a valid pact file");
            }
          } catch (error) {
            console.log("Error reading/parsing file:", error);
            // Silently fail for non-pact or invalid JSON files
          }
        } else {
          console.log("File doesn't end with .json");
        }
      } else {
        console.log("No editor or not JSON language");
      }
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(autoAnalyzeDisposable);
}

/**
 * Analyze a pact document
 */
async function analyzePactDocument(
  document: vscode.TextDocument,
  context: vscode.ExtensionContext,
  panelState: PanelState
): Promise<void> {
  console.log("analyzePactDocument called for:", document.uri.fsPath);
  const filePath = document.uri.fsPath;

  // Check if file is JSON
  if (!filePath.endsWith(".json")) {
    vscode.window.showWarningMessage("Please open a JSON file to analyze");
    return;
  }

  try {
    let pact: C8yPact;
    try {
      console.log("Reading file:", filePath);
      // Read the file content
      const fileContent = fs.readFileSync(filePath, "utf8");
      console.log("File content length:", fileContent.length);
      pact = C8yDefaultPact.from(fileContent);
      console.log("Pact parsed, checking if valid...");
      if (!isPact(pact)) {
        throw new Error("Not a valid C8yPact document.");
      }
      console.log("Valid pact found with", pact.records?.length || 0, "records");
    } catch (e) {
      console.error("Error parsing pact:", e);
      vscode.window.showErrorMessage(
        `This does not appear to be a valid C8yPact file. ${
          (e as Error).message
        }`
      );
      return;
    }

    let panel = panelState.panel;

    // Check if we already have a panel and it's still visible
    if (panel && !panelState.isDisposed) {
      // Reuse existing panel - just update content and title
      panel.title = `Pact Analyzer: ${path.basename(filePath)}`;
      panel.webview.html = getWebviewContent(
        pact,
        panel.webview,
        context.extensionUri
      );
      panel.reveal(vscode.ViewColumn.Two, true);
      panelState.currentDocument = document;
    } else {
      // Create new panel
      panel = vscode.window.createWebviewPanel(
        "c8yPactAnalyzer",
        `C8yPact Analyzer: ${path.basename(filePath)}`,
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      // Mark as disposed when closed
      panel.onDidDispose(() => {
        panelState.panel = null;
        panelState.currentDocument = null;
        panelState.isDisposed = true;
      });

      // Set the webview content
      panel.webview.html = getWebviewContent(
        pact,
        panel.webview,
        context.extensionUri
      );

      panelState.panel = panel;
      panelState.currentDocument = document;
      panelState.isDisposed = false;

      // Handle messages from the webview
      panel.webview.onDidReceiveMessage(
        (message: any) => {
          switch (message.command) {
            case "copyToClipboard":
              vscode.env.clipboard.writeText(message.text);
              vscode.window.showInformationMessage("Copied to clipboard");
              break;
            case "exportRecord":
              exportRecord(message.record);
              break;
            case "navigateToSource":
              // Use the current document from panelState
              navigateToSourceInFile(
                panelState.currentDocument!,
                message.recordIndex,
                message.path
              );
              break;
          }
        },
        undefined,
        context.subscriptions
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error analyzing pact file: ${(error as Error).message}`
    );
  }
}

/**
 * Navigate to a specific location in the source JSON file
 */
async function navigateToSourceInFile(
  document: vscode.TextDocument,
  recordIndex: number,
  path: string
): Promise<void> {
  try {
    const text = document.getText();
    const position = findJsonPath(text, recordIndex, path);

    if (position) {
      // Find if document is already open in an editor
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document.uri.toString() === document.uri.toString()
      );

      const range = new vscode.Range(position, position);

      if (editor) {
        // Document is already visible - just update selection silently
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      } else {
        // Document not visible - open it in column one
        await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false,
          preview: false,
          selection: range,
        });
      }
    } else {
      vscode.window.showWarningMessage(
        `Could not find ${path} for record at index ${recordIndex}`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error navigating to source: ${(error as Error).message}`
    );
  }
}

/**
 * Find the position of a specific path within a record in the JSON file
 */
function findJsonPath(
  text: string,
  recordIndex: number,
  path: string
): vscode.Position | null {
  const lines = text.split("\n");

  // First, find the "records" array
  let recordsArrayStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"records"') && lines[i].includes(":")) {
      recordsArrayStart = i;
      break;
    }
  }

  if (recordsArrayStart === -1) {
    return null;
  }

  // Find the opening bracket of the records array
  let arrayBracketLine = -1;
  for (let i = recordsArrayStart; i < lines.length; i++) {
    if (lines[i].includes("[")) {
      arrayBracketLine = i;
      break;
    }
  }

  if (arrayBracketLine === -1) {
    return null;
  }

  // Now find the Nth record (recordIndex) within the records array
  let currentRecordIndex = -1;
  let recordStart = -1;
  let recordEnd = -1;
  let braceDepth = 0;
  let inRecord = false;

  for (let i = arrayBracketLine + 1; i < lines.length; i++) {
    const line = lines[i];

    // Count all braces in the line
    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === "{") {
        if (braceDepth === 0) {
          // Starting a new record
          currentRecordIndex++;
          if (currentRecordIndex === recordIndex) {
            recordStart = i;
            inRecord = true;
          }
        }
        braceDepth++;
      } else if (char === "}") {
        braceDepth--;
        if (braceDepth === 0 && inRecord) {
          // Ending the record we're looking for
          recordEnd = i;
          break;
        }
      }
    }

    if (recordEnd !== -1) {
      break;
    }

    // Stop if we hit the end of the records array
    if (line.includes("]") && braceDepth === 0) {
      break;
    }
  }

  if (recordStart === -1 || recordEnd === -1) {
    return null;
  }

  // Now search for the specific path within the record
  const pathParts = path.split(".");
  let currentLine = recordStart;

  for (let partIndex = 0; partIndex < pathParts.length; partIndex++) {
    const part = pathParts[partIndex];
    let found = false;

    for (let i = currentLine; i <= recordEnd; i++) {
      const line = lines[i];

      // Check if this line contains our key at the right nesting level
      if (line.includes(`"${part}"`) && line.includes(":")) {
        // Found the key, this is our target line
        currentLine = i;
        found = true;
        break;
      }
    }

    if (!found) {
      return null;
    }
  }

  return new vscode.Position(currentLine, 0);
}

/**
 * Export a record to a separate file
 */
async function exportRecord(record: C8yPactRecord): Promise<void> {
  const fileName = `pact-record-${record.id || Date.now()}.json`;
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(fileName),
    filters: {
      JSON: ["json"],
    },
  });

  if (uri) {
    fs.writeFileSync(uri.fsPath, JSON.stringify(record, null, 2));
    vscode.window.showInformationMessage("Record exported successfully");
  }
}

/**
 * Generate the HTML content for the webview
 */
function getWebviewContent(
  pactData: C8yPact,
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "style.css")
  );
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "out", "webview.js")
  );

  const info = pactData.info || {};
  const records = pactData.records || [];

  // Calculate statistics
  const stats = calculateStats(records);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>C8yPact Analyzer</title>
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <h1>${escapeHtml(
                  (info.title || []).join(" › ") || "Pact Analysis"
                )}</h1>
                <div class="pact-id">${escapeHtml(pactData.id || "N/A")}</div>
            </div>
        </header>
        <section class="info-section">
            <div class="info-row">
                ${createInfoItem(
                  "Base URL",
                  info.baseUrl || "N/A",
                  "full-width"
                )}
            </div>
            <div class="info-row">
                ${createInfoItem("Tenant", info.tenant || "N/A")}
                ${createInfoItem(
                  "System Version",
                  info.version?.system || "N/A"
                )}
                ${createInfoItem(
                  "C8yPact Version",
                  info.version?.c8ypact || "N/A"
                )}
            </div>
        </section>

        <section class="stats-section">
            <h2>Statistics</h2>
            <div class="stats-grid">
                ${createStatCard(stats.totalRequests, "Total Requests")}
                ${createStatCard(stats.endpoints.size, "Unique Endpoints")}
                ${createStatCard(stats.methods.size, "HTTP Methods")}
                ${createStatCard(stats.statusCodes.size, "Status Codes")}
            </div>
        </section>

        <section class="filter-section">
            <h2>Filters</h2>
            <div class="filter-controls">
                <input type="text" id="searchInput" placeholder="Search URL, method, or status..." />
                <select id="methodFilter">
                    <option value="">All Methods</option>
                    ${Array.from(stats.methods)
                      .map((m) => `<option value="${m}">${m}</option>`)
                      .join("")}
                </select>
                <select id="statusFilter">
                    <option value="">All Status Codes</option>
                    ${Array.from(stats.statusCodes)
                      .sort()
                      .map((s) => `<option value="${s}">${s}</option>`)
                      .join("")}
                </select>
                <select id="userAliasFilter">
                    <option value="">All User Aliases</option>
                    ${Array.from(stats.userAliases)
                      .sort()
                      .map(
                        (alias) =>
                          `<option value="${escapeHtml(alias)}">${escapeHtml(
                            alias
                          )}</option>`
                      )
                      .join("")}
                </select>
                <select id="expandUserAliases">
                    <option value="false">Collapsed View</option>
                    <option value="true">Expand User Aliases</option>
                </select>
                <button id="clearFilters">Clear Filters</button>
            </div>
        </section>

        <section class="records-section">
            <h2>Records (<span id="recordCount">${records.length}</span>)</h2>
            <div id="recordsList" class="records-list">
                ${generateRecordsHTML(records, false)}
            </div>
        </section>
    </div>

    <!-- Embed data as non-executable JSON to comply with CSP -->
    <script type="application/json" id="pactData">
      ${JSON.stringify(pactData)}
    </script>
    <script type="application/json" id="recordDetailsMap">
      ${JSON.stringify(Array.from(generateRecordDetailsMap(records).entries()))}
    </script>
    <script src="${scriptUri}?v=${Date.now()}"></script>
</body>
</html>`;
}

/**
 * Generate record details map for pre-rendering
 */
function generateRecordDetailsMap(records: C8yPactRecord[]): Map<number, string> {
  const detailsMap = new Map<number, string>();
  records.forEach((record, index) => {
    detailsMap.set(index, generateRecordDetails(record, index));
  });
  return detailsMap;
}

/**
 * Calculate statistics from records
 */
function calculateStats(records: C8yPactRecord[]): Stats {
  const methods = new Set<string>();
  const statusCodes = new Set<number>();
  const userAliases = new Set<string>();
  const endpoints = new Set<string>();
  let totalRequests = 0;

  records.forEach((record) => {
    if (record.request?.method) {
      methods.add(record.request.method);
    }
    if (record.response?.status) {
      statusCodes.add(record.response.status);
    }
    // Count unique endpoints (URL without query params)
    if (record.request?.url) {
      const url = record.request.url.split("?")[0];
      endpoints.add(url);
    }
    // Collect user aliases and count total requests
    const aliases = record.auth?.userAlias;
    if (aliases) {
      if (Array.isArray(aliases)) {
        totalRequests += aliases.length;
        aliases.forEach((alias) => userAliases.add(alias));
      } else {
        totalRequests += 1;
        userAliases.add(aliases);
      }
    } else {
      totalRequests += 1;
    }
  });

  return {
    methods,
    statusCodes,
    userAliases,
    endpoints,
    totalRequests,
  };
}

/**
 * Generate HTML for records list
 */
function generateRecordsHTML(
  records: C8yPactRecord[],
  expandUserAliases = false
): string {
  const rows: string[] = [];
  let displayIndex = 1;

  records.forEach((record, index) => {
    const method = record.request?.method || "UNKNOWN";
    const url = record.request?.url || "N/A";
    const status = record.response?.status || "N/A";
    const statusClass = getStatusClass(status);

    const authInfo = getAuthInfo(record);

    // Get user aliases
    const userAliases = record.auth?.userAlias;
    const hasUserAliases =
      userAliases &&
      (Array.isArray(userAliases) ? userAliases.length > 0 : true);
    const aliasArray = Array.isArray(userAliases)
      ? userAliases
      : userAliases
      ? [userAliases]
      : null;
    const authType =
      record.auth?.type ||
      authInfo?.display ||
      (hasUserAliases ? "user-alias" : "Default");

    const shouldExpand =
      expandUserAliases && aliasArray && aliasArray.length > 0;

    if (shouldExpand) {
      // Create a row for each userAlias
      aliasArray!.forEach((alias, aliasIndex) => {
        rows.push(`
                    <div class="record-item" data-index="${index}" data-method="${method}" data-status="${status}" data-useralias="${escapeHtml(
          alias
        )}">
                        <div class="record-header toggle-record" data-index="${index}">
                            <span class="index-number">${displayIndex++}</span>
                            <span class="method method-${method.toLowerCase()}">${method}</span>
                            <span class="url" title="${escapeHtml(
                              url
                            )}">${escapeHtml(truncateUrl(url))}</span>
                            <span class="status ${statusClass}">${status}</span>
                            <span class="auth-info user-alias-display">${escapeHtml(
                              alias
                            )}</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        ${
                          aliasIndex === 0
                            ? `
                        <div class="record-details" id="record-${index}" style="display: none;">
                            ${generateRecordDetails(record, index)}
                        </div>
                        `
                            : ""
                        }
                    </div>
                `);
      });
    } else {
      // Standard display - prefer userAlias if available
      let authDisplay: string;
      const userAliasAttr =
        hasUserAliases && aliasArray && aliasArray.length > 0
          ? aliasArray.join(",")
          : "";
      if (hasUserAliases && aliasArray && aliasArray.length > 0) {
        authDisplay = authType || "Default";
      } else {
        authDisplay = authInfo.user
          ? `${authInfo.display} (${authInfo.user})`
          : authInfo.display;
      }

      rows.push(`
                <div class="record-item" data-index="${index}" data-method="${method}" data-status="${status}" data-useralias="${escapeHtml(
        userAliasAttr
      )}">
                    <div class="record-header toggle-record" data-index="${index}">
                        <span class="index-number">${displayIndex++}</span>
                        <span class="method method-${method.toLowerCase()}">${method}</span>
                        <span class="url" title="${escapeHtml(
                          url
                        )}">${escapeHtml(truncateUrl(url))}</span>
                        <span class="status ${statusClass}">${status}</span>
                        <span class="auth-info ${
                          hasUserAliases ? "user-alias-display" : ""
                        }">${escapeHtml(authDisplay)}</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="record-details" id="record-${index}" style="display: none;">
                        ${generateRecordDetails(record, index)}
                    </div>
                </div>
            `);
    }
  });

  return rows.join("");
}

/**
 * Create a detail item HTML element
 */
function createDetailItem(
  label: string,
  contentOrValue: string | null | undefined
): string {
  if (!contentOrValue) {
    return "";
  }

  let content = contentOrValue;

  // If content doesn't start with <span, treat it as simple text to escape and wrap
  if (!content.startsWith("<span")) {
    content = `<span class="detail-value">${escapeHtml(content)}</span>`;
  }

  return `<div class="detail-item">
    <label>${escapeHtml(label)}</label>
    ${content}
  </div>`;
}

/**
 * Create an info item HTML element
 */
function createInfoItem(label: string, value: string, className = ""): string {
  return `<div class="info-item${className ? " " + className : ""}">
    <label>${escapeHtml(label)}:</label>
    <span>${escapeHtml(value)}</span>
  </div>`;
}

/**
 * Create a stat card HTML element
 */
function createStatCard(value: string | number, label: string): string {
  return `<div class="stat-card">
    <div class="stat-value">${escapeHtml(String(value))}</div>
    <div class="stat-label">${escapeHtml(label)}</div>
  </div>`;
}

/**
 * Generate detailed view for a record
 */
function generateRecordDetails(record: C8yPactRecord, index: number): string {
  const authInfo = getAuthInfo(record);
  const requestContentType = get_i(record.request?.headers, "content-type");
  const requestAcceptType = get_i(record.request?.headers, "accept");
  const responseContentType = get_i(record.response?.headers, "content-type");

  // Check if there are multiple userAlias values
  const userAliases = record.auth?.userAlias;
  const hasMultipleUsers = Array.isArray(userAliases) && userAliases.length > 1;

  const requestDetails = [
    createDetailItem("Method", record.request?.method || "N/A"),
    createDetailItem("URL", record.request?.url || "N/A"),
    createDetailItem(
      "User Aliases",
      hasMultipleUsers
        ? `<span class="detail-value user-aliases">${userAliases
            .map(
              (userAlias) =>
                `<span class="user-alias-badge">${escapeHtml(userAlias)}</span>`
            )
            .join(" ")}</span>`
        : null
    ),
    createDetailItem(
      "Authentication",
      authInfo && authInfo.value
        ? `<span class="detail-value">${escapeHtml(authInfo.value)}${
            authInfo.user ? ` (${escapeHtml(authInfo.user)})` : ""
          }</span>`
        : null
    ),
    createDetailItem("Content-Type", requestContentType),
    createDetailItem("Accept", requestAcceptType),
    createDetailItem(
      "Headers",
      record.request?.headers
        ? `<span class="detail-value"><span class="source-link" data-record-index="${index}" data-path="request.headers">View in source →</span></span>`
        : null
    ),
    createDetailItem(
      "Body",
      record.request?.body
        ? `<span class="detail-value"><span class="source-link" data-record-index="${index}" data-path="request.body">View in source →</span></span>`
        : null
    ),
  ].join("");

  const responseDetails = [
    createDetailItem(
      "Status",
      `<span class="detail-value ${getStatusClass(
        record.response?.status || "N/A"
      )}">${escapeHtml(String(record.response?.status || "N/A"))}${
        record.response?.statusText
          ? ` ${escapeHtml(record.response.statusText)}`
          : ""
      }</span>`
    ),
    createDetailItem(
      "Duration",
      record.response?.duration
        ? `<span class="detail-value">${record.response.duration}ms</span>`
        : null
    ),
    createDetailItem("Content-Type", responseContentType),
    createDetailItem(
      "Headers",
      record.response?.headers
        ? `<span class="detail-value"><span class="source-link" data-record-index="${index}" data-path="response.headers">View in source →</span></span>`
        : null
    ),
    createDetailItem(
      "Body",
      record.response?.body
        ? `<span class="detail-value"><span class="source-link" data-record-index="${index}" data-path="response.body">View in source →</span></span>`
        : null
    ),
  ].join("");
  const createdObjectDetails = createDetailItem(
    "Object ID",
    record.createdObject
  );

  return `
        <div class="details-container">
            <div class="details-section">
                <h3>Request</h3>
                <div class="details-content">
                    ${requestDetails}
                </div>
            </div>
            <div class="details-section">
                <h3>Response</h3>
                <div class="details-content">
                    ${responseDetails}
                </div>
            </div>
            ${
              record.createdObject
                ? `
            <div class="details-section">
                <h3>Created Object</h3>
                <div class="details-content">
                    ${createdObjectDetails}
                </div>
            </div>`
                : ""
            }
        </div>
    `;
}

export function deactivate(): void {}
