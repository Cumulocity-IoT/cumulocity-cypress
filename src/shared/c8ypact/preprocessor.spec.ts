/// <reference types="jest" />

import {
  C8yDefaultPactPreprocessor,
  C8yPactPreprocessorDefaultOptions,
  C8yPactPreprocessorOptions,
} from "./preprocessor";

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
});
