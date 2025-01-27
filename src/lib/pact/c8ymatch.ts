import {
  C8yDefaultPactRecord,
  C8yPactInfo,
  C8yPactRecord,
  C8yPactMatcher,
  C8ySchemaMatcher,
  isPactError,
} from "../../shared/c8ypact";
import { C8yClientOptions, isCypressError } from "../../shared/c8yclient";
import { throwError } from "../utils";
import { C8yAjvSchemaMatcher } from "../../contrib/ajv";

const { _ } = Cypress;

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Compares a given Cypress.Response object with a C8yPactRecord contract or a json schema.
       * match ing fails, an C8yPactError is thrown.
       *
       * @param response - A Cypress.Response object representing the HTTP response.
       * @param record - A C8yPactRecord object representing the contract.
       * @param info - An optional C8yPactInfo object that may contain additional information for processing the contract.
       * @param options - An optional C8yClientOptions object that may contain various options for the behavior of the c8ymatch function.
       */
      c8ymatch(
        response: Cypress.Response<any>,
        record: Partial<C8yPactRecord>,
        info?: Partial<C8yPactInfo>,
        options?: C8yClientOptions
      ): Cypress.Chainable<void>;
      c8ymatch(
        response: Cypress.Response<any>,
        schema: any
      ): Cypress.Chainable<void>;
    }
  }
}

type Matcher = C8yPactMatcher | C8ySchemaMatcher | undefined;

Cypress.Commands.add("c8ymatch", (response, pact, info = {}, options = {}) => {
  let matcher: Matcher = Cypress.c8ypact.matcher;
  if (!matcher && Cypress.c8ypact?.isEnabled() === true) return;

  const consoleProps: any = {
    response: response || null,
    matcher: matcher || null,
    options,
    info,
  };
  const logger = Cypress.log({
    autoEnd: false,
    name: "c8ymatch",
    consoleProps: () => consoleProps,
    message: matcher?.constructor.name || "-",
  });

  if (!pact || !_.isObjectLike(pact)) {
    logger.end();
    throwError(
      `Matching requires object or schema to match. Received: ${pact}`
    );
  }

  const isSchemaMatching = !("request" in pact) && !("response" in pact);
  if (isSchemaMatching) {
    matcher =
      options.schemaMatcher ||
      Cypress.c8ypact?.schemaMatcher ||
      new C8yAjvSchemaMatcher();
    options.failOnPactValidation = true;
  }
  consoleProps.isSchemaMatching = isSchemaMatching;
  consoleProps.matcher = matcher;

  if (matcher == null) {
    logger.end();
    return;
  }

  try {
    let strictMatching: boolean =
      Cypress.c8ypact?.getConfigValue("strictMatching") === true;
    if (options.strictMatching != null) {
      strictMatching = options.strictMatching;
    }

    if (isSchemaMatching) {
      const schema = pact;
      _.extend(consoleProps, { response }, { schema });
      matcher.match(response.body, schema, strictMatching);
    } else {
      const matchingProperties = ["request", "response"];
      const pactToMatch = _.pick(pact, matchingProperties);
      const responseAsRecord = _.pick(
        C8yDefaultPactRecord.from(response),
        matchingProperties
      );

      Cypress.c8ypact.preprocessor?.apply(responseAsRecord, info.preprocessor);
      _.extend(
        consoleProps,
        { responseAsRecord },
        { response },
        { pact: pactToMatch }
      );
      (matcher as C8yPactMatcher).match(responseAsRecord, pactToMatch, {
        strictMatching,
        loggerProps: consoleProps,
        schemaMatcher: Cypress.c8ypact.schemaMatcher,
      });
    }
  } catch (error: any) {
    if (_.isFunction(Cypress.c8ypact.on?.matchingError)) {
      Cypress.c8ypact.on.matchingError(matcher, error, options);
    } else if (options.failOnPactValidation === true) {
      if (isCypressError(error) || isPactError(error)) {
        throw error;
      } else {
        throwError(`Matching schema failed. Error: ${error}`);
      }
    }
  } finally {
    logger.end();
  }
});
