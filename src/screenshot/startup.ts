import cypress from "cypress";

import * as path from "path";
import * as fs from "fs";

import yargs from "yargs/yargs";
import { Argv } from "yargs";
import { hideBin } from "yargs/helpers";
import { config as dotenv } from "dotenv";

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import schema from "./../screenshot/schema.json";
import { createInitConfig, readYamlFile } from "./helper";
import {
  C8yScreenshotOptions,
  ScreenshotSetup,
} from "./../lib/screenshots/types";

import debug from "debug";
const log = debug("c8y:c8yscrn:startup");

(async () => {
  try {
    const args = getConfigFromArgs();
    if (!args.config) {
      throw new Error(
        "No config file provided. Use --config option to provide the config file."
      );
    }

    const baseUrl =
      args.baseUrl ?? process.env.C8Y_BASEURL ?? "http://localhost:8080";

    const yamlFile = path.resolve(process.cwd(), args.config);
    if (args.init === true) {
      if (!fs.existsSync(yamlFile)) {
        fs.writeFileSync(yamlFile, createInitConfig(baseUrl), "utf8");
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
    };

    let configData: ScreenshotSetup;
    try {
      configData = readYamlFile(yamlFile);
    } catch (error: any) {
      throw new Error(`Error reading config file. ${error.message}`);
    }

    try {
      log(`Validating config file ${yamlFile}`);
      const ajv = new C8yAjvSchemaMatcher();
      ajv.match(configData, schema, true);
    } catch (error: any) {
      throw new Error(`Invalid config file. ${error.message}`);
    }

    // might run in different environments, so we need to find the correct extension
    // this is required when running in development mode from ts files
    let fileExtension = __filename?.split(".")?.pop();
    if (!fileExtension || !["js", "ts", "mjs", "cjs"].includes(fileExtension)) {
      fileExtension = "js";
    }
    log(`Using baseUrl ${baseUrl}`);
    const screenshotsFolder = path.resolve(
      process.cwd(),
      args.folder ?? "c8yscrn"
    );

    log(`Using screenshots folder ${screenshotsFolder}`);
    const cypressConfigFile = path.resolve(
      path.dirname(__filename),
      `config.${fileExtension}`
    );
    log(`Using cypress config file ${cypressConfigFile}`);

    const browser = (args.browser ?? process.env.C8Y_BROWSER ?? "chrome")
      .toLowerCase()
      .trim();
    log(`Using browser ${args.browser}`);
    if (!["chrome", "firefox", "electron"].includes(browser)) {
      throw new Error(
        `Invalid browser ${browser}. Supported browsers are chrome, firefox, electron.`
      );
    }

    const browserLaunchArgs =
      process.env[`C8Y_${browser.toUpperCase()}_LAUNCH_ARGS`] ??
      process.env.C8Y_BROWSER_LAUNCH_ARGS ??
      "";

    const config = {
      ...{
        configFile: cypressConfigFile,
        browser,
        testingType: "e2e" as const,
        quiet: args.quiet ?? true,
        config: {
          e2e: {
            baseUrl,
            screenshotsFolder,
            specPattern: path.join(
              path.dirname(__filename),
              `*.cy.${fileExtension}`
            ),
          },
        },
      },
      ...{
        env: {
          ...envs,
          ...{
            _c8yscrnConfigFile: yamlFile,
            _c8yscrnyaml: configData,
            _c8yscrnBrowserLaunchArgs: browserLaunchArgs,
          },
        },
      },
    };

    if (args.open === true) {
      await cypress.open(config);
    } else {
      await cypress.run(config);
    }
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
})();

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
      requiresArg: false,
      hidden: true,
    })
    .option("tags", {
      alias: "t",
      type: "array",
      requiresArg: false,
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
