import cypress from "cypress";

import * as path from "path";
import * as fs from "fs";
import _ from "lodash";
import yargs from "yargs/yargs";
import { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { config as dotenv } from "dotenv";
import { ODiffOptions } from "odiff-bin";

import {
  createInitConfig,
  loadConfigFile,
  resolveBaseUrl,
  resolveConfigOptions,
  resolveScreenshotFolder,
} from "./helper";
import { C8yScreenshotOptions, DiffOptions } from "./../lib/screenshots/types";

import debug from "debug";
const log = debug("c8y:scrn:startup");

(async () => {
  try {
    const args = getConfigFromArgs();
    if (!args.config) {
      throw new Error(
        "No config file provided. Use --config option to provide the config file."
      );
    }
    const resolvedCypressConfig = resolveConfigOptions(args);
    let baseUrl = resolveBaseUrl(args);

    const yamlFile = path.resolve(process.cwd(), args.config);
    if (args.init === true) {
      if (!fs.existsSync(yamlFile)) {
        fs.writeFileSync(
          yamlFile,
          createInitConfig(baseUrl ?? "http://localhost:8080"),
          "utf8"
        );
        log(`Config file ${yamlFile} created.`);
      } else {
        throw new Error(`Config file ${yamlFile} already exists.`);
      }
      return;
    }

    if (!fs.existsSync(yamlFile)) {
      log(`Config file ${yamlFile} does not exist.`);
      throw new Error(`Config file ${yamlFile} does not exist.`);
    }

    const tags = (args.tags ?? []).join(",");
    const envs = {
      ...(dotenv().parsed ?? {}),
      ...(dotenv({ path: ".c8yscrn" }).parsed ?? {}),
      ...(tags.length > 0 ? { grepTags: tags } : {}),
      ..._.pickBy(process.env, (value, key) => key.startsWith("C8Y_")),
    };

    // we need to read config here to get some config values
    const configData = loadConfigFile(yamlFile);
    if (configData == null) {
      throw new Error(`Config file ${yamlFile} is empty.`);
    }

    baseUrl = baseUrl ?? configData.baseUrl ?? "http://localhost:8080";
    resolvedCypressConfig.config.e2e.baseUrl = baseUrl;
    log(`Using baseUrl ${baseUrl}`);

    const screenshotsFolder =
      resolvedCypressConfig.config.e2e.screenshotsFolder;
    log(`Using screenshots folder ${screenshotsFolder}`);

    const cypressConfigFile = resolvedCypressConfig.configFile;
    log(`Using cypress config file ${cypressConfigFile}`);

    const browser = resolvedCypressConfig.browser;
    log(`Using browser ${browser}`);

    const browserLaunchArgs =
      process.env[`C8Y_${browser.toUpperCase()}_LAUNCH_ARGS`] ??
      process.env.C8Y_BROWSER_LAUNCH_ARGS ??
      "";

    if (args.highlight === false) {
      log(`Disabling highlights in screenshots`);
    }

    const diffFolder =
      args.diffFolder != null
        ? resolveScreenshotFolder(args.diffFolder)
        : undefined;

    let diffOptions: (DiffOptions & ODiffOptions) | undefined = undefined;
    if (args.diff === true) {
      diffOptions = {
        ...{
          antialiasing: true,
          noFailOnFsErrors: true,
          reduceRamUsage: true,
        },
        ...(configData.global?.diff ?? {}),
        targetFolder: diffFolder,
        skipMove: args.diffSkip,
      };
    }

    // https://docs.cypress.io/guides/guides/module-api
    const config = {
      ...resolvedCypressConfig,
      ...{
        env: {
          ...envs,
          ...{
            _c8yscrnHighlight: args.highlight,
            _c8yscrnCli: true,
            _c8yscrnConfigFile: yamlFile,
            _c8yscrnyaml: configData,
            _c8yscrnBrowserLaunchArgs: browserLaunchArgs,
            _c8yscrnDiffOptions: diffOptions,
          },
        },
      },
    };

    if (args.open === true) {
      await cypress.open(config);
    } else {
      const result = await cypress.run(config);
      if (isFailedRunResult(result)) {
        console.error(result.message);
        process.exit(result.failures);
      } else {
        process.exit(result.totalFailed);
      }
    }
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
})();

function isFailedRunResult(
  result:
    | CypressCommandLine.CypressRunResult
    | CypressCommandLine.CypressFailedRunResult
): result is CypressCommandLine.CypressFailedRunResult {
  return "status" in result && result.status === "failed";
}

export function getConfigFromArgs(): Partial<C8yScreenshotOptions> {
  const result = yargs(hideBin(process.argv))
    .usage("Usage: $0 [options]")
    .scriptName("c8yscrn")
    .command("run", "Run workflows in headless mode", (yargs) => {
      return runOptions(sharedOptions(yargs));
    })
    .command("open", "Run workflows in Cypress open mode", (yargs) => {
      return runOptions(sharedOptions(yargs)).options("open", {
        type: "boolean",
        default: true,
        hidden: true,
      });
    })
    .command("init", "Initialize and create a new config file", (yargs) => {
      return sharedOptions(yargs).options("init", {
        type: "boolean",
        default: true,
        hidden: true,
      });
    })
    .help()
    .wrap(100)
    .parseSync();

  const filteredResult = Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined)
  );

  return filteredResult;
}

function sharedOptions(yargs: Argv) {
  return yargs
    .option("config", {
      alias: "c",
      type: "string",
      requiresArg: true,
      description: "The yaml config file",
      default: "c8yscrn.config.yaml",
    })
    .option("baseUrl", {
      alias: "u",
      type: "string",
      requiresArg: true,
      description: "The Cumulocity base url",
    });
}

function runOptions(yargs: Argv) {
  return yargs
    .option("folder", {
      alias: "f",
      type: "string",
      requiresArg: true,
      description: "The target folder for the screenshots",
    })
    .option("clear", {
      type: "boolean",
      requiresArg: false,
      description: "Clear the target folder and remove all data",
      default: false,
    })
    .option("browser", {
      alias: "b",
      type: "string",
      requiresArg: true,
      default: "chrome",
      description: "Browser to use",
    })
    .option("quiet", {
      type: "boolean",
      default: true,
      requiresArg: true,
      hidden: true,
    })
    .option("diff", {
      type: "boolean",
      default: false,
      requiresArg: false,
      description: "Enable image diffing",
    })
    .option("diffFolder", {
      type: "string",
      requiresArg: true,
      description: "Optional target folder for the diff images",
    })
    .option("diffSkip", {
      type: "boolean",
      default: true,
      requiresArg: false,
      description: "Skip screenshots without difference",
    })
    .option("highlight", {
      type: "boolean",
      alias: "h",
      default: true,
      requiresArg: true,
      description: "Enable or disable highlights in screenshots",
    })
    .option("tags", {
      alias: "t",
      type: "array",
      requiresArg: true,
      description: "Run only screenshot workflows with the given tags",
      coerce: (arg) => {
        const result: string[] = [];
        (Array.isArray(arg) ? arg : [arg]).forEach((tag: string) => {
          const t = tag?.split(",");
          if (t != null) {
            result.push(...t);
          }
        });
        return result;
      },
    });
}
