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
       * @example
       * cy.visitAndWaitToFinishLoading('/');
       * cy.visitAndWaitToFinishLoading('/', 'en', '[data-cy=myelement]');
       *
       * @param {string} url - the page to be visited
       * @param {string} selector - the selector to wait  to become visible. Defaults to `c8y-navigator-outlet c8y-app-icon`.
       * @param {number} timeout - the timeout in milliseconds to wait for the selector to become visible. Defaults to `60000`.
       */
      visitAndWaitForSelector(
        url: string,
        language?: C8yLanguage,
        selector?: string,
        timeout?: number
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
    url,
    language = "en",
    selector = "c8y-drawer-outlet c8y-app-icon .c8y-icon, c8y-navigator-outlet c8y-app-icon",
    timeout = Cypress.config().pageLoadTimeout || 60000
  ) => {
    const consoleProps = {
      url,
      language,
      selector,
      timeout,
    };
    Cypress.log({
      name: "visitAndWaitForSelector",
      message: url,
      consoleProps: () => consoleProps,
    });
    cy.setLanguage(language);
    cy.visit(url);
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
