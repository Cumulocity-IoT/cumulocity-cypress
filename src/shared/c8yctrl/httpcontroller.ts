import _ from "lodash";
import { inspect } from "util";

import express, { Express, RequestHandler } from "express";

import getRawBody from "raw-body";
import cookieParser from "cookie-parser";

import winston from "winston";
import morgan from "morgan";

import { Server } from "http";

import {
  C8yDefaultPact,
  C8yPact,
  C8yPactInfo,
  pactId,
  C8yPactRecordingMode,
  C8yPactMode,
  C8yPactRecordingModeValues,
  C8yPactModeValues,
  C8yPactID,
  isPact,
  isCypressResponse,
  toSerializablePactRecord,
} from "../c8ypact";

import {
  C8yPactHttpControllerLogLevel,
  C8yPactHttpControllerOptions,
  C8yPactHttpResponse,
} from "./httpcontroller-options";
import {
  addC8yCtrlHeader,
  createMiddleware,
  wrapPathIgnoreHandler,
} from "./middleware";

import { C8yPactFileAdapter } from "../c8ypact/adapter/fileadapter";
import { C8yAuthOptions } from "../auth";
import { oauthLogin } from "../oauthlogin";

import fs from "fs";
import path from "path";

import { isVersionSatisfyingRequirements } from "../versioning";
import { safeStringify, to_boolean } from "../util";
import { getPackageVersion } from "../util-node";

import swaggerUi from "swagger-ui-express";
import yaml from "yaml";

import { C8yBaseUrl, C8yTenant } from "../types";

import debug from "debug";
const log = debug("c8y:ctrl:http");

export class C8yPactHttpController {
  currentPact?: C8yDefaultPact;

  readonly port: number;
  readonly hostname: string;

  protected _baseUrl?: C8yBaseUrl;
  protected _staticRoot?: string;
  readonly tenant?: C8yTenant;

  adapter?: C8yPactFileAdapter;
  protected _recordingMode: C8yPactRecordingMode = "append";
  protected _mode: C8yPactMode = "apply";
  protected _isStrictMocking: boolean = true;

  protected staticApps: { [key: string]: string } = {};

  protected authOptions?: C8yAuthOptions;
  protected server?: Server;
  readonly app: Express;
  readonly options: C8yPactHttpControllerOptions;
  readonly resourcePath: string;

  readonly logger: winston.Logger;

  protected mockHandler?: RequestHandler;
  protected proxyHandler?: RequestHandler;

  constructor(options: C8yPactHttpControllerOptions) {
    this.options = options;
    this.adapter = options.adapter;
    this.port = options.port || 3000;
    this.hostname = options.hostname || "localhost";
    this._isStrictMocking = options.strictMocking || true;

    this.resourcePath = options.resourcePath || "/c8yctrl";

    this._baseUrl = options.baseUrl;
    this._staticRoot = options.staticRoot;

    this.currentPact = undefined;
    this.tenant = options.tenant;

    this.mode = options.mode || "apply";
    this.recordingMode = options.recordingMode || "append";

    const loggerOptions = {
      format: winston.format.simple(),
      transports: [new winston.transports.Console()],
    };
    this.logger = this.options.logger || winston.createLogger(loggerOptions);
    this.logger.level = options.logLevel || "info";
    const loggerStream = {
      write: (message: string) => {
        this.logger.info(message.trim());
      },
    };

    if (this.adapter) {
      this.logger.info(`Adapter: ${this.adapter.description()}`);
    }

    this.app = express();

    if (this.options.requestLogger) {
      let rls = this.options.requestLogger;
      if (_.isFunction(rls)) {
        rls = rls(this.logger);
      }
      if (!_.isArrayLike(rls)) {
        rls = [rls];
      }
      log("RequestLogger", rls);
      rls.forEach((h) => this.app.use(h));
    } else {
      this.app.use(
        morgan((options.logFormat || "short") as any, { stream: loggerStream })
      );
    }

    // Express 5 compatibility: explicitly add body parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // register cookie parser
    this.app.use(cookieParser());

    this.authOptions = options.auth;
  }

  /**
   * Base URL of the target server to proxy requests to.
   * @example "https://mytenant.eu-latest.cumulocity.com"
   */
  get baseUrl(): string | undefined {
    return this._baseUrl;
  }

