/// <reference types="jest" />

import _ from "lodash";

import { C8yDefaultPact } from "./c8ydefaultpact";
import { isPact } from "./c8ypact";
import { C8yDefaultPactRecord } from "./c8ydefaultpactrecord";

/**
 * Wrapper for protected methods and properties of C8yDefaultPact for testing.
 */
class TestPact extends C8yDefaultPact {
  test_getRecordIndex() {
    return this.recordIndex;
  }

  test_setRecordIndex(index: number) {
    this.recordIndex = index;
  }

  test_getRequestIndexMap() {
    return this.requestIndexMap;
  }

  test_setRequestIndexMap(map: { [key: string]: number }) {
    this.requestIndexMap = map;
  }

  test_getIteratorIndex() {
    return this.iteratorIndex;
  }

  test_setIteratorIndex(index: number) {
    this.iteratorIndex = index;
  }

  test_getRequesIndex(key: string) {
    return this.getRequesIndex(key);
  }
}

const BASE_URL = "http://localhost:4200";
const url = (path: string, baseUrl: string = BASE_URL) => {
  if (baseUrl && !baseUrl.toLowerCase().startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  return `${baseUrl}${path}`;
};

// more tests of still in c8ypact.cy.ts
describe("c8defaultpact", () => {
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

  describe("record operations", function () {
    let record: C8yDefaultPactRecord | undefined;
    let pact: TestPact | undefined;

    beforeEach(() => {
      record = new C8yDefaultPactRecord(
        {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
        {
          status: 201,
          isOkStatusCode: true,
        },
        {},
        { user: "test" }
      );
      pact = new TestPact(
        [record],
        {
          id: "testid",
          baseUrl: "http://localhost:8080",
        },
        "test"
      );
    });

    it("clearRecords()", function () {
      pact?.test_setIteratorIndex(10);
      pact?.test_setRecordIndex(10);
      pact?.test_setRequestIndexMap({ test: 1 });
      pact!.clearRecords();
      expect(pact!.records.length).toBe(0);
      expect(pact!.test_getIteratorIndex()).toBe(0);
      expect(pact!.test_getRecordIndex()).toBe(0);
      expect(pact!.test_getRequestIndexMap()).toEqual({});
    });

    it("nextRecord() and recordIndex", function () {
      const clone = _.cloneDeep(record!);
      clone.request.url = "http://localhost:8080/tenant/currentTenant";
      pact!.records.push(clone!);
      expect(pact!.records.length).toBe(2);

      const r1 = pact!.nextRecord();
      expect(pact!.test_getRecordIndex()).toBe(1);
      expect(r1).toBe(record);

      const r2 = pact!.nextRecord();
      expect(pact!.test_getRecordIndex()).toBe(2);
      expect(r2).toBe(clone!);

      pact!.clearRecords();
      expect(pact!.nextRecord()).toBe(null);
      expect(pact!.test_getRecordIndex()).toBe(0);
    });

    it("nextRecord() should return next record", function () {
      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
      });
      pact.records.push(C8yDefaultPactRecord.from(response));
      expect(pact.records).toHaveLength(2);
      expect(pact.nextRecord()).not.toBeNull();
      expect(pact.nextRecord()).not.toBeNull();
      expect(pact.nextRecord()).toBeNull();
    });

    it("appendRecord()", function () {
      const clone = _.cloneDeep(record!);
      clone.request.url = "http://localhost:8080/tenant/currentTenant";
      expect(pact!.records.length).toBe(1);
      const result = pact!.appendRecord(clone!);
      expect(result).toBe(true);
      expect(pact!.records.length).toBe(2);
      expect(pact!.records[1]).toBe(clone!);
    });

    it("appendRecord() with skipIfExists for existing record", function () {
      const clone = _.cloneDeep(record!);
      clone.response.status = 404;
      const result = pact!.appendRecord(clone!, true);
      expect(result).toBe(false);
      expect(pact!.records.length).toBe(1);
      expect(pact!.records[0]).toBe(record);
      expect(pact!.records[0].response.status).toBe(201);
    });

    it("replaceRecord()", function () {
      const clone = _.cloneDeep(record!);
      clone.response.status = 404;
      expect(pact!.records.length).toBe(1);
      const result = pact!.replaceRecord(clone);
      expect(result).toBe(true);
      expect(pact!.records.length).toBe(1);
      expect(pact!.records[0]).toBe(clone!);
    });

    it("replaceRecord() with new record", function () {
      const clone = _.cloneDeep(record!);
      clone.request.url = "http://localhost:8080/tenant/currentTenant";
      expect(pact!.records.length).toBe(1);
      const result = pact!.replaceRecord(clone!);
      expect(result).toBe(true);
      expect(pact!.records.length).toBe(2);
      expect(pact!.records[0]).toBe(record!);
      expect(pact!.records[1]).toBe(clone!);
    });

    it("replaceRecord() with sequence of same requests", function () {
      pact!.records.push(record!);
      pact!.records.push(record!);
      expect(pact!.records.length).toBe(3);

      const clone = _.cloneDeep(record!);
      clone.response.status = 404;
      const result1 = pact!.replaceRecord(clone!);
      expect(result1).toBe(true);
      expect(pact!.records.length).toBe(3);
      expect(pact!.records[0]).toBe(clone!);
      expect(pact!.records[1]).toBe(record!);
      expect(pact!.records[2]).toBe(record!);

      const result2 = pact!.replaceRecord(clone!);
      expect(result2).toBe(true);
      expect(pact!.records.length).toBe(3);
      expect(pact!.records[0]).toBe(clone!);
      expect(pact!.records[1]).toBe(clone!);
      expect(pact!.records[2]).toBe(record!);

      const result3 = pact!.replaceRecord(clone!);
      expect(result3).toBe(true);
      expect(pact!.records.length).toBe(3);
      expect(pact!.records[0]).toBe(clone!);
      expect(pact!.records[1]).toBe(clone!);
      expect(pact!.records[2]).toBe(clone!);

      const result4 = pact!.replaceRecord(clone!);
      expect(result4).toBe(true);
      expect(pact!.records.length).toBe(4);
      expect(pact!.records[3]).toBe(clone!);
    });

    it("record iterator", function () {
      const clone = _.cloneDeep(record!);
      clone.request.url = "http://localhost:8080/tenant/currentTenant";
      pact!.records.push(clone!);
      expect(pact!.records.length).toBe(2);

      let index = 0;
      for (const r of pact!) {
        expect(r).toBe(pact!.records[index]);
        index++;
      }
    });
  });

  describe("from()", function () {
    it("from() should create C8yDefaultPact from Cypress.Response", function () {
      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
      });
      expect(pact).not.toBeNull();
      expect(pact.records).toHaveLength(1);
      expect(isPact(pact)).toBe(true);
    });

    it("from() should create C8yDefaultPact from serialized string", function () {
      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
      });
      const pact2 = C8yDefaultPact.from(JSON.stringify(pact));
      expect(pact2).not.toBeNull();
      expect(pact2.records).toHaveLength(1);
      expect(isPact(pact2)).toBe(true);
    });

    it("from() should create C8yDefaultPact from C8yPact object", function () {
      const pactObject = {
        records: [C8yDefaultPactRecord.from(response)],
        info: {
          baseUrl: "http://localhost:4200",
        },
        id: "test",
      };
      // @ts-expect-error
      const pact = C8yDefaultPact.from(pactObject);
      expect(pact).not.toBeNull();
      expect(pact.records).toHaveLength(1);
      expect(isPact(pact)).toBe(true);
    });

    // error tests for C8yDefaultPact.from()
    it("from() should throw error if invalid object", function () {
      expect(() => {
        C8yDefaultPact.from({ test: "test" } as any);
      }).toThrow(/Invalid pact object\./);
    });

    it("from() should throw error if invalid string", function () {
      expect(() => {
        C8yDefaultPact.from(`{ "test": "test" }`);
      }).toThrow(/Invalid pact object\./);
    });

    it("from() should throw error when passing null", function () {
      expect(() => {
        C8yDefaultPact.from(null as any);
      }).toThrow(/Can not create pact from null or undefined\./);
    });
  });

  describe("getRecordsMatchingRequest()", function () {
    it("getRecordsMatchingRequest should return records matching the request", function () {
      const url1 = "/service/oee-bundle/configurationmanager/2/configuration";
      const url2 =
        "/inventory/managedObjects?pageSize=10&fragmentType=isISAObject";
      const url3 = "/service/oee-bundle/configurationmanager/2/configuration";

      // matching of records is based on url and method
      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
      });
      pact.records.push(C8yDefaultPactRecord.from(response));
      pact.records.push(C8yDefaultPactRecord.from(response));
      pact.records[0].request.url = url(url1);
      pact.records[1].request.url = url(url2);
      pact.records[2].request.url = url(url3);
      pact.records[2].request.method = "GET";

      expect(
        pact.getRecordsMatchingRequest({ url: url(url1), method: "PUT" })
      ).toEqual([pact.records[0]]);
      expect(
        pact.getRecordsMatchingRequest({ url: url(url2), method: "PUT" })
      ).toEqual([pact.records[1]]);
      expect(pact.getRecordsMatchingRequest({ url: url(url3) })).toEqual([
        pact.records[0],
        pact.records[2],
      ]);
      expect(
        pact.getRecordsMatchingRequest({ url: url("/test"), method: "PUT" })
      ).toBeNull();
      expect(pact.getRecordsMatchingRequest({ url: url("/test") })).toBeNull();
    });

    it("getRecordsMatchingRequest should match requests with different baseUrls", function () {
      const url1 = "/service/oee-bundle/configurationmanager/2/configuration";

      const r = _.cloneDeep(response);
      r.url = "https://mytest.com" + url1;
      r.method = "GET";
      // pact has been recorded with mytest.com as baseUrl
      const pact = C8yDefaultPact.from(r, {
        id: "testid",
        baseUrl: "https://mytest.com",
      });

      // matches with baseUrl
      expect(
        pact.getRecordsMatchingRequest(
          { url: url(url1), method: "GET" },
          BASE_URL
        )
      ).toEqual([pact.records[0]]);
      expect(
        pact.getRecordsMatchingRequest({ url: url1, method: "GET" }, BASE_URL)
      ).toEqual([pact.records[0]]);
      // does not match as it is has a different baseUrl
      expect(
        pact.getRecordsMatchingRequest(
          {
            url: `https://xyz.com${url1}`,
            method: "GET",
          },
          BASE_URL
        )
      ).toBeNull();

      // matches without baseUrl
      expect(
        pact.getRecordsMatchingRequest({ url: url(url1), method: "GET" })
      ).toEqual([pact.records[0]]);
      expect(
        pact.getRecordsMatchingRequest({ url: url1, method: "GET" })
      ).toEqual([pact.records[0]]);
      // does match as without baseUrl relative urls are matched
      expect(
        pact.getRecordsMatchingRequest({
          url: `https://xyz.com${url1}`,
          method: "GET",
        })
      ).toEqual([pact.records[0]]);
    });

    it("getRecordsMatchingRequest should allow filtering url parameters", function () {
      const url1 =
        "/measurement/measurements?valueFragmentType=OEE&withTotalPages=false&pageSize=2&dateFrom=2024-01-17T14%3A57%3A32.671Z&dateTo=2024-01-17T16%3A57%3A32.671Z&revert=true&valueFragmentSeries=3600s&source=54117556939";

      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
        requestMatching: {
          ignoreUrlParameters: ["dateFrom", "dateTo", "_"],
        },
      });
      pact.records[0].request.url = url(url1);
      pact.records[0].request.method = "GET";

      const url1WithoutParams =
        "/measurement/measurements?valueFragmentType=OEE&withTotalPages=false&pageSize=2&revert=true&valueFragmentSeries=3600s&source=54117556939";

      expect(
        pact.getRecordsMatchingRequest({ url: url(url1WithoutParams) })
      ).toEqual([pact.records[0]]);
    });

    it("getRecordsMatchingRequest should not fail for undefined url", function () {
      const pact = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: BASE_URL,
      });
      pact.records[0].request.method = "GET";

      expect(pact.getRecordsMatchingRequest({ url: undefined })).toBeNull();
      expect(pact.getRecordsMatchingRequest({ url: null } as any)).toBeNull();
      expect(pact.getRecordsMatchingRequest({ url: "" })).toBeNull();
      expect(pact.getRecordsMatchingRequest({ method: "GET" })).toBeNull();
    });

    it("getNextRecordMatchingRequest should work with series of get and put requests", function () {
      const record1 = C8yDefaultPactRecord.from({
        ...response,
        method: "GET",
        url: url("/test1"),
        body: { name: "noname" },
      });
      const record2 = C8yDefaultPactRecord.from({
        ...response,
        method: "PUT",
        url: url("/test1"),
        body: { name: "abcdefghij" },
        requestBody: { name: "abcdefghij" },
      });
      const record3 = C8yDefaultPactRecord.from({
        ...response,
        method: "GET",
        url: url("/test1"),
        body: { name: "abcdefghij" },
      });

      const pact = new TestPact(
        [record1, record2, record3],
        {
          id: "testid",
          baseUrl: BASE_URL,
        },
        "testid"
      );

      const r1 = pact.nextRecordMatchingRequest({
        url: "/test1",
        method: "GET",
      });
      expect(r1?.request).toHaveProperty("body", record1.request.body);
      const r2 = pact.nextRecordMatchingRequest({
        url: "/test1",
        method: "PUT",
      });
      expect(r2?.request).toHaveProperty("body", record2.request.body);
      expect(r2?.response).toHaveProperty("body", record2.response.body);
      const r3 = pact.nextRecordMatchingRequest({
        url: "/test1",
        method: "GET",
      });
      expect(r3?.request).toHaveProperty("body", record3.request.body);

      expect(pact.test_getRequesIndex("get:/test1")).toEqual(2);
      expect(pact.test_getRequesIndex("put:/test1")).toEqual(1);
    });
  });
});
