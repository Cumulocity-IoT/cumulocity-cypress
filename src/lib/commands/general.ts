const { _ } = Cypress;

export {};

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
       * @param {C8yVisitOptions} options - Configuration options
       * @param {C8yLanguage} options.language - The language to set. Defaults to 'en'
       * @param {string} options.selector - The selector to wait to become visible
       * @param {number} options.timeout - The timeout in milliseconds
       * @param {string} options.shell - The shell application to target (overrides C8Y_SHELL_TARGET env)
       * @param {string} options.remotes - Comma-separated list of remote plugins to load (overrides C8Y_SHELL_EXTENSION env)
       */
      visitAndWaitForSelector(
        url: string,
        options: C8yVisitOptions
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

export type C8yRemotesObject = {
  [pluginName: string]: string[];
}

/**
 * Options for `visitAndWaitForSelector` command.
 */
export type C8yVisitOptions = {
  language?: C8yLanguage;
  selector?: string;
  timeout?: number;
  shell?: string;
  remotes?: string | C8yRemotesObject;
};

/**
 * Default selector to wait for when visiting a page. This selector works for different
 * Cumulocity versions.
 */
export const C8yVisitDefaultWaitSelector =
  "c8y-drawer-outlet c8y-app-icon .c8y-icon, c8y-navigator-outlet c8y-app-icon";

Cypress.Commands.add(
  "visitAndWaitForSelector",
  (
    url: string,
    languageOrOptions?: C8yLanguage | C8yVisitOptions,
    selectorValue?: string,
    timeoutValue?: number
  ) => {
    const DEFAULT_LANGUAGE: C8yLanguage = "en";
    const DEFAULT_TIMEOUT = Cypress.config().pageLoadTimeout || 60000;

    const isOptionsObject = (value: unknown): value is C8yVisitOptions => {
      return typeof value === "object" && value != null;
    };

    const options = isOptionsObject(languageOrOptions)
      ? languageOrOptions
      : {
          language: languageOrOptions,
          selector: selectorValue,
          timeout: timeoutValue,
        };

    const language = options.language ?? DEFAULT_LANGUAGE;
    const selector = options.selector ?? C8yVisitDefaultWaitSelector;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    
    let remotes = options.remotes ?? Cypress.env("C8Y_SHELL_EXTENSION");
    if (remotes && typeof remotes === "object") {
      remotes = JSON.stringify(remotes);
    }
    const shell =
      options.shell ??
      Cypress.env("C8Y_SHELL_TARGET") ??
      Cypress.env("C8Y_SHELL_NAME");

    // Build the final URL with shell target if provided
    if (shell) {
      url = `/apps/${shell}/index.html#/${url}`;
    }

    // Log command execution details
    const consoleProps = {
      url,
      language,
      selector,
      timeout,
      shell,
      remotes,
    };
    Cypress.log({
      name: "visitAndWaitForSelector",
      message: url + (remotes ? ` ${remotes}` : ""),
      consoleProps: () => consoleProps,
    });

    cy.setLanguage(language);

    cy.visit(url, remotes ? { qs: { remotes } } : undefined);

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
