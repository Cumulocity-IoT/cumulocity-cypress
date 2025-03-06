/// <reference types="jest" />

import {
  C8yDefaultPactPreprocessor,
  C8yPactPreprocessorOptions,
} from "./preprocessor";

import _ from "lodash";

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

  describe("obfuscation", () => {
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
  });

  describe("removal", () => {
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
  });

  describe("cookie obfuscation", () => {
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

    it("should remove cookie header", () => {
      const options: C8yPactPreprocessorOptions = {
        ignore: ["headers.set-cookie", "requestHeaders.cookie"],
      };
      const preprocessor = new C8yDefaultPactPreprocessor(options);
      preprocessor.apply(response!);

      expect(response!.headers["set-cookie"]).toBeUndefined();
      expect(response!.requestHeaders["cookie"]).toBeUndefined();
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
  });
});
