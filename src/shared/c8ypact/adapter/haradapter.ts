import * as fs from "fs";
import * as path from "path";
import * as glob from "glob";

import {
  C8yPact,
  C8yPactInfo,
  C8yPactObject,
  C8yPactRecord,
  C8yPactSaveKeys,
  pactId,
} from "../c8ypact";
import { safeStringify } from "../../util";
import type {
  Har,
  Entry,
  Header,
  QueryString,
  PostData,
  Content,
} from "har-format";

import { C8yPactDefaultFileAdapter } from "./fileadapter";
import { removeBaseUrlFromString } from "../../url";
import { C8yPactAuthObject } from "cumulocity-cypress/c8ypact";

/**
 * Re-export HAR types from the official @types/har-format package.
 * @see http://www.softwareishard.com/blog/har-12-spec/
 */
export type {
  Har,
  Entry,
  Header,
  QueryString,
  PostData,
  Content,
} from "har-format";

/**
 * C8yPactHARFileAdapter converts between C8yPact format and HAR (HTTP Archive) format.
 * This allows using external HAR tooling with C8yPact recordings.
 *
 * This adapter extends C8yPactDefaultFileAdapter to reuse folder management and utility
 * methods, but only supports .har file extension for reading and writing.
 *
 * When saving, pacts are converted to HAR format. When loading, HAR files are converted
 * back to C8yPact format. Some metadata may be stored in the comment fields to preserve
 * C8yPact-specific information.
 */
export class C8yPactHARFileAdapter extends C8yPactDefaultFileAdapter {
  protected readonly id: string = "harfileadapter";

  constructor(folder: string) {
    // Call parent constructor without JavaScript support
    super(folder, { enableJavaScript: false, id: "harfileadapter" });

    // Override enabled extensions to only support HAR files
    this.fileExtension = "har";
    this.enabledExtensions = [`.${this.fileExtension}`];
  }

  description(): string {
    return `C8yPactHarFileAdapter: ${this.folder}`;
  }

