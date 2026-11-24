import { oauthLogin } from "cumulocity-cypress";

/**
 * cumulocity-cypress's package.json exports map only declares an explicit "types"
 * condition on the main "." entry, not on the "./shared/*" wildcard - so importing
 * `C8yAuthOptions` from "cumulocity-cypress/shared/auth" directly does not resolve
 * under NodeNext. Derive the same type from the value import instead, which does
 * resolve (it's how the oauthLogin(...) call below typechecks at all).
 */
type C8yAuthOptions = Parameters<typeof oauthLogin>[0];

/**
 * Credentials this module accepts. Deliberately narrower than cumulocity-cypress's
 * own C8yAuthOptions (which carries userAlias/type/sendImmediately etc. irrelevant
 * here) so this module's input contract stays stable regardless of upstream changes.
 */
export interface AuthSessionCredentials {
  user: string;
  password: string;
  tenant?: string;
  tfa?: string;
}

/** A cookie shaped for Playwright's `browserContext.addCookies()`. */
export interface AuthSessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
}

export interface AuthSession {
  authCookies: AuthSessionCookie[];
  xsrfToken: string;
}

export type AuthSessionErrorReason =
  | "missing_credentials"
  | "missing_base_url"
  | "unreachable"
  | "rejected";

export class AuthSessionError extends Error {
  readonly reason: AuthSessionErrorReason;

  constructor(
    reason: AuthSessionErrorReason,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "AuthSessionError";
    this.reason = reason;
  }
}

/**
 * oauthLogin's own HTTP-status failures (bad credentials, unknown tenant_id) always
 * carry error.name === "C8yPactError" (see cumulocity-cypress's shared/oauthlogin.ts).
 * Anything else - DNS failure, connection refused, timeout - is a fetch-level
 * rejection and means the base URL itself could not be reached.
 */
function isUnreachableError(error: unknown): boolean {
  return !(error instanceof Error) || error.name !== "C8yPactError";
}

/**
 * Logs in to Cumulocity via OAI-Secure (mirrors cumulocity-cypress's own oauthLogin,
 * which is what cy.login()/cy.oauthLogin() use client-side) and returns the resulting
 * session as Playwright-ready cookies. Explore-time auth is thus identical to
 * test-time auth - no separate login-form automation.
 *
 * Cumulocity's /tenant/oauth intentionally does not distinguish a wrong tenant_id
 * from a wrong password (both come back as the same rejection, to avoid tenant
 * enumeration) - so "rejected" covers both; only unreachable-host failures get their
 * own reason.
 */
export async function createAuthSession(
  baseUrl: string,
  credentials: AuthSessionCredentials
): Promise<AuthSession> {
  if (!credentials || !credentials.user || !credentials.password) {
    throw new AuthSessionError(
      "missing_credentials",
      "AuthSession requires both a user and a password."
    );
  }
  if (!baseUrl) {
    throw new AuthSessionError(
      "missing_base_url",
      "AuthSession requires an absolute base URL to log in against."
    );
  }

  const authInput: C8yAuthOptions = {
    user: credentials.user,
    password: credentials.password,
    tenant: credentials.tenant,
    tfa: credentials.tfa,
  };

  let result: C8yAuthOptions;
  try {
    result = await oauthLogin(authInput, baseUrl);
  } catch (cause) {
    if (isUnreachableError(cause)) {
      throw new AuthSessionError(
        "unreachable",
        `Could not reach ${baseUrl}: ${(cause as Error).message}`,
        { cause }
      );
    }
    throw new AuthSessionError(
      "rejected",
      `Login to ${baseUrl} was rejected for user "${credentials.user}". ` +
        `Cumulocity does not distinguish a wrong tenant from bad credentials, so ` +
        `double-check both. Original error: ${(cause as Error).message}`,
      { cause }
    );
  }

  if (!result.token || !result.xsrfToken) {
    throw new AuthSessionError(
      "rejected",
      `Login to ${baseUrl} for user "${credentials.user}" did not return the expected auth cookies.`
    );
  }

  const url = new URL(baseUrl);
  const cookieDefaults = {
    domain: url.hostname,
    path: "/",
    secure: url.protocol === "https:",
  };

  return {
    xsrfToken: result.xsrfToken,
    authCookies: [
      { name: "Authorization", value: result.token, ...cookieDefaults },
      { name: "XSRF-TOKEN", value: result.xsrfToken, ...cookieDefaults },
    ],
  };
}
