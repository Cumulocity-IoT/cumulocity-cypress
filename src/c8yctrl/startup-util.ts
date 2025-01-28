import _ from "lodash";

import fs from "fs";
import path from "path";

import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import { createLogger, format, transports } from "winston";
// https://github.com/winstonjs/winston/issues/2430
// use following import if transports is empty
import { default as transportsDirect } from "winston/lib/winston/transports/";
import morgan from "morgan";

import {
  C8yPactHttpControllerConfig,
  C8yDefaultPactPreprocessor,
  C8yPactDefaultFileAdapter,
  C8yPactHttpControllerLogLevel,
  C8yPactModeValues,
  C8yPactRecordingModeValues,
  C8yPactHttpControllerDefaultMode,
  C8yPactHttpControllerDefaultRecordingMode,
} from "../shared/c8yctrl";

import { RequestHandler } from "express";
import {
  getPackageVersion,
  safeStringify,
} from "../shared/util";

import debug from "debug";
const log = debug("c8y:ctrl:startup");

export function getEnvVar(name: string): string | undefined {
  return (
    process.env[name] ||
    process.env[_.camelCase(name)] ||
    process.env[`CYPRESS_${name}`] ||
    process.env[name.replace(/^C8Y_/i, "")] ||
    process.env[_.camelCase(`CYPRESS_${name}`)] ||
    process.env[`CYPRESS_${_.camelCase(name.replace(/^C8Y_/i, ""))}`]
  );
}

export function getConfigFromArgs(): [
  Partial<C8yPactHttpControllerConfig>,
  string | undefined
] {
  // doc: https://github.com/yargs/yargs/blob/0c95f9c79e1810cf9c8964fbf7d139009412f7e7/docs/api.md
  const result = yargs(hideBin(process.argv))
    .usage("Usage: $0 [options]")
    .scriptName("c8yctrl")
    .option("folder", {
      alias: "pactFolder",
      type: "string",
      requiresArg: true,
      description: "The folder recordings are stored in",
    })
    .option("port", {
      type: "number",
      requiresArg: true,
      default: +(getEnvVar("C8Y_HTTP_PORT") || 3000),
      defaultDescription: "3000",
      description: "The HTTP port c8yctrl listens on",
    })
    .option("baseUrl", {
      alias: "baseurl",
      type: "string",
      requiresArg: true,
      description: "The Cumulocity URL for proxying requests",
    })
    .option("user", {
      alias: "username",
      requiresArg: true,
      type: "string",
      description: "The username to login at baseUrl",
    })
    .option("password", {
      type: "string",
      requiresArg: true,
      description: "The password to login at baseUrl",
    })
    .option("tenant", {
      type: "string",
      requiresArg: true,
      description: "The tenant id of baseUrl",
    })
    .option("staticRoot", {
      alias: "static",
      requiresArg: true,
      type: "string",
      description: "The root folder to serve static files from",
    })
    .option("mode", {
      type: "string",
      requiresArg: true,
      default: getEnvVar("C8Y_PACT_MODE") || C8yPactHttpControllerDefaultMode,
      defaultDescription: C8yPactHttpControllerDefaultMode,
      description: `One of ${Object.values(C8yPactModeValues).filter((m) => m !== "recording").join(", ")}`,
    })
    .option("recordingMode", {
      type: "string",
      requiresArg: true,
      default:
        getEnvVar("C8Y_PACT_RECORDING_MODE") ||
        C8yPactHttpControllerDefaultRecordingMode,
      defaultDescription: C8yPactHttpControllerDefaultRecordingMode,
      description: `One of ${Object.values(C8yPactRecordingModeValues).join(
        ", "
      )}`,
    })
    .option("config", {
      type: "string",
      requiresArg: true,
      description: "The path to the config file",
    })
    .option("log", {
      type: "boolean",
      default: getEnvVar("C8Y_LOG") !== "false",
      defaultDescription: "true",
      requiresArg: false,
      description: "Enable or disable logging",
    })
    .option("logLevel", {
      type: "string",
      default: getEnvVar("C8Y_LOG_LEVEL") || "info",
      defaultDescription: "info",
      requiresArg: true,
      description: "The log level used for logging",
    })
    .option("logFile", {
      type: "string",
      requiresArg: true,
      description: "The path of the logfile",
    })
    .option("accessLogFile", {
      type: "string",
      requiresArg: true,
      description: "The path of the access logfile",
    })
    .option("apps", {
      type: "array",
      requiresArg: true,
      description:
        "Array of of static folder app names and semver ranges separated by '/'",
      coerce: (arg) => {
        const result: { [key: string]: string } = {};
        arg.forEach((item: string) => {
          const [key, ...value] = item.split("/");
          const semverRange = value.join("/");
          if (key != null && value != null && semverRange != null) {
            result[key] = semverRange;
          }
        });
        return result;
      },
    })
    .help()
    .wrap(120)
    .version(getPackageVersion())
    .parseSync();

  const logLevelValues: string[] = Object.values(C8yPactHttpControllerLogLevel);

  // pick only the options that are set and apply defaults
  // yargs creates properties we do not want, this way we can filter them out
  return [
    {
      folder: result.folder,
      port: result.port,
      baseUrl: result.baseUrl,
      user: result.user,
      password: result.password,
      tenant: result.tenant,
      staticRoot: result.staticRoot,
      logFilename: result.logFile,
      accessLogFilename: result.accessLogFile,
      log: result.log,
      logLevel: logLevelValues.includes(result.logLevel || "")
        ? (result.logLevel as (typeof C8yPactHttpControllerLogLevel)[number])
        : undefined,
      appsVersions: result.apps,
      mode: result.mode as any,
      recordingMode: result.recordingMode as any,
    },
    result.config,
  ];
}