  /**
   * Root folder for static files to serve. The controller will serve static files from this folder.
   * @example "/path/to/static/root"
   */
  get staticRoot(): string | undefined {
    return this._staticRoot;
  }

  get recordingMode(): C8yPactRecordingMode {
    return this._recordingMode;
  }

  set recordingMode(mode: C8yPactRecordingMode) {
    if (!_.isString(mode) || !C8yPactRecordingModeValues.includes(mode)) {
      this.logger.warn(
        `Invalid recording mode: "${mode}". Ignoring and continuing with recording mode "${this.recordingMode}".`
      );
      return;
    }
    this._recordingMode = mode;
  }

  get mode(): C8yPactMode {
    return this._mode;
  }

  set mode(mode: C8yPactMode) {
    if (!_.isString(mode) || !C8yPactModeValues.includes(mode)) {
      this.logger.warn(
        `Invalid mode: "${mode}". Ignoring and continuing with mode "${this.mode}".`
      );
      return;
    }
    this._mode = mode;
  }

  isRecordingEnabled(): boolean {
    return (
      (this.mode === "record" || this.mode === "recording") &&
      this.adapter != null &&
      this.baseUrl != null
    );
  }

  isMockingEnabled(): boolean {
    return this.mode === "apply" || this.mode === "mock";
  }

