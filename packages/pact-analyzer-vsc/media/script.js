// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  initializeFilters();
  initializeRecordInteractions();
  initializeViewModeToggle();
});

/**
 * Initialize view mode toggle
 */
function initializeViewModeToggle() {
  const expandSelect = document.getElementById("expandUserAliases");

  if (expandSelect) {
    expandSelect.addEventListener("change", function () {
      regenerateRecordsList(this.value === "true");
    });
  }
}

/**
 * Regenerate records list based on view mode
 * @param {boolean} expandUserAliases
 */
function regenerateRecordsList(expandUserAliases) {
  const recordsList = document.getElementById("recordsList");

  if (recordsList && typeof pactData !== "undefined" && pactData.records) {
    // Use the client-side version of generateRecordsHTML
    const html = generateRecordsHTMLClient(pactData.records, expandUserAliases);
    recordsList.innerHTML = html;

    // Reapply filters
    applyFilters();
  }
}

/**
 * Initialize filter functionality
 */
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

/**
 * Apply filters to the records list
 */
function applyFilters() {
  const searchTerm =
    document.getElementById("searchInput")?.value.toLowerCase() || "";
  const methodFilter = document.getElementById("methodFilter")?.value || "";
  const statusFilter = document.getElementById("statusFilter")?.value || "";
  const userAliasFilter =
    document.getElementById("userAliasFilter")?.value || "";

  const records = document.querySelectorAll(".record-item");
  let visibleCount = 0;
  const seenIndices = new Set();

  records.forEach((record) => {
    const method = record.dataset.method || "";
    const status = record.dataset.status || "";
    const userAlias = record.dataset.useralias || "";
    const url = record.querySelector(".url")?.textContent.toLowerCase() || "";
    const index = record.dataset.index;

    const matchesSearch =
      !searchTerm ||
      url.includes(searchTerm) ||
      method.toLowerCase().includes(searchTerm) ||
      status.includes(searchTerm);

    const matchesMethod = !methodFilter || method === methodFilter;
    const matchesStatus = !statusFilter || status === statusFilter;
    const matchesUserAlias =
      !userAliasFilter || userAlias.split(",").includes(userAliasFilter);

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

  // Update count in header
  const recordCountSpan = document.getElementById("recordCount");
  if (recordCountSpan) {
    const totalRecords =
      typeof pactData !== "undefined" ? pactData.records.length : 0;
    recordCountSpan.textContent =
      visibleCount === totalRecords
        ? totalRecords
        : `${visibleCount} of ${totalRecords}`;
  }
}

/**
 * Initialize record interactions (expand/collapse)
 */
function initializeRecordInteractions() {
  // Click handlers are now handled by inline onclick in the HTML
  // No additional handlers needed here
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
  vscode.postMessage({
    command: "copyToClipboard",
    text: text,
  });
}

/**
 * Export a record
 * @param {number} index - Record index
 */
function exportRecord(index) {
  if (
    typeof pactData !== "undefined" &&
    pactData.records &&
    pactData.records[index]
  ) {
    vscode.postMessage({
      command: "exportRecord",
      record: pactData.records[index],
    });
  }
}

/**
 * Expand all records
 */
function expandAll() {
  const records = document.querySelectorAll(".record-item");
  records.forEach((record, index) => {
    if (!record.classList.contains("hidden")) {
      record.classList.add("expanded");
      const details = document.getElementById(`record-${index}`);
      if (details) {
        details.style.display = "block";
      }
    }
  });
}

/**
 * Collapse all records
 */
function collapseAll() {
  const records = document.querySelectorAll(".record-item");
  records.forEach((record, index) => {
    record.classList.remove("expanded");
    const details = document.getElementById(`record-${index}`);
    if (details) {
      details.style.display = "none";
    }
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

// Global function to generate records HTML
function generateRecordsHTMLClient(records, expandUserAliases) {
  const rows = [];
  let displayIndex = 1;

  records.forEach((record, index) => {
    const method = record.request?.method || "UNKNOWN";
    const url = record.request?.url || "N/A";
    const status = record.response?.status || "N/A";
    const statusClass = window.PactUtils.getStatusClass(status);

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

    const shouldExpand =
      expandUserAliases && aliasArray && aliasArray.length > 1;

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
            window.PactUtils.escapeHtml(alias) +
            '">' +
            '<div class="record-header" onclick="toggleRecord(' +
            index +
            ')">' +
            '<span class="index-number">' +
            displayIndex++ +
            "</span>" +
            '<span class="method method-' +
            method.toLowerCase() +
            '">' +
            method +
            "</span>" +
            '<span class="url" title="' +
            window.PactUtils.escapeHtml(url) +
            '">' +
            window.PactUtils.escapeHtml(window.PactUtils.truncateUrl(url)) +
            "</span>" +
            '<span class="status ' +
            statusClass +
            '">' +
            status +
            "</span>" +
            '<span class="auth-info user-alias-display">' +
            window.PactUtils.escapeHtml(alias) +
            "</span>" +
            '<span class="toggle-icon">▼</span>' +
            "</div>" +
            (aliasIndex === 0
              ? '<div class="record-details" id="record-' +
                index +
                '" style="display: none;">' +
                (recordDetailsMap.get(index) || "") +
                "</div>"
              : "") +
            "</div>"
        );
      });
    } else {
      // Standard display - prefer userAlias if available
      let authDisplay;
      const userAliasAttr =
        hasUserAliases && aliasArray && aliasArray.length > 0
          ? aliasArray.join(",")
          : "";
      if (hasUserAliases && aliasArray && aliasArray.length > 0) {
        authDisplay = aliasArray[0];
      } else {
        const authInfo = window.PactUtils.getAuthInfo(record);
        authDisplay = authInfo.user
          ? authInfo.display + " (" + authInfo.user + ")"
          : authInfo.display;
      }

      rows.push(
        '<div class="record-item" data-index="' +
          index +
          '" data-method="' +
          method +
          '" data-status="' +
          status +
          '" data-useralias="' +
          window.PactUtils.escapeHtml(userAliasAttr) +
          '">' +
          '<div class="record-header" onclick="toggleRecord(' +
          index +
          ')">' +
          '<span class="index-number">' +
          displayIndex++ +
          "</span>" +
          '<span class="method method-' +
          method.toLowerCase() +
          '">' +
          method +
          "</span>" +
          '<span class="url" title="' +
          window.PactUtils.escapeHtml(url) +
          '">' +
          window.PactUtils.escapeHtml(window.PactUtils.truncateUrl(url)) +
          "</span>" +
          '<span class="status ' +
          statusClass +
          '">' +
          status +
          "</span>" +
          '<span class="auth-info ' +
          (hasUserAliases ? "user-alias-display" : "") +
          '">' +
          window.PactUtils.escapeHtml(authDisplay) +
          "</span>" +
          '<span class="toggle-icon">▼</span>' +
          "</div>" +
          '<div class="record-details" id="record-' +
          index +
          '" style="display: none;">' +
          (recordDetailsMap.get(index) || "") +
          "</div>" +
          "</div>"
      );
    }
  });

  return rows.join("");
}

// Global function to toggle sections
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  const button = event?.target?.closest(".toggle-btn");

  if (!section) return;

  const isExpanded = section.classList.contains("expanded");

  if (isExpanded) {
    section.classList.remove("expanded");
    if (button) button.classList.remove("expanded");
  } else {
    section.classList.add("expanded");
    if (button) button.classList.add("expanded");
  }
}

// Global function to toggle records
function toggleRecord(index) {
  const recordItem = document.querySelector(
    '.record-item[data-index="' + index + '"]'
  );
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

// Global function to navigate to source
function navigateToSource(recordIndex, path) {
  vscode.postMessage({
    command: "navigateToSource",
    recordIndex: recordIndex,
    path: path,
  });
}
