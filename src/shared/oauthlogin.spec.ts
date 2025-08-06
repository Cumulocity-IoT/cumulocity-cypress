/// <reference types="jest" />

import { oauthLogin } from "./oauthlogin";
import { C8yAuthOptions } from "./auth";
import fetch from "cross-fetch";
import { getAuthCookies } from "./cookies";

jest.mock("cross-fetch");
jest.mock("./cookies");

const mockedFetch = fetch as jest.Mock;
const mockedGetAuthCookies = getAuthCookies as jest.Mock;

describe("oauthLogin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const expectValidationError = async (p: Promise<any>, message: string) => {
    try {
      await p;
      fail("Expected function to throw");
    } catch (e) {
      expect((e as Error).message).toBe(message);
    }
  };

  describe("validation", () => {
    it("should throw error if auth is undefined", async () => {
      await expectValidationError(
        oauthLogin(undefined as any, "https://example.com"),
        "Authentication required. oauthLogin requires user and password for authentication."
      );
    });

    it("should throw error if auth is null", async () => {
      await expectValidationError(
        oauthLogin(null as any, "https://example.com"),
        "Authentication required. oauthLogin requires user and password for authentication."
      );
    });

    it("should throw error if user is missing", async () => {
      const auth: Partial<C8yAuthOptions> = { password: "test" };
      await expectValidationError(
        oauthLogin(auth as C8yAuthOptions, "https://example.com"),
        "Authentication required. oauthLogin requires user and password for authentication."
      );
    });

    it("should throw error if password is missing", async () => {
      const auth: Partial<C8yAuthOptions> = { user: "testuser" };
      await expectValidationError(
        oauthLogin(auth as C8yAuthOptions, "https://example.com"),
        "Authentication required. oauthLogin requires user and password for authentication."
      );
    });

    it("should throw error if baseUrl is undefined", async () => {
      const auth: C8yAuthOptions = { user: "testuser", password: "testpass" };
      await expectValidationError(
        oauthLogin(auth, undefined),
        "Base URL required. oauthLogin requires absolute url for login."
      );
    });

    it("should throw error if baseUrl is empty string", async () => {
      const auth: C8yAuthOptions = { user: "testuser", password: "testpass" };
      await expectValidationError(
        oauthLogin(auth, ""),
        "Base URL required. oauthLogin requires absolute url for login."
      );
    });
  });

  describe("successful login", () => {
    it("should perform oauth login and return cookies without tenant", async () => {
      const auth: C8yAuthOptions = { user: "testuser", password: "testpass" };
      const baseUrl = "https://x.y.stage.c8y.io";

      const expectedCookies = {
        xsrfToken: "test-xsrf-token",
        authorization: "test-session-id",
      };
      const oauthResponseBody = "";

      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(oauthResponseBody),
      });
      mockedGetAuthCookies.mockReturnValue(expectedCookies);

      const result = await oauthLogin(auth, baseUrl);

      expect(mockedFetch).toHaveBeenCalledWith(
        `${baseUrl}/tenant/oauth`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: "grant_type=PASSWORD&username=testuser&password=testpass",
        })
      );
      expect(mockedGetAuthCookies).toHaveBeenCalled();
      expect(result).toEqual({
        ...auth,
        xsrfToken: expectedCookies.xsrfToken,
        bearer: expectedCookies.authorization,
      });
    });

    it("should perform oauth login and return cookies with tenant", async () => {
      const auth: C8yAuthOptions = {
        user: "testuser",
        password: "testpass",
        tenant: "mytenant",
      };
      const baseUrl = "https://x.y.stage.c8y.io";

      const expectedCookies = {
        xsrfToken: "test-xsrf-token",
        authorization: "test-session-id",
      };
      const oauthResponseBody = "";

      mockedFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(oauthResponseBody),
      });
      mockedGetAuthCookies.mockReturnValue(expectedCookies);

      const result = await oauthLogin(auth, baseUrl);

      expect(mockedFetch).toHaveBeenCalledWith(
        `${baseUrl}/tenant/oauth?tenant_id=mytenant`,
        expect.objectContaining({
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: "grant_type=PASSWORD&username=testuser&password=testpass",
        })
      );
      expect(mockedGetAuthCookies).toHaveBeenCalled();
      expect(result).toEqual({
        ...auth,
        xsrfToken: expectedCookies.xsrfToken,
        bearer: expectedCookies.authorization,
      });
    });
  });

  describe("error handling", () => {
    it("should throw error on failed authentication", async () => {
      const auth: C8yAuthOptions = { user: "testuser", password: "wrongpass" };
      const baseUrl = "https://example.com";

      mockedFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      try {
        await oauthLogin(auth, baseUrl);
        fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain('Logging in to https://example.com failed for user "testuser" with status code 401.');
      }
    });

    it("should throw error on network failure", async () => {
      const auth: C8yAuthOptions = { user: "testuser", password: "testpass" };
      const baseUrl = "https://example.com";
      const networkError = new Error("Network error");
      mockedFetch.mockRejectedValue(networkError);

      try {
        await oauthLogin(auth, baseUrl);
        fail("should have thrown");
      } catch (e) {
        expect((e as Error).message).toContain("Network error");
      }
    });
  });
});
