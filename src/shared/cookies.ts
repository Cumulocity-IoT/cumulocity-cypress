import * as setCookieParser from "set-cookie-parser";
import { get_i } from "./util";
import _ from "lodash";

export function getAuthCookies(response: Response | Cypress.Response<any>):
  | {
      authorization?: string;
      xsrfToken?: string;
    }
  | undefined {
  let setCookie: any = response.headers.getSetCookie;
  let cookieHeader: string[] | string | undefined;
  if (typeof response.headers.getSetCookie === "function") {
    cookieHeader = response.headers.getSetCookie();
  } else {
    if (typeof response.headers.get === "function") {
      setCookie = response.headers.get("set-cookie");
      if (_.isString(setCookie)) {
        cookieHeader = setCookieParser.splitCookiesString(setCookie);
      } else if (_.isArrayLike(setCookie)) {
        cookieHeader = setCookie;
      }
    } else {
      if (_.isPlainObject(response.headers)) {
        cookieHeader = get_i(response.headers, "set-cookie");
      }
    }
  }
  if (!cookieHeader) return undefined;

  let authorization: string | undefined = undefined;
  let xsrfToken: string | undefined = undefined;
  setCookieParser.parse(cookieHeader || []).forEach((c: any) => {
    if (_.isEqual(c.name.toLowerCase(), "authorization")) {
      authorization = c.value;
    }
    if (_.isEqual(c.name.toLowerCase(), "xsrf-token")) {
      xsrfToken = c.value;
    }
  });

  // This method is intended for use on server environments (for example Node.js).
  // Browsers block frontend JavaScript code from accessing the Set-Cookie header,
  // as required by the Fetch spec, which defines Set-Cookie as a forbidden
  // response-header name that must be filtered out from any response exposed to frontend code.
  // https://developer.mozilla.org/en-US/docs/Web/API/Headers/getSetCookie
  if (!authorization) {
    authorization =
      getCookieValue("authorization") || getCookieValue("Authorization");
    if (_.isEmpty(authorization)) {
      authorization = undefined;
    }
  }
  if (!xsrfToken) {
    xsrfToken = getCookieValue("XSRF-TOKEN") || getCookieValue("xsrf-token");
    if (_.isEmpty(xsrfToken)) {
      xsrfToken = undefined;
    }
  }

  // remove quotes if xsrfToken value is wrapped in quotes, which can happen when the cookie value contains special characters like comma
  if (xsrfToken && xsrfToken.startsWith('"') && xsrfToken.endsWith('"')) {
    xsrfToken = xsrfToken.substring(1, xsrfToken.length - 1);
  }
  if (
    authorization &&
    authorization.startsWith('"') &&
    authorization.endsWith('"')
  ) {
    authorization = authorization.substring(1, authorization.length - 1);
  }

  return { authorization, xsrfToken };
}

// from c8y/client FetchClient
export function getCookieValue(name: string) {
  if (typeof document === "undefined") return undefined;
  const value = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
  return value ? value.pop() : "";
}
