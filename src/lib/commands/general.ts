const { _ } = Cypress;

export { };

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Sets the language in user preferences.
       *
       * @param {C8yLanguage} lang - the language to be enabled in user preferences
       */
      setLanguage(lang: C8yLanguage): Chainable<void>;

      /**
       * Visits a given page and waits for a selector to become visible.
       *
       * Supports two signatures:
       * 1. Positional parameters for simple cases
       * 2. Options object for advanced configuration with shell and remotes support
       *
       * @example
       * // Simple usage with defaults
       * cy.visitAndWaitForSelector('/apps/cockpit');
       * 
       * // With positional parameters
       * cy.visitAndWaitForSelector('/', 'en', '[data-cy=myelement]', 10000);
       *
       * // With options object
       * cy.visitAndWaitForSelector('/apps/cockpit', {
       *   language: 'en',
       *   selector: '#navigator',
       *   timeout: 30000,
       *   shell: 'cockpit',
       *   remotes: '{"my-plugin":["myPluginViewProviders"]}'
       * });
       *
       * @param {string} url - The page to be visited
       * @param {C8yLanguage} language - The language to set. Defaults to 'en'
       * @param {string} selector - The selector to wait to become visible. Defaults to `c8y-drawer-outlet c8y-app-icon .c8y-icon, c8y-navigator-outlet c8y-app-icon`
       * @param {number} timeout - The timeout in milliseconds to wait for the selector to become visible. Defaults to `pageLoadTimeout` or `60000`
       */
      visitAndWaitForSelector(
        url: string,
        language?: C8yLanguage,
        selector?: string,
        timeout?: number
      ): Chainable<void>;

      /**
       * Visits a given page and waits for a selector to become visible (options signature).
       *
       * @param {string} url - The page to be visited
       * @param {object} options - Configuration options
       * @param {C8yLanguage} options.language - The language to set. Defaults to 'en'
       * @param {string} options.selector - The selector to wait to become visible
       * @param {number} options.timeout - The timeout in milliseconds
       * @param {string} options.shell - The shell application to target (overrides C8Y_SHELL_TARGET env)
       * @param {string} options.remotes - Comma-separated list of remote plugins to load (overrides C8Y_SHELL_EXTENSION env)
       */
      visitAndWaitForSelector(
        url: string,
        options: {
          language?: C8yLanguage;
          selector?: string;
          timeout?: number;
          shell?: string;
          remotes?: string;
        }
      ): Chainable<void>;

      /**
       * Disables Gainsight by intercepting tenant options and configuring
       * `gainsightEnabled: false` for `customProperties`.
       *
       * ```
       * {
       *   customProperties: {
       *     ...
       *     gainsightEnabled: false,
       *   }
       * }
       * ```
       */
      disableGainsight(): Chainable<void>;
    }
  }

  export type C8yLanguage = "de" | "en";
}

Cypress.Commands.add(
  "visitAndWaitForSelector",
  (
    url: string,
    languageOrOptions?: C8yLanguage | {
      language?: C8yLanguage;
      selector?: string;
      timeout?: number;
      shell?: string;
      remotes?: string;
    },
    selectorValue?: string,
    timeoutValue?: number
  ) => {
    const DEFAULT_LANGUAGE: C8yLanguage = "en";
    const DEFAULT_SELECTOR = "c8y-drawer-outlet c8y-app-icon .c8y-icon, c8y-navigator-outlet c8y-app-icon";
    const DEFAULT_TIMEOUT = Cypress.config().pageLoadTimeout || 60000;

    const isOptionsObject = (
      value: unknown
    ): value is { language?: C8yLanguage; selector?: string; timeout?: number; shell?: string; remotes?: string } => {
      return typeof value === 'object' && value !== null;
    };

    let language: C8yLanguage;
    let selector: string;
    let timeout: number;
    let shell: string | undefined;
    let remotes: string | undefined;

    if (isOptionsObject(languageOrOptions)) {
      language = languageOrOptions.language ?? DEFAULT_LANGUAGE;
      selector = languageOrOptions.selector ?? DEFAULT_SELECTOR;
      timeout = languageOrOptions.timeout ?? DEFAULT_TIMEOUT;
      shell = languageOrOptions.shell;
      remotes = languageOrOptions.remotes;
    } else {
      language = languageOrOptions ?? DEFAULT_LANGUAGE;
      selector = selectorValue ?? DEFAULT_SELECTOR;
      timeout = timeoutValue ?? DEFAULT_TIMEOUT;
      shell = undefined;
      remotes = undefined;
    }

    // Build the final URL with shell target if provided
    const shellTarget = shell ?? Cypress.env('C8Y_SHELL_TARGET');
    if (shellTarget) {
      url = `/apps/${shellTarget}/index.html#/${url}`;
    }

    // Log command execution details
    const consoleProps = {
      url,
      language,
      selector,
      timeout,
      shell: shellTarget,
      remotes: remotes ?? Cypress.env('C8Y_SHELL_EXTENSION'),
    };
    Cypress.log({
      name: "visitAndWaitForSelector",
      message: url,
      consoleProps: () => consoleProps,
    });

    cy.setLanguage(language);

    const shellExtensions = remotes ?? Cypress.env('C8Y_SHELL_EXTENSION');
    if (shellExtensions) {
      cy.visit(url, { qs: { remotes: shellExtensions } });
    } else {
      cy.visit(url);
    }

    cy.get(selector, { timeout }).should("be.visible");
  }
);

Cypress.Commands.add("setLanguage", (lang: string) => {
  // in case only some of the entry points have been imported e.g. only `cumulocity-cypress/commands/general`, then `setLocale` might not be defined
  if (typeof globalThis.setLocale === "function") {
    globalThis.setLocale(lang);
  }

  Cypress.log({
    name: "setLanguage",
    message: lang,
  });
  cy.intercept(
    {
      method: "GET",
      url: "/inventory/managedObjects?fragmentType=language*",
    },
    (req) => {
      req.continue((res) => {
        const languageFragment = req.query.fragmentType.toString();
        if (res.body[languageFragment]) {
          res.body[languageFragment] = lang;
        } else if (
          res.body.managedObjects &&
          _.isArrayLike(res.body.managedObjects)
        ) {
          res.body.managedObjects.forEach((mo: any) => {
            if (mo[languageFragment]) {
              mo[languageFragment] = lang;
            }
          });
        }
        res.send();
      });
    }
  );

  window.localStorage.setItem("c8y_language", lang);
  Cypress.on("window:before:load", (window) => {
    window.localStorage.setItem("c8y_language", lang);
  });
});

Cypress.Commands.add("disableGainsight", () => {
  Cypress.log({
    name: "disableGainsight",
  });

  cy.intercept("/tenant/system/options/gainsight/api.key*", (req) => {
    req.reply({ statusCode: 404, body: {} });
    throw new Error(
      "Intercepted Gainsight API key call, but Gainsight should have been disabled. Failing..."
    );
  }).as("GainsightAPIKey");

  cy.intercept("/tenant/currentTenant*", (req) => {
    req.continue((res) => {
      const customProperties: any = res.body.customProperties || {};
      customProperties.gainsightEnabled = false;
      res.body.customProperties = customProperties;
      res.send();
    });
  });
});
