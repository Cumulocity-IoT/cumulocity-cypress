import * as path from "path";
import * as fs from "fs";
import debug from "debug";

import {
  C8yPactFileAdapter,
  C8yPactDefaultFileAdapter,
} from "../shared/c8ypact/fileadapter";
import { C8yPact } from "../shared/c8ypact/c8ypact";
import { C8yAuthOptions, oauthLogin } from "../shared/c8yclient";

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import schema from "./../screenshot/schema.json";
import { ScreenshotSetup } from "../lib/screenshots/types";
import { readYamlFile } from "../screenshot/helper";

export { C8yPactFileAdapter, C8yPactDefaultFileAdapter };

/**
 * Configuration options for the Cumulocity Cypress plugin.
 */
export type C8yPluginConfig = {
  /**
   * Folder where to store or load pact files from.
   * Default is cypress/fixtures/c8ypact
   */
  pactFolder?: string;
  /**
   * Adapter to load and save pact objects.
   * Default is C8yPactDefaultFileAdapter
   */
  pactAdapter?: C8yPactFileAdapter;
};

/**
 * Configuration options for the Cumulocity Pact plugin. Sets up for example required tasks
 * to save and load pact objects.
 *
 * @param on Cypress plugin events
 * @param config Cypress plugin config
 * @param options Cumulocity plugin configuration options
 */
export function configureC8yPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options: C8yPluginConfig = {}
) {
  const log = debug("c8y:plugin");

  let adapter = options.pactAdapter;
  if (!adapter) {
    const folder =
      options.pactFolder ||
      options.pactAdapter?.getFolder() ||
      process.env.C8Y_PACT_FOLDER ||
      process.env.CYPRESS_C8Y_PACT_FOLDER ||
      // default folder is cypress/fixtures/c8ypact
      path.join(process.cwd(), "cypress", "fixtures", "c8ypact");
    adapter = new C8yPactDefaultFileAdapter(folder);
    log(`Created C8yPactDefaultFileAdapter with folder ${folder}`);
  } else {
    log(`Using adapter from options ${adapter}`);
  }

  // use C8Y_PLUGIN_LOADED to see if the plugin has been loaded
  config.env.C8Y_PLUGIN_LOADED = "true";
  // use C8Y_PACT_FOLDER to find out where the pact files have been loaded from
  config.env.C8Y_PACT_FOLDER = adapter.getFolder();

  function savePact(pact: C8yPact): null {
    const { id, info, records } = pact;
    log(`savePact() - ${pact.id} (${records?.length || 0} records)`);
    validateId(id);

    const version = getVersion();
    if (version && info) {
      if (!info.version) {
        info.version = {};
      }
      info.version.runner = version;
      info.version.c8ypact = "1";
    }

    adapter?.savePact(pact);
    return null;
  }

  function getPact(pact: string): C8yPact | null {
    log(`getPact() - ${pact}`);
    validateId(pact);
    return adapter?.loadPact(pact) || null;
  }

  function removePact(pact: string): boolean {
    log(`removePact() - ${pact}`);
    validateId(pact);

    adapter?.deletePact(pact);
    return true;
  }

  function validateId(id: string): void {
    log(`validateId() - ${id}`);
    if (!id || typeof id !== "string") {
      log(`Pact id validation failed, was ${typeof id}`);
      throw new Error(`c8ypact id must be a string, was ${typeof id}`);
    }
  }

  async function login(options: {
    auth: C8yAuthOptions;
    baseUrl: string;
  }): Promise<C8yAuthOptions> {
    log(
      `login() - ${options?.auth?.user}:${options?.auth?.password} -> ${options?.baseUrl}`
    );
    return await oauthLogin(options?.auth, options?.baseUrl);
  }

  if (on) {
    on("task", {
      "c8ypact:save": savePact,
      "c8ypact:get": getPact,
      "c8ypact:remove": removePact,
      "c8ypact:oauthLogin": login
    });
  }
}

/**
 * Configuration options for the Cumulocity Screenshot plugin and workflow. This sets up
 * the configuration as well as browser and screenshots handlers.
 * @param on Cypress plugin events
 * @param config Cypress plugin config
 * @param setup Configuration file or setup object
 */
