/// <reference types="vscode-webview" />

// Extend Window interface for type safety
interface WebviewWindow extends Window {
  pactData?: any;
  recordDetailsMap?: Map<number, string>;
}

declare const window: WebviewWindow;

// Access global variables from window since esbuild wraps in IIFE
const pactData = () => window.pactData;
const recordDetailsMap = () => window.recordDetailsMap;

// Get VS Code API
const vscode = acquireVsCodeApi();

// Utility functions
const PactUtils = {
  escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  truncateUrl(url, maxLength = 80) {
    if (!url || url.length <= maxLength) return url;
    return url.substring(0, maxLength - 3) + "...";
  },

  getStatusClass(status) {
    const statusNum = typeof status === "string" ? parseInt(status, 10) : status;
    if (statusNum >= 200 && statusNum < 300) return "status-success";
    if (statusNum >= 300 && statusNum < 400) return "status-redirect";
    if (statusNum >= 400 && statusNum < 500) return "status-client-error";
    if (statusNum >= 500) return "status-server-error";
    return "";
  },

  getAuthInfo(record) {
    const headers = record.request?.headers || {};
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader) {
      if (authHeader.startsWith("Bearer ")) {
        return { type: "Bearer", display: "Bearer Token", user: "", value: authHeader };
      }
      if (authHeader.startsWith("Basic ")) {
        return { type: "Basic", display: "Basic Auth", user: "", value: authHeader };
      }
    }
    if (headers.cookie || headers.Cookie) {
      return { type: "Cookie", display: "Cookie", user: "", value: headers.cookie || headers.Cookie };
    }
    return { type: "None", display: "Default", user: "", value: null };
  },

  getHeaderValue(headers, key) {
    if (!headers) return null;
    return headers[key] || headers[key.toLowerCase()];
  },
};

// Make PactUtils available globally for backward compatibility
window.PactUtils = PactUtils;

// Initialize when DOM is loaded
/**
 * Load embedded JSON data from script tags into window globals.
 * This approach respects CSP by avoiding inline executable scripts.
 */
function loadInlineData(): void {
  try {
    const pactDataElement = document.getElementById("pactData");
    if (pactDataElement?.textContent) {
      window.pactData = JSON.parse(pactDataElement.textContent);
    } else {
      console.error("pactData element not found or empty");
    }

    const recordDetailsMapElement = document.getElementById("recordDetailsMap");
    if (recordDetailsMapElement?.textContent) {
      const entries = JSON.parse(recordDetailsMapElement.textContent);
      window.recordDetailsMap = new Map(entries);
    } else {
      console.error("recordDetailsMap element not found or empty");
    }
  } catch (error) {
    console.error("Failed to parse inline JSON data:", error);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  loadInlineData();
  initializeFilters();
  initializeRecordInteractions();
  initializeViewModeToggle();
});

function initializeViewModeToggle(): void {
  const expandSelect = document.getElementById("expandUserAliases") as HTMLSelectElement;
  if (!expandSelect) {
    console.error("expandUserAliases select element not found");
    return;
  }

  expandSelect.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement;
    const shouldExpand = target.value === "true";
    regenerateRecordsList(shouldExpand);
  });
}

/**
 * Regenerate the records list with expanded or collapsed user aliases.
 * Preserves the expanded/collapsed state of individual record details.
 */
function regenerateRecordsList(expandUserAliases: boolean): void {
  const recordsList = document.getElementById("recordsList");
  const data = pactData();
  
  if (!recordsList) {
    console.error("recordsList element not found");
    return;
  }
  
  if (!data?.records) {
    console.error("pactData or records not available");
    return;
  }

  // Preserve existing expanded detail states
  const existingDetails = new Map<number, string>();
  data.records.forEach((_, index) => {
    const detailsElement = document.getElementById("record-" + index);
    if (detailsElement) {
      existingDetails.set(index, detailsElement.innerHTML);
    }
  });

  const html = generateRecordsHTMLClient(data.records, expandUserAliases, existingDetails);
  recordsList.innerHTML = html;
  applyFilters();
  initializeRecordInteractions();
}

