// Shared utility functions for both server and client environments

import type { C8yPactRecord } from "../../../src/shared/c8ypact";
import { get_i } from "../../../src/shared/util";
import {
  C8yAuthOptions,
  getAuthOptionsFromBasicAuthHeader,
  getAuthOptionsFromJWT,
} from "../../../src/shared/auth";

// Type definitions
interface AuthDetails {
  type: string;
  display: string;
  userAlias?: string;
  options: C8yAuthOptions | undefined;
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
function getAuthDetails(record: C8yPactRecord): AuthDetails | undefined{
  const headers: any = record.request?.headers || {};
  const authHeader = get_i(headers, "authorization");

  if (authHeader) {
    if (
      authHeader.startsWith("Bearer ") ||
      record.auth?.type === "BearerAuth"
    ) {
      const options = getAuthOptionsFromJWT(authHeader);
      if (!options.user) {
        options.user = record.auth?.user;
      }
      return {
        type: "BearerAuth",
        display: "Bearer",
        userAlias: record.auth?.userAlias,
        options,
      };
    }

    if (
      authHeader.startsWith("Basic ") ||
      get_i(headers, "usexbasic") ||
      record.auth?.type === "BasicAuth"
    ) {
      const options = getAuthOptionsFromBasicAuthHeader(authHeader) ?? {
        user: record.auth?.user || "",
      };
      if (!options.user && record.auth?.user != null) {
        options.user = record.auth?.user;
      }
      return {
        type: "BasicAuth",
        display: "Basic",
        userAlias: record.auth?.userAlias,
        options,
      };
    }
  }

  if (get_i(headers, "cookie") || record.auth?.type === "CookieAuth") {
    return {
      type: "CookieAuth",
      display: "Cookie",
      options: {
        user: record.auth?.user || "",
        userAlias: record.auth?.userAlias,
      },
    };
  }

  if (record.auth) {
    return {
      type: record.auth.type || "Default",
      display: record.auth.type || "Default",
      userAlias: record.auth.userAlias,
      options: {
        user: record.auth.user || "",
        userAlias: record.auth.userAlias,
      },
    };
  }

  return { type: "None", display: "Default", options: undefined };
}

export { escapeHtml, truncateUrl, getStatusClass, getAuthDetails };