  /**
   * Starts the server. When started, the server listens on the configured port and hostname. If required,
   * the server will try to login to the target server using the provided credentials. If authOptions have
   * a bearer token, the server will use this token for authentication. To enforce BasicAuth, set the type
   * property of the authOptions to "BasicAuth".
   */
  async start(): Promise<void> {
    if (this.server) {
      await this.stop();
    }

    if (this.authOptions && this.baseUrl) {
      const { user, password, bearer, type } = this.authOptions;
      if (!_.isEqual(type, "BasicAuth") && !bearer && user && password) {
        try {
          const a = await oauthLogin(this.authOptions, this.baseUrl);
          this.logger.info(`oauthLogin -> ${this.baseUrl} (${a.user})`);
          _.extend(this.authOptions, _.pick(a, ["bearer", "xsrfToken"]));
        } catch (error) {
          this.logger.error(
            `Login failed ${this.baseUrl} (${user})\n${inspect(error, {
              depth: null,
            })}`
          );
        }
      }
    }

    if (!this.authOptions) {
      this.logger.debug(`No auth options provided. Not logging in.`);
    }

    await this.registerStaticRootRequestHandler();

    this.registerOpenAPIRequestHandler();

    const ignoredPaths = [this.resourcePath];
    if (!this.mockHandler) {
      this.mockHandler = this.app.use(
        wrapPathIgnoreHandler(this.mockRequestHandler, ignoredPaths)
      );
    }

    this.app.use(
      wrapPathIgnoreHandler((req, res, next) => {
        const that = this;
        getRawBody(
          req,
          {
            length: req.headers["content-length"],
          },
          function (err, chunk) {
            if (err != null) {
              that.logger.warn(`Failed to parse request body: ${err}`);
            } else {
              const rawBody = Buffer.concat([chunk]).toString("utf8");
              if (rawBody != null) {
                (req as any).rawBody = rawBody;
              }
            }
            next();
          }
        );
      }, ignoredPaths)
    );

    if (this.baseUrl) {
      this.logger.info(`BaseURL: ${this.baseUrl}`);
      // register proxy handler first requires to make the proxy ignore certain paths
      // this is needed as bodyParser will break post requests in the proxy handler but
      // is needed before any other handlers dealing with request bodies

      const errorHandler = _.isString(this.options.errorLogger)
        ? morgan(this.options.errorLogger, morganErrorOptions(this.logger))
        : this.options.errorLogger;

      if (!this.proxyHandler) {
        this.proxyHandler = this.app.use(
          createMiddleware(this, {
            ...this.options,
            errorHandler,
          })
        );
      }
    }

    this.registerC8yctrlInterface();

    // Express 5 compatible app.listen with error handling
    return new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(this.port, '0.0.0.0', (error?: Error) => {
        if (error) {
          this.logger.error('Server failed to start:', error);
          reject(error);
        } else {
          this.logger.info(
            `Started: ${this.hostname}:${this.port} (mode: ${this.mode})`
          );
          resolve();
        }
      });
    });
  }

  /**
   * Stops the server.
   */
  async stop(): Promise<void> {
    await this.server?.close();
    this.logger.info("Stopped server");
  }

  protected registerOpenAPIRequestHandler() {
    try {
      const openapiPath = path.join(path.dirname(__filename), "openapi.yaml");
      log(`loading openapi from ${openapiPath}`);
      const fileContent = fs.readFileSync(openapiPath, "utf-8");
      const document = yaml.parse(fileContent);

      this.app.use(
        `${this.resourcePath}/openapi/`,
        swaggerUi.serve,
        swaggerUi.setup(document)
      );
      this.logger.info(`OpenAPI: ${this.resourcePath}/openapi/`);
    } catch (error: any) {
      log(`loading openapi failed: ${error.message}`);
      this.logger.warn(`Failed to load OpenAPI document: ${error.message}`);
      this.logger.debug(inspect(error, { depth: null }));
    }
  }

  protected async registerStaticRootRequestHandler() {
    if (!this.staticRoot) return;
    // register static root
    this.logger.info(`Static Root: ${this.staticRoot}`);

    const appsDir = path.join(this.staticRoot, "apps");
    const subfolders = await fs.promises.readdir(appsDir, {
      withFileTypes: true,
    });

    for (const folder of subfolders) {
      if (!folder.isDirectory()) continue;
      const cumulocityJsonPath = path.join(
        appsDir,
        folder.name,
        "cumulocity.json"
      );
      try {
        const data = await fs.promises.readFile(cumulocityJsonPath, "utf-8");
        const c = JSON.parse(data);
        const version: string = c.version;

        const contextPath: string = c.contextPath;
        const relativePath = `/apps/${contextPath}`;
        const semverRange = this.options.appsVersions?.[contextPath];
        if (semverRange != null) {
          if (!isVersionSatisfyingRequirements(version, [semverRange])) {
            this.logger.debug(
              ` ${relativePath} (${version}) does not satisfy version requirements ${semverRange}`
            );
            continue;
          }
        }

        if (this.staticApps[contextPath] != null) {
          this.logger.debug(
            ` ${contextPath} already registered. Skipping ${cumulocityJsonPath}`
          );
          continue;
        }

        this.staticApps[contextPath] = version;
        const info = version + (semverRange ? ": " + semverRange : "");
        this.logger.info(
          `  ${relativePath} (${info}) -> ${this.staticRoot}/apps/${folder.name}`
        );

        const appFolder = path.join(this.staticRoot, "apps", folder.name);
        log(`${relativePath} -> ${appFolder}`);
        this.app.use(relativePath, express.static(appFolder));
      } catch (error) {
        this.logger.error(`error reading or parsing ${cumulocityJsonPath}`);
        this.logger.error(inspect(error, { depth: null }));
      }
    }
  }

  protected registerC8yctrlInterface() {
    // head endpoint can be used to check if the server is running, e.g. by start-server-and-test package
    this.app.head(this.resourcePath, (req, res) => {
      res.sendStatus(200);
    });
    this.app.get(`${this.resourcePath}/status`, (req, res) => {
      res.setHeader("content-type", "application/json");
      res.send(safeStringify(this.getStatus()));
    });
    this.app.get(`${this.resourcePath}/current`, (req, res) => {
      if (!this.currentPact) {
        // return 404 instead of 204 to indicate that no pact is set
        res.status(404).send("No current pact set");
        return;
      }
      res.setHeader("content-type", "application/json");
      res.send(this.stringifyPact(this.currentPact));
    });
    this.app.post(`${this.resourcePath}/current`, async (req, res) => {
      // Express 5 compatibility: create a copy of query parameters
      const bodyParams = req.body || {};
      const parameters = { ...bodyParams, ...req.query };
      const { mode, clear, recordingMode, strictMocking } = parameters;
      const id: C8yPactID | undefined =
        pactId(parameters.id) || pactId(parameters.title);

      this.mode = mode as C8yPactMode;
      this.recordingMode = recordingMode as C8yPactRecordingMode;
      this._isStrictMocking = to_boolean(strictMocking, this._isStrictMocking);

      if (!id || !_.isString(id)) {
        res.status(404).send("Missing or invalid pact id");
        return;
      }

      const refreshPact =
        this.recordingMode === "refresh" &&
        this.isRecordingEnabled() === true &&
        this.currentPact != null;
      const clearPact =
        _.isString(clear) &&
        (_.isEmpty(clear) || to_boolean(clear, false) === true);

      this.logger.debug(
        `mode: ${this.mode}, recordingMode: ${this.recordingMode}, strictMocking: ${this._isStrictMocking}, refresh: ${refreshPact}, clear: ${clearPact}`
      );

      let current = this.adapter?.loadPact(id);
      if (!current && this.isRecordingEnabled()) {
        const info: C8yPactInfo = {
          baseUrl: this.baseUrl || "",
          tenant: this.tenant || "",
          recordingMode: this.recordingMode,
          requestMatching: this.options.requestMatching,
          preprocessor: this.options.preprocessor?.options,
          strictMocking: this._isStrictMocking,
          ..._.pick(req.body, [
            "id",
            "producer",
            "consumer",
            "version",
            "title",
            "tags",
            "description",
          ]),
        };
        current = new C8yDefaultPact([], info, id);
        this.currentPact = current as C8yDefaultPact;
        res.status(201);
      }

      if (!current) {
        res
          .status(404)
          .send(
            `Not found. Could not find pact with id ${_.escape(
              id
            )}. Enable recording to create a new pact.`
          );
        return;
      } else {
        this.currentPact = C8yDefaultPact.from(current);
      }

      if (refreshPact === true || clearPact === true) {
        this.currentPact!.clearRecords();
        let shouldSave = true;
        if (_.isFunction(this.options.on.savePact)) {
          shouldSave = this.options.on.savePact(this, this.currentPact!);
          if (!shouldSave) {
            this.logger.warn(
              "Pact not saved. Disabled by on.savePact() even though refresh or clear was requested."
            );
          }
        }
        if (shouldSave === true) {
          await this.savePact(this.currentPact!);
          this.logger.debug(
            `Cleared pact (refresh: ${refreshPact} and clear: ${clearPact})`
          );
        }
      }

      res.setHeader("content-type", "application/json");
      res.send(
        this.stringifyPact(current)
        // {
        //   ...this.currentPact,
        //   records: (this.currentPact?.records?.length || 0) as any,
        // })
      );
    });
    this.app.delete(`${this.resourcePath}/current`, (req, res) => {
      this.currentPact = undefined;
      res.sendStatus(204);
    });
    this.app.post(`${this.resourcePath}/current/clear`, async (req, res) => {
      if (!this.currentPact) {
        // return 204 instead of 404 to indicate that no pact is set
        res.status(404).send("No current pact set");
        return;
      }
      this.currentPact!.clearRecords();
      res.setHeader("content-type", "application/json");
      res.send(this.stringifyPact(this.currentPact));
    });
    this.app.get(`${this.resourcePath}/current/request`, (req, res) => {
      if (!this.currentPact) {
        res.status(404).send("No current pact set");
        return;
      }

      const { keys } = { ...req.query };
      const queryKeys = Object.keys(req.query);
      const result = this.getObjectWithKeys(
        this.currentPact!.records.map((r) => r.request),
        keys ?? (queryKeys as any)
      );
      res.setHeader("content-type", "application/json");
      res.status(200).send(JSON.stringify(result, null, 2));
    });
    this.app.get(`${this.resourcePath}/current/response`, (req, res) => {
      if (!this.currentPact) {
        res.status(404).send("No current pact set");
        return;
      }
      const { keys } = { ...req.query };
      const queryKeys = Object.keys(req.query);
      const result = this.getObjectWithKeys(
        this.currentPact!.records.map((r) => {
          return { ...r.response, url: r.request.url };
        }),
        keys ?? (queryKeys as any)
      );
      res.setHeader("content-type", "application/json");
      res.status(200).send(JSON.stringify(result, null, 2));
    });

    // log endpoint
    const logLevels: string[] = Object.values(C8yPactHttpControllerLogLevel);
    this.app.get(`${this.resourcePath}/log`, (req, res) => {
      res.setHeader("content-type", "application/json");
      res.status(200).send(JSON.stringify({ level: this.logger.level }));
    });
    this.app.post(`${this.resourcePath}/log`, (req, res) => {
      const bodyParams = req.body || {};
      const parameters = { ...bodyParams, ...req.query };
      const { message, level } = parameters;
      if (
        level != null &&
        (!_.isString(level) || !logLevels.includes(level.toLowerCase()))
      ) {
        res
          .status(400)
          .send(`Invalid log level. Use one of: ${logLevels.join(", ")}`);
        return;
      }
      if (_.isString(message)) {
        this.logger.log(level || "info", message);
      }
      res.sendStatus(204);
    });
    this.app.put(`${this.resourcePath}/log`, (req, res) => {
      const bodyParams = req.body || {};
      const parameters = { ...bodyParams, ...req.query };
      const { level } = parameters;
      if (_.isString(level) && logLevels.includes(level.toLowerCase())) {
        this.logger.level = level.toLowerCase() as any;
      } else {
        res
          .status(400)
          .send(`Invalid log level. Use one of: ${logLevels.join(", ")}`);
        return;
      }
      res.sendStatus(204);
    });
  }

  protected getStatus() {
    const status = {
      status: "ok",
      uptime: process.uptime(),
      version: getPackageVersion(),
      adapter: this.adapter?.description() || null,
      baseUrl: this.baseUrl || null,
      tenant: this.tenant || null,
      current: {
        id: this.currentPact?.id || null,
      },
      static: {
        root: this.staticRoot || null,
        required: this.options.appsVersions || null,
        apps: this.staticApps || null,
      },
      mode: this.mode,
      supportedModes: C8yPactModeValues,
      recording: {
        recordingMode: this.recordingMode,
        supportedRecordingModes: C8yPactRecordingModeValues,
        isRecordingEnabled: this.isRecordingEnabled(),
      },
      mocking: {
        isMockingEnabled: this.isMockingEnabled(),
        strictMocking: this._isStrictMocking,
      },
      logger: {
        level: this.logger.level,
      },
    };
    return status;
  }

  // mock handler - returns recorded response.
  // register before proxy handler
  protected mockRequestHandler: RequestHandler = (req, res, next) => {
    if (!this.isMockingEnabled()) {
      return next();
    }

    let response: C8yPactHttpResponse | undefined | null = undefined;
    const record = this.currentPact?.nextRecordMatchingRequest(
      req,
      this.baseUrl
    );
    if (_.isFunction(this.options.on.mockRequest)) {
      response = this.options.on.mockRequest(this, req, record);
      if (!response && record) {
        addC8yCtrlHeader(res, "x-c8yctrl-type", "skipped");
        return next();
      }
    } else {
      response = record?.response;
    }
    if (response != null) {
      addC8yCtrlHeader(response, "x-c8yctrl-mode", this.recordingMode);
    }

    if (!record && !response) {
      if (this._isStrictMocking) {
        if (_.isFunction(this.options.on.mockNotFound)) {
          const r = this.options.on.mockNotFound(this, req);
          if (r != null) {
            response = r;
          }
        }
        if (response == null && this.options.mockNotFoundResponse) {
          const r = this.options.mockNotFoundResponse;
          response = _.isFunction(r) ? r(req) : r;
        } else if (response == null) {
          response = {
            status: 404,
            statusText: "Not Found",
            body:
              `<html>\n<head><title>404 Recording Not Found</title></head>` +
              `\n<body bgcolor="white">\n<center><h1>404 Recording Not Found</h1>` +
              `</center>\n<hr><center>cumulocity-cypress-ctrl/${this.constructor.name}</center>` +
              `\n</body>\n</html>\n`,
            headers: {
              "content-type": "text/html",
            },
          };
        }
        addC8yCtrlHeader(response, "x-c8yctrl-type", "notfound");
      }
    }

    if (!response) {
      this.logger.error(`No response for ${req.method} ${req.url}`);
      return next();
    }

    const responseBody = _.isString(response?.body)
      ? response?.body
      : this.stringify(response?.body);

    if (res.hasHeader("transfer-encoding")) {
      res.removeHeader("transfer-encoding");
      res.removeHeader("Transfer-Encoding");
    }
    res.setHeader("content-length", Buffer.byteLength(responseBody));

    response.headers = _.defaults(
      response?.headers,
      _.pick(response?.headers, ["content-type", "set-cookie"])
    );
    res.writeHead(
      response?.status || 200,
      _.omit(response?.headers || {}, "content-length", "date", "connection")
    );
    res.end(responseBody);
  };

  protected stringifyReplacer = (key: string, value: any) => {
    if (!_.isString(value)) return value;
    const replaceProperties = ["self", "next", "initRequest"];
    if (replaceProperties.includes(key) && value.startsWith("http")) {
      // replace url host with localhost
      const newHost = `http://${this.hostname}:${this.port}`;
      value = value.replace(/https?:\/\/[^/]+/, newHost);
    }
    return value;
  };

  getStringifyReplacer(): (key: string, value: any) => any {
    const configReplacer = this.options.stringifyReplacer;
    return configReplacer && _.isFunction(configReplacer)
      ? configReplacer
      : this.stringifyReplacer;
  }

  public stringify(obj?: any): string {
    if (!obj) return "";
    return JSON.stringify(obj, this.getStringifyReplacer(), 2);
  }

  protected stringifyPact(pact: C8yDefaultPact | C8yPact | any): string {
    const p = _.pick(pact, ["id", "info", "records"]) as C8yPact;
    return this.stringify(p);
  }

  protected producerForPact(pact: C8yPact) {
    return _.isString(pact.info.producer)
      ? { name: pact.info.producer }
      : pact.info.producer;
  }

  protected pactsForProducer(
    pacts: { [key: string]: C8yDefaultPact },
    producer: string | { name: string; version: string },
    version?: string
  ): C8yPact[] {
    if (!pacts) return [];
    return Object.keys(pacts)
      .filter((key) => {
        const p = pacts[key as keyof typeof pacts];
        const n = _.isString(producer) ? producer : producer.name;
        const v = _.isString(producer) ? version : producer.version;
        const pactProducer = this.producerForPact(p);
        if (!_.isUndefined(v) && !_.isEqual(v, pactProducer?.version))
          return false;
        if (!_.isEqual(n, pactProducer?.name)) return false;
        return true;
      })
      .map((key) => pacts[key as keyof typeof pacts]);
  }

  async savePact(
    response: Cypress.Response<any> | C8yPact,
    pactForId?: C8yPact
  ): Promise<boolean> {
    let pact: C8yDefaultPact | undefined = undefined;
    if (
      pactForId == null &&
      (("records" in response && "info" in response && "id" in response) ||
        isPact(response))
    ) {
      pact = new C8yDefaultPact(response.records, response.info, response.id);
    }

    if (pactForId != null) {
      pact =
        pactForId instanceof C8yDefaultPact
          ? pactForId
          : C8yDefaultPact.from(pactForId);
    }

    if (pact == null && pactForId == null) {
      pact = this.currentPact;
    }

    if (pact == null) {
      this.logger.warn(
        `savePact(): Could not save pact. No pact provided to save the response.`
      );
      return false;
    }

    if (this.adapter == null) {
      this.logger.warn(
        `savePact(): Failed to save pact ${pact.id}. No adapter configured.`
      );
      return false;
    }

    let result = false;

    if (isCypressResponse(response)) {
      const record = toSerializablePactRecord(response, {
        preprocessor: this.options.preprocessor,
        ...(this.baseUrl && { baseUrl: this.baseUrl }),
      });

      if (
        this.recordingMode === "append" ||
        this.recordingMode === "new" ||
        // refresh is the same as append as for refresh we remove the pact in each tests beforeEach
        this.recordingMode === "refresh"
      ) {
        result =
          result || pact.appendRecord(record, this.recordingMode === "new");
      } else if (this.recordingMode === "replace") {
        result = result || pact.replaceRecord(record);
      }
    }

    try {
      // records might be empty for a new pact without having received a request
      if (_.isEmpty(pact.records)) return false;
      if (result === true) {
        this.adapter?.savePact(pact);
      }
    } catch (error) {
      this.logger.error(`Failed to save pact ${error}`);
      this.logger.error(inspect(error, { depth: null }));
      result = false;
    }
    return result;
  }

  protected getObjectWithKeys(objs: any[], keys: string[]): any[] {
    return objs.map((r) => {
      const x: any = _.pick(r, keys);
      if (keys.includes("size")) {
        x.size = r.body ? this.stringify(r.body).length : 0;
      }
      return x;
    });
  }
}

export function morganErrorOptions(
  logger: winston.Logger | undefined = undefined
) {
  const options = {
    skip: (req, res) => {
      return (
        res.statusCode < 400 || req.url.startsWith("/notification/realtime")
      );
    },
  } as morgan.Options<express.Request, express.Response>;
  if (logger != null) {
    options.stream = {
      write: (message: string) => {
        logger.error(message.trim());
      },
    };
  }
  return options;
}
