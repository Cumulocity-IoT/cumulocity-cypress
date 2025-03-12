import {
  get_i,
  sanitizeStringifiedObject,
  toBoolean,
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
  });

  describe("toBoolean", () => {
    it("should return the default value if input is null", () => {
      const defaultValue = true;
      const result = toBoolean(null as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return the default value if input is not a string", () => {
      const defaultValue = false;
      const result = toBoolean({} as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return true if input is 'true'", () => {
      const defaultValue = false;
      const result = toBoolean("true", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is not lowercase", () => {
      const defaultValue = false;
      const result = toBoolean("TrUe", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is '1'", () => {
      const defaultValue = false;
      const result = toBoolean("1", defaultValue);
      expect(result).toBe(true);
    });

    it("should return false if input is 'false'", () => {
      const defaultValue = true;
      const result = toBoolean("false", defaultValue);
      expect(result).toBe(false);
    });

    it("should return false if input is '0'", () => {
      const defaultValue = true;
      const result = toBoolean("0", defaultValue);
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
});
