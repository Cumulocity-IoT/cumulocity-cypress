/// <reference types="jest" />

import {
  isAbsoluteURL,
  isURL,
  normalizeBaseUrl,
  relativeURL,
  removeBaseUrlFromString,
  tenantUrl,
  updateURLs,
  urlForBaseUrl,
  validateBaseUrl,
} from "./url";

describe("url", () => {
  it("isUrl", () => {
    expect(isURL(new URL("http://example.com"))).toBeTruthy();
    expect(isURL("http://example.com")).toBeFalsy();
    expect(isURL("")).toBeFalsy();
    expect(isURL(null)).toBeFalsy();
    expect(isURL(undefined)).toBeFalsy();
  });

  it("relativeURL", () => {
    expect(relativeURL(new URL("http://example.com"))).toBe("/");
    expect(relativeURL("http://example.com/my/path")).toBe("/my/path");
    expect(relativeURL("http://example.com/my/path?x=y")).toBe("/my/path?x=y");
    expect(relativeURL("http://example.com/my/path?x")).toBe("/my/path?x");
    expect(relativeURL("")).toBeFalsy();
  });

  it("removeBaseUrlFromString", () => {
    const _r = removeBaseUrlFromString;
    expect(_r("http://example.com/my/path", "http://example.com")).toBe(
      "/my/path"
    );
    expect(_r("http://example.com/my/path", "http://example.com////")).toBe(
      "/my/path"
    );
    expect(_r("http://example.com", "http://example.com")).toBe("/");
    expect(_r("http://example.com/my/path", undefined)).toBe(
      "http://example.com/my/path"
    );
    expect(_r("http://example.com/my/path", "http://example.com/my/path")).toBe(
      "/"
    );
  });

  it("tenantUrl", () => {
    expect(tenantUrl("http://cumulocity.com", "my-tenant")).toBe(
      "http://my-tenant.cumulocity.com"
    );
    expect(tenantUrl("http://xyz.eu-latest.cumulocity.com", "my-tenant")).toBe(
      "http://my-tenant.eu-latest.cumulocity.com"
    );
    expect(
      tenantUrl(
        "https://xyz.eu-latest.cumulocity.com/adbsdahabds?qwe=121",
        "my-tenant"
      )
    ).toBe("https://my-tenant.eu-latest.cumulocity.com/adbsdahabds?qwe=121");

    expect(
      tenantUrl("http://xyz.eu-latest.cumulocity.com////", "my-tenant")
    ).toBe("http://my-tenant.eu-latest.cumulocity.com");

    expect(tenantUrl("http://example.com", "")).toBe(undefined);
    expect(tenantUrl("", "my-tenant")).toBe(undefined);
    expect(tenantUrl("", "")).toBe(undefined);
  });

  it("isAbsoluteURL", () => {
    expect(isAbsoluteURL("HTTPS://example.com///")).toBeTruthy();
    expect(isAbsoluteURL("http://example.com")).toBeTruthy();
    expect(isAbsoluteURL("https://example.com")).toBeTruthy();
    expect(isAbsoluteURL("ftp://example.com")).toBeFalsy();
    expect(isAbsoluteURL("example.com")).toBeFalsy();
    expect(isAbsoluteURL("")).toBeFalsy();
    expect(isAbsoluteURL(null as any)).toBeFalsy();
    expect(isAbsoluteURL(undefined as any)).toBeFalsy();
  });

  it("validateBaseUrl", () => {
    expect(() => validateBaseUrl("example.com")).toThrow();
    expect(() => validateBaseUrl(undefined as any)).not.toThrow();
    expect(() => validateBaseUrl(null as any)).not.toThrow();
    expect(() => validateBaseUrl("")).toThrow();
    expect(() => validateBaseUrl("http://example.com")).not.toThrow();

    const x: any = undefined,
      y: any = "https://example.com";
    expect(() => validateBaseUrl(x || y)).not.toThrow();
  });

  it("urlFromStrings", () => {
    expect(urlForBaseUrl("http://example.com", undefined)).toEqual(
      "http://example.com"
    );
    expect(urlForBaseUrl("http://example.com", "/my/path")).toEqual(
      "http://example.com/my/path"
    );
    expect(urlForBaseUrl("http://example.com/", "my/path")).toEqual(
      "http://example.com/my/path"
    );
    expect(urlForBaseUrl("http://example.com/base/", "/my/path")).toEqual(
      "http://example.com/my/path"
    );
    expect(
      urlForBaseUrl("http://example.com/base/", "/my/path?bac=123")
    ).toEqual("http://example.com/my/path?bac=123");
  });

  describe("updateURLs", () => {
    it("should return the same URL if no changes are made", () => {
      expect(updateURLs("http://example.com", {} as any, {} as any)).toBe(
        "http://example.com"
      );
    });

    it("should update the URL if the base URL changes", () => {
      expect(
        updateURLs(
          "https://xyz.eu-latest.cumulocity.com",
          {
            baseUrl: "https://xyz.eu-latest.cumulocity.com",
          },
          {
            baseUrl: "https://abc.eu-latest.cumulocity.com",
          }
        )
      ).toBe("https://abc.eu-latest.cumulocity.com");
    });

    it("should update the URL with tenant id", () => {
      expect(
        updateURLs(
          "https://t1234.eu-latest.cumulocity.com",
          {
            baseUrl: "https://xyz.eu-latest.cumulocity.com",
            tenant: "t1234",
          },
          {
            baseUrl: "https://abc.eu-latest.cumulocity.com",
          }
        )
      ).toBe("https://abc.eu-latest.cumulocity.com");
    });

    it("should update the URL with tenants", () => {
      expect(
        updateURLs(
          "https://t1234.eu-latest.cumulocity.com",
          {
            baseUrl: "https://xyz.eu-latest.cumulocity.com",
            tenant: "t1234",
          },
          {
            baseUrl: "https://abc.eu-latest.cumulocity.com",
            tenant: "t5678",
          }
        )
      ).toBe("https://t5678.eu-latest.cumulocity.com");
    });

    it("should update the URL with tenant id with localhost and port", () => {
      expect(
        updateURLs(
          "https://t1234.eu-latest.cumulocity.com",
          {
            baseUrl: "https://xyz.eu-latest.cumulocity.com",
            tenant: "t1234",
          },
          {
            baseUrl: "http://localhost:8181",
          }
        )
      ).toBe("http://localhost:8181");
    });

    it("should add tenant if short url", () => {
      expect(
        updateURLs(
          "https://t1234.eu-latest.cumulocity.com",
          {
            baseUrl: "https://xyz.eu-latest.cumulocity.com",
            tenant: "t1234",
          },
          {
            baseUrl: "https://cumulocity.com",
            tenant: "t5678",
          }
        )
      ).toBe("https://t5678.cumulocity.com");
    });

    it("update baseUrls with json", function () {
      const body = `"{"self": "https://mytenant.cumulocity.com/inventory/managedObjects/1?withChildren=false"}"`;
      expect(
        updateURLs(
          body,
          { baseUrl: "https://mytenant.cumulocity.com", tenant: "t12345" },
          { baseUrl: "http://localhost:8080" }
        )
      ).toBe(
        `"{"self": "http://localhost:8080/inventory/managedObjects/1?withChildren=false"}"`
      );
    });

    it("update baseUrls with tenant with json", function () {
      const body = `"{"self": "https://t123456.eu-latest.cumulocity.com/inventory/managedObjects/1?withChildren=false"}"`;
      expect(
        updateURLs(
          body,
          {
            baseUrl: "https://mytenant.eu-latest.cumulocity.com",
            tenant: "t123456",
          },
          { baseUrl: "http://localhost:8080" }
        )
      ).toBe(
        `"{"self": "http://localhost:8080/inventory/managedObjects/1?withChildren=false"}"`
      );
    });

    it("update baseUrls with tenants with json", function () {
      const body = `"{"self": "https://t123456.eu-latest.cumulocity.com/inventory/managedObjects/1?withChildren=false"}"`;
      expect(
        updateURLs(
          body,
          {
            baseUrl: "https://mytenant.eu-latest.cumulocity.com",
            tenant: "t123456",
          },
          {
            baseUrl: "http://test.us.cumulocity.com",
            tenant: "t654321",
          }
        )
      ).toBe(
        `"{"self": "http://t654321.us.cumulocity.com/inventory/managedObjects/1?withChildren=false"}"`
      );
    });
  });

  describe("normalizeBaseUrl", () => {
    it("should return undefined for undefined input", () => {
      const result = normalizeBaseUrl(undefined);
      expect(result).toBeUndefined();
    });

    it("should return undefined for null input", () => {
      const result = normalizeBaseUrl(null as any);
      expect(result).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      const result = normalizeBaseUrl("");
      expect(result).toBeUndefined();
    });

    it("should return undefined for whitespace-only string", () => {
      const result = normalizeBaseUrl("   ");
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-string input", () => {
      const result = normalizeBaseUrl(123 as any);
      expect(result).toBeUndefined();
    });
    it("should return existing HTTPS URL unchanged", () => {
      const result = normalizeBaseUrl("https://example.com");
      expect(result).toBe("https://example.com");
    });

    it("should return existing HTTP URL unchanged", () => {
      const result = normalizeBaseUrl("http://example.com");
      expect(result).toBe("http://example.com");
    });

    it("should add HTTPS to URL without protocol", () => {
      const result = normalizeBaseUrl("example.com");
      expect(result).toBe("https://example.com");
    });

    it("should add HTTPS to URL with path but no protocol", () => {
      const result = normalizeBaseUrl("example.com/path");
      expect(result).toBe("https://example.com");
    });

    it("should add HTTPS to URL with port but no protocol", () => {
      const result = normalizeBaseUrl("example.com:8080");
      expect(result).toBe("https://example.com:8080");
    });

    it("should handle case-insensitive protocols", () => {
      const result1 = normalizeBaseUrl("HTTPS://example.com");
      expect(result1).toBe("https://example.com");

      const result2 = normalizeBaseUrl("HTTP://example.com");
      expect(result2).toBe("http://example.com");
    });

    it("should trim whitespace before processing", () => {
      const result = normalizeBaseUrl("  example.com  ");
      expect(result).toBe("https://example.com");
    });

    it("should handle complex URLs without protocol", () => {
      const result = normalizeBaseUrl(
        "subdomain.example.com:8080/path?query=value#fragment"
      );
      expect(result).toBe("https://subdomain.example.com:8080");
    });

    it("should handle localhost URLs", () => {
      const result1 = normalizeBaseUrl("localhost:3000");
      expect(result1).toBe("https://localhost:3000");

      const result2 = normalizeBaseUrl("http://localhost:3000");
      expect(result2).toBe("http://localhost:3000");
    });

    it("should handle IP addresses", () => {
      const result1 = normalizeBaseUrl("192.168.1.1:8080");
      expect(result1).toBe("https://192.168.1.1:8080");

      const result2 = normalizeBaseUrl("https://192.168.1.1:8080");
      expect(result2).toBe("https://192.168.1.1:8080");
    });

    it("should handle URLs with subdomains", () => {
      const result = normalizeBaseUrl("sub.domain.example.com");
      expect(result).toBe("https://sub.domain.example.com");
    });

    it("should handle URLs with query parameters", () => {
      const result = normalizeBaseUrl("example.com?param=value");
      expect(result).toBe("https://example.com");
    });

    it("should handle URLs with fragments", () => {
      const result = normalizeBaseUrl("example.com#section");
      expect(result).toBe("https://example.com");
    });

    it("should handle Cumulocity-style URLs", () => {
      const result1 = normalizeBaseUrl("tenant.cumulocity.com");
      expect(result1).toBe("https://tenant.cumulocity.com");

      const result2 = normalizeBaseUrl("tenant.eu-latest.cumulocity.com");
      expect(result2).toBe("https://tenant.eu-latest.cumulocity.com");
    });

    it("should not add trailing slash to URLs with existing paths", () => {
      const result1 = normalizeBaseUrl("https://example.com/api");
      expect(result1).toBe("https://example.com");

      const result2 = normalizeBaseUrl("example.com/api/v1");
      expect(result2).toBe("https://example.com");
    });

    it("should handle URLs that already have trailing slash", () => {
      const result1 = normalizeBaseUrl("https://example.com/");
      expect(result1).toBe("https://example.com");

      const result2 = normalizeBaseUrl("example.com/");
      expect(result2).toBe("https://example.com");
    });

    it("should handle URLs with multiple slashes", () => {
      const result1 = normalizeBaseUrl("https://example.com///path");
      expect(result1).toBe("https://example.com");
      const result2 = normalizeBaseUrl("https://example.com//////");
      expect(result2).toBe("https://example.com");
    });

    it("should throw an error for invalid URLs", () => {
      expect(() => normalizeBaseUrl("not a url")).toThrow();
      expect(() => normalizeBaseUrl("http://")).toThrow();
      expect(() => normalizeBaseUrl("://missing.protocol.com")).toThrow();
    });
  });
});
