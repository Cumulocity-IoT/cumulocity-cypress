const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('C8y Pact Analyzer is now active');
    
    // Store a single shared panel - use object so reference persists
    const panelState = {
        panel: null,
        currentDocument: null
    };

    let disposable = vscode.commands.registerCommand('c8yPactAnalyzer.analyze', async function () {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }

        const document = editor.document;
        analyzePactDocument(document, context, panelState);
    });

    // Auto-update analyzer when switching between files, but only if panel is already open
    const autoAnalyzeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
        // Only auto-update if there's already a panel open
        if (!panelState.panel || panelState.panel._isDisposed === true) {
            return;
        }
        
        if (editor && editor.document.languageId === 'json') {
            const document = editor.document;
            const filePath = document.uri.fsPath;
            
            if (filePath.endsWith('.json')) {
                try {
                    const fileContent = fs.readFileSync(filePath, 'utf8');
                    const pactData = JSON.parse(fileContent);
                    
                    if (isValidPactFile(pactData)) {
                        analyzePactDocument(document, context, panelState);
                    }
                } catch (error) {
                    // Silently fail for non-pact or invalid JSON files
                }
            }
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(autoAnalyzeDisposable);
}

/**
 * Analyze a pact document
 * @param {vscode.TextDocument} document 
 * @param {vscode.ExtensionContext} context 
 * @param {Object} panelState - Object containing panel and currentDocument
 */
