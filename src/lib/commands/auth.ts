import {
  getAuthOptions,
  resetClient,
  userAliasFromArgs,
  getAuthOptionsFromCypressEnv,
} from "../utils";
import {
  C8yAuthOptions,
  C8yAuthentication,
  isAuthOptions,
} from "../../shared/auth";

export {
  C8yAuthOptions,
  C8yAuthentication,
  isAuthOptions,
  getAuthOptionsFromCypressEnv,
  getAuthEnvVariables,
};

declare global {
  namespace Cypress {
    interface Chainable extends ChainableWithState {
      /**
       * Get `C8yAuthOptions` from arguments or environment variables. If no arguments are
       * provided, getAuth() will try to get the authentication from `C8Y_USERNAME` and
       * `C8Y_PASSWORD` environment variables.
       *
       * By providing a user alias, getAuth() will look for environment variables with the
       * following pattern: `${userAlias}_username` and `${userAlias}_password`. If there is
       * no such environment variable, an error will be thrown.
       *
       * @example
       * cy.getAuth("admin", "password").login();
       * cy.getAuth("admin").login();
       * cy.getAuth().login();
       */
      getAuth(): Chainable<C8yAuthOptions | undefined>;
      getAuth(user: string): Chainable<C8yAuthOptions | undefined>;
      getAuth(
        user: string,
        password: string
      ): Chainable<C8yAuthOptions | undefined>;
      getAuth(auth: C8yAuthOptions): Chainable<C8yAuthOptions | undefined>;

      /**
       * Use `C8yAuthOptions` for all commands of this library requiring authentication
       * within the current test context (it).
       *
       * @example
       * cy.useAuth("admin", "password");
       * cy.login();
       * cy.createUser(...);
       */
      useAuth(): Chainable<C8yAuthOptions | undefined>;
      useAuth(user: string): Chainable<C8yAuthOptions | undefined>;
      useAuth(
        user: string,
        password: string
      ): Chainable<C8yAuthOptions | undefined>;
      useAuth(auth: C8yAuthOptions): Chainable<C8yAuthOptions | undefined>;
    }

    interface SuiteConfigOverrides {
      auth?: C8yAuthConfig;
    }

    interface TestConfigOverrides {
      auth?: C8yAuthConfig;
    }

    interface RuntimeConfigOptions {
      auth?: C8yAuthConfig;
    }
  }

  type C8yAuthConfig = string | C8yAuthOptions;

  type C8yAuthArgs =
    | [user: string]
    | [user: string, password: string]
    | [authOptions: C8yAuthOptions];
}

const getAuthEnvVariables = () => {
  const env = Cypress.env();
  const filteredKeysAndValues: any = {};
  Object.keys(env).forEach((key) => {
    if (
      key.endsWith("_username") ||
      key.endsWith("_password") ||
      key === "C8Y_USERNAME" ||
      key === "C8Y_USER" ||
      key === "C8Y_PASSWORD" ||
      key === "C8Y_TOKEN" ||
      key === "C8Y_XSRF_TOKEN" ||
      key === "C8Y_AUTHORIZATION"
    ) {
      filteredKeysAndValues[key] = env[key];
    }
  });
  return filteredKeysAndValues;
};

Cypress.Commands.add("getAuth", { prevSubject: "optional" }, (...args) => {
  const auth = authFn("getAuth", args);
  return cy.wrap<C8yAuthOptions | undefined>(auth, { log: false });
});

Cypress.Commands.add("useAuth", { prevSubject: "optional" }, (...args) => {
  const auth = authFn("useAuth", args);
  if (auth != null) {
    const win: Cypress.AUTWindow = cy.state("window");
    win.localStorage.setItem("__auth", JSON.stringify(auth));
  }
  resetClient();

  return cy.wrap<C8yAuthOptions | undefined>(auth, { log: false });
});

function authFn(fnName: string, args: any[]) {
  const auth = getAuthOptions(...args);
  const userAlias = userAliasFromArgs(...args);

  const consoleProps: any = {
    getauthoptions: auth || null,
    arguments: args || null,
    env: getAuthEnvVariables() || null,
    userAlias: userAlias || null,
  };

  const logger = Cypress.log({
    name: fnName,
    message: `${auth?.userAlias ? auth.userAlias + " -> " : ""}${
      auth ? auth.user : ""
    }`,
    consoleProps: () => consoleProps,
    autoEnd: false,
  });

  if (auth == null && userAlias != null) {
    logger.end();
    throw new Error(
      `No authentication found for userAlias ${userAlias}. Configure authentication ` +
        `using ${userAlias}_username and ${userAlias}_password environment variables.`
    );
  }

  consoleProps.Yields = auth || null;
  logger.end();

  return auth;
}
