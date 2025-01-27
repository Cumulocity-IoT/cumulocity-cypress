import { FetchClient } from "@c8y/client";
import { C8yPact } from "../../shared/c8ypact";
import { C8yAuthOptions } from "../../shared/auth";
import { getC8yClientAuthentication } from "../utils";
import { C8yClient } from "../../shared/c8yclient";

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
    schemaGenerator: undefined,
    schemaMatcher: undefined,
    debugLog: false,
    preprocessor: undefined,
    config: {},
    getConfigValue: (key, defaultValue) => defaultValue,
    getConfigValues: () => ({}),
    loadCurrent: () => cy.wrap<C8yPact | null>(null, { log: false }),
    env: () => ({}),
    on: {},
    createFetchClient: (auth: C8yAuthOptions, baseUrl: string) =>
      new FetchClient(getC8yClientAuthentication(auth), baseUrl),
  };
}
