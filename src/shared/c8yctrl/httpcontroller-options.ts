import { C8yPactHttpController } from "./httpcontroller";
import {
  C8yPact,
  C8yPactPreprocessor,
  C8yPactRecord,
  C8yPactRequestMatchingOptions,
  C8yPactResponse,
  C8ySchemaGenerator,
  C8yPactFileAdapter,
  C8yPactMode,
  C8yPactRecordingMode,
} from "../c8ypact";

import { Request, RequestHandler } from "express";
import { ClientRequest, IncomingMessage, ServerResponse } from "http";

import { FormatFn } from "morgan";
import winston from "winston";
import { C8yAuthOptions } from "../auth";

type LogFormat =
  | "json"
  | "simple"
  | "combined"
  | "short"
  | "dev"
  | "tiny"
  | "common";

export type C8yPactHttpResponse<T = any> = Pick<
  C8yPactResponse<T>,
  "status" | "statusText" | "body" | "headers"
>;

export const C8yPactHttpControllerLogLevel = [
  "info",
  "debug",
  "warn",
  "error",
] as const;

export const C8yPactHttpControllerDefaultMode: C8yPactMode = "forward";

export const C8yPactHttpControllerDefaultRecordingMode: C8yPactRecordingMode =
  "append";

export interface C8yPactHttpControllerOptions {
  /**
   * The resource path to use for the controller. Default is "/c8yctrl".
   */
  resourcePath?: string;
  /**
   * Base URL of the target server to proxy requests to.
   */
  baseUrl?: string;
  /**
   * Authentication options to use for authenticating against the target server.
   */
  auth?: C8yAuthOptions;
  /**
   * Hostname to listen on. Default is localhost.
   */
  hostname?: string;
  /**
   * Port to listen on. Default is 3000.
   */
  port?: number;
  /**
   * Tenant id of the target server to proxy requests to.
   */
  tenant?: string;
  /**
   * Root folder for static files to serve.
   */
  staticRoot?: string;
  /**
   * Adapter to use for loading and saving pact files.
   */
  adapter: C8yPactFileAdapter;
  /**
   * Preprocessor to use for modifying requests and responses.
   */
  preprocessor?: C8yPactPreprocessor;
  /**
   * Schema generator to use for generating schemas for response bodies. If not set, no schema is generated.
   */
  schemaGenerator?: C8ySchemaGenerator;
  /**
   * Request matching options to use for matching requests to recorded responses.
   */
  requestMatching?: C8yPactRequestMatchingOptions;
  /**
   * Enable strict mocking. If true, only recorded responses are returned.
   */
  strictMocking?: boolean;
  /**
   * Mode the controller is running in.
   */
  mode?: C8yPactMode;
  /**
   * Recording mode to use for recording requests and responses.
   */
  recordingMode?: C8yPactRecordingMode;
  /**
   * Id of the pact to use for recording and mocking. Default is undefined.
   */
  pactId?: string;
  /**
   * Record to use for error responses when no mock is found.
   */
  mockNotFoundResponse?:
    | C8yPactHttpResponse
    | ((req: Request<any, any, any, any>) => C8yPactHttpResponse);
  /**
   * Logger to use for logging. Currently only winston is supported.
   */
  logger?: winston.Logger;
  /**
   * RequestHandler to use for logging requests. Default is morgan.
   */
  requestLogger?:
    | RequestHandler[]
    | ((logger?: winston.Logger) => RequestHandler[]);
  /**
   * RequestHandler to use for logging errors. Default is morgan logger
   * that logs error object with url, status, request and response details.
   */
  errorLogger?: RequestHandler;
  /**
   * Log level to use for logging. Default is info.
   */
  logLevel?: (typeof C8yPactHttpControllerLogLevel)[number];
  /**
   * Log format to use for logging.
   */
  logFormat?:
    | LogFormat
    | string
    | FormatFn<IncomingMessage, ServerResponse<IncomingMessage>>;
  /**
   * The app names and version to use from static folder. E.g. "cockpit: 1020".
   * The version must be a semver range.
   */
  appsVersions?: { [key: string]: string };
  /**
   * Custom replacer function to use for JSON.stringify. Use for customization of JSON output.
   * Default is to replace URLs in "self", "next", "initRequest" properties with hostname and
   * port of the controller.
   */
  stringifyReplacer?: (key: string, value: any) => any;
  /**
   * Callbacks for hooking into the controller lifecycle.
   */
  on: C8yPactHttpControllerCallbackOptions;
}

