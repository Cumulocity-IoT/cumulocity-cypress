import _ from "lodash";

import { Request, RequestHandler, Response } from "express";
import winston from "winston";
import { ClientRequest, IncomingMessage, ServerResponse } from "http";
import * as setCookieParser from "set-cookie-parser";
import * as libCookie from "cookie";

import {
  createProxyMiddleware,
  responseInterceptor,
} from "http-proxy-middleware";
import { C8yAuthOptions, normalizeAuthHeaders } from "../auth";

import { C8yPactHttpController } from "./httpcontroller";
import { C8yDefaultPact } from "../c8ypact";

import type {
  C8yCtrlHeader,
  C8yPactHttpResponse,
} from "./httpcontroller-options";
import { C8yBaseUrl } from "../types";

export function createMiddleware(
  c8yctrl: C8yPactHttpController,
  options: {
    auth?: C8yAuthOptions;
    baseUrl?: C8yBaseUrl;
    logger?: winston.Logger;
    ignoredPaths?: string[];
    errorHandler?: RequestHandler;
  } = {}
): RequestHandler {
  const ignoredPaths = options.ignoredPaths || ["/c8yctrl"];
  return wrapPathIgnoreHandler(
    createProxyMiddleware({
      target: options.baseUrl || c8yctrl.baseUrl,
      changeOrigin: true,
      cookieDomainRewrite: "",
      selfHandleResponse: true,
      logger: options.logger || c8yctrl.logger,
      followRedirects: false,

      on: {
        proxyReq: createRequestHandler(c8yctrl, options.auth),
        proxyRes: responseInterceptor(
          createResponseInterceptor(c8yctrl, options.errorHandler)
        ),
      },
    }),
    ignoredPaths
  );
}

/**
 * Wraps a RequestHandler to ignore certain paths. For paths matching items in the
 * `ignoredPaths` parameter, the handler will call `next()` immediately and not call
 * the wrapped handler. For matching `startsWith` is used.
 * @param handler The RequestHandler to wrap
 * @param ignoredPaths The paths to ignore using exact match
 * @returns The RequestHandler wrapper
 */
export function wrapPathIgnoreHandler(
  handler: RequestHandler,
  ignoredPaths: string[]
): RequestHandler {
  return (req, res, next) => {
    if (ignoredPaths.filter((p) => req.path.startsWith(p)).length > 0) {
      next();
    } else {
      handler(req, res, next);
      // disabled calling the handler in Promise.
      // new Promise((resolve, reject) => {
      //   handler(req, res, (err) => (err ? reject(err) : resolve(null)));
      // })
      //   .then(() => {
      //     next();
      //   })
      //   .catch(() => {
      //     next();
      //   });
    }
  };
}

export function createResponseInterceptor(
  c8yctrl: C8yPactHttpController,
  errorHandler?: RequestHandler
) {
  return async (
    responseBuffer: Buffer,
    proxyRes: Request,
    req: Request,
    res: Response
  ) => {
    let resBody = responseBuffer.toString("utf8");

    if (res.statusCode >= 400 && errorHandler != null) {
      (res as any).body = resBody;
      errorHandler(req, res, () => {});
    }

    const c8yctrlId = (req as any).c8yctrlId;
    addC8yCtrlHeader(res, "x-c8yctrl-mode", c8yctrl.recordingMode);

    const onProxyResponse = c8yctrl.options.on.proxyResponse;
    if (_.isFunction(onProxyResponse)) {
      const pactResponse = toC8yPactResponse(res, resBody);
      const shouldContinue = onProxyResponse(c8yctrl, req, pactResponse);

      // pass objects from response returned by onProxyResponse to res
      res.statusCode =
        pactResponse.status != null ? pactResponse.status : res.statusCode;
      for (const [key, value] of Object.entries(pactResponse.headers || {})) {
        res.setHeader(key, value as any);
      }
      if (pactResponse.body) {
        resBody = _.isString(pactResponse.body)
          ? pactResponse.body
          : c8yctrl.stringify(pactResponse.body);
      }

      if (!shouldContinue) {
        addC8yCtrlHeader(res, "x-c8yctrl-type", "skip");
        return resBody;
      }
    }

    // Rewrite the Location header if present
    const locationHeader = res.getHeader("location");
    if (locationHeader) {
      const newLocation = locationHeader
        .toString()
        .replace(/^https?:\/\/[^/]+/, `${req.protocol}://${req.get("host")}`);
      res.setHeader("location", newLocation);
    }

    if (c8yctrl.isRecordingEnabled() === false) return responseBuffer;

    let reqBody = (req as any).rawBody || req.body;
    try {
      if (_.isString(reqBody)) {
        reqBody = JSON.parse(reqBody);
      }
    } catch {
      // no-op : use body as string
    }

    try {
      resBody = JSON.parse(resBody);
    } catch {
      // no-op : use body as string
    }
    const setCookieHeader = res.getHeader("set-cookie") as string[];
    const cookies = setCookieParser.parse(setCookieHeader, {
      decodeValues: false,
    });
    if (cookies.length) {
      res.setHeader(
        "set-cookie",
        cookies.map(function (cookie) {
          delete cookie.domain;
          delete cookie.secure;
          return libCookie.serialize(
            cookie.name,
            cookie.value,
            cookie as libCookie.SerializeOptions
          );
        })
      );
    }

    // we might receive responses for requests triggered for a previous pact
    // ensure recording to the correct pact and log some warning.
    let pact = c8yctrl.currentPact;
    if (c8yctrlId && !_.isEqual(c8yctrl.currentPact?.id, c8yctrlId)) {
      const p = c8yctrl.adapter?.loadPact(c8yctrlId);
      pact = p ? C8yDefaultPact.from(p) : undefined;
      c8yctrl.logger.warn(
        `Request for ${c8yctrlId} received for pact with different id.`
      );
    }

    if (pact == null) return responseBuffer;

    if (_.isFunction(c8yctrl.options.on.savePact)) {
      const shouldSave = c8yctrl.options.on.savePact(c8yctrl, pact);
      if (!shouldSave) {
        addC8yCtrlHeader(res, "x-c8yctrl-type", "skipped");
        return responseBuffer;
      }
    }

    let didSave = false;
    if (pact != null) {
      didSave = await c8yctrl.savePact(
        toCypressResponse(req, res, { resBody, reqBody }),
        pact
      );
    }

    addC8yCtrlHeader(res, "x-c8yctrl-type", didSave ? "saved" : "discard");
    addC8yCtrlHeader(res, "x-c8yctrl-count", `${pact.records.length}`);

    return responseBuffer;
  };
}

