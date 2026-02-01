/// <reference types="jest" />

import * as fs from "fs";
import * as path from "path";
import { C8yPactHARFileAdapter } from "./haradapter";

describe("C8yPactHARFileAdapter", () => {
  const testFolder = path.join(__dirname, "__test_har_adapter__");
  let adapter: C8yPactHARFileAdapter;

  beforeEach(() => {
    // Create test folder
    if (!fs.existsSync(testFolder)) {
      fs.mkdirSync(testFolder, { recursive: true });
    }
    adapter = new C8yPactHARFileAdapter(testFolder);
  });

  afterEach(() => {
    // Clean up test folder
    if (fs.existsSync(testFolder)) {
      const files = fs.readdirSync(testFolder);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testFolder, file));
      });
      fs.rmdirSync(testFolder);
    }
  });

  describe("constructor", () => {
    it("should initialize with the correct folder", () => {
      expect(adapter.getFolder()).toBe(testFolder);
    });

    it("should have correct description", () => {
      expect(adapter.description()).toBe(
        `C8yPactHarFileAdapter: ${testFolder}`
      );
    });
  });

  describe("savePact and loadPact", () => {
    it("should save a pact as HAR file and load it back", () => {
      const mockPact: any = {
        id: "test_pact",
        info: {
          id: "test_pact",
          producer: { name: "TestProducer", version: "1.0.0" },
          consumer: { name: "TestConsumer", version: "1.0.0" },
          version: { c8ypact: "1.0.0" },
          baseUrl: "https://example.com",
          tenant: "t12345",
          title: ["Test Suite", "Test Case"],
          description: "A test pact",
        },
        records: [
          {
            id: "record1",
            request: {
              method: "GET",
              url: "https://example.com/api/test",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer token123",
              },
            },
            response: {
              status: 200,
              statusText: "OK",
              headers: {
                "Content-Type": "application/json",
              },
              body: { result: "success" },
              $body: { result: "success" },
              duration: 150,
              isOkStatusCode: true,
            },
            auth: {
              type: "BearerAuth",
              token: "token123",
            },
            options: {
              baseUrl: "https://example.com",
            },
          },
          {
            id: "record2",
            request: {
              method: "POST",
              url: "https://example.com/api/create",
              headers: {
                "Content-Type": "application/json",
              },
              body: { name: "test" },
              $body: { name: "test" },
            },
            response: {
              status: 201,
              statusText: "Created",
              headers: {
                "Content-Type": "application/json",
              },
              body: { id: "123", name: "test" },
              $body: { id: "123", name: "test" },
              duration: 200,
              isOkStatusCode: true,
            },
            createdObject: "123",
          },
        ],
      };

      // Save the pact
      adapter.savePact(mockPact);

      // Verify file exists
      const harFile = path.join(testFolder, "test_pact.har");
      expect(fs.existsSync(harFile)).toBe(true);

      // Verify it's valid JSON
      const harContent = fs.readFileSync(harFile, "utf-8");
      const har = JSON.parse(harContent);
      expect(har.log).toBeDefined();
      expect(har.log.version).toBe("1.2");
      expect(har.log.entries).toHaveLength(2);

      // Load the pact back
      const loadedPact = adapter.loadPact("test_pact");
      expect(loadedPact).not.toBeNull();
      expect(loadedPact?.id).toBe("test_pact");
      expect(loadedPact?.records).toHaveLength(2);

      // Verify first record
      const record1 = loadedPact?.records[0];
      expect(record1?.request.method).toBe("GET");
      expect(record1?.request.url).toBe("/api/test");
      expect(record1?.response.status).toBe(200);
      expect(record1?.response.body).toEqual({ result: "success" });

      // Verify second record
      const record2 = loadedPact?.records[1];
      expect(record2?.request.method).toBe("POST");
      expect(record2?.request.body).toEqual({ name: "test" });
      expect(record2?.response.status).toBe(201);
      expect(record2?.createdObject).toBe("123");
    });

    it("should handle pacts without records", () => {
      const mockPact: any = {
        id: "empty_pact",
        info: {
          id: "empty_pact",
          baseUrl: "https://example.com",
        },
        records: [],
      };

      adapter.savePact(mockPact);

      const loadedPact = adapter.loadPact("empty_pact");
      expect(loadedPact).not.toBeNull();
      expect(loadedPact?.records).toHaveLength(0);
    });
  });

  describe("pactExists", () => {
    it("should return true for existing pact", () => {
      const mockPact: any = {
        id: "existing_pact",
        info: {
          id: "existing_pact",
          baseUrl: "https://example.com",
        },
        records: [],
      };

      adapter.savePact(mockPact);
      expect(adapter.pactExists("existing_pact")).toBe(true);
    });

    it("should return false for non-existing pact", () => {
      expect(adapter.pactExists("non_existing_pact")).toBe(false);
    });
  });

  describe("deletePact", () => {
    it("should delete an existing pact", () => {
      const mockPact: any = {
        id: "pact_to_delete",
        info: {
          id: "pact_to_delete",
          baseUrl: "https://example.com",
        },
        records: [],
      };

      adapter.savePact(mockPact);
      expect(adapter.pactExists("pact_to_delete")).toBe(true);

      adapter.deletePact("pact_to_delete");
      expect(adapter.pactExists("pact_to_delete")).toBe(false);
    });

    it("should handle deleting non-existing pact", () => {
      expect(() => adapter.deletePact("non_existing")).not.toThrow();
    });
  });

  describe("loadPacts", () => {
    it("should load multiple pacts", () => {
      const pact1: any = {
        id: "pact1",
        info: { id: "pact1", baseUrl: "https://example.com" },
        records: [],
      };
      const pact2: any = {
        id: "pact2",
        info: { id: "pact2", baseUrl: "https://example.com" },
        records: [],
      };

      adapter.savePact(pact1);
      adapter.savePact(pact2);

      const pacts = adapter.loadPacts();
      expect(Object.keys(pacts)).toHaveLength(2);
      expect(pacts["pact1"]).toBeDefined();
      expect(pacts["pact2"]).toBeDefined();
    });
  });

  describe("HAR format validation", () => {
    it("should convert relative URLs to absolute URLs", () => {
      const mockPact: any = {
        id: "relative_url_test",
        info: {
          id: "relative_url_test",
          baseUrl: "https://mytenant.cumulocity.com",
        },
        records: [
          {
            request: {
              method: "GET",
              url: "/inventory/managedObjects",
              headers: { "Content-Type": "application/json" },
            },
            response: {
              status: 200,
              body: { test: "data" },
            },
          },
          {
            request: {
              method: "POST",
              url: "https://mytenant.cumulocity.com/inventory/managedObjects",
              headers: { "Content-Type": "application/json" },
            },
            response: {
              status: 201,
              body: { id: "123" },
            },
          },
        ],
      };

      adapter.savePact(mockPact);

      const harFile = path.join(testFolder, "relative_url_test.har");
      const harContent = JSON.parse(fs.readFileSync(harFile, "utf-8"));

      // Both URLs should be absolute in HAR format
      expect(harContent.log.entries[0].request.url).toBe(
        "https://mytenant.cumulocity.com/inventory/managedObjects"
      );
      expect(harContent.log.entries[1].request.url).toBe(
        "https://mytenant.cumulocity.com/inventory/managedObjects"
      );
    });

    it("should create HAR with correct structure", () => {
      const mockPact: any = {
        id: "har_structure_test",
        info: {
          id: "har_structure_test",
          producer: { name: "TestProducer", version: "1.0.0" },
          baseUrl: "https://example.com",
        },
        records: [
          {
            request: {
              method: "GET",
              url: "https://example.com/api/test?param1=value1&param2=value2",
              headers: { "Content-Type": "application/json" },
            },
            response: {
              status: 200,
              statusText: "OK",
              headers: { "Content-Type": "application/json" },
              body: { test: "data" },
              duration: 100,
            },
          },
        ],
      };

      adapter.savePact(mockPact);

      const harFile = path.join(testFolder, "har_structure_test.har");
      const harContent = JSON.parse(fs.readFileSync(harFile, "utf-8"));

      // Validate HAR structure
      expect(harContent.log).toBeDefined();
      expect(harContent.log.version).toBe("1.2");
      expect(harContent.log.creator).toBeDefined();
      expect(harContent.log.creator.name).toBe("TestProducer");
      expect(harContent.log.entries).toHaveLength(1);

      const entry = harContent.log.entries[0];
      expect(entry.request).toBeDefined();
      expect(entry.response).toBeDefined();
      expect(entry.request.method).toBe("GET");
      expect(entry.request.url).toContain("param1=value1");
      expect(entry.request.queryString).toBeDefined();
      expect(entry.request.queryString).toHaveLength(2);
      expect(entry.response.status).toBe(200);
      expect(entry.response.content).toBeDefined();
      expect(entry.response.content.mimeType).toContain("json");
    });

    it("should preserve request body in POST requests", () => {
      const mockPact: any = {
        id: "post_request_test",
        info: {
          id: "post_request_test",
          baseUrl: "https://example.com",
        },
        records: [
          {
            request: {
              method: "POST",
              url: "https://example.com/api/create",
              headers: { "Content-Type": "application/json" },
              body: { name: "test", value: 123 },
            },
            response: {
              status: 201,
              statusText: "Created",
              body: { id: "456" },
            },
          },
        ],
      };

      adapter.savePact(mockPact);
      const loadedPact = adapter.loadPact("post_request_test");

      expect(loadedPact?.records[0].request.body).toEqual({
        name: "test",
        value: 123,
      });
    });
  });
});
