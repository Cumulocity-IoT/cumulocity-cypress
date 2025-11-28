import {
  isAbsoluteURL,
  urlForBaseUrl,
} from "cumulocity-cypress/shared/c8ypact/url";
import {
  getAuthOptions,
  getBaseUrlFromEnv,
  getXsrfToken,
  normalizedArgumentsWithAuth,
} from "../utils";
const { _ } = Cypress;

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Retry a request for a given number of max retries and delay. When test function
       * `testFn` returns `true` stop retrying and continue.
       *
       * Use `retries` to pass number of retries and `retryDelay` to pass delay in milliseconds.
       *
       * @example
       *  cy.retryRequest(
       *    {
       *      method: "GET",
       *      url: "/service/apama-oeeapp/mon/ping",
       *      retries: Cypress.env("livenessRetries") || 5,
       *      retryDelay: Cypress.env("livenessRetryTimeout") || 10000,
       *    },
       *    (response) => {
       *      return response.status === 200;
       *    }
       *  );
       */
      retryRequest<T = any>(
        options: C8yRequestOptions,
        testFn: (response: any) => boolean
      ): Chainable<Response<T>>;
    }
    interface Cypress {
      cy: {
        addCommand: (cmd: any) => void;
      };
    }

    interface RequestOptions {
      preferBasicAuth?: boolean;
    }
  }

  type RetryOptions = { retries: number; retryDelay: number };
  type C8yRequestOptions = Partial<Cypress.RequestOptions> & RetryOptions;
}

const methods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "COPY",
  "LOCK",
  "MKCOL",
  "MOVE",
  "PURGE",
  "PROPFIND",
  "PROPPATCH",
  "UNLOCK",
  "REPORT",
  "MKACTIVITY",
  "CHECKOUT",
  "MERGE",
  "M-SEARCH",
  "NOTIFY",
  "SUBSCRIBE",
  "UNSUBSCRIBE",
  "SEARCH",
  "CONNECT",
];

function retryRequest(...args: any[]) {
  const $args = normalizedArgumentsWithAuth(args);
  if (!$args || $args.length !== 3) {
    throw new Error(
      "Missing argument. Requiring authentication, request options and test function."
    );
  }

  // eslint-disable-next-line prefer-const -- auth is not reassigned
  let [auth, options, testFn] = $args;
  const orgOptions = _.cloneDeep(options);
  const retryOptions = _.pick(options, ["retryDelay", "retries"]);
  options = _.omit(options, ["retryDelay", "retries"]);
  testFn =
    testFn && _.isFunction(testFn)
      ? testFn
      : function () {
          return false;
        };

  const consoleProps = {
    auth: auth,
    retryOptions: retryOptions,
    requestOptions: options,
  };
  Cypress.log({
    name: "retryRequest",
    message: "",
    consoleProps: () => consoleProps,
  });

  const lastRetry = retryOptions.retries <= 0;
  const fixedOptions = lastRetry
    ? options
    : { ...options, failOnStatusCode: false };
  cy.getAuth(auth)
    .request(fixedOptions)
    .then((resp) => {
      if (testFn(resp) || lastRetry) return cy.wrap(resp);

      cy.wait(retryOptions.retryDelay).then(() => {
        return retryRequest(
          auth,
          { ...orgOptions, retries: retryOptions.retries - 1 },
          testFn
        );
      });
    });
}
Cypress.Commands.add("retryRequest", { prevSubject: "optional" }, retryRequest);

// we can not just simply overwrite cy.request and add authentication if needed as
// test code might use overwriting of requests. In this case our extension would be overwritten again.
// current solution uses a wrapper for the default request function that adds the authentication
// from environment.

const requestCommandWrapper = (
  wrappedFn: Cypress.CommandFnWithOriginalFn<any>
) => {
  return function (...args: any[]) {
    const options: Partial<Cypress.RequestOptions> = {};

    const originalFn = _.isFunction(args[0]) ? args[0] : undefined;
    const $args = originalFn ? args.slice(1) : args;

    if (_.isObjectLike($args[0])) {
      _.extend(options, $args[0]);
    } else if ($args.length === 1) {
      options.url = $args[0];
    } else if ($args.length === 2) {
      if (methods.includes($args[0].toUpperCase())) {
        options.method = $args[0];
        options.url = $args[1];
      } else {
        options.url = $args[0];
        options.body = $args[1];
      }
    } else if ($args.length === 3) {
      options.method = $args[0];
      options.url = $args[1];
      options.body = $args[2];
    }
    const auth = getAuthOptions(options.auth) ?? getAuthOptions.apply($args);
    const preferBasicAuth = options.preferBasicAuth ?? false;

    const xsrfToken = getXsrfToken();
    const jwtToken = auth?.token;

    if (preferBasicAuth && auth?.user != null && auth?.password != null) {
      options.auth = _.pick(options.auth ?? auth, "user", "password");
    } else if (xsrfToken && !(jwtToken && Cypress.testingType === "component")) {
      // prefer jwt token for component testing
      options.headers = _.extend(options.headers || {}, {
        "X-XSRF-TOKEN": xsrfToken,
      });
    } else if (jwtToken) {
      options.headers = _.extend(options.headers || {}, {
        Authorization: `Bearer ${jwtToken}`,
      });
    } else if (auth?.user != null && auth?.password != null) {
      options.auth = _.pick(options.auth ?? auth, "user", "password");
    }

    if (Cypress.testingType === "component" && options.url != null) {
      if (!isAbsoluteURL(options.url)) {
        const baseUrl = getBaseUrlFromEnv();
        if (baseUrl) {
          options.url = urlForBaseUrl(baseUrl, options.url);
        }
      }
    }

    const o = _.omit(options, ["preferBasicAuth"]);
    const wrappedArgs: any[] =
      originalFn && args?.length > 0 ? [args[0], o] : [o];

    // @ts-expect-error
    return wrappedFn(...wrappedArgs);
  };
};

const requestFn = _.get(Cypress.cy, "request");
if (requestFn) {
  Cypress.cy.addCommand({
    name: "request",
    fn: requestCommandWrapper(requestFn),
    type: "parent",
    prevSubject: null,
  });
}

const overwriteFn = Cypress.Commands.overwrite;
Cypress.Commands.overwrite = (
  name: keyof Cypress.Chainable<any>,
  fn: Cypress.CommandFnWithOriginalFn<any>
) => {
  if (name === "request") {
    overwriteFn(name, requestCommandWrapper(fn));
  } else {
    overwriteFn(name, fn);
  }
};
