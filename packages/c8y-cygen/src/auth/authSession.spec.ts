import { oauthLogin } from "cumulocity-cypress";
import {
  createAuthSession,
  AuthSessionError,
} from "./authSession.js";

jest.mock("cumulocity-cypress", () => ({
  oauthLogin: jest.fn(),
}));

const mockedOauthLogin = oauthLogin as jest.Mock;

describe("createAuthSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validCredentials = { user: "testuser", password: "testpass" };
  const baseUrl = "https://mytenant.stage.c8y.io";

  describe("input validation", () => {
    it("throws missing_credentials when user is absent, without calling oauthLogin", async () => {
      await expect(
        createAuthSession(baseUrl, { user: "", password: "testpass" })
      ).rejects.toMatchObject({
        name: "AuthSessionError",
        reason: "missing_credentials",
      });
      expect(mockedOauthLogin).not.toHaveBeenCalled();
    });

    it("throws missing_credentials when password is absent", async () => {
      await expect(
        createAuthSession(baseUrl, { user: "testuser", password: "" })
      ).rejects.toBeInstanceOf(AuthSessionError);
      expect(mockedOauthLogin).not.toHaveBeenCalled();
    });

    it("throws missing_base_url when baseUrl is empty", async () => {
      await expect(
        createAuthSession("", validCredentials)
      ).rejects.toMatchObject({
        name: "AuthSessionError",
        reason: "missing_base_url",
      });
      expect(mockedOauthLogin).not.toHaveBeenCalled();
    });
  });

  describe("successful login", () => {
    it("returns Playwright-ready cookies and the xsrf token", async () => {
      mockedOauthLogin.mockResolvedValue({
        ...validCredentials,
        token: "test-session-id",
        xsrfToken: "test-xsrf-token",
      });

      const session = await createAuthSession(baseUrl, validCredentials);

      expect(session.xsrfToken).toBe("test-xsrf-token");
      expect(session.authCookies).toEqual([
        {
          name: "Authorization",
          value: "test-session-id",
          domain: "mytenant.stage.c8y.io",
          path: "/",
          secure: true,
        },
        {
          name: "XSRF-TOKEN",
          value: "test-xsrf-token",
          domain: "mytenant.stage.c8y.io",
          path: "/",
          secure: true,
        },
      ]);
    });

    it("marks cookies as not secure for an http base URL", async () => {
      mockedOauthLogin.mockResolvedValue({
        ...validCredentials,
        token: "test-session-id",
        xsrfToken: "test-xsrf-token",
      });

      const session = await createAuthSession(
        "http://localhost:8080",
        validCredentials
      );

      expect(session.authCookies.every((c) => c.secure === false)).toBe(true);
    });

    it("passes tenant and tfa through to oauthLogin", async () => {
      mockedOauthLogin.mockResolvedValue({
        token: "t",
        xsrfToken: "x",
      });

      await createAuthSession(baseUrl, {
        ...validCredentials,
        tenant: "mytenant",
        tfa: "123456",
      });

      expect(mockedOauthLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          user: "testuser",
          password: "testpass",
          tenant: "mytenant",
          tfa: "123456",
        }),
        baseUrl
      );
    });
  });

  describe("rejected login", () => {
    it("wraps a C8yPactError (bad credentials or unknown tenant) as reason: rejected", async () => {
      const c8yError = new Error(
        'Logging in to https://mytenant.stage.c8y.io failed for user "testuser" with status code 401.'
      );
      c8yError.name = "C8yPactError";
      mockedOauthLogin.mockRejectedValue(c8yError);

      await expect(
        createAuthSession(baseUrl, validCredentials)
      ).rejects.toMatchObject({
        name: "AuthSessionError",
        reason: "rejected",
        cause: c8yError,
      });
    });

    it("wraps a response missing the expected cookies as reason: rejected", async () => {
      mockedOauthLogin.mockResolvedValue({ ...validCredentials });

      await expect(
        createAuthSession(baseUrl, validCredentials)
      ).rejects.toMatchObject({
        name: "AuthSessionError",
        reason: "rejected",
      });
    });
  });

  describe("unreachable base URL", () => {
    it("wraps a non-C8yPactError fetch failure as reason: unreachable", async () => {
      const networkError = new Error("getaddrinfo ENOTFOUND mytenant.invalid");
      mockedOauthLogin.mockRejectedValue(networkError);

      await expect(
        createAuthSession(baseUrl, validCredentials)
      ).rejects.toMatchObject({
        name: "AuthSessionError",
        reason: "unreachable",
        cause: networkError,
      });
    });
  });
});