  savePact(pact: C8yPact | Pick<C8yPact, C8yPactSaveKeys>): void {
    this.createFolderRecursive(this.folder);
    const pId = pactId(pact.id);
    if (pId == null) {
      this.log(`savePact() - invalid pact id ${pact.id} -> ${pId}`);
      return;
    }

    const file = path.join(this.folder, `${pId}.${this.fileExtension}`);
    this.log(`savePact() - write ${file} (${pact.records?.length || 0} records)`);

    try {
      const har = this.pactToHAR(pact as C8yPact);
      fs.writeFileSync(file, safeStringify(har, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save pact as HAR.`, error);
    }
  }

  /**
   * Override parent's loadPactFromFile to handle HAR format conversion.
   * This is called by parent's loadPactObjects for each .har file found.
   */
  protected loadPactFromFile(filePath: string): C8yPactObject | null {
    if (!fs.existsSync(filePath)) {
      this.log(`loadPactFromFile() - file does not exist: ${filePath}`);
      return null;
    }

    const extension = path.extname(filePath).toLowerCase();

    // Only handle .har files
    if (extension !== `.${this.fileExtension}`) {
      this.log(
        `loadPactFromFile() - file extension ${extension} is not supported: ${filePath}`
      );
      return null;
    }

    try {
      const harContent = fs.readFileSync(filePath, "utf-8");
      const har: Har = JSON.parse(harContent);
      const filename = path.basename(filePath, `.${this.fileExtension}`);
      const pact = this.harToPact(har, filename);
      if (pact) {
        this.log(`loadPactFromFile() - ${filePath} loaded successfully`);
      }
      return pact;
    } catch (error) {
      this.log(`loadPactFromFile() - error loading ${filePath}: ${error}`);
      return null;
    }
  }

  /**
   * Override parent's loadPactObjects to use simpler glob pattern for .har files.
   * The parent's brace expansion pattern doesn't work well with single extensions.
   */
  protected loadPactObjects(): C8yPact[] {
    this.log(`loadPactObjects() - ${this.folder}`);
    if (!this.folder || !fs.existsSync(this.folder)) {
      this.log(`loadPactObjects() - ${this.folder} does not exist`);
      return [];
    }

    const harFiles = glob.sync(
      path.join(this.folder, `*.${this.fileExtension}`)
    );
    this.log(
      `loadPactObjects() - reading ${harFiles.length} .${this.fileExtension} files from ${this.folder}`
    );

    const pactObjects = harFiles
      .map((file: string) => {
        try {
          return this.loadPactFromFile(file);
        } catch (error) {
          this.log(`loadPactObjects() - error loading ${file}: ${error}`);
          return null;
        }
      })
      .filter(Boolean) as C8yPact[];

    this.log(`loadPactObjects() - loaded ${pactObjects.length} valid pact objects`);
    return pactObjects;
  }

  /**
   * Convert a C8yPact object to HAR format
   */
  protected pactToHAR(pact: C8yPact): Har {
    const entries: Entry[] = (pact.records || []).map((record) => {
      const request = record.request;
      const response = record.response;

      // Parse URL to extract query string parameters and ensure absolute URL
      const requestUrl = request.url || "";
      let absoluteUrl = requestUrl;
      let queryString: QueryString[] = [];
      try {
        // Parse URL with baseUrl to ensure it's absolute
        const urlObj = new URL(
          requestUrl,
          pact.info?.baseUrl || "http://localhost"
        );
        absoluteUrl = urlObj.href;
        queryString = Array.from(urlObj.searchParams.entries()).map(
          ([name, value]) => ({ name, value })
        );
      } catch {
        // If URL parsing fails, try to make it absolute if it starts with /
        if (requestUrl.startsWith("/") && pact.info?.baseUrl) {
          try {
            const baseUrl = pact.info.baseUrl.replace(/\/$/, "");
            absoluteUrl = baseUrl + requestUrl;
          } catch {
            // Keep original URL if all fails
          }
        }
      }

      // Convert headers from object to HAR format
      const requestHeaders: Header[] = request.headers
        ? Object.entries(request.headers).flatMap(([name, value]) => {
            if (Array.isArray(value)) {
              return value.map((v) => ({ name, value: String(v) }));
            }
            return [{ name, value: String(value) }];
          })
        : [];

      const responseHeaders: Header[] = response.headers
        ? Object.entries(response.headers).flatMap(([name, value]) => {
            if (Array.isArray(value)) {
              return value.map((v) => ({ name, value: String(v) }));
            }
            return [{ name, value: String(value) }];
          })
        : [];

      // Handle request body
      let postData: PostData | undefined;
      let requestBodySize = 0;
      if (request.body != null || request.$body != null) {
        const bodyData = request.$body || request.body;
        const headers = request.headers as Record<string, any> | undefined;
        const contentType =
          headers?.["content-type"] ||
          headers?.["Content-Type"] ||
          "application/json";
        const bodyText =
          typeof bodyData === "string" ? bodyData : safeStringify(bodyData);
        requestBodySize = bodyText ? bodyText.length : 0;
        postData = {
          mimeType: String(contentType),
          text: bodyText,
        };
      }

      // Handle response body
      const responseBody = response.$body || response.body;
      const respHeaders = response.headers as Record<string, any> | undefined;
      const responseContentType =
        respHeaders?.["content-type"] ||
        respHeaders?.["Content-Type"] ||
        "application/json";
      const responseText =
        typeof responseBody === "string"
          ? responseBody
          : safeStringify(responseBody);

      const responseContent: Content = {
        size: responseText ? responseText.length : 0,
        mimeType: String(responseContentType),
        text: responseText,
      };

      // Create the HAR entry with C8yPact metadata in comments
      const entry: Entry = {
        startedDateTime: new Date().toISOString(),
        time: response.duration || 0,
        request: {
          method: String(request.method || "GET").toUpperCase(),
          url: absoluteUrl,
          httpVersion: "HTTP/1.1",
          cookies: [],
          headers: requestHeaders,
          queryString: queryString,
          postData: postData,
          headersSize: -1,
          bodySize: requestBodySize,
        },
        response: {
          status: response.status || 200,
          statusText: response.statusText || "",
          httpVersion: "HTTP/1.1",
          cookies: [],
          headers: responseHeaders,
          content: responseContent,
          redirectURL: "",
          headersSize: -1,
          bodySize: responseContent.size,
        },
        cache: {},
        timings: {
          send: -1,
          wait: response.duration || 0,
          receive: -1,
        },
        comment: safeStringify({
          c8ypact: {
            id: record.id,
            auth: record.auth,
            options: record.options,
            createdObject: record.createdObject,
          },
        }),
      };

      return entry;
    });

    const har: Har = {
      log: {
        version: "1.2",
        creator: {
          name: pact.info?.producer
            ? typeof pact.info.producer === "string"
              ? pact.info.producer
              : pact.info.producer.name
            : "C8yPact",
          version: pact.info?.version?.c8ypact || "1.0.0",
        },
        entries: entries,
        comment: safeStringify({
          c8ypact: {
            id: pact.id,
            info: {
              ...pact.info,
              // Don't duplicate large fields that are in entries
            },
          },
        }),
      },
    };

    return har;
  }

  /**
   * Convert a HAR format to C8yPact object
   */
  protected harToPact(har: Har, id: string): C8yPactObject | null {
    try {
      // Extract C8yPact metadata from comment if available
      let pactMetadata: {
        id?: string;
        info?: C8yPactInfo;
        auth?: C8yPactAuthObject;
        options?: any;
        createdObject?: string;
      } = {};
      try {
        if (har.log.comment) {
          const parsed = JSON.parse(har.log.comment);
          pactMetadata = parsed.c8ypact || {};
        }
      } catch {
        // Ignore comment parsing errors
      }
      const baseUrl = pactMetadata.info?.baseUrl;
      const pactId = pactMetadata.id || id;
      const records = har.log.entries.map((entry) => {
        // Extract C8yPact metadata from entry comment if available
        let recordMetadata: any = {};
        try {
          if (entry.comment) {
            const parsed = JSON.parse(entry.comment);
            recordMetadata = parsed.c8ypact || {};
          }
        } catch {
          // Ignore comment parsing errors
        }

        // Convert HAR headers to object format
        const requestHeaders: { [key: string]: string } = {};
        entry.request.headers.forEach((header) => {
          requestHeaders[header.name] = header.value;
        });

        const responseHeaders: { [key: string]: string } = {};
        entry.response.headers.forEach((header) => {
          responseHeaders[header.name] = header.value;
        });

        // Parse request body
        let requestBody: any;
        if (entry.request.postData?.text) {
          try {
            // Try to parse as JSON
            if (entry.request.postData.mimeType.includes("application/json")) {
              requestBody = JSON.parse(entry.request.postData.text);
            } else {
              requestBody = entry.request.postData.text;
            }
          } catch {
            requestBody = entry.request.postData.text;
          }
        }

        // Parse response body
        let responseBody: any;
        if (entry.response.content.text) {
          try {
            // Try to parse as JSON
            if (entry.response.content.mimeType.includes("application/json")) {
              responseBody = JSON.parse(entry.response.content.text);
            } else {
              responseBody = entry.response.content.text;
            }
          } catch {
            responseBody = entry.response.content.text;
          }
        }

        return {
          id: recordMetadata.id,
          request: {
            method: entry.request.method,
            url: removeBaseUrlFromString(entry.request.url, baseUrl),
            headers: requestHeaders,
            body: requestBody,
          },
          response: {
            status: entry.response.status,
            statusText: entry.response.statusText,
            headers: responseHeaders,
            body: responseBody,
            duration: entry.time,
            isOkStatusCode:
              entry.response.status >= 200 && entry.response.status < 300,
          },
          auth: recordMetadata.auth,
          options: recordMetadata.options,
          createdObject: recordMetadata.createdObject,
        } as C8yPactRecord;
      });

      // Reconstruct pact info from HAR metadata
      const info = {
        ...pactMetadata.info,
        id: pactId,
        producer: {
          name: har.log.creator.name,
          version: har.log.creator.version,
        },
        version: { c8ypact: har.log.creator.version },
        baseUrl: pactMetadata.info?.baseUrl || "",
      };

      const pact: C8yPactObject = {
        id: pactId,
        info: info,
        records: records,
      };

      return pact;
    } catch (error) {
      this.log(`harToPact() - error converting HAR to pact: ${error}`);
      return null;
    }
  }
}