export function configureC8yScreenshotPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  setup?: string | ScreenshotSetup
) {
  const log = debug("c8y:scrn:plugin");
  let configData: string | ScreenshotSetup | undefined = setup;
  if (config.env._c8yscrnConfigYaml != null) {
    log(`Using config from _c8yscrnConfigYaml`);
    configData = config.env._c8yscrnConfigYaml;
  }

  let lookupPaths: string[] = [];
  if (typeof configData === "string") {
    lookupPaths.push(configData);
    configData = undefined;
  }

  if (configData == null) {
    if (config.env._c8yscrnConfigFile != null) {
      lookupPaths.push(config.env._c8yscrnConfigFile);
    }
    lookupPaths.push("c8yscrn.config.yaml");
    log(`Looking for config file in [${lookupPaths.join(", ")}]`);
    const projectRoot =
      path.dirname(config.configFile) ??
      config.fileServerFolder ??
      process.cwd();
    log(`Using project root ${projectRoot}`);

    lookupPaths = lookupPaths
      .map((p) => path.resolve(projectRoot, p))
      .filter((p) => fs.existsSync(p));
    if (lookupPaths.length !== 0) {
      log(`Found ${lookupPaths.join(", ")}`);
    }
    if (lookupPaths.length == 0) {
      throw new Error(
        "No config file found. Please provide config file or create c8yscrn.config.yaml."
      );
    }

    log(`Using config file ${lookupPaths[0]}`);
    configData = readYamlFile(lookupPaths[0]);
  }

  if (!configData || typeof configData === "string") {
    throw new Error(
      "No config data found. Please provide config file or create c8yscrn.config.yaml."
    );
  }

  const ajv = new C8yAjvSchemaMatcher();
  ajv.match(configData, schema, true);

  if (configData.global?.timeouts?.default) {
    config.defaultCommandTimeout = configData.global.timeouts.default;
    log(`Setting default command timeout to ${config.defaultCommandTimeout}`);
  }
  if (configData.global?.timeouts?.pageLoad) {
    config.pageLoadTimeout = configData.global.timeouts.pageLoad;
    log(`Setting page load timeout to ${config.pageLoadTimeout}`);
  }
  if (configData.global?.timeouts?.screenshot) {
    config.responseTimeout = configData.global.timeouts.screenshot;
    log(`Setting screenshot timeout to ${config.responseTimeout}`);
  }

  log(
    `Config validated. ${configData.screenshots?.length} screenshots configured.`
  );

  const overwrite = configData.global?.overwrite ?? false;

  config.env._c8yscrnConfigYaml = configData;
  config.baseUrl =
    config.baseUrl ?? configData?.baseUrl ?? "http://localhost:8080";
  log(`Using baseUrl ${config.baseUrl}`);

  // https://www.cypress.io/blog/generate-high-resolution-videos-and-screenshots
  // https://github.com/cypress-io/cypress/issues/27260
  on("before:browser:launch", (browser, launchOptions) => {
    log(
      `Launching browser ${browser.name} in ${
        browser.isHeadless ? "headless" : "headed"
      } mode`
    );

    const viewportWidth = configData?.global?.viewportWidth ?? 1440;
    const viewportHeight = configData?.global?.viewportHeight ?? 900;
    log(`Setting viewport to ${viewportWidth}x${viewportHeight}`);
    if (browser.name === "chrome") {
      launchOptions.args.push(
        `--window-size=${viewportWidth},${viewportHeight}`
      );
      log(`Setting chrome launch options: ${launchOptions.args.slice(-1)}`);
    }
    if (browser.name === "electron") {
      launchOptions.preferences.width = viewportWidth;
      launchOptions.preferences.height = viewportHeight;
      launchOptions.preferences.resizable = false;
      log(
        `Setting electron perferences width=${viewportWidth}, height=${viewportHeight}`
      );
    }
    if (browser.name === "firefox") {
      launchOptions.args.push(`--width=${viewportWidth}`);
      launchOptions.args.push(`--height=${viewportHeight}`);
      log(`Setting firefox launch options: ${launchOptions.args.slice(-2)}`);
    }
    const launchArgs = config.env._c8yscrnBrowserLaunchArgs
    if (launchArgs != null && launchArgs !== "") {
      log(`Adding additional launch options ${launchArgs}`);
      launchOptions.args.push(launchArgs);
    }

    return launchOptions;
  });

  on("after:screenshot", (details) => {
    return new Promise((resolve, reject) => {
      const newPath =
        details.specName.trim() == ""
          ? details.path
          : details.path?.replace(`${details.specName}${path.sep}`, "");

      const folder = newPath?.split(path.sep).slice(0, -1).join(path.sep);
      if (folder && !fs.existsSync(folder)) {
        const result = fs.mkdirSync(folder, { recursive: true });
        if (!result) {
          reject(`Failed to create folder ${folder}`);
        }
      }
      if (!folder) {
        resolve({
          path: details.path,
          size: details.size,
          dimensions: details.dimensions,
        });
      }

      // for Module API run(), overwrite option of the screenshot is not working
      const targetPath = overwrite === true ? newPath : appendCountIfPathExists(newPath);
      log(`Moving screenshot ${details.path} to ${targetPath} (overwrite: ${overwrite})`);

      fs.rename(details.path, targetPath, (err) => {
        if (err) return reject(err);
        resolve({
          path: newPath,
          size: details.size,
          dimensions: details.dimensions,
        });
      });
    });
  });

  return config;
}

export function appendCountIfPathExists(newPath: string): string {
  let count = 2;
  let adjustedPath = newPath;

  while (fs.existsSync(adjustedPath)) {
    const parsedPath = path.parse(newPath);
    adjustedPath = path.join(parsedPath.dir, `${parsedPath.name} (${count})${parsedPath.ext}`);
    count++;
  }

  return adjustedPath;
}

function getVersion() {
  try {
    let currentDir = __dirname;
    let packageJsonPath;
    let maxLevels = 3;
    while (maxLevels > 0) {
      packageJsonPath = path.resolve(currentDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf8")
        );
        return packageJson.version;
      }
      currentDir = path.dirname(currentDir);
      maxLevels--;
    }
  } catch {
    console.error(
      "Failed to get version from package.json. package.json not found."
    );
  }
  return "unknown";
}