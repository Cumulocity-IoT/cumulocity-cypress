/// <reference types="jest" />

import {
  isAbsoluteURL,
  isURL,
  relativeURL,
  removeBaseUrlFromString,
  tenantUrl,
  updateURLs,
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
});
