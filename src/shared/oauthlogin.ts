import _ from "lodash";
import fetch from "cross-fetch"; // Added for direct fetch usage

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

  const tenant = auth.tenant;
  const tenant_id = tenant ? `?tenant_id=${tenant}` : "";
  const oauthEndpointUrl = `${baseUrl}/tenant/oauth${tenant_id}`;
  
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
      `Logging in to ${baseUrl} failed for user "${auth.user}" with status code ${oauthResponse.status}.${oauthResponse.body ? "\n" + await oauthResponse.text() : ""}`
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
