const { _ } = Cypress;

export {};

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Hides the Cumulocity cookie banner by accepting all cookies. See `acceptCookieBanner`.
       * @deprecated Use `acceptCookieBanner` instead.
       */
      hideCookieBanner(): Chainable<void>;

      /**
       * Accept the cookie banner with the provided configuration for current, functional and marketing cookies.
       * As the cookie banner requires the cookie set to match the current policy version, accepting the cookie
       * banner adds an interception for the public options to get the current policy version. Make sure to call
       * this command before visiting the page. `cy.login` will call this command automatically with the
       * default values. If the cookie banner has been accepted or hidden using `acceptCookieBanner` or `hideCookieBanner`,
       * you can reset it by calling `showCookieBanner`.
       *
       * To fully disable the cookie banner, you can use `cy.disableCookieBanner`. This will not set the required
       * cookies, but instead disable the cookie banner completely.
       */
      acceptCookieBanner(
        required: boolean,
        functional: boolean,
        marketing: boolean
      ): Chainable<void>;

      /**
       * Disables the cookie banner without setting any cookies. This will disable the cookie banner completely.
       * Use if you want to disable the cookie banner for all policy versions. See `acceptCookieBanner` for more
       * information.
       * @see acceptCookieBanner
       */
      disableCookieBanner(): Chainable<void>;

      /**
       * Ensure the cookie banner is shown on visit. If the cookie banner has been
       * accepted or hidden using `acceptCookieBanner` or `hideCookieBanner`, it will be reset.
       */
      showCookieBanner(): Chainable<void>;

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

Cypress.Commands.add("hideCookieBanner", () => {
  Cypress.log({
    name: "hideCookieBanner",
  });
  cy.acceptCookieBanner(true, true, true);
});

Cypress.Commands.add(
  "acceptCookieBanner",
  (required = true, functional = true, marketing = true) => {
    const COOKIE_NAME = "acceptCookieNotice";

    const consoleProps = {
      required,
      functional,
      marketing,
    };

    Cypress.log({
      name: "acceptCookieBanner",
      message: "",
      consoleProps: () => consoleProps,
    });

    const setLocalCookie = (c: { [key: string]: string | boolean }) => {
      const cookie = JSON.stringify(c);
      window.localStorage.removeItem("__ccHideCookieBanner");
      Cypress.on("window:before:load", (window) => {
        window.localStorage.setItem(COOKIE_NAME, cookie);
      });
      window.localStorage.setItem(COOKIE_NAME, cookie);
    };

    setLocalCookie({ required, functional, marketing });

    cy.intercept(
      {
        pathname: /\/apps\/public\/public-options(@app-[^/]+)?\/options.json/,
      },
      (request) => {
        request.on("before:response", (response) => {
          if (response.statusCode !== 200) {
            return;
          }
          if (window.localStorage.getItem("__ccHideCookieBanner") === "false") {
            return;
          }

          const policyVersion = response.body.cookieBanner?.policyVersion;
          const denyCookies: { [key: string]: string | boolean } = {
            required: !!required,
            functional: !!functional,
            marketing: !!marketing,
          };
          if (policyVersion != null) {
            denyCookies.policyVersion = policyVersion;
          }
          setLocalCookie(denyCookies);
        });
      }
    );
  }
);

Cypress.Commands.add("showCookieBanner", () => {
  Cypress.log({
    name: "showCookieBanner",
  });

  Cypress.on("window:before:load", (window) => {
    window.localStorage.removeItem("acceptCookieNotice");
  });
  window.localStorage.removeItem("acceptCookieNotice");
  window.localStorage.setItem("__ccHideCookieBanner", "false");
});

Cypress.Commands.add("disableCookieBanner", () => {
  Cypress.log({
    name: "disableCookieBanner",
    message: "",
  });

  cy.intercept(
    {
      pathname: /\/apps\/public\/public-options(@app-[^/]+)?\/options.json/,
    },
    (req) => {
      req.continue((res) => {
        res.body.cookieBanner = undefined;
        res.send();
      });
    }
  );
});

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
  globalThis.setLocale(lang);

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
