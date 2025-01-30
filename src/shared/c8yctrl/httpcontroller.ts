import _ from "lodash";

import express, { Express, RequestHandler } from "express";

import bodyParser from "body-parser";
import cookieParser from "cookie-parser";

import winston from "winston";
import morgan from "morgan";

import { Server } from "http";

import {
  C8yDefaultPact,
  C8yPact,
  C8yPactInfo,
  C8yPactSaveKeys,
  pactId,
  toPactSerializableObject,
  C8yPactRecordingMode,
  C8yPactMode,
  C8yPactRecordingModeValues,
  C8yPactModeValues,
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

import { toBoolean } from "./httpcontroller-utils";
import { C8yPactFileAdapter } from "../c8ypact/fileadapter";
import { C8yAuthOptions } from "../auth";
import { oauthLogin } from "../c8yclient";

import fs from "fs";
import path from "path";

import { isVersionSatisfyingRequirements } from "../versioning";
import { getPackageVersion, safeStringify } from "../util";

import debug from "debug";
const log = debug("c8y:ctrl:http");

export class C8yPactHttpController {
  currentPact?: C8yDefaultPact;

  readonly port: number;
  readonly hostname: string;

  protected _baseUrl?: string;
  protected _staticRoot?: string;
  readonly tenant?: string;

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

    // register cookie parser
    this.app.use(cookieParser());

    this.authOptions = options.auth;
  }

  get baseUrl(): string | undefined {
    return this._baseUrl;
  }

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
          this.logger.error(`Login failed ${this.baseUrl} (${user})`, error);
        }
      }
    }

    if (!this.authOptions) {
      this.logger.debug(`No auth options provided. Not logging in.`);
    }

    await this.registerStaticRootRequestHandler();

    if (this.baseUrl) {
      this.logger.info(`BaseURL: ${this.baseUrl}`);
      // register proxy handler first requires to make the proxy ignore certain paths
      // this is needed as bodyParser will break post requests in the proxy handler but
      // is needed before any other handlers dealing with request bodies
      const ignoredPaths = [this.resourcePath];

      if (!this.mockHandler) {
        this.mockHandler = this.app.use(
          wrapPathIgnoreHandler(this.mockRequestHandler, ignoredPaths)
        );
      }

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

    // automatically parse request bodies - must come after proxy handler
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));

    this.registerC8yctrlInterface();

    try {
      this.server = await this.app.listen(this.port);
      this.logger.info(
        `Started: ${this.hostname}:${this.port} (mode: ${this.mode})`
      );
    } catch (error) {
      this.logger.error("Error starting server:", error);
      throw error;
    }
  }

  /**
   * Stops the server.
   */
  async stop(): Promise<void> {
    await this.server?.close();
    this.logger.info("Stopped server");
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
        this.logger.error(
          `  error reading or parsing ${cumulocityJsonPath} - ${error}`
        );
      }
    }
  }

  protected registerC8yctrlInterface() {
    // head endpoint can be used to check if the server is running, e.g. by start-server-and-test package
    this.app.head(this.resourcePath, (req, res) => {
      res.status(200).send();
    });
    this.app.get(`${this.resourcePath}/status`, (req, res) => {
      res.setHeader("content-type", "application/json");
      res.send(safeStringify(this.getStatus()));
    });
    this.app.get(`${this.resourcePath}/current`, (req, res) => {
      if (!this.currentPact) {
        // return 204 instead of 404 to indicate that no pact is set
        res.status(204).send();
        return;
      }
      res.setHeader("content-type", "application/json");
      res.send(this.stringifyPact(this.currentPact));
    });
    this.app.post(`${this.resourcePath}/current`, async (req, res) => {
      const parameters = { ...req.body, ...req.query };
      const { mode, clear, recordingMode, strictMocking } = parameters;
      const id = pactId(parameters.id) || pactId(parameters.title);

      this.mode = mode as C8yPactMode;
      this.recordingMode = recordingMode as C8yPactRecordingMode;
      this._isStrictMocking = toBoolean(strictMocking, this._isStrictMocking);

      if (!id || !_.isString(id)) {
        res.status(204).send("Missing or invalid pact id");
        return;
      }

      const refreshPact =
        this.recordingMode === "refresh" &&
        this.isRecordingEnabled() === true &&
        this.currentPact != null;
      const clearPact =
        _.isString(clear) &&
        (_.isEmpty(clear) || toBoolean(clear, false) === true);

      this.logger.debug(
        `mode: ${this.mode}, recordingMode: ${this.recordingMode}, strictMocking: ${this._isStrictMocking}, refresh: ${refreshPact}, clear: ${clearPact}`
      );

      if (this.currentPact?.id === id) {
        res.status(204);
      } else {
        let current = this.adapter?.loadPact(id);
        if (!current && this.isRecordingEnabled()) {
          const info: C8yPactInfo = {
            baseUrl: this.baseUrl || "",
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
            .send(`Not found. Enable recording to create a new pact.`);
          return;
        } else {
          current = this.adapter?.loadPact(id);
          if (!current) {
            res
              .status(404)
              .send(`Not found. Could not find pact with id ${_.escape(id)}.`);
            return;
          } else {
            this.currentPact = C8yDefaultPact.from(current);
            res.status(200);
          }
        }
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
        this.stringifyPact({
          ...this.currentPact,
          records: (this.currentPact?.records?.length || 0) as any,
        })
      );
    });
    this.app.delete(`${this.resourcePath}/current`, (req, res) => {
      this.currentPact = undefined;
      res.status(204).send();
    });
    this.app.post(`${this.resourcePath}/current/clear`, async (req, res) => {
      if (!this.currentPact) {
        // return 204 instead of 404 to indicate that no pact is set
        res.status(204).send();
        return;
      }
      this.currentPact!.clearRecords();
      res.setHeader("content-type", "application/json");
      res.send(this.stringifyPact(this.currentPact));
    });
    this.app.get(`${this.resourcePath}/current/request`, (req, res) => {
      if (!this.currentPact) {
        res.send(204);
        return;
      }
      const result = this.getObjectWithKeys(
        this.currentPact!.records.map((r) => r.request),
        Object.keys(req.query)
      );
      res.setHeader("content-type", "application/json");
      res.status(200).send(JSON.stringify(result, null, 2));
    });
    this.app.get(`${this.resourcePath}/current/response`, (req, res) => {
      if (!this.currentPact) {
        res.send(204);
        return;
      }
      const result = this.getObjectWithKeys(
        this.currentPact!.records.map((r) => {
          return { ...r.response, url: r.request.url };
        }),
        Object.keys(req.query)
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
      const parameters = { ...req.body, ...req.query };
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
      res.status(204).send();
    });
    this.app.put(`${this.resourcePath}/log`, (req, res) => {
      const parameters = { ...req.body, ...req.query };
      const { level } = parameters;
      if (_.isString(level) && logLevels.includes(level.toLowerCase())) {
        this.logger.level = level.toLowerCase() as any;
      } else {
        res
          .status(400)
          .send(`Invalid log level. Use one of: ${logLevels.join(", ")}`);
        return;
      }
      res.status(204).send();
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
    if (!pactForId) return false;

    let result = false;
    const id = pactForId.id;
    try {
      let pact: Pick<C8yPact, C8yPactSaveKeys>;
      if ("records" in response && "info" in response) {
        pact = response;
      } else {
        const info: C8yPactInfo = {
          id: pactForId?.id,
          title: [],
          tenant: this.tenant,
          baseUrl: this.baseUrl || "",
          preprocessor: this.options.preprocessor?.options,
          requestMatching: this.options.requestMatching,
          strictMocking: this._isStrictMocking,
        };
        pact = await toPactSerializableObject(response, info, {
          preprocessor: this.options.preprocessor,
          schemaGenerator: this.options.schemaGenerator,
        });
      }

      // see also cypresspact.ts savePact() implementation
      const { records } = pact;
      if (!pactForId) {
        pactForId = new C8yDefaultPact(records, pact.info, id);
        this.currentPact = pactForId as C8yDefaultPact;
      } else {
        if (
          this.recordingMode === "append" ||
          this.recordingMode === "new" ||
          // refresh is the same as append as for refresh we remove the pact in each tests beforeEach
          this.recordingMode === "refresh"
        ) {
          for (const record of pact.records) {
            result =
              result ||
              pactForId.appendRecord(record, this.recordingMode === "new");
          }
        } else if (this.recordingMode === "replace") {
          for (const record of pact.records) {
            result = result || pactForId.replaceRecord(record);
          }
        }
      }

      // records might be empty when if a new pact without having received a request
      if (!pact || _.isEmpty(pactForId.records)) return false;
      if (result) {
        this.adapter?.savePact(pactForId);
      }
      return result;
    } catch (error) {
      this.logger.error(`Failed to save pact ${error}`);
      return false;
    }
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
