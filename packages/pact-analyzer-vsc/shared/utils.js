// Shared utility functions for both server and client environments

/**
 * Escape HTML special characters
 * Uses DOM manipulation in browser, manual replacement in Node.js
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return "";

  // Check if we're in a browser environment
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    // Browser environment - use DOM manipulation
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  } else {
    // Node.js environment - use manual string replacement
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return String(text).replace(/[&<>"']/g, (m) => map[m]);
  }
}

/**
 * Truncate URL for display
 * @param {string} url - URL to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - Truncated URL
 */
function truncateUrl(url, maxLength = 80) {
  if (!url || url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + "...";
}

/**
 * Get CSS class for HTTP status code
 * @param {number} status - HTTP status code
 * @returns {string} - CSS class name
 */
function getStatusClass(status) {
  if (status >= 200 && status < 300) return "status-success";
  if (status >= 300 && status < 400) return "status-redirect";
  if (status >= 400 && status < 500) return "status-client-error";
  if (status >= 500) return "status-server-error";
  return "";
}

/**
 * Get authentication information from a record
 * @param {Object} record - Pact record object
 * @returns {Object} - Auth info with type, display, and user
 */
function getAuthInfo(record) {
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

  const auth = record.auth;
  if (auth) {
    if (auth.token) {
      const user = auth.userAlias || auth.user || "";
      return { type: "Bearer", display: "Bearer Token", user: user, value: auth.token };
    }
    if (auth.user && auth.password) {
      const user = auth.userAlias || auth.user || "";
      return { type: "Basic", display: "Basic Auth", user: user, value: auth.password };
    }
    if (auth.cookies) {
      const user = auth.userAlias || auth.user || "";
      return { type: "Cookie", display: "Cookie", user: user, value: auth.cookies };
    }
  }

  return { type: "None", display: "Default", user: "", value: null };
}

/**
 * Check if the data is a valid C8yPact file
 * @param {any} data
 * @returns {boolean}
 */
function isValidPactFile(data) {
  return (
    data &&
    typeof data === "object" &&
    "info" in data &&
    "records" in data &&
    Array.isArray(data.records) &&
    "id" in data
  );
}

function getHeaderValue(headers, key) {
  if (!headers) return null;
  return headers[key] || headers[key.toLowerCase()];
}

/**
 * Export functions for both CommonJS and ES modules
 */
if (typeof module !== "undefined" && module.exports) {
  // CommonJS (Node.js)
  module.exports = {
    escapeHtml,
    truncateUrl,
    getStatusClass,
    getAuthInfo,
    isValidPactFile,
    getHeaderValue,
  };
} else if (typeof window !== "undefined") {
  // Browser environment
  window.PactUtils = {
    escapeHtml,
    truncateUrl,
    getStatusClass,
    getAuthInfo,
    isValidPactFile,
    getHeaderValue,
  };
}
