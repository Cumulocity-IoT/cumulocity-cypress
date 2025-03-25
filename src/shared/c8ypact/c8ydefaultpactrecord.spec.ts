/// <reference types="jest" />

import _ from "lodash";

import { C8yDefaultPact } from "./c8ydefaultpact";
import { isPact } from "./c8ypact";
import { C8yDefaultPactRecord } from "./c8ydefaultpactrecord";
import { C8yBaseUrl } from "../types";

const BASE_URL = "http://localhost:4200";
const url = (path: string, baseUrl: C8yBaseUrl = BASE_URL) => {
  if (baseUrl && !baseUrl.toLowerCase().startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  return `${baseUrl}${path}`;
};

// more tests of still in c8ypact.cy.ts
describe("c8ydefaultpactrecord", () => {
  // response to create a test pact object
  const response: Cypress.Response<any> = {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: { name: "t123456789" },
    duration: 100,
    requestHeaders: { "content-type": "application/json2" },
    requestBody: { id: "abc123124" },
    allRequestResponses: [],
    isOkStatusCode: false,
    method: "PUT",
    url: BASE_URL,
  };

  describe("create record", function () {
    let record: C8yDefaultPactRecord | undefined;

    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
        {
          status: 201,
          isOkStatusCode: true,
        },
        {
          baseUrl: "http://localhost:8080",
        },
        { user: "test" }
      );
    });

    it("should create C8yDefaultPactRecord", function () {
      expect(record).not.toBeNull();
      expect(record!.request).not.toBeNull();
      expect(record!.response).not.toBeNull();
      expect(record!.auth).not.toBeNull();
      expect(record!.options).not.toBeNull();
    });
  });

  describe("hasRequestHeader", function () {
    let record: C8yDefaultPactRecord | undefined;

    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
          headers: { "x-xsrf-token": "abcde" },
        },
        {
          status: 201,
          isOkStatusCode: true,
        },
        {},
        { user: "test" }
      );
    });

    it("should return true for existing header", function () {
      expect(record!.hasRequestHeader("x-xsrf-token")).toBeTruthy();
    });

    it("should return false for non-existing header", function () {
      expect(record!.hasRequestHeader("content-type2")).toBeFalsy();
    });

    it("should use case-insensitive comparison", function () {
      expect(record!.hasRequestHeader("X-XSRF-TOKEN")).toBeTruthy();
    });
  });

  describe("authType", function () {
    let record: C8yDefaultPactRecord | undefined;

    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
          headers: { "x-xsrf-token": "abcde" },
        },
        {
          status: 201,
          isOkStatusCode: true,
        },
        {},
        { user: "test" }
      );
    });

    it("should return CookieAuth for x-xsrf-token header", function () {
      expect(record!.authType()).toBe("CookieAuth");
    });

    it("should return type from auth object", function () {
      record!.auth = { type: "BasicAuth", user: "test" };
      expect(record!.authType()).toBe("BasicAuth");
    });

    it("should return undefined for unknown auth type", function () {
      record!.request.headers = {};
      record!.auth = { type: "UnknownAuth", user: "test" };
      expect(record!.authType()).toBe(undefined);
    });

    it("should return BasicAuth for Authorization header", function () {
      record!.request.headers = { Authorization: "Basic abcde" };
      expect(record!.authType()).toBe("BasicAuth");
    });
  });

  describe("date", function () {
    let record: C8yDefaultPactRecord | undefined;
    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
        {
          status: 201,
          isOkStatusCode: true,
        }
      );
    });

    it("should return date object", function () {
      record!.response.headers = { date: "2021-01-01" };
      expect(record!.date()).not.toBeNull();
      expect(record!.date()).toBeInstanceOf(Date);
      expect(record!.date()).toEqual(new Date("2021-01-01"));
    });

    it("should return null for invalid date", function () {
      record!.response.headers = { date: "abc" };
      expect(record!.date()).toBeNull();
    });
  });

  describe("toCypressResponse", function () {
    let record: C8yDefaultPactRecord | undefined;

    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
          headers: { "x-xsrf-token": "abcde" },
          method: "POST",
          body: { id: "abc123124" },
        },
        {
          status: 201,
        },
        {},
        { user: "test" }
      );
    });

    it("should convert to Cypress.Response", function () {
      const cypressResponse = record!.toCypressResponse();
      expect(cypressResponse).not.toBeNull();
      expect(cypressResponse).toHaveProperty("status", 201);
      expect(cypressResponse).toHaveProperty("isOkStatusCode", true);
      expect(cypressResponse).toHaveProperty("requestHeaders");
      expect(cypressResponse).toHaveProperty("requestBody");
      expect(cypressResponse).toHaveProperty("url");
      expect(cypressResponse).toHaveProperty("method");
    });
  });
});
