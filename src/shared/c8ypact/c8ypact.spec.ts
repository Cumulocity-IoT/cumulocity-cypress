/// <reference types="jest" />

import { C8yDefaultPact } from "./c8ydefaultpact";
import { C8yDefaultPactRecord } from "./c8ydefaultpactrecord";
import {
  C8yPact,
  C8yPactModeValues,
  getEnvVar,
  isPact,
  isPactError,
  isPactRecord,
  isValidPactId,
  pactId,
  validatePactMode,
} from "./c8ypact";

describe("c8ypact", () => {
  describe("pactId", function () {
    it("generate id for string", function () {
      expect(pactId("test")).toBe("test");
      expect(pactId("test test")).toBe("test_test");
      expect(pactId("test    test")).toBe("test_test");
      expect(pactId("test_test")).toBe("test_test");
      expect(pactId("_test_test_")).toBe("_test_test_");
    });

    it("remove special characters", function () {
      expect(pactId("test@#$%^&*()+")).toBe("test");
      // special handling of _
      // as value is split to words which are joined by _, there might be multiple _ in a row
      expect(pactId("test@#$%^&*()_+")).toBe("test__");
      expect(pactId("test@#$%^&*()_+ test")).toBe("test___test");
    });

    it("should not split numbers", function () {
      expect(pactId("c8ypact")).toBe("c8ypact");
      expect(pactId("c8ypact test")).toBe("c8ypact_test");
    });

    it("deburrs string", function () {
      expect(pactId("tést")).toBe("test");
      expect(pactId("tést tèst")).toBe("test_test");
    });

    it("trims id string", function () {
      expect(pactId(" test ")).toBe("test");
      expect(pactId(" test test ")).toBe("test_test");
      expect(pactId(["  test  ", "  test"])).toBe("test__test");
    });

    it("generate id for array of strings", function () {
      expect(pactId(["test", "test"])).toBe("test__test");
      expect(pactId(["test", "test test"])).toBe("test__test_test");
    });

    it("should return undefined for undefined or null", function () {
      expect(pactId(undefined as any)).toBe(undefined);
      expect(pactId(null as any)).toBe(null);
    });

    it("should return undefined for objects", function () {
      expect(pactId({ test: "test" } as any)).toBe(undefined);
      expect(pactId({ test: "test", test2: "test" } as any)).toBe(undefined);
    });

    it("should not change valid ids", function () {
      expect(pactId("test")).toBe("test");
      expect(pactId("test_test")).toBe("test_test");
      expect(pactId("test__test")).toBe("test__test");
      const x = "c8ypact__c8ypact_record_and_load__should_record_c8ypacts";
      expect(pactId(x)).toBe(x);
    });
  });

  describe("isValidPactId", function () {
    it("valid pact ids", function () {
      expect(isValidPactId("test")).toBe(true);
      expect(isValidPactId("test_test")).toBe(true);
      expect(isValidPactId("test__test")).toBe(true);
      expect(isValidPactId("test__test2__test_test3_test4")).toBe(true);
      expect(isValidPactId("test__test_")).toBe(true); // underscore is valid character
    });

    it("invalid pact ids", function () {
      expect(isValidPactId("test*#")).toBe(false);
      expect(isValidPactId("test test")).toBe(false);
      expect(isValidPactId("tést")).toBe(false);
    });
  });

  describe("isPactRecord", function () {
    it("isPactRecord validates undefined", function () {
      expect(isPactRecord(undefined)).toBe(false);
    });

    it("isPactRecord validates pact object", function () {
      const pact = {
        response: {
          status: 201,
          isOkStatusCode: true,
        },
        request: {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
        toCypressResponse: () => true,
      };
      expect(isPactRecord(pact)).toBe(true);
    });

    it("isPactRecord validates C8yDefaultPactRecord", function () {
      const pact = {
        response: {
          status: 201,
          isOkStatusCode: true,
        },
        request: {
          url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
        },
      };
      const record = new C8yDefaultPactRecord(pact.request, pact.response, {});
      expect(isPactRecord(record)).toBe(true);
      expect(record.toCypressResponse()).not.toBe(null);
    });
  });

  describe("isPact", function () {
    it("isPact validates undefined", function () {
      expect(isPact(undefined)).toBe(false);
    });

    it("isPact validates pact object", function () {
      const pact: C8yPact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
            },
            {
              status: 201,
              isOkStatusCode: true,
            },
            {},
            { user: "test" }
          ),
        ],
        {
          id: "testid",
          baseUrl: "http://localhost:8080",
        },
        "test"
      );
      expect(isPact(pact)).toBe(true);
    });

    it("isPact validates records to be C8yDefaultPactRecord", function () {
      const pact: C8yPact = new C8yDefaultPact(
        [
          // @ts-expect-error
          {
            response: {
              status: 201,
              isOkStatusCode: true,
            },
            request: {
              url: "http://localhost:8080/inventory/managedObjects/1?withChildren=false",
            },
          },
        ],
        {
          baseUrl: "http://localhost:8080",
        },
        "test"
      );
      expect(isPact(pact)).toBe(false);
    });
  });

  describe("isPactError", function () {
    it("isPactError validates error object with name C8yPactError", function () {
      const error = new Error("test");
      error.name = "C8yPactError";
      expect(isPactError(error)).toBe(true);
    });

    it("isPactError does not validate error with wrong name", function () {
      const error = new Error("test");
      expect(isPactError(error)).toBe(false);
    });

    it("isPactError does not validate undefined and empty", function () {
      expect(isPactError(undefined)).toBe(false);
      expect(isPactError(null)).toBe(false);
      expect(isPactError({})).toBe(false);
    });
  });

  describe("getEnvVar", () => {
    it("getEnvVar should return value for same key", () => {
      process.env.MY_VARIABLE = "my value";
      const result = getEnvVar("MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should return value for camelCase key", () => {
      process.env.myVariable = "my value";
      const result = getEnvVar("MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should return value for key with Cypress_ prefix", () => {
      process.env.CYPRESS_MY_VARIABLE = "my value";
      const result = getEnvVar("MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should return value for key with C8Y_ prefix", () => {
      process.env.MY_VARIABLE = "my value";
      const result = getEnvVar("C8Y_MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should return value for key with CYPRESS_ prefix and camel case variable", () => {
      process.env.CYPRESS_myVariable = "my value";
      const result = getEnvVar("MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should return value for key with CYPRESS_ with removing C8Y_", () => {
      process.env.CYPRESS_MY_VARIABLE = "my value";
      const result = getEnvVar("C8Y_MY_VARIABLE");
      expect(result).toBe("my value");
    });

    it("getEnvVar should camelcase C8Y prefix as c8y", () => {
      process.env.CYPRESS_c8yPactMode = "my value";
      const result = getEnvVar("C8Y_PACT_MODE");
      expect(result).toBe("my value");
    });
  });

  describe("validatePactMode", () => {
    it("validatePactMode should not throw for valid mode", () => {
      expect(() => {
        validatePactMode("record");
      }).not.toThrow();
    });

    it("validatePactMode should not throw for null or undefined", () => {
      expect(() => {
        validatePactMode(null as any);
      }).not.toThrow();

      expect(() => {
        validatePactMode(undefined);
      }).not.toThrow();
    });

    it("validatePactMode should lowercase value", () => {
      expect(() => {
        validatePactMode("ReCORd");
      }).not.toThrow();
    });

    it("validatePactMode should throw for not string value", () => {
      expect(() => {
        validatePactMode({} as any);
      }).toThrowError(
        `Unsupported pact mode: "${{}.toString()}". Supported values are: ${Object.values(
          C8yPactModeValues
        ).join(", ")}`
      );
    });

    it("validatePactMode should throw for invalid mode", () => {
      expect(() => {
        validatePactMode("invalid");
      }).toThrowError(
        `Unsupported pact mode: "invalid". Supported values are: ${Object.values(
          C8yPactModeValues
        ).join(", ")}`
      );
    });
  });
});
