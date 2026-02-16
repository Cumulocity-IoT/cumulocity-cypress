/// <reference types="jest" />

import { BasicAuth, BearerAuth, Client, FetchClient } from "@c8y/client";
import {
  getAuthOptionsFromBasicAuthHeader,
  hasAuthentication,
  isAuthOptions,
  isPactAuthObject,
  normalizeAuthHeaders,
  tenantFromBasicAuth,
  toC8yAuthentication,
  toPactAuthObject,
} from "./auth";
import { C8yClient } from "./c8yclient";

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
      expect(isAuthOptions({ token: "test", user: "admin" })).toBe(true);
      expect(
        isAuthOptions({ token: "test", type: "CookieAuth", user: "admin" })
      ).toBe(true);
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

    it("isPactAuthObject validates object with token", function () {
      expect(isPactAuthObject({ token: "test" })).toBe(true);
      expect(isPactAuthObject({ token: "test", userAlias: "admin" })).toBe(
        true
      );
      expect(isPactAuthObject({ token: "test", type: "CookieAuth" })).toBe(
        true
      );
      expect(isPactAuthObject({ token: "test", user: "admin" })).toBe(true);
      expect(
        isPactAuthObject({
          token: "test",
          type: "CookieAuth",
          user: "admin",
        })
      ).toBe(true);
      expect(
        isPactAuthObject({
          token: "test",
          type: "CookieAuth",
          userAlias: "admin",
          user: "admin",
        })
      ).toBe(true);
    });

    it("isPactAuthObject fails without user or token", function () {
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

  describe("tenantFromBasicAuth", () => {
    it("should return undefined if auth is not an object or string", () => {
      expect(tenantFromBasicAuth(undefined as any)).toBeUndefined();
      expect(tenantFromBasicAuth(null as any)).toBeUndefined();
      expect(tenantFromBasicAuth(123 as any)).toBeUndefined();
    });

    it("should return undefined if auth object does not have user", () => {
      expect(tenantFromBasicAuth({})).toBeUndefined();
      expect(tenantFromBasicAuth({ password: "test" } as any)).toBeUndefined();
    });

    it("should return tenant from auth user", () => {
      expect(tenantFromBasicAuth({ user: "tenant/test" })).toBe("tenant");
      expect(tenantFromBasicAuth("tenant/test")).toBe("tenant");

      expect(
        tenantFromBasicAuth({ user: "tenant/test/", password: "test" } as any)
      ).toBe("tenant");
      expect(tenantFromBasicAuth("tenant/test/")).toBe("tenant");

      expect(
        tenantFromBasicAuth({
          user: "tenant/test/sub",
          password: "test",
        } as any)
      ).toBe("tenant");
      expect(tenantFromBasicAuth("tenant/test/sub")).toBe("tenant");
    });

    it("should return undefined if user in auth does not have tenant", () => {
      expect(tenantFromBasicAuth({ user: "test" })).toBeUndefined();
      expect(tenantFromBasicAuth("test")).toBeUndefined();

      expect(
        tenantFromBasicAuth({ user: "test/", password: "test" } as any)
      ).toBeUndefined();
      expect(tenantFromBasicAuth("test/")).toBeUndefined();
    });
  });

  describe("hasAuthentication", () => {
    const b = "https://example.com";
    const basicAuth = new BasicAuth({
      user: "testuser",
      password: "testpass",
    });

    const bearerAuth = new BearerAuth("testtoken");

    it("should return false for undefined client", () => {
      expect(hasAuthentication(undefined as any)).toBe(false);
    });

    it("should return false for empty client", () => {
      expect(hasAuthentication({} as any)).toBe(false);
    });

    it("should return false for client without fetch options", () => {
      const client = { getFetchOptions: () => undefined as any } as any;
      expect(hasAuthentication(client)).toBe(false);
    });

    it("should return true for client with X-XSRF-TOKEN header", () => {
      const client = {
        getFetchOptions: () => ({ headers: { "X-XSRF-TOKEN": "abc" } }),
      } as any;
      expect(hasAuthentication(client)).toBe(true);
    });

    it("should return true for client with authorization header", () => {
      const client = {
        getFetchOptions: () => ({ headers: { Authorization: "Bearer 123" } }),
      } as any;
      expect(hasAuthentication(client)).toBe(true);
    });

    it("should return false for client without authentication headers", () => {
      const client = { getFetchOptions: () => ({ headers: {} }) } as any;
      expect(hasAuthentication(client)).toBe(false);
    });

    it("should return true for FetchClient with authentication headers", () => {
      expect(hasAuthentication(new FetchClient(basicAuth, b))).toBe(true);
    });

    it("should return true for FetchClient with BearerAuth", () => {
      expect(hasAuthentication(new FetchClient(bearerAuth, b))).toBe(true);
    });

    it("should return false for FetchClient without authentication", () => {
      const client = new FetchClient(undefined as any, b);
      expect(hasAuthentication(client)).toBe(false);
    });

    it("should return true for C8yClient without _auth property", () => {
      const c8yclient: C8yClient = {
        _client: new Client(basicAuth, b),
      };
      expect(hasAuthentication(c8yclient)).toBe(true);
    });

    it("should return true for C8yClient with _auth property", () => {
      const c8yclient: C8yClient = {
        _auth: basicAuth,
      };
      expect(hasAuthentication(c8yclient)).toBe(true);
    });

    it("should return false for C8yClient without _auth and getFetchOptions", () => {
      const c8yclient: C8yClient = {
        _client: { getFetchOptions: () => undefined as any } as any,
      };
      expect(hasAuthentication(c8yclient)).toBe(false);
    });

    it("should return true for Client with authentication", () => {
      const client = new Client(basicAuth, b);
      expect(hasAuthentication(client)).toBe(true);
    });

    it("should return true for Client with BearerAuth", () => {
      const client = new Client(bearerAuth, b);
      expect(hasAuthentication(client)).toBe(true);
    });
    it("should return false for Client without authentication", () => {
      const client = new Client(undefined as any, b);
      expect(hasAuthentication(client)).toBe(false);
    });

    it("should return false for Client with fetchClient without authentication", () => {
      const client = new Client(basicAuth, b);
      client.core = new FetchClient(undefined as any, b);
      expect(hasAuthentication(client)).toBe(false);
    });
  });

  describe("toC8yAuthentication", () => {
    it("should return undefined for undefined input", () => {
      expect(toC8yAuthentication(undefined)).toBeUndefined();
    });

    it("should return undefined for null input", () => {
      expect(toC8yAuthentication(null as any)).toBeUndefined();
    });

    it("should return undefined for non-object input", () => {
      expect(toC8yAuthentication(123 as any)).toBeUndefined();
      expect(toC8yAuthentication("test" as any)).toBeUndefined();
    });

    it("should return BearerAuth for object with token", () => {
      const auth = { token: "testtoken" };
      const result = toC8yAuthentication(auth);
      expect(result).toBeInstanceOf(BearerAuth);
    });

    it("should return BasicAuth for object with user and password", () => {
      const auth = { user: "testuser", password: "testpass" };
      const result = toC8yAuthentication(auth);
      expect(result).toBeInstanceOf(BasicAuth);
      expect((result as BasicAuth).user).toBe("testuser");
    });

    it("should return undefined for object without token, user, or password", () => {
      const auth = { other: "value" };
      const result = toC8yAuthentication(auth);
      expect(result).toBeUndefined();
    });

    it("should return object if is IAuthentication", () => {
      const auth: any = {
        getFetchOptions: () => ({ headers: { "X-XSRF-TOKEN": "abc" } }),
      };
      const result = toC8yAuthentication(auth);
      expect(result).toBe(auth);
    });

    it("should return object if is IAuthentication instance", () => {
      const auth = new BearerAuth("testtoken");
      const result = toC8yAuthentication(auth);
      expect(result).toBe(auth);

      const auth2 = new BasicAuth({
        user: "testuser",
        password: "testpass",
      });
      const result2 = toC8yAuthentication(auth2);
      expect(result2).toBe(auth2);
    });
  });
});
