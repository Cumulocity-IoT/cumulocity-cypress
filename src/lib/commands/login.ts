import { sanitizeStringifiedObject } from "cumulocity-cypress/shared/util";
import { C8yTenant } from "../../shared/types";
import { getAuthOptions, resetClient } from "../utils";
import { C8yAuthOptions, isAuthOptions } from "./auth";

const { _ } = Cypress;
import { gte } from "semver";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Login to Cumulocity.
       *
       * Uses env variables `C8Y_USERNAME` and `C8Y_PASSWORD` if no arguments or no
       * auth options are passed. The logged in user will be stored in `C8Y_LOGGED_IN_USER`.
       *
       * Default values for login options:
       * ```
       * {
       *   disableGainsight: true,
       *   hideCookieBanner: true,
       *   useSession: true, // for Cypress 11+
       *   validationFn: () => {
       *     cy.getCookie('XSRF-TOKEN').should('exist');
       *     cy.getCookie('authorization').should('exist');
       *   }
       * }
       * ```
       *
       * @param {string} user - the user to login to Cumulocity
       * @param {string} password - the password to login to Cumulocity
       * @param {C8yLoginOptions} options - login options to use for login to Cumulocity
       */
      login(options?: C8yLoginOptions): Chainable<void>;
      login(user: string, options?: C8yLoginOptions): Chainable<void>;
      login(
        user: string,
        password: string,
        options?: C8yLoginOptions
      ): Chainable<void>;
      login(auth: C8yAuthOptions, options?: C8yLoginOptions): Chainable<void>;
    }
  }

  type C8yLoginOptions = {
    useSession?: boolean;
    disableGainsight?: boolean;
    hideCookieBanner?: boolean;
    validationFn?: () => boolean;
  };

  type C8yLoginAuthArgs =
    | [options?: C8yLoginOptions]
    | [user: string, options?: C8yLoginOptions]
    | [user: string, password: string, options?: C8yLoginOptions]
    | [authOptions: C8yAuthOptions, options?: C8yLoginOptions];
}

export const defaultLoginOptions = () => {
  return {
    disableGainsight: Cypress.env("C8Y_DISABLE_GAINSIGHT") ?? true,
    hideCookieBanner: Cypress.env("C8Y_HIDE_COOKIEBANNER") ?? true,
    useSession: gte(Cypress.version, "12.0.0"),

    validationFn: () => {
      cy.getCookie("XSRF-TOKEN").should("exist");
      cy.getCookie("authorization").should("exist");
    },
  } as C8yLoginOptions;
};

Cypress.Commands.add("login", { prevSubject: "optional" }, (...args) => {
  const auth = getAuthOptions(...args);
  const consoleProps: any = {
    auth: auth || null,
    arguments: args || null,
  };
  const logger = Cypress.log({
    autoEnd: false,
    name: "login",
    message: sanitizeStringifiedObject(JSON.stringify(auth)),
    consoleProps: () => consoleProps,
  });
  if (!auth) {
    logger.end();
    throw new Error(
      "Missing authentication. cy.login() requires authentication. Pass auth using cy.getAuth().login() " +
        "or cy.useAuth() and make sure a valid auth object was created from environment or arguments."
    );
  }

  (Cypress.isCy(auth) ? auth : cy.wrap(auth, { log: false })).then(
    (auth: C8yAuthOptions) => {
      let options: C8yLoginOptions = {};
      const lastArg: any = args.pop();
      if (isAuthOptions(lastArg) || !_.isObjectLike(lastArg)) {
        options = defaultLoginOptions();
      } else {
        options = _.defaults(lastArg, defaultLoginOptions());
      }

      consoleProps.auth = auth || null;
      consoleProps.options = options || null;

      const loginRequest = (tenant: C8yTenant) => {
        // cookie banner adds interception, set before login
        if (options.hideCookieBanner === true) {
          cy.hideCookieBanner();
        }
        const tenant_id = tenant ? `?tenant_id=${tenant}` : "";
        return cy
          .request({
            method: "POST",
            // tenant_id is optional, if not provided, it will use the tenant from auth object or hostname
            url: `/tenant/oauth${tenant_id}`,
            body: {
              grant_type: "PASSWORD",
              username: auth?.user,
              password: auth?.password,
              tfa_code: auth?.tfa,
            },
            form: true,
          })
          .then((resp) => {
            expect(resp).to.have.property("headers");
            if (options.disableGainsight === true) {
              cy.disableGainsight();
            }
          });
      };

      const tenant: C8yTenant = auth?.tenant || Cypress.env("C8Y_TENANT");
      consoleProps.tenant = tenant || null;

      if (auth?.token != null && auth.xsrfToken != null) {
        const cookieOptions = {
          domain: undefined,
          httpOnly: false,
          secure: false,
          path: "/",
        };

        cy.setCookie("authorization", auth.token, cookieOptions);
        cy.setCookie("XSRF-TOKEN", auth.xsrfToken, cookieOptions);
        Cypress.env("C8Y_LOGGED_IN_USER", auth.user);
        Cypress.env("C8Y_TENANT", auth.tenant);
      } else if (options.useSession === true) {
        cy.session(
          auth?.user || auth,
          () => {
            loginRequest(tenant);
          },
          {
            validate() {
              if (_.isFunction(options.validationFn)) {
                options?.validationFn();
              }
              Cypress.env("C8Y_LOGGED_IN_USER", auth.user);
              Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", auth.userAlias);
            },
            cacheAcrossSpecs: true,
          }
        );
      } else {
        loginRequest(tenant).then(() => {
          if (_.isFunction(options.validationFn)) {
            options.validationFn();
          }
          Cypress.env("C8Y_LOGGED_IN_USER", auth.user);
          Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", auth.userAlias);
        });
      }

      resetClient();
    }
  );

  cy.then(() => {
    logger.end();
  });
});
