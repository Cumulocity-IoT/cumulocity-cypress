import {
  getMinimizedVersionString,
  getMinSatisfyingVersion,
} from "../../shared/versioning";
import {
  C8yPactID,
  C8yPactMode,
  C8yPactRecordingMode,
  C8yPactRecordingModeValues,
  pactId,
} from "../../shared/c8ypact";
import { getShellVersionFromEnv, getSystemVersionFromEnv } from "../utils";

const { _ } = Cypress;

/**
 * Determines the pact mode based on the provided environment variable.
 * @param envVar The environment variable to check for the mode.
 */
export function mode(
  envVar: string,
  defaultValue: string = "disabled"
): C8yPactMode {
  let mode = Cypress.env(envVar) || defaultValue;
  if (!_.isString(mode) || _.isEmpty(mode)) {
    mode = defaultValue;
  }
  return mode.toLowerCase() as C8yPactMode;
}

/**
 * Determines the recording mode based on the provided environment variable.
 * @param envVar The environment variable to check for the recording mode.
 */
export function recordingMode(envVar: string): C8yPactRecordingMode {
  const mode: string =
    Cypress.env(envVar) ||
    Cypress.config().c8ypact?.recordingMode ||
    C8yPactRecordingModeValues[0];

  if (!mode || !_.isString(mode)) {
    return C8yPactRecordingModeValues[0];
  }

  return mode.toLowerCase() as C8yPactRecordingMode;
}

/**
 * Checks if the pact functionality is enabled based on the provided environment variable.
 * @param envVar The environment variable to check for enabling the pact.
 */
export function isEnabled(envVar: string): boolean {
  if (Cypress.env("C8Y_PLUGIN_LOADED") == null) return false;
  if (mode(envVar) === "disabled") return false;

  if (Cypress.config().c8ypact?.ignore === true) {
    return false;
  } else {
    if (Cypress.c8ypact.getConfigValue("ignore") === true) {
      return false;
    }
  }
  return true;
}

export function getCurrentTestId(): C8yPactID {
  let result: string[] | undefined = undefined;
  const pact = Cypress.config().c8ypact;
  if (pact?.id != null && pactId(pact.id) != null) {
    result = [pact.id];
  }

  if (result == null) {
    result = Cypress.currentTest?.titlePath;
    if (result == null) {
      result = Cypress.spec?.relative?.split("/").slice(-2);
    }
  }

  const requires = Cypress.config().requires;
  const requiredVersion = _.isArrayLike(requires)
    ? requires
    : requires?.shell || requires?.system;

  // for now prefer shell version over system version
  const version =
    _.isArrayLike(requires) || requires?.shell == null
      ? getSystemVersionFromEnv()
      : getShellVersionFromEnv();

  if (version != null && result != null && requiredVersion != null) {
    const minVersion = getMinSatisfyingVersion(version, requiredVersion);
    if (minVersion != null) {
      const mv = getMinimizedVersionString(minVersion);
      if (mv != null && mv !== "0") {
        result.unshift(mv);
      }
    }
  }

  if (result != null) {
    const pId = pactId(result);
    if (pId != null) {
      return pId;
    }
  }

  const error = new Error("Failed to get or create pact id for current test.");
  error.name = "C8yPactError";
  throw error;
}

export function getSuiteTitles(suite: any): string[] {
  if (suite.parent && !_.isEmpty(suite.parent.title)) {
    return [...getSuiteTitles(suite.parent), suite.title];
  }
  return [suite.title];
}
