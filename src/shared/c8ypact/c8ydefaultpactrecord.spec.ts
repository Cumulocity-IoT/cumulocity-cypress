/// <reference types="jest" />

import _ from "lodash";

import { C8yDefaultPactRecord, C8yDefaultPactRecordInit, createPactRecord } from "./c8ydefaultpactrecord";
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

    it("should create C8yDefaultPactRecord with individual parameters", function () {
      expect(record).not.toBeNull();
      expect(record!.request).not.toBeNull();
      expect(record!.response).not.toBeNull();
      expect(record!.auth).not.toBeNull();
      expect(record!.options).not.toBeNull();
    });

    it("should create C8yDefaultPactRecord with id parameter", function () {
      const recordWithId = new C8yDefaultPactRecord(
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
        { user: "test" },
        undefined,
        undefined,
        "test-id-123"
      );

      expect(recordWithId).not.toBeNull();
      expect(recordWithId.id).toBe("test-id-123");
      expect(recordWithId.request).not.toBeNull();
      expect(recordWithId.response).not.toBeNull();
      expect(recordWithId.auth).not.toBeNull();
      expect(recordWithId.options).not.toBeNull();
    });

    it("should create C8yDefaultPactRecord with object parameter", function () {
      const params: C8yDefaultPactRecordInit = {
        request: {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
          method: "POST"
        },
        response: {
          status: 201,
          isOkStatusCode: true,
        },
        options: {
          baseUrl: "http://localhost:8080",
        },
        auth: { user: "test" },
        createdObject: "created-object-123",
        id: "pact-id-456"
      };

      record = new C8yDefaultPactRecord(params);

      expect(record).not.toBeNull();
      expect(record.request).toEqual(params.request);
      expect(record.response).toEqual(params.response);
      expect(record.options).toEqual(params.options);
      expect(record.auth).toEqual(params.auth);
      expect(record.createdObject).toBe("created-object-123");
      expect(record.id).toBe("pact-id-456");
    });

    it("should create C8yDefaultPactRecord with object parameter with optional fields", function () {
      const params: C8yDefaultPactRecordInit = {
        request: {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
        response: {
          status: 200,
          isOkStatusCode: true,
        }
        // Only required fields, optional fields undefined
      };

      record = new C8yDefaultPactRecord(params);

      expect(record).not.toBeNull();
      expect(record.request).toEqual(params.request);
      expect(record.response).toEqual(params.response);
      expect(record.options).toBeUndefined();
      expect(record.auth).toBeUndefined();
      expect(record.createdObject).toBeUndefined();
      expect(record.modifiedResponse).toBeUndefined();
      expect(record.id).toBeUndefined();
    });

    it("should handle POST request and auto-set createdObject when using object parameter", function () {
      const params: C8yDefaultPactRecordInit = {
        request: {
          url: "http://localhost:8080/inventory/managedObjects",
          method: "POST"
        },
        response: {
          status: 201,
          isOkStatusCode: true,
          body: { id: "auto-generated-id-789" }
        }
      };

      record = new C8yDefaultPactRecord(params);

      expect(record).not.toBeNull();
      expect(record.createdObject).toBe("auto-generated-id-789");
    });
  });

  describe("from method", function () {
    it("should create record from Cypress.Response with id", function () {
      const response: Partial<Cypress.Response<any>> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "test-object" },
        url: "http://localhost:8080/inventory/managedObjects/1",
        method: "GET"
      };

      const record = C8yDefaultPactRecord.from(response, undefined, undefined, "from-id-123");

      expect(record).not.toBeNull();
      expect(record.id).toBe("from-id-123");
      expect(record.request.url).toBe(response.url);
      expect(record.response.status).toBe(response.status);
    });

    it("should create record from existing C8yPactRecord and preserve id", function () {
      const existingRecord: C8yDefaultPactRecord = new C8yDefaultPactRecord({
        request: { url: "http://localhost:8080/test" },
        response: { status: 200 },
        id: "existing-id-456"
      });

      const newRecord = C8yDefaultPactRecord.from(existingRecord);

      expect(newRecord).not.toBeNull();
      expect(newRecord.id).toBe("existing-id-456");
      expect(newRecord.request.url).toBe(existingRecord.request.url);
      expect(newRecord.response.status).toBe(existingRecord.response.status);
    });

    it("should create record from existing C8yPactRecord and override id", function () {
      const existingRecord: C8yDefaultPactRecord = new C8yDefaultPactRecord({
        request: { url: "http://localhost:8080/test" },
        response: { status: 200 },
        id: "existing-id-456"
      });

      const newRecord = C8yDefaultPactRecord.from(existingRecord, undefined, undefined, "new-id-789");

      expect(newRecord).not.toBeNull();
      expect(newRecord.id).toBe("new-id-789");
      expect(newRecord.request.url).toBe(existingRecord.request.url);
      expect(newRecord.response.status).toBe(existingRecord.response.status);
    });

    it("should create record from Cypress.Response without id", function () {
      const response: Partial<Cypress.Response<any>> = {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
        body: { error: "Not found" },
        url: "http://localhost:8080/inventory/managedObjects/999",
        method: "DELETE"
      };

      const record = C8yDefaultPactRecord.from(response);

      expect(record).not.toBeNull();
      expect(record.id).toBeUndefined();
      expect(record.request.url).toBe(response.url);
      expect(record.response.status).toBe(response.status);
    });
  });

  describe("createPactRecord function", function () {
    it("should create pact record with id", function () {
      const response: Partial<Cypress.Response<any>> = {
        status: 201,
        statusText: "Created",
        headers: { "content-type": "application/json" },
        body: { id: "new-object-123", name: "Test Object" },
        url: "http://localhost:8080/inventory/managedObjects",
        method: "POST"
      };

      const record = createPactRecord(response, undefined, { id: "create-pact-id-456" });

      expect(record).not.toBeNull();
      expect(record.id).toBe("create-pact-id-456");
      expect(record.request.url).toBe(response.url);
      expect(record.response.status).toBe(response.status);
    });

    it("should create pact record without id", function () {
      const response: Partial<Cypress.Response<any>> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "Test Object" },
        url: "http://localhost:8080/inventory/managedObjects/1",
        method: "GET"
      };

      const record = createPactRecord(response);

      expect(record).not.toBeNull();
      expect(record.id).toBeUndefined();
      expect(record.request.url).toBe(response.url);
      expect(record.response.status).toBe(response.status);
    });

    it("should create pact record with auth options and id", function () {
      const response: Partial<Cypress.Response<any>> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "Test Object" },
        url: "http://localhost:8080/inventory/managedObjects/1",
        method: "GET"
      };

      const record = createPactRecord(response, undefined, {
        loggedInUser: "testuser",
        loggedInUserAlias: "testalias",
        authType: "BasicAuth",
        id: "auth-pact-id-789"
      });

      expect(record).not.toBeNull();
      expect(record.id).toBe("auth-pact-id-789");
      expect(record.auth).toBeDefined();
      expect(record.auth?.user).toBe("testuser");
      expect(record.auth?.userAlias).toBe("testalias");
      expect(record.auth?.type).toBe("BasicAuth");
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

    it("should return BearerAuth for Bearer Authorization header", function () {
      record!.request.headers = { Authorization: "Bearer abcde" };
      expect(record!.authType()).toBe("BearerAuth");
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