export function createRequestHandler(
  c8yctrl: C8yPactHttpController,
  auth?: C8yAuthOptions
) {
  return (proxyReq: ClientRequest, req: Request, res: Response) => {
    const rawBody = (req as any).rawBody;
    if (rawBody && typeof rawBody === "string") {
      proxyReq.setHeader("transfer-encoding", "chunked");
      proxyReq.removeHeader("content-length");
      proxyReq.write(rawBody);
    } else if (req.body) {
      const bodyString = JSON.stringify(req.body);
      proxyReq.removeHeader("Transfer-Encoding");
      proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyString));
      proxyReq.write(bodyString);
    }

    if (c8yctrl.currentPact?.id) {
      (req as any).c8yctrlId = c8yctrl.currentPact?.id;
    }

    addC8yCtrlHeader(res, "x-c8yctrl-mode", c8yctrl.recordingMode);

    // add authorization header
    if (
      (c8yctrl.isRecordingEnabled() === true || c8yctrl.mode === "forward") &&
      auth &&
      !proxyReq.getHeader("Authorization") &&
      !proxyReq.getHeader("authorization")
    ) {
      const { bearer, xsrfToken, user, password } = auth as C8yAuthOptions;
      if (bearer) {
        proxyReq.setHeader("Authorization", `Bearer ${bearer}`);
      }
      if (!bearer && user && password) {
        proxyReq.setHeader(
          "Authorization",
          `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
        );
      }
      if (xsrfToken) {
        proxyReq.setHeader("X-XSRF-TOKEN", xsrfToken);
      }
    }

    if (_.isFunction(c8yctrl.options.on.proxyRequest)) {
      const r = c8yctrl.options.on.proxyRequest(c8yctrl, proxyReq, req);
      if (r) {
        const responseBody = _.isString(r?.body)
          ? r?.body
          : c8yctrl.stringify(r?.body);

        res.setHeader("content-length", Buffer.byteLength(responseBody));

        r.headers = _.defaults(
          r?.headers,
          _.pick(r?.headers, ["content-type", "set-cookie"])
        );

        res.writeHead(r?.status || 200, r?.headers);
        res.end(responseBody);
      }
    }
  };
}

export function addC8yCtrlHeader(
  response: C8yPactHttpResponse | Response,
  ctrlHeader: C8yCtrlHeader,
  value: string
) {
  if (response != null && "hasHeader" in response && "setHeader" in response) {
    if (!response.hasHeader(ctrlHeader)) {
      response.setHeader(ctrlHeader, value);
    }
  } else if (response && "headers" in response) {
    if (!_.get(response.headers, ctrlHeader)) {
      response.headers = response?.headers || {};
      response.headers[ctrlHeader] = value;
    }
  }
}

export function toC8yPactResponse(
  res: Response<any, any>,
  body: any
): C8yPactHttpResponse {
  return {
    headers: res?.getHeaders() as { [key: string]: string },
    status: res?.statusCode,
    statusText: res?.statusMessage,
    body,
  };
}

export function toCypressResponse(
  req: IncomingMessage | Request,
  res: ServerResponse<IncomingMessage> | Response,
  options?: {
    reqBody?: string;
    resBody?: string;
  }
): Cypress.Response<any> {
  const statusCode = res?.statusCode || 200;
  const result: Cypress.Response<any> = {
    body: options?.resBody,
    url: req?.url,
    headers: res?.getHeaders() as { [key: string]: string },
    status: res?.statusCode,
    duration: 0,
    requestHeaders: req?.headers as { [key: string]: string },
    requestBody: options?.reqBody,
    statusText: res?.statusMessage,
    method: req?.method || "GET",
    isOkStatusCode: statusCode >= 200 && statusCode < 300,
    allRequestResponses: [],
  };
  result.headers = normalizeAuthHeaders(result.headers);

  return result;
}
