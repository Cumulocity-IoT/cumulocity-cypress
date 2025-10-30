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
    }
  }
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
        // in case of e.g. a 404 on the public options, do not try to modify the body
        if (res.statusCode == 200 && typeof res.body === "object") {
          res.body.cookieBanner = undefined;
        }
        res.send();
      });
    }
  );
});