export interface C8yPactHttpControllerCallbackOptions {
  /**
   * Called before the controller is started.
   * @param ctrl The controller instance.
   * @param config The configuration used for the controller.
   */
  beforeStart?: (
    ctrl: C8yPactHttpController,
    config?: C8yPactHttpControllerOptions
  ) => void;
  /**
   * Called before a request is mocked. Use to modify or return custom response as mock. Also
   * use to forward custom headers from the request to the response. By default, only the
   * recorded `content-type` and `set-cookie` headers are forwarded. Any other recorded headers
   * must be forwarded by adding them to the `response.headers` object.
   *
   * By returning null or undefined, the request is passed to the proxy handler without mocking.
   *
   * **Note**: return `record.response` to use the recorded response as mock.
   *
   * @param ctrl The controller instance.
   * @param req The request to mock.
   * @param record The record used for mocking.
   * @returns A response to use as mock or null/undefined to pass the request to the proxy handler.
   */
  mockRequest?: (
    ctrl: C8yPactHttpController,
    req: Request<any, any, any, any>,
    record: C8yPactRecord | undefined | null
  ) => C8yPactHttpResponse | undefined | null;
  /**
   * Called when a request is not found in the recorded pacts. Use to return a custom response
   * for the request or `undefined` if `mockNotFoundResponse` or default 404 response should
   * be returned for the given request. To access the pact, the response was not found in, use
   * `c8yctl.currentPact`.
   * @param ctrl The controller instance.
   * @param req The request to be mocked.
   * @returns A response to use as mock for the request or `undefined` to use the default 404 response.
   */
  mockNotFound?: (
    ctrl: C8yPactHttpController,
    req: Request
  ) => C8yPactHttpResponse | undefined;
  /**
   * Called before a request is proxied. Use to modify the request before it
   * is proxied, e.g. to add or remove headers, etc. or to abort the request
   * by returning a custom or error response to send back to the client.
   * @param ctrl The controller instance.
   * @param proxyReq The proxy request.
   * @param req The request to proxy.
   * @returns A response to send back to the client to abort the request or undefined to continue.
   */
  proxyRequest?: (
    ctrl: C8yPactHttpController,
    proxyReq: ClientRequest,
    req: Request<any, any, any, any>
  ) => C8yPactHttpResponse | undefined | null;
  /**
   * Called after receiving the response for a proxied request. By returning false,
   * the request and response are ignored and not processed and saved. Use to filter
   * requests and responses from recording.
   * @param ctrl The controller instance.
   * @param req The proxied request.
   * @param res The proxied response.
   * @returns false if the request and response should be ignored, true otherwise.
   */
  proxyResponse?: (
    ctrl: C8yPactHttpController,
    req: Request,
    res: C8yPactHttpResponse
  ) => boolean;
  /**
   * Called before a request and its response are saved. By returning false, the
   * request is ignored and not saved.
   * @param ctrl The controller instance.
   * @param req The C8yPact object to be saved.
   * @returns true if the C8yPact should be saved, false otherwise.
   */
  savePact?: (ctrl: C8yPactHttpController, pact: C8yPact) => boolean;
}

export interface C8yPactHttpControllerConfig
  extends C8yPactHttpControllerOptions {
  /**
   * Folder to load and save pact files from and to.
   */
  folder?: string;
  /**
   * Folder to save log files to.
   */
  logFolder?: string;
  /**
   * Log file name to use for logging.
   */
  logFilename?: string;
  /**
   * File to use for http access logging.
   */
  accessLogFilename?: string;
  /**
   * User to login to the target server.
   */
  user?: string;
  /**
   * Password to login to the target server.
   */
  password?: string;
  /**
   * Enable or disable logging.
   */
  log?: boolean;
}

export type C8yCtrlHeader =
  | "x-c8yctrl-type"
  | "x-c8yctrl-id"
  | "x-c8yctrl-count"
  | "x-c8yctrl-mode";
