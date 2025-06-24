import { FetchClient } from "@c8y/client";
import { C8yPact } from "../../shared/c8ypact";
import { C8yAuthOptions } from "../../shared/auth";
import { getC8yClientAuthentication } from "../utils";
import { C8yClient } from "../../shared/c8yclient";
import { C8yBaseUrl } from "../../shared/types";
import { C8yCtrlCurrentResponse } from "../pact/cypressctrl";
declare global {
  interface ChainableWithState {
    state(state: "window"): Cypress.AUTWindow;
    state(state: "c8yclient"): C8yClient | undefined;
    state(state: "c8yclient", value: C8yClient | undefined): void;
  }

  namespace Cypress {
    interface Cypress {
      errorMessages: any;
    }
    interface LogConfig {
      renderProps(): ObjectLike;
    }
  }
}

if (!Cypress.c8ypact) {
  Cypress.c8ypact = {
    mode: () => "disabled",
    recordingMode: () => "refresh",
    current: null,
    getCurrentTestId: () => "-",
    isRecordingEnabled: () => false,
    isMockingEnabled: () => false,
    savePact: () => new Promise((resolve) => resolve()),
    isEnabled: () => false,
    matcher: undefined,
    pactRunner: undefined,
    schemaMatcher: undefined,
    debugLog: false,
    preprocessor: undefined,
    config: {},
    getConfigValue: (key, defaultValue) => defaultValue,
    getConfigValues: () => ({}),
    loadCurrent: () => cy.wrap<C8yPact | null>(null, { log: false }),
    env: () => ({}),
    on: {},
    createFetchClient: (auth: C8yAuthOptions, baseUrl: C8yBaseUrl) =>
      new FetchClient(getC8yClientAuthentication(auth), baseUrl),
  };
}

if (!Cypress.c8yctrl) {
  Cypress.c8yctrl = {
    mode: () => "disabled",
    recordingMode: () => "append",
    get current() {
      return null;
    },
    isEnabled: () => false,
    isRecordingEnabled: () => false,
    isMockingEnabled: () => false,
    setCurrent: () => cy.wrap<C8yCtrlCurrentResponse | null>(null),
    resetCurrent: () => cy.wrap<C8yCtrlCurrentResponse | null>(null),
    url: () => null,
    debugLog: false,
  };
}
