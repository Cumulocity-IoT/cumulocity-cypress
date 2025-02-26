#!/usr/bin/env node

import _ from "lodash";
import debug from "debug";
import { inspect } from "util";
import { config as dotenv } from "dotenv";

import { C8yPactHttpController, C8yPactHttpControllerOptions } from "./index";

import { cosmiconfig } from "cosmiconfig";
import { TypeScriptLoader } from "cosmiconfig-typescript-loader";

import {
  applyDefaultConfig,
  defaultLogger,
  getConfigFromArgsOrEnvironment,
  validateConfig,
} from "./startup-util";

const log = debug("c8y:ctrl:startup");

(async () => {
  // load .env file first and overwrite with .c8yctrl file if present
  dotenv();
  dotenv({ path: ".c8yctrl", override: true });

  // read config from environment variables or command line arguments
  const [config, configFile] = getConfigFromArgsOrEnvironment();
  log(`config from args and environment: ${JSON.stringify(config, null, 2)}`);

  // load defaults and merge them with the current config
  applyDefaultConfig(config);

  const searchPlaces = configFile ? [configFile] : ["c8yctrl.config.ts"];
  // load config file if provided and merge it with the current config
  const configLoader = cosmiconfig("cumulocity-cypress", {
    searchPlaces,
    loaders: {
      ".ts": TypeScriptLoader(),
    },
  });

  const result = await configLoader.search(process.cwd());
  if (result) {
    log("loaded config:", result.filepath);
    if (_.isFunction(result.config)) {
      log("config exported a function");
      const configClone = _.cloneDeep(config);
      // assign logger after deep cloning: https://github.com/winstonjs/winston/issues/1730
      configClone.logger = defaultLogger;
      const c = result.config(configClone);
      _.assignIn(config, c || configClone);
    } else {
      log("config exported an object");
      _.assignIn(config, result.config);
    }

    config.logger?.info("Config: " + result.filepath);
  } else {
    log("no config file found in:", searchPlaces);
  }

  // now config is complete and we can start the controller
  const c = config as C8yPactHttpControllerOptions;
  try {
    validateConfig(config);
    const controller = new C8yPactHttpController(c);
    config.on?.beforeStart?.(controller, c);
    await controller.start();
  } catch (error: any) {
    if (c.logger != null) {
      c.logger?.error(
        `Error starting c8yctrl: ${inspect(error, { depth: null })}`
      );
    } else {
      console.error(`Error starting c8yctrl`);
      console.error(error);
    }
  }
})();
