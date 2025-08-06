/// <reference types="jest" />

import {
  buildTestHierarchy,
  get_i,
  normalizeBaseUrl,
  sanitizeStringifiedObject,
  shortestUniquePrefixes,
  to_array,
  to_boolean,
  toSensitiveObjectKeyPath,
} from "./util";

describe("util", () => {
  it("sanitizeStringifiedObject", () => {
    expect(sanitizeStringifiedObject({ test: "test" } as any)).toEqual({
      test: "test",
    });
    expect(sanitizeStringifiedObject("test")).toEqual("test");
    expect(sanitizeStringifiedObject(undefined as any)).toEqual(undefined);

    expect(
      sanitizeStringifiedObject('{ "password": "abcdefg", "test": "test" }')
    ).toEqual('{ "password": "***", "test": "test" }');

    expect(sanitizeStringifiedObject('{ "password": "abcdefg" }')).toEqual(
      '{ "password": "***" }'
    );

    expect(sanitizeStringifiedObject('{ "password": "abcdefg" }')).toEqual(
      '{ "password": "***" }'
    );

    expect(sanitizeStringifiedObject('{"password": "abcdefg"}')).toEqual(
      '{"password": "***"}'
    );

    expect(sanitizeStringifiedObject("{password: abcdefg}")).toEqual(
      "{password: ***}"
    );

    expect(
      sanitizeStringifiedObject("{username: myuser, password: abc123}")
    ).toEqual("{username: myuser, password: ***}");

    expect(
      sanitizeStringifiedObject("{username: myuser, password: abc123}")
    ).toEqual("{username: myuser, password: ***}");

    expect(
      sanitizeStringifiedObject("{ password: abc123, username: myuser }")
    ).toEqual("{ password: ***, username: myuser }");

    expect(
      sanitizeStringifiedObject(
        '{"user":"abcdefg","password":"123456"}'
      )
    ).toEqual(
      '{"user":"abcdefg","password":"***"}'
    );
  });

  describe("to_boolean", () => {
    it("should return the default value if input is null", () => {
      const defaultValue = true;
      const result = to_boolean(null as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return the default value if input is not a string", () => {
      const defaultValue = false;
      const result = to_boolean({} as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return true if input is 'true'", () => {
      const defaultValue = false;
      const result = to_boolean("true", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is not lowercase", () => {
      const defaultValue = false;
      const result = to_boolean("TrUe", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is '1'", () => {
      const defaultValue = false;
      const result = to_boolean("1", defaultValue);
      expect(result).toBe(true);
    });

    it("should return false if input is 'false'", () => {
      const defaultValue = true;
      const result = to_boolean("false", defaultValue);
      expect(result).toBe(false);
    });

    it("should return false if input is '0'", () => {
      const defaultValue = true;
      const result = to_boolean("0", defaultValue);
      expect(result).toBe(false);
    });
  });

  describe("toSensitiveObjectKeyPath", () => {
    let response: any;
    beforeEach(() => {
      response = {
        status: 200,
        statusText: "OK",
        headers: {
          "set-cookie": [
            "authorization=secret; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
            "XSRF-TOKEN=token; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
          ],
        },
        body: { name: "t123456789" },
        duration: 100,
        requestHeaders: {
          cookie: "authorization=secret; XSRF-TOKEN=token",
        },
        requestBody: { id: "abc123124" },
      };
    });

    it("should get case sensitive path", () => {
      const path1 = toSensitiveObjectKeyPath(response!, "HEADERS.Set-Cookie");
      expect(path1).toBe("headers.set-cookie");
      const path2 = toSensitiveObjectKeyPath(
        response!,
        "REQUESTHEADERS.Cookie"
      );
      expect(path2).toBe("requestHeaders.cookie");
    });

    it("should return sensitive path up to first mismatch", () => {
      const path = toSensitiveObjectKeyPath(
        response!,
        "HEADERS.Set-Cookie.Expires"
      );
      expect(path).toBe("headers.set-cookie.Expires");
    });

    it("should use key path as array", () => {
      const path = toSensitiveObjectKeyPath(response!, [
        "HEADERS",
        "Set-Cookie",
        "Expires",
      ]);
      expect(path).toBe("headers.set-cookie.Expires");
    });

    it("should return undefined if object is null", () => {
      const path = toSensitiveObjectKeyPath(null, "HEADERS.Set-Cookie");
      expect(path).toBeUndefined();
    });
  });

  describe("get_i", () => {
    it("should return value for case insensitive key", () => {
      const obj = { test: "test", ComPlex: { keY: { TokEN: "value" } } };
      const result = get_i(obj, "TEST");
      expect(result).toBe("test");
      const result2 = get_i(obj, "complex.key.token");
      expect(result2).toBe("value");
    });

    it("should return value for array index", () => {
      const obj = {
        array: [1, 2, 3],
        ComPlex: { kEY: { ArraY: ["a", "b", "c"] } },
      };
      const result = get_i(obj, "ARRAY[1]");
      expect(result).toBe(2);
      const result2 = get_i(obj, "ARRAY.2");
      expect(result2).toBe(3);
      const result3 = get_i(obj, "complex.key.array[0]");
      expect(result3).toBe("a");
      const result4 = get_i(obj, "complex.key.array.1");
      expect(result4).toBe("b");
    });

    it("shoud return undefined if key is not found", () => {
      const obj = { test: "test", Complex: { key: { token: "value" } } };
      const result = get_i(obj, "TEST1");
      expect(result).toBeUndefined();
      const result2 = get_i(obj, "complex.key.token1");
      expect(result2).toBeUndefined();
    });

    it("should return value for nested arrays and objects", () => {
      const obj = { array: [{ test: "test" }, { test: ["a", "b", "c"] }] };
      const result = get_i(obj, "ARRAY[0].test");
      expect(result).toBe("test");
      const result2 = get_i(obj, "ARRAY.1.test.0");
      expect(result2).toBe("a");
      const result3 = get_i(obj, "ARRAY.1.test[1]");
      expect(result3).toBe("b");
      const result4 = get_i(obj, "ARRAY[1].test[2]");
      expect(result4).toBe("c");
    });

    it("should return undefined if object is null", () => {
      const result = get_i(null, "TEST");
      expect(result).toBeUndefined();
    });

    it("should return undefined if key is null", () => {
      const obj = { test: "test", Complex: { key: { token: "value" } } };
      const result = get_i(obj, null as any);
      expect(result).toBeUndefined();
    });

    it("should return undefined if key is empty", () => {
      const obj = { test: "test", Complex: { key: { token: "value" } } };
      const result = get_i(obj, "");
      expect(result).toBeUndefined();
    });
  });

  describe("shortestUniquePrefixes", () => {
    it("should return an empty array for empty input", () => {
      const result = shortestUniquePrefixes([]);
      expect(result).toEqual([]);
    });

    it("should return an empty string for an empty word", () => {
      const result = shortestUniquePrefixes([""]);
      expect(result).toEqual([""]);
    });

    it("should return empty strings for multiple empty words", () => {
      const result = shortestUniquePrefixes(["", "", ""]);
      expect(result).toEqual(["", "", ""]);
    });

    it("should return the first character for a single word input", () => {
      const result = shortestUniquePrefixes(["test"]);
      expect(result).toEqual(["t"]);
    });

    it("should return first characters for completely different words", () => {
      const result = shortestUniquePrefixes(["apple", "banana", "cherry"]);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should find the shortest unique prefixes for words with common prefixes", () => {
      const result = shortestUniquePrefixes([
        "apple",
        "application",
        "apartment",
      ]);
      expect(result).toEqual(["apple", "appli", "apa"]);
    });

    it("should handle words where one is a prefix of another", () => {
      const result = shortestUniquePrefixes(["test", "test", "testing"]);
      expect(result).toEqual(["test", "test", "testi"]);
    });

    it("should not add prefixes for duplicate words", () => {
      const result = shortestUniquePrefixes(["same", "same", "different"]);
      expect(result).toEqual(["same", "same", "d"]);
    });

    it("should handle complex combinations", () => {
      const result = shortestUniquePrefixes(["dog", "doll", "donut", "cat"]);
      expect(result).toEqual(["dog", "dol", "don", "c"]);
    });

    it("should handle case sensitivity", () => {
      const result = shortestUniquePrefixes(["Test", "test"]);
      expect(result).toEqual(["T", "t"]);
    });
  });

  describe("to_array", () => {
    it("should return undefined if input is null", () => {
      expect(to_array(null as any)).toBeUndefined();
      expect(to_array(undefined as any)).toBeUndefined();
    });

    it("should return array if input is not an array", () => {
      const result = to_array("test" as any);
      expect(result).toEqual(["test"]);
    });

    it("should return array if input is an array", () => {
      const result = to_array(["test"]);
      expect(result).toEqual(["test"]);
    });

    it("should return array if input is an object", () => {
      const result = to_array({ test: "test" });
      expect(result).toEqual([{ test: "test" }]);
    });
  });

  describe("buildTestHierarchy", () => {
    it("should build a test hierarchy tree", () => {
      const objects = [
        { name: "test1", type: "type1" },
        { name: "test2", type: "type2" },
        { name: "test3", type: "type3" },
        { name: "test4", type: "type4" },
      ];
      const tree = buildTestHierarchy(objects, (obj) => [obj.type, obj.name]);
      expect(tree).toEqual({
        type1: { test1: { name: "test1", type: "type1" } },
        type2: { test2: { name: "test2", type: "type2" } },
        type3: { test3: { name: "test3", type: "type3" } },
        type4: { test4: { name: "test4", type: "type4" } },
      });
    });

    it("should build a test hierarchy tree with multiple levels", () => {
      const objects = [
        { name: "test1", type: "type1", group: "group1" },
        { name: "test2", type: "type2", group: "group2" },
        { name: "test3", type: "type3", group: "group3" },
        { name: "test4", type: "type4", group: "group4" },
      ];
      const tree = buildTestHierarchy(objects, (obj) => [
        obj.type,
        obj.group,
        obj.name,
      ]);
      expect(tree).toEqual({
        type1: {
          group1: { test1: { name: "test1", type: "type1", group: "group1" } },
        },
        type2: {
          group2: { test2: { name: "test2", type: "type2", group: "group2" } },
        },
        type3: {
          group3: { test3: { name: "test3", type: "type3", group: "group3" } },
        },
        type4: {
          group4: { test4: { name: "test4", type: "type4", group: "group4" } },
        },
      });
    });

    it("should build a test hierarchy tree with multiple levels and multiple objects", () => {
      const objects = [
        { name: "test1", type: "type1", group: "group1" },
        { name: "test2", type: "type2", group: "group2" },
        { name: "test3", type: "type3", group: "group3" },
        { name: "test4", type: "type4", group: "group4" },
        { name: "test5", type: "type1", group: "group1" },
        { name: "test6", type: "type2", group: "group2" },
        { name: "test7", type: "type3", group: "group3" },
        { name: "test8", type: "type4", group: "group4" },
      ];
      const tree = buildTestHierarchy(objects, (obj) => [
        obj.type,
        obj.group,
        obj.name,
      ]);
      expect(tree).toEqual({
        type1: {
          group1: {
            test1: { name: "test1", type: "type1", group: "group1" },
            test5: { name: "test5", type: "type1", group: "group1" },
          },
        },
        type2: {
          group2: {
            test2: { name: "test2", type: "type2", group: "group2" },
            test6: { name: "test6", type: "type2", group: "group2" },
          },
        },
        type3: {
          group3: {
            test3: { name: "test3", type: "type3", group: "group3" },
            test7: { name: "test7", type: "type3", group: "group3" },
          },
        },
        type4: {
          group4: {
            test4: { name: "test4", type: "type4", group: "group4" },
            test8: { name: "test8", type: "type4", group: "group4" },
          },
        },
      });
    });

    it("should handle empty objects", () => {
      const objects: any[] = [];
      const tree = buildTestHierarchy(objects, (obj) => []);
      expect(tree).toEqual({});
    });

    it("should handle empty title function", () => {
      const objects = [
        { name: "test1", type: "type1" },
        { name: "test2", type: "type2" },
        { name: "test3", type: "type3" },
        { name: "test4", type: "type4" },
      ];
      const tree = buildTestHierarchy(objects, (obj) => []);
      expect(tree).toEqual({});
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
    });    it("should return existing HTTPS URL unchanged", () => {
      const result = normalizeBaseUrl("https://example.com");
      expect(result).toBe("https://example.com/");
    });

    it("should return existing HTTP URL unchanged", () => {
      const result = normalizeBaseUrl("http://example.com");
      expect(result).toBe("http://example.com/");
    });

    it("should add HTTPS to URL without protocol", () => {
      const result = normalizeBaseUrl("example.com");
      expect(result).toBe("https://example.com/");
    });

    it("should add HTTPS to URL with path but no protocol", () => {
      const result = normalizeBaseUrl("example.com/path");
      expect(result).toBe("https://example.com/path");
    });

    it("should add HTTPS to URL with port but no protocol", () => {
      const result = normalizeBaseUrl("example.com:8080");
      expect(result).toBe("https://example.com:8080/");
    });

    it("should handle case-insensitive protocols", () => {
      const result1 = normalizeBaseUrl("HTTPS://example.com");
      expect(result1).toBe("HTTPS://example.com/");
      
      const result2 = normalizeBaseUrl("HTTP://example.com");
      expect(result2).toBe("HTTP://example.com/");
    });

    it("should trim whitespace before processing", () => {
      const result = normalizeBaseUrl("  example.com  ");
      expect(result).toBe("https://example.com/");
    });

    it("should handle complex URLs without protocol", () => {
      const result = normalizeBaseUrl("subdomain.example.com:8080/path?query=value#fragment");
      expect(result).toBe("https://subdomain.example.com:8080/path?query=value#fragment");
    });

    it("should handle localhost URLs", () => {
      const result1 = normalizeBaseUrl("localhost:3000");
      expect(result1).toBe("https://localhost:3000/");

      const result2 = normalizeBaseUrl("http://localhost:3000");
      expect(result2).toBe("http://localhost:3000/");
    });

    it("should handle IP addresses", () => {
      const result1 = normalizeBaseUrl("192.168.1.1:8080");
      expect(result1).toBe("https://192.168.1.1:8080/");

      const result2 = normalizeBaseUrl("https://192.168.1.1:8080");
      expect(result2).toBe("https://192.168.1.1:8080/");
    });

    it("should handle URLs with subdomains", () => {
      const result = normalizeBaseUrl("sub.domain.example.com");
      expect(result).toBe("https://sub.domain.example.com/");
    });

    it("should handle URLs with query parameters", () => {
      const result = normalizeBaseUrl("example.com?param=value");
      expect(result).toBe("https://example.com/?param=value");
    });

    it("should handle URLs with fragments", () => {
      const result = normalizeBaseUrl("example.com#section");
      expect(result).toBe("https://example.com/#section");
    });

    it("should handle Cumulocity-style URLs", () => {
      const result1 = normalizeBaseUrl("tenant.cumulocity.com");
      expect(result1).toBe("https://tenant.cumulocity.com/");

      const result2 = normalizeBaseUrl("tenant.eu-latest.cumulocity.com");
      expect(result2).toBe("https://tenant.eu-latest.cumulocity.com/");
    });

    it("should not add trailing slash to URLs with existing paths", () => {
      const result1 = normalizeBaseUrl("https://example.com/api");
      expect(result1).toBe("https://example.com/api");

      const result2 = normalizeBaseUrl("example.com/api/v1");
      expect(result2).toBe("https://example.com/api/v1");
    });

    it("should handle URLs that already have trailing slash", () => {
      const result1 = normalizeBaseUrl("https://example.com/");
      expect(result1).toBe("https://example.com/");

      const result2 = normalizeBaseUrl("example.com/");
      expect(result2).toBe("https://example.com/");
    });
  });
});
