/// <reference types="jest" />

import {
  getAuthOptionsFromBasicAuthHeader,
  isAuthOptions,
  isPactAuthObject,
  normalizeAuthHeaders,
  toPactAuthObject,
} from "./auth";

describe("auth", () => {
  describe("isAuthOptions", function () {
    it("isAuthOptions fails for undefined", function () {
      expect(isAuthOptions(undefined)).toBe(false);
      expect(isAuthOptions(null)).toBe(false);
    });

    it("isAuthOptions fails for string", function () {
      expect(isAuthOptions("test")).toBe(false);
    });

    it("isAuthOptions fails empty object", function () {
      expect(isAuthOptions({})).toBe(false);
    });

    it("isAuthOptions validates object with user and password", function () {
      expect(isAuthOptions({ user: "test", password: "test" })).toBe(true);
      expect(
        isAuthOptions({ user: "test", password: "test", userAlias: "admin" })
      ).toBe(true);
      expect(
        isAuthOptions({ user: "test", password: "test", type: "CookieAuth" })
      ).toBe(true);
    });

    it("isAuthOptions fails without user and as password", function () {
      expect(isAuthOptions({ user: "test" })).toBe(false);
      expect(isAuthOptions({ user: "test", type: "CookieAuth" })).toBe(false);
      expect(isAuthOptions({ password: "test}" })).toBe(false);
    });

    it("isAuthOptions does not validate object without user", function () {
      expect(isAuthOptions({ password: "test" })).toBe(false);
    });

    it("isAuthOptions validates object with token", function () {
      expect(isAuthOptions({ token: "test" })).toBe(true);
      expect(isAuthOptions({ token: "test", userAlias: "admin" })).toBe(true);
      expect(isAuthOptions({ token: "test", type: "CookieAuth" })).toBe(true);
      expect(
        isAuthOptions({ token: "test", type: "CookieAuth", user: "admin" })
      );
    });
  });

  describe("isPactAuthObject", function () {
    it("isPactAuthObject fails for undefined", function () {
      expect(isPactAuthObject(undefined)).toBe(false);
      expect(isPactAuthObject(null)).toBe(false);
    });

    it("isPactAuthObject fails for string", function () {
      expect(isPactAuthObject("test")).toBe(false);
    });

    it("isPactAuthObject fails empty object", function () {
      expect(isPactAuthObject({})).toBe(false);
    });

    it("isPactAuthObject validates object with user", function () {
      expect(isPactAuthObject({ user: "test" })).toBe(false);
      expect(isPactAuthObject({ user: "test", userAlias: "admin" })).toBe(true);
      expect(isPactAuthObject({ user: "test", type: "CookieAuth" })).toBe(true);
      expect(
        isPactAuthObject({
          user: "test",
          type: "CookieAuth",
          userAlias: "admin",
        })
      ).toBe(true);
      expect(
        isPactAuthObject({
          user: "test",
          type: "CookieAuth",
          userAlias: "admin",
          password: "test",
        })
      ).toBe(false);
      expect(
        isPactAuthObject({
          user: "test",
          userAlias: "admin",
          password: "test",
        })
      ).toBe(false);
    });

    it("isPactAuthObject fails without user", function () {
      expect(isPactAuthObject({})).toBe(false);
      expect(isPactAuthObject({ userAlias: "admin" })).toBe(false);
    });
  });

  describe("toPactAuthObject", function () {
    it("toPactAuthObject returns object with user, type and userAlias", function () {
      expect(
        toPactAuthObject({ user: "test", password: "test", tenant: "test" })
      ).toEqual({
        user: "test",
      });
      expect(
        toPactAuthObject({
          user: "test",
          password: "test",
          tenant: "test",
          type: "CookieAuth",
          userAlias: "admin",
        })
      ).toEqual({
        user: "test",
        type: "CookieAuth",
        userAlias: "admin",
      });
    });
  });

  describe("normalizeAuthHeaders", () => {
    it("should return the headers if they are already normalized", () => {
      const headers = {
        "X-XSRF-TOKEN": "abc",
        Authorization: "Bearer 123",
      };
      const result = normalizeAuthHeaders(headers);
      expect(result).toBe(headers);
    });

    it("should normalize the headers if they are not normalized", () => {
      const headers = {
        "x-xsrf-token": "abc",
        authorization: "Bearer 123",
      };
      const result = normalizeAuthHeaders(headers);
      expect(result).toEqual({
        "X-XSRF-TOKEN": "abc",
        Authorization: "Bearer 123",
      });
      expect(Object.keys(result)).toStrictEqual([
        "X-XSRF-TOKEN",
        "Authorization",
      ]);
    });

    it("should not change other headers", () => {
      const headers = {
        "x-xsrf-token": "abc",
        authorization: "Bearer 123",
        "content-type": "application/json",
        accept: "application/json",
        usexbasic: true,
      };
      const result = normalizeAuthHeaders(headers);
      expect(result).toEqual({
        "X-XSRF-TOKEN": "abc",
        Authorization: "Bearer 123",
        "content-type": "application/json",
        accept: "application/json",
        usexbasic: true,
      });
      expect(Object.keys(result)).toStrictEqual([
        "content-type",
        "accept",
        "usexbasic",
        "X-XSRF-TOKEN",
        "Authorization",
      ]);
    });

    it("should normalize case insensitive headers", () => {
      const headers = {
        "X-xSrf-TOKen": "abc",
        AuTHORIZation: "Bearer 123",
      };
      const result = normalizeAuthHeaders(headers);
      expect(result).toEqual({
        "X-XSRF-TOKEN": "abc",
        Authorization: "Bearer 123",
      });
    });

    it("should not add authorization header if it is not present", () => {
      const headers = {
        ABC: "abc",
      };
      const result = normalizeAuthHeaders(headers);
      expect(result).toEqual({
        ABC: "abc",
      });
      expect(Object.keys(result)).toStrictEqual(["ABC"]);
    });
  });

  describe("getAuthOptionsFromBasicAuthHeader", () => {
    it("should return undefined if the header is not valid", () => {
      expect(
        getAuthOptionsFromBasicAuthHeader(undefined as any)
      ).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader(null as any)).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader({} as any)).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader("")).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader("Basic")).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader("Basic ")).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader("Basic test")).toBeUndefined();
      expect(getAuthOptionsFromBasicAuthHeader("XBasic dGVzd")).toBeUndefined();
    });

    it("should return the user and password from the header", () => {
      const header = "Basic dGVzdDp0ZXN0";
      const result = getAuthOptionsFromBasicAuthHeader(header);
      expect(result).toEqual({ user: "test", password: "test" });
    });

    it("should return the user and password from the header with special characters", () => {
      const header = "Basic dGVzdDp0ZXN0Cg==";
      const result = getAuthOptionsFromBasicAuthHeader(header);
      expect(result).toEqual({ user: "test", password: "test\n" });
    });

    it("should return undefined if base64 does not have :", () => {
      const header = "Basic dGVzdA==";
      const result = getAuthOptionsFromBasicAuthHeader(header);
      expect(result).toBeUndefined();
    });
  });
});
