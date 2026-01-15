import { isAbsoluteURL, normalizeUrl } from "../../shared/url";
import {
  C8yDefaultPact,
  C8yPact,
  C8yPactID,
  C8yPactMode,
  C8yPactRecordingMode,
  pactId,
  validatePactMode,
  validatePactRecordingMode,
} from "../../shared/c8ypact";
import { to_boolean } from "../../shared/util";
import * as pactutils from "./pactutils";

const { _ } = Cypress;

declare global {
  namespace Cypress {
    interface Cypress {
      c8yctrl: CypressC8yCtrl;
    }
  }

  /**
   * C8yCtrl interface. Contains all functions and properties to interact with c8yctrl
   * http proxy and API.
   */
  interface CypressC8yCtrl {
    /**
     * The current pact object used by c8yctrl. This is set by the setCurrent function
     * and reset by the resetCurrent function.
     */
    get current(): C8yPact | null;
    /**
     * Returns the current pact mode of the c8yctrl server. This is set by the
     * environment variable C8YCTRL_MODE or the default value "disabled".
     * @returns The current pact mode.
     */
    mode: () => C8yPactMode;
    /**
     * Returns the current recording mode. This is set by the environment variable
     * C8YCTRL_RECORDING_MODE or the default value "append".
     * @returns The current recording mode.
     */
    recordingMode: () => C8yPactRecordingMode;
    /**
     * Checks if the c8yctrl server is enabled or configured for current test.
     * This is true if the plugin is loaded and the environment variable
     * C8YCTRL_MODE is configured.
     * @returns True if using the c8yctrl server is enabled, false otherwise.
     */
    isEnabled: () => boolean;
    /**
     * Checks if the c8yctrl server is enabled. This is true if the mode is set to
     * "record", or "recording".
     * @returns True if the c8yctrl server is enabled, false otherwise.
     */
    isRecordingEnabled: () => boolean;
    /**
     * Checks if the mocking is enabled. This is true if the mode is set to
     * "mock" or "apply" and the c8yctrl server is enabled.
     * @returns True if mocking is enabled, false otherwise.
     */
    isMockingEnabled: () => boolean;
    /**
     * Sets the current test in the c8yctrl server. This will also set the
     * Cypress.c8yctrl.current property to the C8yPact object of the current test.
     * @param options The options to set the current test.
     * @returns The response object of the c8yctrl API call to set the current test.
     */
    setCurrent: (options: {
      id?: C8yPactID;
      title?: string | string[];
      clear?: boolean;
      mode?: C8yPactMode;
      recordingMode?: C8yPactRecordingMode;
    }) => Cypress.Chainable<C8yCtrlCurrentResponse | null>;
    /**
     * Resets the current test in the c8yctrl server. This will also reset the
     * Cypress.c8yctrl.current property to null.
     * @returns The response object of the c8yctrl API call to reset the current test.
     */
    resetCurrent: () => Cypress.Chainable<C8yCtrlCurrentResponse | null>;
    /**
     * Gets the URL of the c8yctrl server. This could be from the environment variable
     * C8YCTRL_URL or the baseUrl from the Cypress config.
     * @returns The URL of the c8yctrl server. If the URL is not set, it returns null.
     */
    url: () => string | null;
    /**
     * Use debugLog to enable logging of debug information to the Cypress debug log.
     */
    debugLog: boolean;
  }
}

export type C8yCtrlCurrentResponse = {
  status: number;
  headers: any;
  body: any;
  statusText: string;
  ok: boolean;
  redirected: boolean;
  type: string;
  url: string;
};

