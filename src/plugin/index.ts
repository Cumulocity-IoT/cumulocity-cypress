import * as path from "path";
import * as fs from "fs";
import debug from "debug";

import { compare } from "odiff-bin";
import WebSocket from "ws";
import { watch, FSWatcher } from "chokidar";

import {
  C8yPactFileAdapter,
  C8yPactDefaultFileAdapter,
} from "../shared/c8ypact/adapter/fileadapter";
import {
  C8yPactHttpController,
  C8yPactHttpControllerOptions,
} from "../c8yctrl";
import {
  C8yPact,
  getEnvVar,
  validatePactMode,
} from "../shared/c8ypact/c8ypact";
import { C8yAuthOptions, oauthLogin } from "../shared/c8yclient";
import { validateBaseUrl } from "../shared/c8ypact/url";
import { getPackageVersion } from "../shared/util";

import {
  C8yScreenshotFileUploadOptions,
  DiffOptions,
  ScreenshotSetup,
} from "../lib/screenshots/types";
import { loadConfigFile } from "../c8yscrn/helper";
import { C8yBaseUrl } from "../shared/types";

export { C8yPactFileAdapter, C8yPactDefaultFileAdapter };
export { readYamlFile, loadConfigFile } from "../c8yscrn/helper";

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
  const envFolder = getEnvVar("C8Y_PACT_FOLDER");
  if (!adapter) {
    const folder =
      options.pactFolder ||
      options.pactAdapter?.getFolder() ||
      envFolder ||
      // default folder is cypress/fixtures/c8ypact
      path.join(process.cwd(), "cypress", "fixtures", "c8ypact");
    adapter = new C8yPactDefaultFileAdapter(folder);
    log(`Created C8yPactDefaultFileAdapter with folder ${folder}`);
  } else {
    log(`Using adapter from options ${adapter}`);
  }

  // validate pact mode and base url before starting the plugin
  // use environment variables AND config.env for variables defined in cypress.config.ts
  const mode =
    getEnvVar("C8Y_PACT_MODE") || getEnvVar("C8Y_PACT_MODE", config.env);
  log(`validatePactMode() - ${mode}`);

  validatePactMode(mode); // throws on error
  const baseUrl =
    getEnvVar("C8Y_BASEURL") ||
    getEnvVar("CYPRESS_BASEURL") ||
    getEnvVar("C8Y_BASEURL", config.env) ||
    getEnvVar("CYPRESS_BASEURL", config.env);

  log(`validateBaseUrl() - ${baseUrl}`);
  validateBaseUrl(baseUrl); // throws on error

  let http: C8yPactHttpController | null = null;

  // use C8Y_PLUGIN_LOADED to see if the plugin has been loaded
  config.env.C8Y_PLUGIN_LOADED = "true";
  // use C8Y_PACT_FOLDER to find out where the pact files have been loaded from
  config.env.C8Y_PACT_FOLDER = adapter.getFolder();

  function savePact(pact: C8yPact): null {
    const { id, info, records } = pact;
    log(`savePact() - ${pact.id} (${records?.length || 0} records)`);
    validateId(id);

    const version = getPackageVersion();
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

  async function startHttpController(
    options: C8yPactHttpControllerOptions
  ): Promise<C8yPactHttpController> {
    if (http) {
      await stopHttpController();
    }
    http = new C8yPactHttpController(options);
    await http.start();
    return http;
  }

  async function stopHttpController(): Promise<null> {
    if (http) {
      await http.stop();
      http = null;
    }
    return null;
  }

  async function login(options: {
    auth: C8yAuthOptions;
    baseUrl: C8yBaseUrl;
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
      "c8ypact:http:start": startHttpController,
      "c8ypact:http:stop": stopHttpController,
      "c8ypact:oauthLogin": login,
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
  const logRun = debug("c8y:scrn:run");
  const logScreenshot = debug("c8y:scrn:run:screenshot");

  let configData: string | ScreenshotSetup | undefined = setup;
  if (typeof configData === "object") {
    log(`Using config from object`);
  }
  if (configData == null && config.env._c8yscrnConfigYaml != null) {
    log(`Using config from _c8yscrnConfigYaml`);
    configData = config.env._c8yscrnConfigYaml;
  }

  let lookupPaths: string[] = [];
  if (typeof configData === "string") {
    lookupPaths.push(configData);
    configData = undefined;
  }

  const projectRoot =
    path.dirname(config.configFile) ?? config.fileServerFolder ?? process.cwd();
  log(`Using project root ${projectRoot}`);

  let configFilePath: string | undefined = undefined;
  if (configData == null) {
    if (config.env._c8yscrnConfigFile != null) {
      lookupPaths.push(config.env._c8yscrnConfigFile);
    }
    lookupPaths.push("c8yscrn.config.yaml");
    log(`Looking for config file in [${lookupPaths.join(", ")}]`);

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

    configFilePath = lookupPaths[0];
    log(`Using config file ${configFilePath}`);
    configData = loadConfigFile(configFilePath);
  }

  if (!configData || typeof configData === "string") {
    throw new Error(
      "No config data found. Please provide config file or create c8yscrn.config.yaml."
    );
  }

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

  const failureFolder = config.env._c8yscrnFailureFolder;
  if (failureFolder != null) {
    log(`Using failure folder ${failureFolder}`);
  }

  const diffOptions: DiffOptions | undefined = config.env._c8yscrnDiffOptions;
  if (diffOptions != null) {
    log(`Using diff options ${JSON.stringify(diffOptions)}`);
  } else {
    log(`No diff options provided. Image diffing disabled.`);
  }

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

    // adding 500px height in headless mode for viewport and browser controls
    // see https://github.com/cypress-io/cypress/issues/27260#issuecomment-2127940718
    // see https://github.com/cypress-io/cypress/issues/3324
    if (browser.name === "chrome") {
      launchOptions.args.push(
        `--window-size=${viewportWidth},${viewportHeight + 500}`
      );
      log(`Setting chrome launch options: ${launchOptions.args.slice(-1)}`);
    }
    if (browser.name === "electron") {
      launchOptions.preferences.width = viewportWidth;
      launchOptions.preferences.height = viewportHeight + 500;
      launchOptions.preferences.resizable = false;
      log(
        `Setting electron perferences width=${viewportWidth}, height=${
          viewportHeight + 500
        }`
      );
    }
    if (browser.name === "firefox") {
      launchOptions.args.push(`--width=${viewportWidth}`);
      launchOptions.args.push(`--height=${viewportHeight + 500}`);
      log(`Setting firefox launch options: ${launchOptions.args.slice(-2)}`);
    }
    const launchArgs = config.env._c8yscrnBrowserLaunchArgs;
    if (launchArgs != null && launchArgs !== "") {
      log(`Adding additional launch options ${launchArgs}`);
      launchOptions.args.push(launchArgs);
    }

    return launchOptions;
  });

  on("after:screenshot", (details) => {
    logScreenshot(`Starting screenshot ${JSON.stringify(details)}`);
    return new Promise((resolve, reject) => {
      const finish = (result: Cypress.AfterScreenshotReturnObject | string) => {
        const resolveObject: Cypress.AfterScreenshotReturnObject = {
          ...details,
          ...(typeof result === "string" && { path: result }),
        };
        logScreenshot(`Finished screenshot ${JSON.stringify(resolveObject)}`);
        resolve(resolveObject);
      };

      const moveFile = (source: string, target: string) => {
        fs.rename(source, target, (err) => {
          if (err) {
            logScreenshot(`Error moving file: ${err}`);
            return reject(err);
          }
          logScreenshot(`Moved ${source} to ${target} (${overwrite})`);
        });
      };

      const deleteFile = (source: string) => {
        fs.unlink(source, (err) => {
          if (err) {
            logScreenshot(`Error deleting file: ${err}`);
            return reject(err);
          }
          logScreenshot(`Deleted ${source}`);
        });
      };
      // path contains spec name, remove it. might only be required for run() mode however
      const newPath =
        details.specName.trim() == ""
          ? details.path
          : details.path?.replace(`${details.specName}${path.sep}`, "");
      logRun(`details.path: ${details.path} -> newPath: ${newPath}`);

      const screenshotTarget = path.dirname(newPath);
      const diffTarget =
        diffOptions?.targetFolder ??
        (config.screenshotsFolder as string) ??
        (config.e2e.screenshotsFolder as string);

      const isTestFailure = details.testFailure === true;
      const isDiffEnabled = diffOptions != null && !isTestFailure;
      if (isDiffEnabled && !diffTarget) {
        logScreenshot(`Diffing enabled but no target folder found`);
        finish(details);
      }

      const folders = [screenshotTarget];
      if (isTestFailure && failureFolder != null) {
        folders.push(failureFolder);
      }
      if (isDiffEnabled && diffTarget) {
        folders.push(
          path.join(diffTarget, ...details.name.split("/").slice(0, -1))
        );
      }

      folders.forEach((f) => {
        if (!fs.existsSync(f)) {
          const result = fs.mkdirSync(f, { recursive: true });
          if (!result) {
            reject(`Failed to create folder ${f}`);
          }
        }
      });

      if (!screenshotTarget) {
        logScreenshot(`No screenshot target folder configured`);
        finish(details);
      }

      // for Module API run(), overwrite option of the screenshot is not working
      const screenshotFile =
        overwrite === true ? newPath : appendCountIfPathExists(newPath);

      if (isTestFailure && failureFolder != null) {
        const failureFileName = path.basename(details.path);
        const failureTarget = path.join(failureFolder, failureFileName);
        logScreenshot(`Moving failure screenshot to: ${failureTarget}`);
        moveFile(details.path, failureTarget);
        finish(details);
      } else if (!isDiffEnabled) {
        moveFile(details.path, screenshotFile);
        finish(newPath);
      } else {
        const diffFile = path.join(diffTarget, `${details.name}.diff.png`);
        logScreenshot(`Diff file: ${diffFile}`);
        compare(details.path, screenshotFile, diffFile, diffOptions).then(
          (diffResult) => {
            logScreenshot(`Diff result: ${JSON.stringify(diffResult)}`);
            if (diffOptions.skipMove === true && diffResult.match === true) {
              logScreenshot(
                `Skipping ${screenshotFile} (skipMove: ${diffOptions.skipMove})`
              );
              // discard the screenshot if there is a match and skipMove is false
              if (!diffOptions.skipMove) deleteFile(details.path);
            } else {
              moveFile(details.path, screenshotFile);
            }
            finish(newPath);
          }
        );
      }
    });
  });

  on("task", {
    debug: (message: string) => {
      logRun(message.slice(0, 100));
      return null;
    },
    "c8yscrn:file": (file: {
      path: string;
      fileName: string;
      encoding: BufferEncoding;
    }) => {
      return getFileUploadOptions(file, configFilePath, projectRoot);
    },
  });

  // there is no way to reload the config file from plugin events
  // before:run and before:spec events can not update the config or env
  // workaround is to use a websocket server to reload the config file
  // on file change of the config file

  const disabled = config.env.C8Y_DISABLE_WEBSOCKET;
  if (disabled === true || disabled === "true") {
    log(
      `Websocket server disabled. Config file will not be watched and reloaded.`
    );
    return;
  }

  // only create websocket server if not in text terminal (run) and started from c8yscrn cli
  const fromCli = config.env._c8yscrnCli === true;
  log(
    `${configFilePath} textterminal: ${config.isTextTerminal} cli: ${fromCli}`
  );

  if (config.isTextTerminal === false && configFilePath != null && fromCli) {
    let watcher: FSWatcher | undefined = undefined;
    // socket will be recreated as the client will reload the tests
    const socket = new WebSocket.Server({ port: 9345 });
    socket.on("connection", function connection(conn) {
      log(`Started websocket server on port 9345`);
      if (watcher != null) watcher.close();

      log(`Watching ${configFilePath} for change events`);
      watcher = watch(configFilePath).on("change", () => {
        log(`${configFilePath} has changed`);
        const newConfig = loadConfigFile(configFilePath, false);
        if (newConfig == null) {
          log(`Failed to reload config file ${configFilePath}`);
          return;
        }
        const message = JSON.stringify({
          command: "reload",
          config: newConfig,
        });
        log(`Sending reload message`);
        conn?.send(message);
      });
    });
  }

  return config;
}