export function getConfigFromEnvironment(): Partial<C8yPactHttpControllerConfig> {
  return {
    folder: getEnvVar("C8Y_PACT_FOLDER"),
    port: +(getEnvVar("C8Y_HTTP_PORT") || 3000),
    baseUrl: getEnvVar("C8Y_BASE_URL") || getEnvVar("C8Y_BASEURL"),
    user: getEnvVar("C8Y_BASE_USERNAME") || getEnvVar("C8Y_USERNAME"),
    password: getEnvVar("C8Y_BASE_PASSWORD") || getEnvVar("C8Y_PASSWORD"),
    tenant: getEnvVar("C8Y_BASE_TENANT") || getEnvVar("C8Y_TENANT"),
    staticRoot: getEnvVar("C8Y_STATIC_ROOT") || getEnvVar("C8Y_STATIC"),
    logFilename: getEnvVar("C8Y_LOG_FILE"),
    accessLogFilename: getEnvVar("C8Y_ACCESS_LOG_FILE"),
    log: getEnvVar("C8Y_LOG") !== "false",
    logLevel: getEnvVar("C8Y_LOG_LEVEL"),
    mode: getEnvVar("C8Y_PACT_MODE"),
    recordingMode: getEnvVar("C8Y_PACT_RECORDING_MODE"),
  } as Partial<C8yPactHttpControllerConfig>;
}

export function getConfigFromArgsOrEnvironment(): [
  Partial<C8yPactHttpControllerConfig>,
  string | undefined
] {
  const [args, config] = getConfigFromArgs();
  const env = getConfigFromEnvironment();
  return [_.defaults(args, env), config];
}

export function validateConfig(config: Partial<C8yPactHttpControllerConfig>) {
  if (!C8yPactModeValues.includes(config.mode as any)) {
    throw new Error(
      `Configured mode "${
        config.mode
      }" is not valid. Must be one of ${C8yPactModeValues.join(", ")}.`
    );
  }
  if (!C8yPactRecordingModeValues.includes(config.recordingMode as any)) {
    throw new Error(
      `Configured recording mode "${
        config.recordingMode
      }" is not valid. Must be one of ${C8yPactRecordingModeValues.join(", ")}.`
    );
  }
}

const safeTransports = !_.isEmpty(transports) ? transports : transportsDirect;

/**
 * Default logger for the HTTP controller. It logs to the console with colors and simple format.
 * This needs to be passed to the config, so it must be created before applying the default config.
 */
export const defaultLogger = createLogger({
  transports: [
    new safeTransports.Console({
      format: format.combine(
        format.colorize({
          all: true,
          colors: {
            info: "green",
            error: "red",
            warn: "yellow",
            debug: "white",
          },
        }),
        format.simple()
      ),
    }),
  ],
});

/**
 * Default config object for the HTTP controller. It takes a configuration object and
 * adds required defaults, as for example the adapter, an error response record or the logger.
 *
 * This config can be overwritten by a config file, which is loaded by cosmiconfig.
 */
