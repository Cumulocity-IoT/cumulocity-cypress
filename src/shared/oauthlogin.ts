import _ from "lodash";
import fetch from "cross-fetch"; // Added for direct fetch usage
import { Buffer } from "buffer"; // Added for Basic Auth

import { C8yBaseUrl } from "./types";
import { C8yAuthOptions } from "./auth";
import { getAuthCookies } from "./cookies";

export async function oauthLogin(
  auth: C8yAuthOptions,
  baseUrl?: C8yBaseUrl
): Promise<C8yAuthOptions> {
  if (!auth || !auth.user || !auth.password) {
    const error = new Error(
      "Authentication required. oauthLogin requires user and password for authentication."
    );
    error.name = "C8yPactError";
    throw error;
  }

  if (!baseUrl) {
    const error = new Error(
      "Base URL required. oauthLogin requires absolute url for login."
    );
    error.name = "C8yPactError";
    throw error;
  }

  let tenant = auth.tenant;
  if (!tenant) {
    const basicAuthHeader = `Basic ${Buffer.from(
      `${auth.user}:${auth.password}`
    ).toString("base64")}`;

    const tenantUrl = `${baseUrl}/tenant/currentTenant`;
    const tenantResponse = await fetch(tenantUrl, {
      headers: {
        Authorization: basicAuthHeader,
      },
    });

    if (tenantResponse.status !== 200) {
      const error = new Error(
        `Getting tenant id failed for ${baseUrl} with status code ${
          tenantResponse.status
        }. Use env variable or pass it as part of auth object.`
      );
      error.name = "C8yPactError";
      throw error;
    }
    const tenantData = await tenantResponse.json();
    tenant = tenantData.name;
  }

  const oauthEndpointUrl = `${baseUrl}/tenant/oauth?tenant_id=${tenant}`;
  const params = new URLSearchParams({
    grant_type: "PASSWORD",
    username: auth.user || "",
    password: auth.password || "",
    ...(auth.tfa && { tfa_code: auth.tfa }),
  });

  const oauthResponse = await fetch(oauthEndpointUrl, {
    method: "POST",
    body: params.toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
  });

  if (oauthResponse.status !== 200) {
    const error = new Error(
      `Logging in to ${baseUrl} failed for user "${auth.user}" with status code ${oauthResponse.status}.`
    );
    error.name = "C8yPactError";
    throw error;
  }

  const cookies = getAuthCookies(oauthResponse); // Assuming getAuthCookies works with standard Response
  const { authorization, xsrfToken } = _.pick(cookies, [
    "authorization",
    "xsrfToken",
  ]);
  auth = {
    ...auth,
    ...(authorization && { bearer: authorization }),
    ...(xsrfToken && { xsrfToken: xsrfToken }),
  };

  return auth;
}