export function appendCountIfPathExists(newPath: string): string {
  let count = 2;
  let adjustedPath = newPath;

  while (fs.existsSync(adjustedPath)) {
    const parsedPath = path.parse(newPath);
    adjustedPath = path.join(
      parsedPath.dir,
      `${parsedPath.name} (${count})${parsedPath.ext}`
    );
    count++;
  }

  return adjustedPath;
}

export function getFileUploadOptions(
  file: {
    path: string;
    fileName?: string;
    encoding?: BufferEncoding;
  },
  configFilePath: string | undefined,
  projectRoot: string
): C8yScreenshotFileUploadOptions | null {
  const log = debug("c8y:scrn:run:fileupload");

  const p = path.resolve(
    configFilePath != null ? path.dirname(configFilePath) : projectRoot,
    file.path
  );
  log(`Reading file ${p} with encoding ${file.encoding}`);
  if (!fs.existsSync(p)) {
    log(`File ${p} not found`);
    return null;
  }

  const mimeTypeMap: { [extension: string]: string } = {
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".csv": "text/csv",
    ".txt": "text/plain",
  };

  const textFileExtensions = [".csv", ".txt", ".json"];
  const binaryFileExtensions = [".png", ".jpg", ".jpeg", ".gif"];
  const extension = [file.fileName, file.path]
    .filter((p) => p != null)
    .map((p) => path.extname(p).toLowerCase() ?? null)[0];
  log(`Found extension ${extension}`);
  if (extension == null) {
    log(`Required extension to upload file. Skipping ${p}`);
    return null;
  }

  let mimeType: string | undefined = undefined;
  if (mimeTypeMap[extension] != null) {
    mimeType = mimeTypeMap[extension];
    log(`Using mimeType ${mimeType}`);
  }

  let encoding = file.encoding;
  let data: any = undefined;
  if (extension === ".json") {
    encoding = encoding ?? "utf8";
    data = JSON.parse(fs.readFileSync(p, encoding));
  } else if (textFileExtensions.includes(extension)) {
    encoding = encoding ?? "utf8";
  } else if (binaryFileExtensions.includes(extension)) {
    encoding = encoding ?? "binary";
  } else {
    log(`Unsupported file type ${extension}`);
    return null;
  }
  if (data == null) {
    data = fs.readFileSync(p, encoding);
    log(`Read ${encoding} file ${p}`);
  }

  const stats = fs.statSync(p);
  const fileSizeInBytes = stats.size;
  log(`Read ${encoding} file ${p} with ${fileSizeInBytes} bytes`);

  const result: C8yScreenshotFileUploadOptions = {
    data,
    encoding,
    path: p,
    filename: file.fileName ?? path.basename(p),
    mimeType,
  };

  return result;
}