export const applyDefaultConfig = (
  config: Partial<C8yPactHttpControllerConfig>
) => {
  if (!config?.auth) {
    log("no auth options provided, trying to create from user and password");
    const { user, password, tenant } = config;
    config.auth = user && password ? { user, password, tenant } : undefined;
  }

  if (!("on" in config)) {
    config.on = {};
    log("configured empty object callback 'on' property of config");
  }

  // check all default properties as _.defaults seems to still overwrite in some cases
  if (!("adapter" in config)) {
    config.adapter = new C8yPactDefaultFileAdapter(
      config.folder || "./c8ypact"
    );
    log(
      `configured default file adapter for folder ${
        config.folder || "./c8ypact"
      }.`
    );
  }

  if (!("mockNotFoundResponse" in config)) {
    config.mockNotFoundResponse = (url) => {
      return {
        status: 404,
        statusText: "Not Found",
        body: `Not Found: ${url}`,
        headers: {
          "content-type": "application/text",
        },
      };
    };
    log("configured default 404 text mockNotFoundResponse");
  }

  if (!("requestMatching" in config)) {
    config.requestMatching = {
      ignoreUrlParameters: ["dateFrom", "dateTo", "_", "nocache"],
      baseUrl: config.baseUrl,
    };
    log("configured default requestMatching");
  }

  if (!("preprocessor" in config)) {
    config.preprocessor = new C8yDefaultPactPreprocessor({
      obfuscate: ["request.headers.Authorization", "response.body.password"],
    });
    log("configured default preprocessor");
  }

  applyDefaultLogConfig(config);

  return config;
};

const applyDefaultLogConfig = (
  config: Partial<C8yPactHttpControllerConfig>
) => {
  if ("log" in config && config.log === false) {
    log("disabled logging as config.log == false");
    config.logger = undefined;
    config.requestLogger = undefined;
    return;
  }

  if (!("logger" in config)) {
    config.logger = defaultLogger;
    log("configured default logger");
  }

  if (
    "logFilename" in config &&
    config.logFilename != null &&
    config.logger != null
  ) {
    const p = path.isAbsolute(config.logFilename)
      ? config.accessLogFilename
      : path.join(process.cwd(), config.logFilename);

    config.logger.add(
      new safeTransports.File({
        format: format.simple(),
        filename: p,
      })
    );
    log(`configured default logger file transport ${p}.`);
  }

  if (
    "logLevel" in config &&
    config.logLevel != null &&
    config.logger != null
  ) {
    config.logger.level = config.logLevel;
    log(`configured log level ${config.logLevel}.`);
  }

  if (!("requestLogger" in config)) {
    config.requestLogger = [
      morgan(
        "[c8yctrl] :method :url :status :res[content-length] - :response-time ms",
        {
          skip: (req) => {
            return (
              !req.url.startsWith("/c8yctrl") ||
              req.url.startsWith("/c8yctrl/log")
            );
          },

          stream: {
            write: (message: string) => {
              config.logger?.warn(message.trim());
            },
          },
        }
      ),
    ];
    log("configured default requestLogger for /c8yctrl interface and errors");
  }

  if (!("errorLogger" in config) && config.errorLogger == null) {
    if ((morgan as any)["error-object"] == null) {
      // eslint-disable-next-line import/no-named-as-default-member
      morgan.token("error-object", (req, res) => {
        let resBody = (res as any).body;
        if (
          _.isString(resBody) &&
          // parse as json only if body is a cumulocity error response
          /"error"\s*:\s*"/.test(resBody) &&
          /"message"\s*:\s*"/.test(resBody)
        ) {
          try {
            resBody = JSON.parse(resBody);
          } catch (e) {
            // ignore, use body as string
          }
        }
        // make sure we do not log too much
        if (_.isString(resBody)) {
          resBody = resBody.slice(0, 1000);
        }

        const errorObject = {
          url: req.url,
          status: `${res.statusCode} ${res.statusMessage}`,
          requestHeader: req.headers,
          responseHeader: res.getHeaders(),
          responseBody: resBody,
          requestBody: (req as any).body,
        };
        return safeStringify(errorObject);
      });
      log("default morgan error-object token compiled and registered");
    }

    config.errorLogger = morgan(":error-object", {
      skip: (req, res) => {
        return (
          res.statusCode < 400 || req.url.startsWith("/notification/realtime")
        );
      },
      stream: {
        write: (message: string) => {
          config.logger?.error(message.trim());
        },
      },
    });
    log("configured default error logger");
  }

  if ("accessLogFilename" in config && config.accessLogFilename != null) {
    const p = path.isAbsolute(config.accessLogFilename)
      ? config.accessLogFilename
      : path.join(process.cwd(), config.accessLogFilename);

    const accessLogger = morgan("common", {
      stream: fs.createWriteStream(p, {
        flags: "a",
      }),
    });

    if (config.requestLogger != null) {
      if (_.isArrayLike(config.requestLogger)) {
        (config.requestLogger as RequestHandler[]).push(accessLogger);
        log(`configured file access logger to existing logger ${p}`);
      }
    } else {
      config.requestLogger = [accessLogger];
      log(`configured file access logger ${p}`);
    }
  }
};
