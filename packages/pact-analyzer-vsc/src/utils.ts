// Shared utility functions for both server and client environments

import type { C8yPactRecord } from "../../../src/shared/c8ypact";

// Type definitions
interface AuthInfo {
  type: string;
  display: string;
  user: string;
  value: string | null;
}

/**
 * Escape HTML special characters
 * Uses DOM manipulation in browser, manual replacement in Node.js
 */
function escapeHtml(text: string): string {
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
    const map: Record<string, string> = {
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
 */
function truncateUrl(url: string, maxLength: number = 80): string {
  if (!url || url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + "...";
}

/**
 * Get CSS class for HTTP status code
 */
function getStatusClass(status: string | number): string {
  const statusNum = typeof status === 'string' ? parseInt(status, 10) : status;

  if (statusNum >= 200 && statusNum < 300) return "status-success";
  if (statusNum >= 300 && statusNum < 400) return "status-redirect";
  if (statusNum >= 400 && statusNum < 500) return "status-client-error";
  if (statusNum >= 500) return "status-server-error";
  return "";
}

/**
 * Get authentication information from a record
 */
function getAuthInfo(record: C8yPactRecord): AuthInfo {
  const headers: any = record.request?.headers || {};
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

  // const auth = record.auth;
  // if (auth) {
  //   if (auth.token) {
  //     const user = Array.isArray(auth.userAlias)
  //       ? auth.userAlias[0] || ""
  //       : auth.userAlias || auth.user || "";
  //     return { type: "Bearer", display: "Bearer Token", user: user, value: auth.token };
  //   }
  //   if (auth.user && auth.password) {
  //     const user = Array.isArray(auth.userAlias)
  //       ? auth.userAlias[0] || ""
  //       : auth.userAlias || auth.user || "";
  //     return { type: "Basic", display: "Basic Auth", user: user, value: auth.password };
  //   }
  //   if (auth.cookies) {
  //     const user = Array.isArray(auth.userAlias)
  //       ? auth.userAlias[0] || ""
  //       : auth.userAlias || auth.user || "";
  //     return { type: "Cookie", display: "Cookie", user: user, value: auth.cookies };
  //   }
  // }

  return { type: "None", display: "Default", user: "", value: null };
}

/**
 * Get header value case-insensitively
 */
function getHeaderValue(headers: Record<string, string> | undefined, key: string): string | null {
  if (!headers) return null;
  return headers[key] || headers[key.toLowerCase()];
}

// ES Module exports
export {
  escapeHtml,
  truncateUrl,
  getStatusClass,
  getAuthInfo,
  getHeaderValue,
};