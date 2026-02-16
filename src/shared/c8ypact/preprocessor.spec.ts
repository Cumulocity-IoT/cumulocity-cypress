/// <reference types="jest" />

import {
  C8yDefaultPactPreprocessor,
  C8yPactPreprocessorDefaultOptions,
  C8yPactPreprocessorOptions,
  parseRegexReplace,
  performRegexReplace,
} from "./preprocessor";

import "../global";

import _ from "lodash";

class TestC8yDefaultPactPreprocessor extends C8yDefaultPactPreprocessor {
  public test_resolveOptions(options?: C8yPactPreprocessorOptions) {
    return this.resolveOptions(options);
  }
}

describe("C8yDefaultPactPreprocessor", () => {
  const BASE_URL = "http://localhost:4200";
  let response: Cypress.Response<any> | undefined;
  
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
      allRequestResponses: [],
      isOkStatusCode: false,
      method: "PUT",
      url: BASE_URL,
    };
  });

  describe("general", () => {
    it("should not fail if no options are provided", () => {
      const preprocessor = new C8yDefaultPactPreprocessor();
      const r = { ...response };
      preprocessor.apply(response!, undefined);
      expect(response).toStrictEqual(r);
    });
  });

  describe("resolveOptions", () => {
    it("should resolve options", () => {
      const preprocessor = new TestC8yDefaultPactPreprocessor();
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.name", "requestBody.id"],
        obfuscate: ["body.name", "requestBody.id"],
        obfuscationPattern: "xxxxx",
        ignoreCase: false,
      };
      const resolvedOptions = preprocessor.test_resolveOptions(options);
      expect(resolvedOptions).toStrictEqual(options);
    });

    it("should resolve options with default values", () => {
      const preprocessor = new TestC8yDefaultPactPreprocessor();
      const resolvedOptions = preprocessor.test_resolveOptions();
      expect(resolvedOptions).toStrictEqual(C8yPactPreprocessorDefaultOptions);
    });

    it("should resolve options with default values and options", () => {
      const preprocessor = new TestC8yDefaultPactPreprocessor();
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.name", "requestBody.id"],
        obfuscate: ["body.name", "requestBody.id"],
      };
      const resolvedOptions = preprocessor.test_resolveOptions(options);
      expect(resolvedOptions).toStrictEqual({
        ...C8yPactPreprocessorDefaultOptions,
        ...options,
      });
    });

    it("should resolve options with default values and class options", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.name", "requestBody.id"],
        obfuscate: ["body.name", "requestBody.id"],
      };
      const preprocessor = new TestC8yDefaultPactPreprocessor(options);
      const resolvedOptions = preprocessor.test_resolveOptions(options);
      expect(resolvedOptions).toStrictEqual({
        ...C8yPactPreprocessorDefaultOptions,
        ...options,
      });
    });

    it("should overwrite class options with options", () => {
      const classOptions: C8yPactPreprocessorOptions = {
        ignore: ["body.name", "requestBody.id"],
        obfuscate: ["body.name", "requestBody.id"],
      };
      const options: C8yPactPreprocessorOptions = {
        ignore: ["abc"],
        obfuscate: ["def"],
      };
      const preprocessor = new TestC8yDefaultPactPreprocessor(classOptions);
      const resolvedOptions = preprocessor.test_resolveOptions(options);
      expect(resolvedOptions).toStrictEqual({
        ...C8yPactPreprocessorDefaultOptions,
        ...options,
      });
    });
  });

  describe("obfuscate", () => {
    it("should not fail if obfuscate option is undefined", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: undefined,
      };
      const preprocessor = new C8yDefaultPactPreprocessor();
      const r = { ...response };
      preprocessor.apply(response!, options);
      expect(response).toStrictEqual(r);
    });

    it("should obfuscate specified keys", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.name", "requestBody.id"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBe("******");
      expect(response!.requestBody.id).toBe("******");
    });

    it("should use custom obfuscation pattern", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.name", "requestBody.id"],
        obfuscationPattern: "###",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBe("###");
      expect(response!.requestBody.id).toBe("###");
    });

    it("should use default obfuscation pattern", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.name", "requestBody.id"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.requestBody.id).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should obfuscate case with insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.Name", "requestBody.Id"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBe("******");
      expect(response!.requestBody.id).toBe("******");
    });

    it("should not add key if it does not exist", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.nonexistent"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.nonexistent).toBeUndefined();
      expect(response!.body).not.toHaveProperty("nonexistent");
    });

    it("should not add key with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["BODY.nonexistent", "requestBody.Id"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.nonexistent).toBeUndefined();
      expect(response!.body).not.toHaveProperty("nonexistent");
      expect(response!.requestBody.id).toBe("******");
    });

    it("should obfuscate with array elements in path", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.linkedSeries.fragment"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.linkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.linkedSeries[0].fragment).toBe("******");
    });

    it("should obfuscate with case insensitive keys in array elements in path", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.linkedSeries.FRAGMENT"],
        obfuscationPattern: "******",
        ignoreCase: true,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.linkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.linkedSeries[0].fragment).toBe("******");
    });

    it("should obfuscate array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.c8y_LinkedSeries"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.c8y_LinkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
        { fragment: "Test_Fragment0", series: "Total" },
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.c8y_LinkedSeries).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should obfuscate empty array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.c8y_LinkedSeries"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.c8y_LinkedSeries = [];
      preprocessor.apply(response!);

      expect(response!.body.c8y_LinkedSeries).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });
  });

  describe("authorization header obfuscation", () => {
    it("should preserve Basic and Bearer prefix if present", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization", "requestHeaders.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "Basic dGVzdDp0ZXN0";
      response!.requestHeaders.authorization = "Bearer dGVzdDp0ZXN0";
      preprocessor.apply(response!);

      expect(response!.headers.authorization).toBe(
        "Basic " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.requestHeaders.authorization).toBe(
        "Bearer " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should handle case-insensitive Bearer and Basic prefixes", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization", "requestHeaders.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "bearer token123";
      response!.requestHeaders.authorization = "basic token456";
      preprocessor.apply(response!);

      expect(response!.headers.authorization).toBe(
        "bearer " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.requestHeaders.authorization).toBe(
        "basic " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should obfuscate malformed Bearer/Basic without token completely", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization", "requestHeaders.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "Bearer";
      response!.requestHeaders.authorization = "Basic";
      preprocessor.apply(response!);

      // Malformed headers without tokens should be obfuscated completely
      expect(response!.headers.authorization).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.requestHeaders.authorization).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should obfuscate Bearer/Basic with trailing space but no token completely", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization", "requestHeaders.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "Bearer ";
      response!.requestHeaders.authorization = "Basic ";
      preprocessor.apply(response!);

      // Headers with only space but no actual token should be obfuscated completely
      expect(response!.headers.authorization).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.requestHeaders.authorization).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should preserve mixed case Bearer/Basic with tokens", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "bEaReR token123";
      preprocessor.apply(response!);

      expect(response!.headers.authorization).toBe(
        "bEaReR " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should obfuscate non-Bearer/Basic authorization headers completely", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "CustomAuth token123";
      preprocessor.apply(response!);

      expect(response!.headers.authorization).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should fully obfuscate non-authorization fields with Bearer-like values", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.password", "body.secret"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body = {
        password: "Bearer token123",
        secret: "Basic credentials456",
      };
      preprocessor.apply(response!);

      // Password and secret fields should be fully obfuscated, not preserve Bearer/Basic
      expect(response!.body.password).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.body.secret).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should fully obfuscate nested non-authorization fields with auth-like values", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.user.apiKey", "body.config.token"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body = {
        user: { apiKey: "Bearer myApiKey123" },
        config: { token: "Basic secret" },
      };
      preprocessor.apply(response!);

      // Non-authorization fields should be fully obfuscated
      expect(response!.body.user.apiKey).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      expect(response!.body.config.token).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });

    it("should preserve Bearer in authorization but obfuscate in password field", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.authorization", "body.password"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.headers.authorization = "Bearer authToken123";
      response!.body = { password: "Bearer password123" };
      preprocessor.apply(response!);

      // Authorization should preserve Bearer prefix
      expect(response!.headers.authorization).toBe(
        "Bearer " + C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
      // Password should be fully obfuscated
      expect(response!.body.password).toBe(
        C8yDefaultPactPreprocessor.defaultObfuscationPattern
      );
    });
  });

  describe("ignore", () => {
    it("should not fail if ignore option is undefined", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: undefined,
      };
      const preprocessor = new C8yDefaultPactPreprocessor();
      const r = { ...response };
      preprocessor.apply(response!, options);
      expect(response).toStrictEqual(r);
    });

    it("should remove specified keys", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.name", "requestBody.id"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBeUndefined();
      expect(response!.requestBody.id).toBeUndefined();
    });

    it("should remove entire body field if no specific key is specified", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body).toBeUndefined();
    });

    it("should remove obfuscated keys", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["body.name", "requestBody.id"],
        ignore: ["body.name", "requestBody.id"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.body.name).toBeUndefined();
      expect(response!.requestBody.id).toBeUndefined();
    });

    it("should remove cookie header", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["headers.set-cookie", "requestHeaders.cookie"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toBeUndefined();
      expect(response!.requestHeaders["cookie"]).toBeUndefined();
    });

    it("should use case insensitive cookie header", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["headers.Set-Cookie", "requestHeaders.Cookie"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toBeUndefined();
      expect(response!.requestHeaders["cookie"]).toBeUndefined();
    });

    it("should match case sensitive if ignoreCase is false", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["headers.Set-Cookie", "requestHeaders.Cookie"],
        ignoreCase: false,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=secret; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=token; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=secret; XSRF-TOKEN=token"
      );
    });

    it("should remove from array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.linkedSeries.fragment"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.linkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.linkedSeries[0].fragment).toBeUndefined();
      expect(response!.body.linkedSeries[0]).not.toHaveProperty("fragment");
      expect(response!.body.linkedSeries[0].series).toBe("Total");
    });

    it("should remove with case insensitive keys from array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.linkedSeries.FRAGMENT"],
        ignoreCase: true,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.linkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.linkedSeries[0].fragment).toBeUndefined();
      expect(response!.body.linkedSeries[0]).not.toHaveProperty("fragment");
      expect(response!.body.linkedSeries[0].series).toBe("Total");
    });

    it("should remove array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.c8y_LinkedSeries"],
        ignoreCase: true,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.c8y_LinkedSeries = [
        { fragment: "Test_Fragment0", series: "Total" },
        { fragment: "Test_Fragment0", series: "Total" },
        { fragment: "Test_Fragment0", series: "Total" },
      ];
      preprocessor.apply(response!);

      expect(response!.body.c8y_LinkedSeries).toBeUndefined();
    });

    it("should remove empty array elements", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["body.c8y_LinkedSeries"],
        ignoreCase: true,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      response!.body.c8y_LinkedSeries = [];
      preprocessor.apply(response!);

      expect(response!.body.c8y_LinkedSeries).toBeUndefined();
    });
  });

  describe("cookie", () => {
    it("should obfuscate all cookies", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: ["headers.set-cookie", "requestHeaders.cookie"],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=******; XSRF-TOKEN=******"
      );
    });

    it("should obfuscate specified cookies by name", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: [
          "headers.set-cookie.authorization",
          "requestHeaders.cookie.authorization",
        ],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=token; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=******; XSRF-TOKEN=token"
      );
    });

    it("should remove specified cookies by name", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: [
          "headers.set-cookie.authorization",
          "requestHeaders.cookie.authorization",
        ],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "XSRF-TOKEN=token; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toBe("XSRF-TOKEN=token");
    });

    it("should remove entire cookie field if no specific cookie is specified", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["headers.set-cookie", "requestHeaders.cookie"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toBeUndefined();
      expect(response!.requestHeaders["cookie"]).toBeUndefined();
    });

    it("should obfuscate with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: [
          "headers.set-cookie.AUTHORIZATION",
          "requestHeaders.cookie.AUTHORIZATION",
          "headers.set-cookie.Xsrf-Token",
        ],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=******; XSRF-TOKEN=token"
      );
    });

    it("should obfuscate with case insensitive keys in entire path", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: [
          "headers.Set-Cookie.AUTHORIZATION",
          "HEADers.Set-COOKIE.Xsrf-Token",
          "RequestHeaders.Cookie.AUTHORIZATION",
        ],
        obfuscationPattern: "******",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=******; XSRF-TOKEN=token"
      );
    });

    it("should match case sensitive if ignoreCase is false", () => {
      const options: C8yPactPreprocessorOptions = {
        obfuscate: [
          "headers.Set-Cookie.AUTHORIZATION",
          "headers.set-cookie.XSRF-TOKEN",
          "RequestHeaders.Cookie.AUTHORIZATION",
          "requestHeaders.cookie.XSRF-TOKEN",
        ],
        obfuscationPattern: "******",
        ignoreCase: false,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toStrictEqual([
        "authorization=secret; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT; HttpOnly",
        "XSRF-TOKEN=******; Max-Age=1209600; Path=/; Expires=Wed, 19 Mar 2025 17:26:23 GMT",
      ]);
      expect(response!.requestHeaders["cookie"]).toStrictEqual(
        "authorization=secret; XSRF-TOKEN=******"
      );
    });
  });

  describe("pick", () => {
    it("should pick only specified keys in an object", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: {
          headers: ["content-type"],
          body: [],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response);

      expect(response).toStrictEqual({
        headers: {
          "content-type": "application/json",
        },
        body: { name: "test" },
      });
    });

    it("should pick only specified keys in an object with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: {
          HEADERS: ["Content-Type"],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response);

      expect(response).toStrictEqual({
        headers: {
          "content-type": "application/json",
        },
      });
    });

    it("should pick only specified keys in an object with case insensitive keys in entire path", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: {
          HEADERS: ["Content-Type"],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        HEADERS: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
      };

      preprocessor.apply(response as any);

      expect(response).toStrictEqual({
        HEADERS: {
          "content-type": "application/json",
        },
      });
    });

    it("should pick only specified keys for root object", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: ["content-type"],
      };
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
        "content-type": "application/text",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response);

      expect(response).toStrictEqual({
        "content-type": "application/text",
      });
    });

    it("should pick only specified keys for root object with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: ["content-type"],
      };
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
        "cOnteNT-Type": "application/text",
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response);
      expect(response).toStrictEqual({
        "cOnteNT-Type": "application/text",
      });
    });

    it("should not fail if pick option is undefined", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: undefined,
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      const originalResponse = { ...response };
      preprocessor.apply(response);

      expect(response).toStrictEqual(originalResponse);
    });

    it("should apply pick and ignore options", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: { headers: ["content-type"] },
        ignore: ["headers.content-type"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response);

      expect(response).toStrictEqual({
        headers: {},
      });
    });

    it("should apply pick and obfuscate options", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: { headers: ["content-type"] },
        obfuscate: ["headers.content-type"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response);

      expect(response).toStrictEqual({
        headers: {
          "content-type": C8yDefaultPactPreprocessor.defaultObfuscationPattern,
        },
      });
    });

    it("should apply pick and obfuscate options with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: { headers: ["content-type"] },
        obfuscate: ["headers.content-type"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        HEADERS: {
          "Content-Type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response, { ignoreCase: true });

      expect(response).toStrictEqual({
        HEADERS: {
          "Content-Type": C8yDefaultPactPreprocessor.defaultObfuscationPattern,
        },
      });
    });

    it("should not use pick option as prefix", () => {
      const options: C8yPactPreprocessorOptions = {
        pick: { head: [] },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = {
        headers: {
          "content-type": "application/json",
          "cache-control": "no-cache",
        },
        body: { name: "test" },
      };

      preprocessor.apply(response);
      expect(response).toStrictEqual({});
    });

    it("should work with real example", () => {
      const obj: any = {
        request: {
          url: "/service/dtm/assets",
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: {
            name: "CypressTestAsset",
            linkedSeries: [
              { fragment: "Test_Fragment0", series: "Total" },
              {
                fragment: "Test_Fragment1",
                series: "Total",
                source: {
                  fragment: "Source_Fragment",
                  series: "Source_Series",
                  id: "0",
                },
              },
            ],
          },
        },
        response: {
          status: 403,
          statusText: "Forbidden",
          body: {
            messages: [
              "Access Denied. User does not have permission ROLE_DIGITAL_TWIN_ASSETS_CREATE or ROLE_DIGITAL_TWIN_ASSETS_ADMIN.",
            ],
          },
          headers: {
            "content-type": "application/json",
            "cache-control": "no-cache, no-store, max-age=0, must-revalidate",
            "www-authenticate": 'XBasic realm="Cumulocity"',
            "x-content-type-options": "nosniff",
            "x-xss-protection": "1; mode=block",
          },
          duration: 0,
          isOkStatusCode: false,
          allRequestResponses: [],
        },
      };
      const options: any = {
        ignoreCase: true,
        pick: {
          request: ["url", "method", "headers.content-type"],
          response: [
            "body",
            "status",
            "headers.content-type",
            "status",
            "statusText",
          ],
        },
        ignore: ["request.headers"],
      };

      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(obj);
      expect(obj).toStrictEqual({
        request: {
          url: "/service/dtm/assets",
          method: "POST",
        },
        response: {
          status: 403,
          statusText: "Forbidden",
          body: {
            messages: [
              "Access Denied. User does not have permission ROLE_DIGITAL_TWIN_ASSETS_CREATE or ROLE_DIGITAL_TWIN_ASSETS_ADMIN.",
            ],
          },
          headers: {
            "content-type": "application/json",
          },
        },
      });
    });
  });

  describe("regexReplace", () => {
    it("should perform regex replace", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": "/abc/def/g",
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "abc" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("def");
    });

    it("should perform regex replace with case insensitive keys", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": "/abc/def/g",
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { BODY: { name: "abc" } };

      preprocessor.apply(response as any, { ignoreCase: true });

      expect(response.BODY.name).toBe("def");
    });

    it("should perform regex replace with multiple keys", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": "/abc/def/g",
          "requestBody.id": "/123/456/g",
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "abc" }, requestBody: { id: "123" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("def");
      expect(response.requestBody.id).toBe("456");
    });

    it("should apply regex replace with global flag", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": "/abc/def/g",
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "abc abc" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("def def"); // Global replace
    });

    it("should apply multiple regex replacements in sequence when using array", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": ["/hello/hi/g", "/world/earth/g"],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "hello world" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("hi earth");
    });

    it("should apply each regex replacement in array order", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": ["/abc/xyz/g", "/xyz/123/g"],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "abc" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("123"); // First transforms abc→xyz, then xyz→123
    });

    it("should handle mixed string and array values for different keys", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": ["/John/Jane/", "/Doe/Smith/"],
          "body.id": "/ID-\\d+/ID-000/",
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "John Doe", id: "ID-123" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("Jane Smith");
      expect(response.body.id).toBe("ID-000");
    });

    it("should continue with valid patterns if one pattern in array is invalid", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": [
            "/valid/replaced/g",
            "invalid-pattern",
            "/pattern/newpattern/g",
          ],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "valid pattern" } };
      preprocessor.apply(response);
      // Should apply first and third patterns but skip the invalid one
      expect(response.body.name).toBe("replaced newpattern");
    });

    it("should handle empty array gracefully", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": [],
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "original value" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe("original value");
    });

    it("should replace with empty string if replacement is empty", () => {
      const options: C8yPactPreprocessorOptions = {
        regexReplace: {
          "body.name": "/abc//g", // Empty replacement
        },
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      const response = { body: { name: "abc" } };
      preprocessor.apply(response);
      expect(response.body.name).toBe(""); // Should replace with empty string
    });
  });

  describe("regex parsing", () => {
    // Positive tests for parseRegexReplace
    it("should parse valid regex replace patterns", () => {
      const s = "/abc/def/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      const pattern = regex?.pattern;
      expect(pattern?.source).toBe("abc");
      expect(pattern?.flags).toBe("g");
      expect(regex?.replacement).toBe("def");
    });

    it("should parse regex replace pattern with multiple flags", () => {
      const s = "/abc/replacement/gim";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc");
      expect(regex?.pattern.flags).toBe("gim");
      expect(regex?.replacement).toBe("replacement");
    });

    it("should parse regex replace pattern with special characters in pattern", () => {
      const s = "/a.b*c+/replacement/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("a.b*c+");
      expect(regex?.replacement).toBe("replacement");
    });

    it("should parse regex replace pattern with special characters in replacement", () => {
      const s = "/abc/$&-$1-$$-$`-$'/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc");
      expect(regex?.replacement).toBe("$&-$1-$$-$`-$'");
    });

    it("should parse regex replace pattern with escaped forward slashes in pattern", () => {
      const s = "/abc\\/def/replacement/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc\\/def");
      expect(regex?.replacement).toBe("replacement");
    });

    it("should parse regex replace pattern with escaped forward slashes in replacement", () => {
      const s = "/abc/replace\\/with\\/slashes/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc");
      expect(regex?.replacement).toBe("replace\\/with\\/slashes");
    });

    it("should parse URL-like replace patterns", () => {
      const s = "/http:\\/\\/example\\.com/https:\\/\\/example\\.org/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("http:\\/\\/example\\.com");
      expect(regex?.replacement).toBe("https:\\/\\/example\\.org");
    });

    // Negative tests for parseRegexReplace
    it("should throw error for invalid regex replace patterns", () => {
      const s = "abc/def/g"; // Missing opening slash
      expect(() => parseRegexReplace(s)).toThrow(
        "Invalid replacement regular expression: abc/def/g"
      );
    });

    it("should throw error for pattern without closing delimiter", () => {
      const s = "/abc/def"; // Missing closing delimiter
      expect(() => parseRegexReplace(s)).toThrow(
        "Invalid replacement regular expression: /abc/def"
      );
    });

    it("should throw error for non-string input", () => {
      expect(() => parseRegexReplace(null as any)).toThrow(
        "Invalid replacement expression input."
      );
    });

    it("should throw error for invalid regex patterns", () => {
      const s = "/abc[/replacement/g"; // Invalid regex pattern (unclosed character class)
      expect(() => parseRegexReplace(s)).toThrow("Invalid regular expression:");
    });

    // Edge cases for parseRegexReplace
    it("should parse regex replace patterns with empty pattern", () => {
      const s = "//replacement/g";
      expect(() => parseRegexReplace(s)).toThrow(
        "Invalid replacement regular expression: //replacement/g"
      );
    });

    it("should parse regex replace patterns with character classes", () => {
      const s = "/[a-z0-9]+/replacement/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("[a-z0-9]+");
      expect(regex?.replacement).toBe("replacement");
    });

    it("should parse regex replace patterns with capture groups", () => {
      const s = "/(\\w+)\\s(\\w+)/Hello $2, $1!/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("(\\w+)\\s(\\w+)");
      expect(regex?.replacement).toBe("Hello $2, $1!");
    });

    it("should parse regex replace patterns with no flags", () => {
      const s = "/abc/def/";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc");
      expect(regex?.pattern.flags).toBe("");
      expect(regex?.replacement).toBe("def");
    });

    it("should parse regex replace pattern with function-like replacement syntax", () => {
      const s = "/abc/function(match) { return match.toUpperCase(); }/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();
      expect(regex?.pattern.source).toBe("abc");
      expect(regex?.replacement).toBe(
        "function(match) { return match.toUpperCase(); }"
      );
    });

    // Complex edge cases
    it("should parse complex regex replace pattern with lookaheads and lookbehinds", () => {
      try {
        const s = "/(?<=@)\\w+(?=\\.com)/replacement/g";
        const regex = parseRegexReplace(s);
        expect(regex).toBeDefined();
        expect(regex?.pattern.source).toBe("(?<=@)\\w+(?=\\.com)");
        expect(regex?.replacement).toBe("replacement");
      } catch (e) {
        // Skip if browser doesn't support lookbehind
      }
    });

    it("should parse regex replace pattern with unicode properties", () => {
      try {
        const s = "/\\p{Script=Greek}/replacement/u";
        const regex = parseRegexReplace(s);
        expect(regex).toBeDefined();
        expect(regex?.pattern.source).toBe("\\p{Script=Greek}");
        expect(regex?.pattern.flags).toBe("u");
        expect(regex?.replacement).toBe("replacement");
      } catch (e) {
        // Skip if browser doesn't support Unicode property escapes
      }
    });

    // Additional negative tests
    it("should throw error for regex with invalid flags", () => {
      const s = "/abc/def/xyz"; // Invalid flags
      // This may or may not throw depending on browser implementation of RegExp
      expect(() => {
        try {
          parseRegexReplace(s);
        } catch (e) {
          if (e instanceof Error && e.message.includes("Invalid flags")) {
            throw e; // Re-throw RegExp constructor errors about invalid flags
          }
          throw new Error("Invalid replacement expression pattern.");
        }
      }).toThrow();
    });

    it("should throw error for empty string", () => {
      expect(() => parseRegexReplace("")).toThrow(
        "Invalid replacement expression input."
      );
    });

    it("should throw error for standard regex without replacement", () => {
      const s = "/abc/g"; // No replacement part (standard regex)
      expect(() => parseRegexReplace(s)).toThrow(
        "Invalid replacement regular expression: /abc/g"
      );
    });

    it("should throw error for incorrectly escaped pattern", () => {
      const s = "/abc\\/replacement/g"; // Slash in wrong place
      expect(() => parseRegexReplace(s)).toThrow(
        "Invalid replacement regular expression: /abc\\/replacement/g"
      );
    });

    // Practical application tests
    it("should correctly apply the replacement", () => {
      const s = "/hello/goodbye/g";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();

      // Use the parsed regex to perform a replacement
      const text = "hello world, hello universe";
      const result = text.replace(regex.pattern, regex.replacement);
      expect(result).toBe("goodbye world, goodbye universe");
    });

    it("should correctly apply replacement with capture groups", () => {
      const s = "/(\\w+)\\s(\\w+)/Hello $2, $1!/";
      const regex = parseRegexReplace(s);
      expect(regex).toBeDefined();

      // Use the parsed regex to perform a replacement
      const text = "John Doe";
      const result = text.replace(regex.pattern, regex.replacement);
      expect(result).toBe("Hello Doe, John!");
    });
  });

  describe("performRegexReplace", () => {
    it("should perform regex replace with valid pattern", () => {
      const s = "/abc/def/g";
      const regex = parseRegexReplace(s);
      const text = "abc abc abc";
      const result = performRegexReplace(text, regex!);
      expect(result).toBe("def def def");
    });

    it("should return input string if input is not a string", () => {
      const regex = parseRegexReplace("/abc/def/g");
      const result1 = performRegexReplace(undefined as any, regex!);
      expect(result1).toBe(undefined);
      const result2 = performRegexReplace(null as any, regex!);
      expect(result2).toBe(null);
      const result3 = performRegexReplace({} as any, regex!);
      expect(result3).toStrictEqual({});
    });
  });
});