function initializeFilters() {
  const searchInput = document.getElementById("searchInput");
  const methodFilter = document.getElementById("methodFilter");
  const statusFilter = document.getElementById("statusFilter");
  const userAliasFilter = document.getElementById("userAliasFilter");
  const clearFiltersBtn = document.getElementById("clearFilters");

  if (searchInput) {
    searchInput.addEventListener("input", applyFilters);
  }
  if (methodFilter) {
    methodFilter.addEventListener("change", applyFilters);
  }
  if (statusFilter) {
    statusFilter.addEventListener("change", applyFilters);
  }
  if (userAliasFilter) {
    userAliasFilter.addEventListener("change", applyFilters);
  }
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", function () {
      if (searchInput) searchInput.value = "";
      if (methodFilter) methodFilter.value = "";
      if (statusFilter) statusFilter.value = "";
      if (userAliasFilter) userAliasFilter.value = "";
      const expandSelect = document.getElementById("expandUserAliases");
      if (expandSelect) expandSelect.value = "false";
      applyFilters();
      regenerateRecordsList(false);
    });
  }
}

function applyFilters() {
  const searchTerm = document.getElementById("searchInput")?.value.toLowerCase() || "";
  const methodFilter = document.getElementById("methodFilter")?.value || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "";
  const userAliasFilter = document.getElementById("userAliasFilter")?.value || "";
  const records = document.querySelectorAll(".record-item");
  let visibleCount = 0;
  const seenIndices = new Set();

  records.forEach((record) => {
    const method = record.dataset.method || "";
    const status = record.dataset.status || "";
    const userAlias = record.dataset.useralias || "";
    const url = record.querySelector(".url")?.textContent?.toLowerCase() || "";
    const index = record.dataset.index || "";

    const matchesSearch = !searchTerm || url.includes(searchTerm) || method.toLowerCase().includes(searchTerm) || status.includes(searchTerm);
    const matchesMethod = !methodFilter || method === methodFilter;
    const matchesStatus = !statusFilter || status === statusFilter;
    const matchesUserAlias = !userAliasFilter || userAlias.split(",").includes(userAliasFilter);

    if (matchesSearch && matchesMethod && matchesStatus && matchesUserAlias) {
      record.classList.remove("hidden");
      if (!seenIndices.has(index)) {
        visibleCount++;
        seenIndices.add(index);
      }
    } else {
      record.classList.add("hidden");
    }
  });

  const recordCountSpan = document.getElementById("recordCount");
  if (recordCountSpan) {
    const data = pactData();
    const totalRecords = data?.records?.length || 0;
    recordCountSpan.textContent = visibleCount === totalRecords ? totalRecords.toString() : visibleCount + " of " + totalRecords;
  }
}

function initializeRecordInteractions() {
  const recordHeaders = document.querySelectorAll(".record-header.toggle-record");
  recordHeaders.forEach((header) => {
    header.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index") || "0");
      toggleRecord(index);
    });
  });

  const sourceLinks = document.querySelectorAll(".source-link");
  sourceLinks.forEach((link) => {
    link.addEventListener("click", function () {
      const recordIndex = parseInt(this.getAttribute("data-record-index") || "0");
      const path = this.getAttribute("data-path") || "";
      navigateToSource(recordIndex, path);
    });
  });
}

function expandAll() {
  const records = document.querySelectorAll(".record-item");
  records.forEach((record, index) => {
    if (!record.classList.contains("hidden")) {
      record.classList.add("expanded");
      const details = document.getElementById("record-" + index);
      if (details) details.style.display = "block";
    }
  });
}

function collapseAll() {
  const records = document.querySelectorAll(".record-item");
  records.forEach((record, index) => {
    record.classList.remove("expanded");
    const details = document.getElementById("record-" + index);
    if (details) details.style.display = "none";
  });
}

// Keyboard shortcuts
document.addEventListener("keydown", function (e) {
  // Ctrl/Cmd + F to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    e.preventDefault();
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
  // Ctrl/Cmd + E to expand all
  if ((e.ctrlKey || e.metaKey) && e.key === "e") {
    e.preventDefault();
    expandAll();
  }
  // Ctrl/Cmd + Shift + E to collapse all
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
    e.preventDefault();
    collapseAll();
  }
});

