/// <reference types="jest" />

import * as path from "path";
import { C8yPactDefaultFileAdapter } from "./fileadapter";

describe("C8yPactFileAdapter - js loading", () => {
  const fixturesPath = path.join(__dirname, "../../../../test/fixtures/js");

  describe("js enabled", () => {
    const adapterOptions = { enableJavaScript: true };

    it("should load JavaScript pact file (.js)", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      const pact = adapter.loadPact("jstest");
      expect(pact).toBeDefined();
      expect(pact?.id).toBe("jstest");
      expect(pact?.info.id).toBe("jstest");
      expect(pact?.info.tenant).toBe("test-tenant");
      expect(pact?.records).toHaveLength(1);
      expect(pact?.records[0].request.method).toBe("GET");
    });

    it("should load CommonJS pact file (.cjs)", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      const pact = adapter.loadPact("cjstest");
      expect(pact).toBeDefined();
      expect(pact?.id).toBe("cjstest");
      expect(pact?.info.id).toBe("cjstest");
      expect(pact?.info.tenant).toBe("test-tenant");
      expect(pact?.records).toHaveLength(1);
      expect(pact?.records[0].request.method).toBe("POST");
    });

    it("should include JavaScript and CJS files in loadPacts()", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      const pacts = adapter.loadPacts();
      expect(pacts).toBeDefined();
      expect(pacts["jstest"]).toBeDefined();
      expect(pacts["jstest"].info.tenant).toBe("test-tenant");
      expect(pacts["cjstest"]).toBeDefined();
      expect(pacts["cjstest"].info.tenant).toBe("test-tenant");
    });

    it("should correctly detect JS and CJS file existence with pactExists()", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      expect(adapter.pactExists("jstest")).toBe(true);
      expect(adapter.pactExists("cjstest")).toBe(true);
      expect(adapter.pactExists("nonexistent")).toBe(false);
    });
  });

  describe("js disabled", () => {
    it("should NOT load JavaScript pact file (.js)", () => {
      const adapter = new C8yPactDefaultFileAdapter(fixturesPath);
      const pact = adapter.loadPact("jstest");
      expect(pact).toBeNull();
    });

    it("should NOT load CommonJS pact file (.cjs)", () => {
      const adapter = new C8yPactDefaultFileAdapter(fixturesPath);
      const pact = adapter.loadPact("cjstest");
      expect(pact).toBeNull();
    });

    it("should NOT include JavaScript or CJS files in loadPacts()", () => {
      const adapter = new C8yPactDefaultFileAdapter(fixturesPath);
      const pacts = adapter.loadPacts();
      expect(pacts).toBeDefined();
      expect(pacts["jstest"]).toBeUndefined();
      expect(pacts["cjstest"]).toBeUndefined();
      // Assuming there might be other file types like json, check it's not empty if they exist
      // For this specific test file, if only JS files are present, it might be empty.
      // If a json file (e.g. simpletest.json) was in fixturesPath, it should be loaded.
    });

    it("should NOT detect JS or CJS file existence with pactExists()", () => {
      const adapter = new C8yPactDefaultFileAdapter(fixturesPath);
      expect(adapter.pactExists("jstest")).toBe(false);
      expect(adapter.pactExists("cjstest")).toBe(false);
      expect(adapter.pactExists("nonexistent")).toBe(false);
    });
  });

  describe("when JavaScript is explicitly disabled", () => {
    const adapterOptions = { enableJavaScript: false };

    it("should NOT load JavaScript pact file (.js)", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      const pact = adapter.loadPact("jstest");
      expect(pact).toBeNull();
    });

    it("should NOT load CommonJS pact file (.cjs)", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        fixturesPath,
        adapterOptions
      );
      const pact = adapter.loadPact("cjstest");
      expect(pact).toBeNull();
    });
  });
});
