// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeFilters();
    initializeRecordInteractions();
    initializeViewModeToggle();
});

/**
 * Initialize view mode toggle
 */
function initializeViewModeToggle() {
    const expandSelect = document.getElementById('expandUserAliases');
    
    if (expandSelect) {
        expandSelect.addEventListener('change', function() {
            regenerateRecordsList(this.value === 'true');
        });
    }
}

/**
 * Regenerate records list based on view mode
 * @param {boolean} expandUserAliases 
 */
function regenerateRecordsList(expandUserAliases) {
    const recordsList = document.getElementById('recordsList');
    
    if (recordsList && typeof pactData !== 'undefined' && pactData.records) {
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
    const searchInput = document.getElementById('searchInput');
    const methodFilter = document.getElementById('methodFilter');
    const statusFilter = document.getElementById('statusFilter');
    const userAliasFilter = document.getElementById('userAliasFilter');
    const clearFiltersBtn = document.getElementById('clearFilters');

    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    if (methodFilter) {
        methodFilter.addEventListener('change', applyFilters);
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }

    if (userAliasFilter) {
        userAliasFilter.addEventListener('change', applyFilters);
    }

    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            if (methodFilter) methodFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            if (userAliasFilter) userAliasFilter.value = '';
            const expandSelect = document.getElementById('expandUserAliases');
            if (expandSelect) expandSelect.value = 'false';
            applyFilters();
            regenerateRecordsList(false);
        });
    }
}

/**
 * Apply filters to the records list
 */
function applyFilters() {
    const searchTerm = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const methodFilter = document.getElementById('methodFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    const userAliasFilter = document.getElementById('userAliasFilter')?.value || '';

    const records = document.querySelectorAll('.record-item');
    let visibleCount = 0;
    const seenIndices = new Set();

    records.forEach(record => {
        const method = record.dataset.method || '';
        const status = record.dataset.status || '';
        const userAlias = record.dataset.useralias || '';
        const url = record.querySelector('.url')?.textContent.toLowerCase() || '';
        const index = record.dataset.index;

        const matchesSearch = !searchTerm || 
            url.includes(searchTerm) || 
            method.toLowerCase().includes(searchTerm) || 
            status.includes(searchTerm);

        const matchesMethod = !methodFilter || method === methodFilter;
        const matchesStatus = !statusFilter || status === statusFilter;
        const matchesUserAlias = !userAliasFilter || userAlias.split(',').includes(userAliasFilter);

        if (matchesSearch && matchesMethod && matchesStatus && matchesUserAlias) {
            record.classList.remove('hidden');
            if (!seenIndices.has(index)) {
                visibleCount++;
                seenIndices.add(index);
            }
        } else {
            record.classList.add('hidden');
        }
    });

    // Update count in header
    const recordCountSpan = document.getElementById('recordCount');
    if (recordCountSpan) {
        const totalRecords = typeof pactData !== 'undefined' ? pactData.records.length : 0;
        recordCountSpan.textContent = visibleCount === totalRecords ? totalRecords : `${visibleCount} of ${totalRecords}`;
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
        command: 'copyToClipboard',
        text: text
    });
}

/**
 * Export a record
 * @param {number} index - Record index
 */
function exportRecord(index) {
    if (typeof pactData !== 'undefined' && pactData.records && pactData.records[index]) {
        vscode.postMessage({
            command: 'exportRecord',
            record: pactData.records[index]
        });
    }
}

/**
 * Expand all records
 */
function expandAll() {
    const records = document.querySelectorAll('.record-item');
    records.forEach((record, index) => {
        if (!record.classList.contains('hidden')) {
            record.classList.add('expanded');
            const details = document.getElementById(`record-${index}`);
            if (details) {
                details.style.display = 'block';
            }
        }
    });
}

/**
 * Collapse all records
 */
function collapseAll() {
    const records = document.querySelectorAll('.record-item');
    records.forEach((record, index) => {
        record.classList.remove('expanded');
        const details = document.getElementById(`record-${index}`);
        if (details) {
            details.style.display = 'none';
        }
    });
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }

    // Ctrl/Cmd + E to expand all
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        expandAll();
    }

    // Ctrl/Cmd + Shift + E to collapse all
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        collapseAll();
    }
});