function generateRecordsHTMLClient(records, expandUserAliases, existingDetails) {
  const rows = [];
  let displayIndex = 1;

  records.forEach((record, index) => {
    const method = record.request?.method || "UNKNOWN";
    const url = record.request?.url || "N/A";
    const status = record.response?.status || "N/A";
    const statusClass = PactUtils.getStatusClass(status);
    const userAliases = record.auth?.userAlias;
    const hasUserAliases = userAliases && (Array.isArray(userAliases) ? userAliases.length > 0 : true);
    const aliasArray = Array.isArray(userAliases) ? userAliases : userAliases ? [userAliases] : null;
    const shouldExpand = expandUserAliases && aliasArray && aliasArray.length > 0;

    if (shouldExpand) {
      aliasArray.forEach((alias, aliasIndex) => {
        rows.push(
          '<div class="record-item" data-index="' +
            index +
            '" data-method="' +
            method +
            '" data-status="' +
            status +
            '" data-useralias="' +
            PactUtils.escapeHtml(alias) +
            '">' +
            '<div class="record-header toggle-record" data-index="' +
            index +
            '">' +
            '<span class="index-number">' +
            displayIndex++ +
            "</span>" +
            '<span class="method method-' +
            method.toLowerCase() +
            '">' +
            method +
            "</span>" +
            '<span class="url" title="' +
            PactUtils.escapeHtml(url) +
            '">' +
            PactUtils.escapeHtml(PactUtils.truncateUrl(url)) +
            "</span>" +
            '<span class="status ' +
            statusClass +
            '">' +
            status +
            "</span>" +
            '<span class="auth-info user-alias-display">' +
            PactUtils.escapeHtml(alias) +
            "</span>" +
            '<span class="toggle-icon">▼</span>' +
            "</div>" +
            (aliasIndex === 0
              ? '<div class="record-details" id="record-' +
                index +
                '" style="display: none;">' +
                (existingDetails?.get(index) || recordDetailsMap()?.get(index) || "") +
                "</div>"
              : "") +
            "</div>"
        );
      });
    } else {
      let authDisplay;
      const userAliasAttr = hasUserAliases && aliasArray && aliasArray.length > 0 ? aliasArray.join(",") : "";
      if (hasUserAliases && aliasArray && aliasArray.length > 0) {
        authDisplay = aliasArray[0];
      } else {
        const authInfo = PactUtils.getAuthInfo(record);
        authDisplay = authInfo.user ? authInfo.display + " (" + authInfo.user + ")" : authInfo.display;
      }
      rows.push(
        '<div class="record-item" data-index="' +
          index +
          '" data-method="' +
          method +
          '" data-status="' +
          status +
          '" data-useralias="' +
          PactUtils.escapeHtml(userAliasAttr) +
          '">' +
          '<div class="record-header toggle-record" data-index="' +
          index +
          '">' +
          '<span class="index-number">' +
          displayIndex++ +
          "</span>" +
          '<span class="method method-' +
          method.toLowerCase() +
          '">' +
          method +
          "</span>" +
          '<span class="url" title="' +
          PactUtils.escapeHtml(url) +
          '">' +
          PactUtils.escapeHtml(PactUtils.truncateUrl(url)) +
          "</span>" +
          '<span class="status ' +
          statusClass +
          '">' +
          status +
          "</span>" +
          '<span class="auth-info ' +
          (hasUserAliases ? "user-alias-display" : "") +
          '">' +
          PactUtils.escapeHtml(authDisplay) +
          "</span>" +
          '<span class="toggle-icon">▼</span>' +
          "</div>" +
          '<div class="record-details" id="record-' +
          index +
          '" style="display: none;">' +
          (existingDetails?.get(index) || recordDetailsMap()?.get(index) || "") +
          "</div>" +
          "</div>"
      );
    }
  });

  return rows.join("");
}

function toggleRecord(index) {
  const recordItem = document.querySelector('.record-item[data-index="' + index + '"]');
  const details = document.getElementById("record-" + index);
  if (!recordItem || !details) return;

  const isExpanded = recordItem.classList.contains("expanded");
  if (isExpanded) {
    recordItem.classList.remove("expanded");
    details.style.display = "none";
  } else {
    recordItem.classList.add("expanded");
    details.style.display = "block";
  }
}

function navigateToSource(recordIndex, path) {
  vscode.postMessage({ command: "navigateToSource", recordIndex: recordIndex, path: path });
}
