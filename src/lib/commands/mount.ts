import { mount } from "cypress/angular";

import "./auth";
import "../../c8ypact";
import "./intercept";
import "./oauthlogin";

import { FetchClient } from "@c8y/client";
import { getAuthOptionsFromEnv, getBaseUrlFromEnv } from "../utils";
import { C8yAuthOptions } from "../../shared/auth";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Mount a Cumulocity Angular component. When mounting the component FetchClient
       * provider will be C8yPactFetchClient to enable recording and mocking of
       * requests and responses. Set base url with C8Y_BASEURL and pass authentication
       * via cy.getAuth() or cy.useAuth().
       */
      mount: typeof mount;
    }
  }
}

Cypress.Commands.add(
  "mount",
  // @ts-expect-error
  { prevSubject: "optional" },
  (subject: C8yAuthOptions, ...args) => {
    const [component, options = {}] = args;
    if (Cypress.c8ypact == null || Cypress.c8ypact.isEnabled() === false) {
      return mount(component, options);
    }

    const consoleProps: any = {};
    const logger = Cypress.log({
      autoEnd: false,
      name: "mount",
      // @ts-expect-error
      message: isClass(component) ? component.name : component,
      consoleProps: () => consoleProps,
    });

    let baseUrl = getBaseUrlFromEnv();
    if (!baseUrl && !Cypress.c8ypact.isRecordingEnabled()) {
      baseUrl = Cypress.c8ypact.current?.info.baseUrl;
    }

    const auth = subject || getAuthOptionsFromEnv();
    consoleProps.baseUrl = baseUrl;
    consoleProps.auth = auth || null;
    consoleProps.options = options;

    if (!baseUrl) {
      logger.end();
      const error = new Error(
        "No base URL configured. cy.mount requires a base url. For component testing use C8Y_BASEURL env variable."
      );
      error.name = "C8yPactError";
      throw error;
    }

    const registerFetchClient = (auth?: C8yAuthOptions) => {
      const fetchClient = Cypress.c8ypact.createFetchClient(
        auth,
        // might use window.location if baseUrl is relative (does not start with http)
        baseUrl || ""
      );
      if (!fetchClient) {
        return;
      }
      const providers = options.providers || [];
      if (!providers.some((provider) => provider.provide === FetchClient)) {
        providers.push({
          provide: FetchClient,
          useValue: fetchClient,
        });
        options.providers = providers;
        consoleProps.providers = providers;
      }
    };

    consoleProps.isRecordingEnabled = Cypress.c8ypact.isRecordingEnabled();
    const strictMocking =
      Cypress.c8ypact?.getConfigValue("strictMocking") === true;

    consoleProps.strictMocking = strictMocking;

    return (
      auth != null &&
      (Cypress.c8ypact.isRecordingEnabled() || strictMocking === false)
        ? cy.oauthLogin(auth)
        : cy.wrap<C8yAuthOptions | undefined>(auth)
    ).then((a) => {
      registerFetchClient(a);
      logger.end();

      return mount(component, options);
    });
  }
);

function isClass(component: any) {
  return (
    component &&
    typeof component === "function" &&
    !!component.prototype &&
    component.constructor != null
  );
}