async function analyzePactDocument(document, context, panelState) {
    const filePath = document.uri.fsPath;

    // Check if file is JSON
    if (!filePath.endsWith('.json')) {
        vscode.window.showWarningMessage('Please open a JSON file to analyze');
        return;
    }

    try {
        // Read the file content
        const fileContent = fs.readFileSync(filePath, 'utf8');
        let pactData;

        try {
            pactData = JSON.parse(fileContent);
        } catch (parseError) {
            vscode.window.showErrorMessage('Invalid JSON file: ' + parseError.message);
            return;
        }

        // Validate if it's a C8y Pact file
        if (!isValidPactFile(pactData)) {
            vscode.window.showWarningMessage('This does not appear to be a valid C8y Pact file');
            return;
        }

        let panel = panelState.panel;
        
        // Check if we already have a panel and it's still visible
        if (panel && panel._isDisposed !== true) {
            // Reuse existing panel - just update content and title
            panel.title = `Pact Analyzer: ${path.basename(filePath)}`;
            panel.webview.html = getWebviewContent(pactData, panel.webview, context.extensionUri);
            panel.reveal(vscode.ViewColumn.Two);
            panelState.currentDocument = document;
        } else {
            // Create new panel
            panel = vscode.window.createWebviewPanel(
                'c8yPactAnalyzer',
                `Pact Analyzer: ${path.basename(filePath)}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Mark as disposed when closed
            panel.onDidDispose(() => {
                panelState.panel = null;
                panelState.currentDocument = null;
            });

            // Set the webview content
            panel.webview.html = getWebviewContent(pactData, panel.webview, context.extensionUri);
            
            panelState.panel = panel;
            panelState.currentDocument = document;
            
            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'copyToClipboard':
                            vscode.env.clipboard.writeText(message.text);
                            vscode.window.showInformationMessage('Copied to clipboard');
                            break;
                        case 'exportRecord':
                            exportRecord(message.record);
                            break;
                        case 'navigateToSource':
                            // Use the current document from panelState
                            navigateToSourceInFile(panelState.currentDocument, message.recordIndex, message.path);
                            break;
                    }
                },
                undefined,
                context.subscriptions
            );
        }

    } catch (error) {
        vscode.window.showErrorMessage('Error analyzing pact file: ' + error.message);
    }
}

/**
 * Check if the data is a valid C8y Pact file
 * @param {any} data 
 * @returns {boolean}
 */
function isValidPactFile(data) {
    return data && 
           typeof data === 'object' &&
           'info' in data &&
           'records' in data &&
           Array.isArray(data.records) &&
           'id' in data;
}

/**
 * Navigate to a specific location in the source JSON file
 * @param {vscode.TextDocument} document 
 * @param {number} recordIndex 
 * @param {string} path 
 */
async function navigateToSourceInFile(document, recordIndex, path) {
    try {
        const text = document.getText();
        const position = findJsonPath(text, recordIndex, path);
        
        if (position) {
            // Find if document is already open in an editor
            let editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === document.uri.toString()
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
                    selection: range
                });
            }
        } else {
            vscode.window.showWarningMessage(`Could not find ${path} for record at index ${recordIndex}`);
        }
    } catch (error) {
        vscode.window.showErrorMessage('Error navigating to source: ' + error.message);
    }
}

/**
 * Find the position of a specific path within a record in the JSON file
 * @param {string} text 
 * @param {number} recordIndex 
 * @param {string} path 
 * @returns {vscode.Position | null}
 */
function findJsonPath(text, recordIndex, path) {
    const lines = text.split('\n');
    
    // First, find the "records" array
    let recordsArrayStart = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('"records"') && lines[i].includes(':')) {
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
        if (lines[i].includes('[')) {
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
            
            if (char === '{') {
                if (braceDepth === 0) {
                    // Starting a new record
                    currentRecordIndex++;
                    if (currentRecordIndex === recordIndex) {
                        recordStart = i;
                        inRecord = true;
                    }
                }
                braceDepth++;
            } else if (char === '}') {
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
        if (line.includes(']') && braceDepth === 0) {
            break;
        }
    }
    
    if (recordStart === -1 || recordEnd === -1) {
        return null;
    }
    
    // Now search for the specific path within the record
    const pathParts = path.split('.');
    let currentLine = recordStart;
    let currentDepth = 0;
    
    for (let partIndex = 0; partIndex < pathParts.length; partIndex++) {
        const part = pathParts[partIndex];
        let found = false;
        let searchDepth = partIndex;
        
        for (let i = currentLine; i <= recordEnd; i++) {
            const line = lines[i];
            
            // Check if this line contains our key at the right nesting level
            if (line.includes(`"${part}"`) && line.includes(':')) {
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
 * @param {any} record 
 */
async function exportRecord(record) {
    const fileName = `pact-record-${record.id || Date.now()}.json`;
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(fileName),
        filters: {
            'JSON': ['json']
        }
    });

    if (uri) {
        fs.writeFileSync(uri.fsPath, JSON.stringify(record, null, 2));
        vscode.window.showInformationMessage('Record exported successfully');
    }
}

/**
 * Generate the HTML content for the webview
 * @param {any} pactData 
 * @param {vscode.Webview} webview
 * @param {vscode.Uri} extensionUri
 * @returns {string}
 */
function getWebviewContent(pactData, webview, extensionUri) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'style.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'script.js'));

    const info = pactData.info || {};
    const records = pactData.records || [];
    
    // Calculate statistics
    const stats = calculateStats(records);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <link href="${styleUri}" rel="stylesheet">
    <title>C8y Pact Analyzer</title>
</head>
<body>
    <div class="container">
        <header>
            <div class="header-content">
                <h1>${escapeHtml((info.title || []).join(' › ') || 'Pact Analysis')}</h1>
                <div class="pact-id">${escapeHtml(pactData.id || 'N/A')}</div>
            </div>
        </header>
        <section class="info-section">
            <div class="info-grid">
                <div class="info-item">
                    <label>Base URL:</label>
                    <span>${escapeHtml(info.baseUrl || 'N/A')}</span>
                </div>
                <div class="info-item">
                    <label>Tenant:</label>
                    <span>${escapeHtml(info.tenant || 'N/A')}</span>
                </div>
                <div class="info-item">
                    <label>System Version:</label>
                    <span>${escapeHtml(info.version?.system || 'N/A')}</span>
                </div>
                <div class="info-item">
                    <label>C8y Pact Version:</label>
                    <span>${escapeHtml(info.version?.c8ypact || 'N/A')}</span>
                </div>
            </div>
        </section>

        <section class="stats-section">
            <h2>Statistics</h2>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${stats.totalRequests}</div>
                    <div class="stat-label">Total Requests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.endpoints.size}</div>
                    <div class="stat-label">Unique Endpoints</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.methods.size}</div>
                    <div class="stat-label">HTTP Methods</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${stats.statusCodes.size}</div>
                    <div class="stat-label">Status Codes</div>
                </div>
            </div>
        </section>

        <section class="filter-section">
            <h2>Filters</h2>
            <div class="filter-controls">
                <input type="text" id="searchInput" placeholder="Search URL, method, or status..." />
                <select id="methodFilter">
                    <option value="">All Methods</option>
                    ${Array.from(stats.methods).map(m => `<option value="${m}">${m}</option>`).join('')}
                </select>
                <select id="statusFilter">
                    <option value="">All Status Codes</option>
                    ${Array.from(stats.statusCodes).sort().map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
                <select id="userAliasFilter">
                    <option value="">All User Aliases</option>
                    ${Array.from(stats.userAliases).sort().map(alias => `<option value="${escapeHtml(alias)}">${escapeHtml(alias)}</option>`).join('')}
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

    <script>
        const vscode = acquireVsCodeApi();
        const pactData = ${JSON.stringify(pactData)};
        
        // Store record details HTML
        const recordDetailsMap = new Map();
        ${records.map((record, index) => `recordDetailsMap.set(${index}, \`${generateRecordDetails(record, index).replace(/`/g, '\\`')}\`);`).join('\n        ')}
        
        // Helper functions
        function escapeHtml(text) {
            if (typeof text !== 'string') return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function truncateUrl(url, maxLength = 80) {
            if (!url || url.length <= maxLength) return url;
            return url.substring(0, maxLength - 3) + '...';
        }
        
        function getStatusClass(status) {
            if (status >= 200 && status < 300) return 'status-success';
            if (status >= 300 && status < 400) return 'status-redirect';
            if (status >= 400 && status < 500) return 'status-client-error';
            if (status >= 500) return 'status-server-error';
            return '';
        }
        
        function getAuthInfo(record) {
            const headers = record.request?.headers || {};
            const authHeader = headers.authorization || headers.Authorization;
            
            if (authHeader) {
                if (authHeader.startsWith('Bearer ')) {
                    return { type: 'Bearer', display: 'Bearer Token', user: '' };
                }
                if (authHeader.startsWith('Basic ')) {
                    return { type: 'Basic', display: 'Basic Auth', user: '' };
                }
            }
            
            if (headers.cookie || headers.Cookie) {
                return { type: 'Cookie', display: 'Cookie', user: '' };
            }
            
            const auth = record.auth;
            if (auth) {
                if (auth.token) {
                    const user = auth.userAlias || auth.user || '';
                    return { type: 'Bearer', display: 'Bearer Token', user: user };
                }
                if (auth.user && auth.password) {
                    const user = auth.userAlias || auth.user || '';
                    return { type: 'Basic', display: 'Basic Auth', user: user };
                }
                if (auth.cookies) {
                    const user = auth.userAlias || auth.user || '';
                    return { type: 'Cookie', display: 'Cookie', user: user };
                }
            }
            
            return { type: 'None', display: 'Default', user: '' };
        }
        
        // Global function to generate records HTML
        function generateRecordsHTMLClient(records, expandUserAliases) {
            const rows = [];
            let displayIndex = 1;
            
            records.forEach((record, index) => {
                const method = record.request?.method || 'UNKNOWN';
                const url = record.request?.url || 'N/A';
                const status = record.response?.status || 'N/A';
                const statusClass = getStatusClass(status);
                
                // Get user aliases
                const userAliases = record.auth?.userAlias;
                const hasUserAliases = userAliases && (Array.isArray(userAliases) ? userAliases.length > 0 : true);
                const aliasArray = Array.isArray(userAliases) ? userAliases : (userAliases ? [userAliases] : null);
                
                const shouldExpand = expandUserAliases && aliasArray && aliasArray.length > 1;
                
                if (shouldExpand) {
                    aliasArray.forEach((alias, aliasIndex) => {
                        rows.push(\`
                            <div class="record-item" data-index="\${index}" data-method="\${method}" data-status="\${status}" data-useralias="\${escapeHtml(alias)}">
                                <div class="record-header" onclick="toggleRecord(\${index})">
                                    <span class="index-number">\${displayIndex++}</span>
                                    <span class="method method-\${method.toLowerCase()}">\${method}</span>
                                    <span class="url" title="\${escapeHtml(url)}">\${escapeHtml(truncateUrl(url))}</span>
                                    <span class="status \${statusClass}">\${status}</span>
                                    <span class="auth-info user-alias-display">\${escapeHtml(alias)}</span>
                                    <span class="toggle-icon">\u25bc</span>
                                </div>
                                \${aliasIndex === 0 ? \`
                                <div class="record-details" id="record-\${index}" style="display: none;">
                                    \${recordDetailsMap.get(index) || ''}
                                </div>
                                \` : ''}
                            </div>
                        \`);
                    });
                } else {
                    // Standard display - prefer userAlias if available
                    let authDisplay;
                    const userAliasAttr = (hasUserAliases && aliasArray && aliasArray.length > 0) ? aliasArray.join(',') : '';
                    if (hasUserAliases && aliasArray && aliasArray.length > 0) {
                        authDisplay = aliasArray[0];
                    } else {
                        const authInfo = getAuthInfo(record);
                        authDisplay = authInfo.user ? \`\${authInfo.display} (\${authInfo.user})\` : authInfo.display;
                    }
                    
                    rows.push(\`
                        <div class="record-item" data-index="\${index}" data-method="\${method}" data-status="\${status}" data-useralias="\${escapeHtml(userAliasAttr)}">
                            <div class="record-header" onclick="toggleRecord(\${index})">
                                <span class="index-number">\${displayIndex++}</span>
                                <span class="method method-\${method.toLowerCase()}">\${method}</span>
                                <span class="url" title="\${escapeHtml(url)}">\${escapeHtml(truncateUrl(url))}</span>
                                <span class="status \${statusClass}">\${status}</span>
                                <span class="auth-info \${hasUserAliases ? 'user-alias-display' : ''}">\${escapeHtml(authDisplay)}</span>
                                <span class="toggle-icon">\u25bc</span>
                            </div>
                            <div class="record-details" id="record-\${index}" style="display: none;">
                                \${recordDetailsMap.get(index) || ''}
                            </div>
                        </div>
                    \`);
                }
            });
            
            return rows.join('');
        }
        
        // Global function to toggle sections
        function toggleSection(sectionId) {
            const section = document.getElementById(sectionId);
            const button = event?.target?.closest('.toggle-btn');
            
            if (!section) return;

            const isExpanded = section.classList.contains('expanded');
            
            if (isExpanded) {
                section.classList.remove('expanded');
                if (button) button.classList.remove('expanded');
            } else {
                section.classList.add('expanded');
                if (button) button.classList.add('expanded');
            }
        }
        
        // Global function to toggle records
        function toggleRecord(index) {
            const recordItem = document.querySelector(\`.record-item[data-index="\${index}"]\`);
            const details = document.getElementById(\`record-\${index}\`);

            if (!recordItem || !details) return;

            const isExpanded = recordItem.classList.contains('expanded');

            if (isExpanded) {
                recordItem.classList.remove('expanded');
                details.style.display = 'none';
            } else {
                recordItem.classList.add('expanded');
                details.style.display = 'block';
            }
        }
        
        // Global function to navigate to source
        function navigateToSource(recordIndex, path) {
            vscode.postMessage({
                command: 'navigateToSource',
                recordIndex: recordIndex,
                path: path
            });
        }
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
}

/**
 * Calculate statistics from records
 * @param {Array} records 
 * @returns {Object}
 */
function calculateStats(records) {
    const methods = new Set();
    const statusCodes = new Set();
    const userAliases = new Set();
    const endpoints = new Set();
    let totalRequests = 0;

    records.forEach(record => {
        if (record.request?.method) {
            methods.add(record.request.method);
        }
        if (record.response?.status) {
            statusCodes.add(record.response.status);
        }
        // Count unique endpoints (URL without query params)
        if (record.request?.url) {
            const url = record.request.url.split('?')[0];
            endpoints.add(url);
        }
        // Collect user aliases and count total requests
        const aliases = record.auth?.userAlias;
        if (aliases) {
            if (Array.isArray(aliases)) {
                totalRequests += aliases.length;
                aliases.forEach(alias => userAliases.add(alias));
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
        totalRequests
    };
}

/**
 * Generate HTML for records list
 * @param {Array} records 
 * @param {boolean} expandUserAliases - If true, expand records with multiple userAlias
 * @returns {string}
 */
function generateRecordsHTML(records, expandUserAliases = false) {
    const rows = [];
    let displayIndex = 1;
    
    records.forEach((record, index) => {
        const method = record.request?.method || 'UNKNOWN';
        const url = record.request?.url || 'N/A';
        const status = record.response?.status || 'N/A';
        const statusClass = getStatusClass(status);
        
        // Get user aliases
        const userAliases = record.auth?.userAlias;
        const hasUserAliases = userAliases && (Array.isArray(userAliases) ? userAliases.length > 0 : true);
        const aliasArray = Array.isArray(userAliases) ? userAliases : (userAliases ? [userAliases] : null);
        
        const shouldExpand = expandUserAliases && aliasArray && aliasArray.length > 1;
        
        if (shouldExpand) {
            // Create a row for each userAlias
            aliasArray.forEach((alias, aliasIndex) => {
                rows.push(`
                    <div class="record-item" data-index="${index}" data-method="${method}" data-status="${status}" data-useralias="${escapeHtml(alias)}">
                        <div class="record-header" onclick="toggleRecord(${index})">
                            <span class="index-number">${displayIndex++}</span>
                            <span class="method method-${method.toLowerCase()}">${method}</span>
                            <span class="url" title="${escapeHtml(url)}">${escapeHtml(truncateUrl(url))}</span>
                            <span class="status ${statusClass}">${status}</span>
                            <span class="auth-info user-alias-display">${escapeHtml(alias)}</span>
                            <span class="toggle-icon">▼</span>
                        </div>
                        ${aliasIndex === 0 ? `
                        <div class="record-details" id="record-${index}" style="display: none;">
                            ${generateRecordDetails(record, index)}
                        </div>
                        ` : ''}
                    </div>
                `);
            });
        } else {
            // Standard display - prefer userAlias if available
            let authDisplay;
            const userAliasAttr = (hasUserAliases && aliasArray && aliasArray.length > 0) ? aliasArray.join(',') : '';
            if (hasUserAliases && aliasArray && aliasArray.length > 0) {
                authDisplay = aliasArray[0];
            } else {
                const authInfo = getAuthInfo(record);
                authDisplay = authInfo.user ? `${authInfo.display} (${authInfo.user})` : authInfo.display;
            }
            
            rows.push(`
                <div class="record-item" data-index="${index}" data-method="${method}" data-status="${status}" data-useralias="${escapeHtml(userAliasAttr)}">
                    <div class="record-header" onclick="toggleRecord(${index})">
                        <span class="index-number">${displayIndex++}</span>
                        <span class="method method-${method.toLowerCase()}">${method}</span>
                        <span class="url" title="${escapeHtml(url)}">${escapeHtml(truncateUrl(url))}</span>
                        <span class="status ${statusClass}">${status}</span>
                        <span class="auth-info ${hasUserAliases ? 'user-alias-display' : ''}">${escapeHtml(authDisplay)}</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="record-details" id="record-${index}" style="display: none;">
                        ${generateRecordDetails(record, index)}
                    </div>
                </div>
            `);
        }
    });
    
    return rows.join('');
}

/**
 * Get authentication type and details from record
 * @param {Object} record 
 * @returns {Object} { type: string, display: string, user: string }
 */
function getAuthInfo(record) {
    // First check request headers for auth
    const headers = record.request?.headers || {};
    const authHeader = headers.authorization || headers.Authorization;
    
    if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
            return { type: 'Bearer', display: 'Bearer Token', user: '' };
        }
        if (authHeader.startsWith('Basic ')) {
            return { type: 'Basic', display: 'Basic Auth', user: '' };
        }
    }
    
    if (headers.cookie || headers.Cookie) {
        return { type: 'Cookie', display: 'Cookie', user: '' };
    }
    
    // Fall back to record.auth if no header auth found
    const auth = record.auth;
    if (auth) {
        if (auth.token) {
            return { type: 'Bearer', display: 'Bearer Token', user: auth.user || '' };
        }
        if (auth.user && auth.password) {
            const user = auth.userAlias || auth.user;
            return { type: 'Basic', display: 'Basic Auth', user: user };
        }
        if (auth.cookies) {
            const user = auth.userAlias || auth.user || '';
            return { type: 'Cookie', display: 'Cookie', user: user };
        }
    }
    
    return { type: 'None', display: 'Default', user: '' };
}

/**
 * Get content type from headers
 * @param {Object} headers 
 * @returns {string}
 */
function getContentType(headers) {
    if (!headers) return 'N/A';
    return headers['content-type'] || headers['Content-Type'] || 'N/A';
}

/**
 * Generate detailed view for a record
 * @param {Object} record 
 * @param {number} index
 * @returns {string}
 */
function generateRecordDetails(record, index) {
    const authInfo = getAuthInfo(record);
    const requestContentType = getContentType(record.request?.headers);
    const responseContentType = getContentType(record.response?.headers);
    
    // Check if there are multiple userAlias values
    const userAliases = record.auth?.userAlias;
    const hasMultipleUsers = Array.isArray(userAliases) && userAliases.length > 1;
    
    return `
        <div class="details-container">
            <div class="details-section">
                <h3>Request</h3>
                <div class="details-content">
                    <div class="detail-item">
                        <label>Method</label>
                        <span class="detail-value">${escapeHtml(record.request?.method || 'N/A')}</span>
                    </div>
                    <div class="detail-item">
                        <label>URL</label>
                        <span class="detail-value">${escapeHtml(record.request?.url || 'N/A')}</span>
                    </div>
                    ${hasMultipleUsers ? `
                    <div class="detail-item">
                        <label>User Aliases</label>
                        <span class="detail-value user-aliases">${userAliases.map(userAlias => `<span class="user-alias-badge">${escapeHtml(userAlias)}</span>`).join(' ')}</span>
                    </div>` : ''}
                    <div class="detail-item">
                        <label>Authentication</label>
                        <span class="detail-value">${escapeHtml(authInfo.display)}${authInfo.user ? ` (${escapeHtml(authInfo.user)})` : ''}</span>
                    </div>
                    <div class="detail-item">
                        <label>Content-Type</label>
                        <span class="detail-value">${escapeHtml(requestContentType)}</span>
                    </div>
                    ${record.request?.headers ? `
                    <div class="detail-item">
                        <label>Headers</label>
                        <span class="detail-value"><span class="source-link" onclick="navigateToSource(${index}, 'request.headers')">View in source →</span></span>
                    </div>` : ''}
                    ${record.request?.body ? `
                    <div class="detail-item">
                        <label>Body</label>
                        <span class="detail-value"><span class="source-link" onclick="navigateToSource(${index}, 'request.body')">View in source →</span></span>
                    </div>` : ''}
                </div>
            </div>
            <div class="details-section">
                <h3>Response</h3>
                <div class="details-content">
                    <div class="detail-item">
                        <label>Status</label>
                        <span class="detail-value ${getStatusClass(record.response?.status)}">${escapeHtml(String(record.response?.status || 'N/A'))}${record.response?.statusText ? ` ${escapeHtml(record.response.statusText)}` : ''}</span>
                    </div>
                    ${record.response?.duration ? `
                    <div class="detail-item">
                        <label>Duration</label>
                        <span class="detail-value">${record.response.duration}ms</span>
                    </div>` : ''}
                    <div class="detail-item">
                        <label>Content-Type</label>
                        <span class="detail-value">${escapeHtml(responseContentType)}</span>
                    </div>
                    ${record.response?.headers ? `
                    <div class="detail-item">
                        <label>Headers</label>
                        <span class="detail-value"><span class="source-link" onclick="navigateToSource(${index}, 'response.headers')">View in source →</span></span>
                    </div>` : ''}
                    ${record.response?.body ? `
                    <div class="detail-item">
                        <label>Body</label>
                        <span class="detail-value"><span class="source-link" onclick="navigateToSource(${index}, 'response.body')">View in source →</span></span>
                    </div>` : ''}
                </div>
            </div>
            ${record.createdObject ? `
            <div class="details-section">
                <h3>Created Object</h3>
                <div class="details-content">
                    <div class="detail-item">
                        <label>Object ID</label>
                        <span class="detail-value">${escapeHtml(record.createdObject)}</span>
                    </div>
                </div>
            </div>` : ''}
        </div>
    `;
}

/**
 * Get CSS class for status code
 * @param {number} status 
 * @returns {string}
 */
function getStatusClass(status) {
    if (status >= 200 && status < 300) return 'status-success';
    if (status >= 300 && status < 400) return 'status-redirect';
    if (status >= 400 && status < 500) return 'status-client-error';
    if (status >= 500) return 'status-server-error';
    return '';
}

/**
 * Truncate URL for display
 * @param {string} url 
 * @returns {string}
 */
function truncateUrl(url) {
    if (!url) return 'N/A';
    return url.length > 80 ? url.substring(0, 77) + '...' : url;
}

/**
 * Escape HTML special characters
 * @param {string} text 
 * @returns {string}
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
