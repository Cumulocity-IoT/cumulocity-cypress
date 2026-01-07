// Shared utility functions for both server and client environments

import type { C8yPactRecord } from "../../../src/shared/c8ypact";
import { get_i } from "../../../src/shared/util";
import {
  C8yAuthOptions,
  getAuthOptionsFromBasicAuthHeader,
  getAuthOptionsFromJWT,
} from "../../../src/shared/auth";

// Type definitions
interface AuthDetails extends C8yAuthOptions {
  display?: string;
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
  const statusNum = typeof status === "string" ? parseInt(status, 10) : status;

  if (statusNum >= 200 && statusNum < 300) return "status-success";
  if (statusNum >= 300 && statusNum < 400) return "status-redirect";
  if (statusNum >= 400 && statusNum < 500) return "status-client-error";
  if (statusNum >= 500) return "status-server-error";
  return "";
}

/**
 * Get authentication information from a record
 */
function getAuthDetails(record: C8yPactRecord): AuthDetails | undefined {
  const headers: any = record.request?.headers || {};
  const authHeader = get_i(headers, "authorization");
  const type = record.authType();
  const display = type?.replace("Auth", "");

  if (type === "BearerAuth") {
    const auth = getAuthOptionsFromJWT(authHeader);
    return {
      type,
      ...(display && { display }),
      ...auth,
    };
  }

  if (type === "BasicAuth") {
    const auth: C8yAuthOptions =
      getAuthOptionsFromBasicAuthHeader(authHeader) ?? record.auth ?? {};
    return {
      type,
      display,
      ...auth,
    };
  }

  if (record.auth) {
    return {
      type,
      display,
      ...record.auth,
    };
  }

  return undefined;
}

export { escapeHtml, truncateUrl, getStatusClass, getAuthDetails };