if (_.get(Cypress, "__c8yctrl.initialized") === undefined) {
  _.set(Cypress, "__c8yctrl.initialized", true);
  Cypress.c8yctrl = {
    mode,
    recordingMode,
    get current() {
      return _current;
    },
    isEnabled,
    setCurrent,
    resetCurrent,
    url,
    isRecordingEnabled: () => {
      const modeValue = mode();
      return isEnabled() && ["recording", "record"].includes(modeValue);
    },
    isMockingEnabled: () => {
      const modeValue = mode();
      return isEnabled() && ["mock", "apply"].includes(modeValue);
    },
    debugLog: false,
  };

  beforeEach(function () {
    let consoleProps: any = {};
    let logger: Cypress.Log | undefined = undefined;
    if (Cypress.c8yctrl.debugLog === true) {
      consoleProps = {
        id: Cypress.c8ypact.getCurrentTestId() || null,
        current: Cypress.c8yctrl.current || null,
        isEnabled: Cypress.c8yctrl.isEnabled(),
        isRecordingEnabled: Cypress.c8yctrl.isRecordingEnabled(),
        isMockingEnabled: Cypress.c8yctrl.isMockingEnabled(),
        mode: Cypress.c8yctrl.mode() || null,
        url: Cypress.c8yctrl.url() || null,
        recordingMode: Cypress.c8yctrl.recordingMode(),
        debugLog: Cypress.c8yctrl.debugLog,
        cypressEnv: Cypress.env(),
      };
      logger = Cypress.log({
        name: "c8yctrl",
        displayName: "c8yctrl",
        message: `init`,
        consoleProps: () => consoleProps,
      });
    }

    if (!isEnabled()) {
      logger?.end();
      return;
    }

    try {
      validatePactMode(Cypress.env("C8YCTRL_MODE"));
      validatePactRecordingMode(Cypress.env("C8YCTRL_RECORDING_MODE"));
    } catch (error) {
      logger?.end();
      throw error;
    }

    Cypress.c8yctrl
      .setCurrent({
        id: Cypress.c8ypact.getCurrentTestId(),
        mode: mode(),
        recordingMode: recordingMode(),
      })
      .then((response) => {
        consoleProps.setCurrentResponse = response;
        consoleProps.current = Cypress.c8yctrl.current || null;
        logger?.end();

        if (response?.ok === false) {
          throw new Error(
            `Failed to update current test in ${url()}/c8yctrl/current. c8yctrl returned ${
              response.status
            } ${response.statusText}.`
          );
        }
      });
  });

  afterEach(() => {
    if (!isEnabled()) return;
    Cypress.c8yctrl.resetCurrent();
  });
}

let _current: C8yPact | null = null;

const C8yCtrlSetCurrentDefaults = {
  clear: false,
  id: Cypress.c8ypact.getCurrentTestId(),
  mode: "apply",
  recordingMode: "append",
};

function mode(): C8yPactMode {
  return pactutils.mode("C8YCTRL_MODE");
}

function recordingMode() {
  return pactutils.recordingMode("C8YCTRL_RECORDING_MODE");
}

function isEnabled() {
  if (url() == null) return false;

  const ignore = to_boolean(Cypress.env("C8YCTRL_IGNORE"), false);
  if (ignore === true) return false;

  return pactutils.isEnabled("C8YCTRL_MODE");
}

function setCurrent(options: {
  id?: C8yPactID;
  title?: string | string[];
  clear?: boolean;
  mode?: C8yPactMode;
  recordingMode?: C8yPactRecordingMode;
}): Cypress.Chainable<C8yCtrlCurrentResponse | null> {
  const o = _.defaults(
    options ?? {},
    {
      mode: mode(),
      recordingMode: recordingMode(),
      id: Cypress.c8ypact.getCurrentTestId(),
      clear: recordingMode() === "refresh",
    },
    C8yCtrlSetCurrentDefaults
  );

  const values = ["recording", "record"];
  if (values.includes(Cypress.env("C8YCTRL_MODE"))) {
    o.mode = "record";
  }

  if (options?.id == null && options?.title == null) {
    throw new Error("Either id or title must be provided to setCurrent.");
  }

  const id = pactId(o.id ?? o.title);
  let clear = false;
  if (
    o.clear === true ||
    o.recordingMode === "refresh" ||
    Cypress.c8yctrl.recordingMode() === "refresh"
  ) {
    clear = true;
  }

  const parameter = `?mode=${o.mode}&recordingMode=${o.recordingMode}${
    clear ? "&clear=true" : ""
  }`;

  return cy
    .task<C8yCtrlCurrentResponse | null>("c8ypact:fetch", {
      url: `${url()}/c8yctrl/current${parameter}&id=${id}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    })
    .then((response) => {
      if (response == null || response.ok === false || response.body == null) {
        _current = null;
        return null;
      }
      const pact = C8yDefaultPact.from(response.body);
      _current = pact;
      return response;
    });
}

function resetCurrent() {
  return cy
    .task<C8yCtrlCurrentResponse | null>("c8ypact:fetch", {
      url: `${url()}/c8yctrl/current`,
      method: "DELETE",
    })
    .then((response) => {
      _current = null;
      return cy.wrap(response);
    });
}

function url() {
  const u = Cypress.env("C8YCTRL_URL");
  if (u != null && isAbsoluteURL(u)) {
    return normalizeUrl(u);
  }
  return Cypress.config().baseUrl;
}
