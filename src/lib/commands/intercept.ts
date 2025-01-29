import { C8yPactRecord } from "../../shared/c8ypact";
import {
  HTTP_METHODS,
  STATIC_RESPONSE_KEYS,
  STATIC_RESPONSE_WITH_OPTIONS_KEYS,
} from "../pact/constants";
import { getBaseUrlFromEnv } from "../utils";
import { isAbsoluteURL } from "cumulocity-cypress/shared/c8ypact/url";

const { _ } = Cypress;

declare global {
  namespace Cypress {
    interface Actions {
      (action: "log:intercept", fn: (options: any) => void): Cypress;
    }
  }
}

// see documentation fo cy.intercept at https://docs.cypress.io/api/commands/intercept
Cypress.Commands.overwrite("intercept", (originalFn, ...args) => {
  // if c8ypact is not enabled, return original function without any changes or wrapping
  // make sure we do not break things if c8ypact is not enabled
  if (!Cypress.c8ypact?.isEnabled() || !args || _.isEmpty(args)) {
    return originalFn(...args);
  }

  const method =
    _.isString(args[0]) && HTTP_METHODS.includes(args[0].toUpperCase())
      ? args[0]
      : undefined;

  let matcher = method ? args[1] : args[0];
  // component testing does not know about a baseUrl so relative paths will be matched
  // with url of cypress runner
  if (Cypress.testingType === "component") {
    const baseUrl = getBaseUrlFromEnv();
    if (_.isString(matcher) && !isAbsoluteURL(matcher) && baseUrl) {
      matcher = {
        hostname: baseUrl.replace(/^https?:\/\//i, ""),
        path: matcher,
      };
    }
  }

  let response = method ? args[2] : args[1];

  const updatedArgs: any[] = [];
  if (method) {
    updatedArgs.push(method);
  }
  if (matcher) {
    updatedArgs.push(matcher);
  }
  if (response) {
    try {
      if (typeof response === "function") {
        response = wrapFunctionRouteHandler(response);
      } else {
        response = wrapStaticResponse(response);
      }
    } catch (error) {
      console.log(`Failed to intercept response: ${error}`);
    }
    updatedArgs.push(response);
  } else {
    response = wrapEmptyRouteHandler();
    updatedArgs.push(response);
  }

  // @ts-expect-error
  return originalFn(...updatedArgs);
});

Cypress.env("C8Y_PACT_INTERCEPT_IMPORTED", true);

Cypress.on("log:intercept", (options) => {
  if (!Cypress.c8ypact.isRecordingEnabled()) return;
  const { req, res, modified } = options;

  const cypressResponse = responseFrom(req, res);
  const modifiedResponse =
    modified != null ? responseFrom(req, modified) : undefined;

  Cypress.c8ypact.savePact(
    cypressResponse,
    {},
    { noqueue: true, ...(modifiedResponse && { modifiedResponse }) }
  );
});

function responseFrom(req: any, res: any): Cypress.Response<any> {
  const isBody = res != null && !("body" in res);
  const statusCode = isBody ? 200 : res?.statusCode;
  const result: Cypress.Response<any> = {
    body: isBody ? res : res?.body,
    url: req?.url,
    headers: isBody ? {} : res?.headers,
    status: statusCode,
    duration: res?.duration,
    requestHeaders: req?.headers,
    requestBody: req?.body,
    statusText: isBody ? "OK" : res?.statusMessage,
    method: req?.method || "GET",
    allRequestResponses: [],
    isOkStatusCode: statusCode >= 200 && statusCode < 300,
  };
  // required to fix inconsistencies between c8yclient and interceptions
  // using lowercase and uppercase. fix here.
  if (result.requestHeaders?.["x-xsrf-token"]) {
    result.requestHeaders["X-XSRF-TOKEN"] =
      result.requestHeaders["x-xsrf-token"];
    delete result.requestHeaders["x-xsrf-token"];
  }
  if (result.requestHeaders?.["authentication"]) {
    result.requestHeaders["Authorization"] =
      result.requestHeaders["authentication"];
    delete result.requestHeaders["authentication"];
  }
  return result;
}

function emitInterceptionEvent(req: any, res: any, modified: any = undefined) {
  Cypress.emit("log:intercept", {
    req,
    res,
    modified,
  });
}

const wrapFunctionRouteHandler = (fn: any) => {
  return function (req: any) {
    // see Cypress before-request.ts for implementation details of overwritten functions

    // wrap continue() function
    const reqContinue = req.continue;
    req.continue = (resFn: any) => {
      let unmodifiedRes: any;

      if (Cypress.c8ypact.isRecordingEnabled()) {
        req.on("before:response", (res: any) => {
          unmodifiedRes = _.cloneDeep(res);
        });

        req.on("after:response", (res: any) => {
          emitInterceptionEvent(req, unmodifiedRes, res);
        });
      }

      if (
        Cypress.c8ypact.current == null ||
        !Cypress.c8ypact.isMockingEnabled()
      ) {
        reqContinue(resFn);
      } else {
        let [record, response] = responseFromPact({}, req);
        if (_.isFunction(Cypress.c8ypact.on?.mockRecord)) {
          record = Cypress.c8ypact.on.mockRecord(record || undefined);
          if (record) {
            response = {
              body: record.response.body,
              headers: record.response.headers,
              statusCode: record.response.status,
            };
          } else {
            reqContinue(resFn);
            return;
          }
        }

        if (resFn) {
          response.send = () => {};
          resFn(response);
        }
        req.reply(response);
      }
    };

    // wrap reply() function
    const reqReply = req.reply;
    req.reply = (...args: any[]) => {
      if (!args || _.isEmpty(args)) {
        reqReply(...args);
        return;
      } else {
        const replyOptions: any = {};
        if (_.isFunction(args[0])) {
          // route handler - not supported as it seems only supported for compatibility
          // with old implementation of continue() based on reply()
          reqReply(...args);
        } else if (
          (_.isString(args[0]) || !hasStaticResponseKeys(args[0])) &&
          args.length <= 2
        ) {
          replyOptions.body = args[0];
          if (args.length > 1) {
            replyOptions.headers = args[1];
          }
        } else if (_.isObjectLike(args[0])) {
          if (!hasStaticResponseWithOptionsKeys(args[0])) {
            replyOptions.body = args[0];
          } else {
            _.extend(replyOptions, args[0]);
          }
        } else if (_.isNumber(args[0])) {
          replyOptions.statusCode = args[0];
          if (args.length > 1 && !_.isUndefined(args[1])) {
            replyOptions.body = args[1];
          }
          if (args.length > 2 && !_.isUndefined(args[1])) {
            replyOptions.headers = args[2];
          }
        }

        processReply(req, replyOptions, reqReply, reqContinue);
      }
    };

    fn(req);
  };
};

const wrapStaticResponse = (obj: any) => {
  return function (req: any) {
    processReply(req, obj, req.reply, req.continue);
  };
};

const wrapEmptyRouteHandler = () => {
  return function (req: any) {
    let strictMock = true;
    if (Cypress.c8ypact.isMockingEnabled() && Cypress.c8ypact.current == null) {
      failForStrictMocking();
      // if we get here, strictMocking is disabled as failForStrictMocking() did not throw an error
      strictMock = false;
    }

    if (!Cypress.c8ypact.isMockingEnabled() || !strictMock) {
      req.continue((res: any) => {
        emitInterceptionEvent(req, _.cloneDeep(res));
        res.send();
      });
    } else {
      let [record, response] = responseFromPact({}, req);
      if (_.isFunction(Cypress.c8ypact.on?.mockRecord)) {
        record = Cypress.c8ypact.on.mockRecord(record || undefined);
        if (record) {
          response = {
            body: record.response.body,
            headers: record.response.headers,
            statusCode: record.response.status,
          };
        } else {
          response = undefined;
        }
      }
      if (!response) {
        req.continue((res: any) => {
          res.send();
        });
      } else {
        // GenericStaticResponse
        req.reply(response);
      }
    }
  };
};

function processReply(req: any, obj: any, replyFn: any, continueFn: any) {
  if (Cypress.c8ypact.isRecordingEnabled()) {
    const responsePromise = new Cypress.Promise((resolve) => {
      // "before:response" is the event to use as in "response" event the continue handler
      // seems to be called resulting in a timeout
      // https://docs.cypress.io/api/commands/intercept#Intercepted-responses
      req.on("before:response", async (res: any) => {
        let modifiedResponse = obj;
        if (_.isObjectLike(obj) && "fixture" in obj) {
          const [path, encoding] = obj.fixture.split(",");
          // @ts-expect-error
          modifiedResponse = await Cypress.backend("get:fixture", path, {
            encoding: encoding || "utf-8",
          });
        }
        emitInterceptionEvent(req, _.cloneDeep(res), modifiedResponse);

        // merge response with object done with res.send(obj)
        resolve();
      });
    });

    continueFn((res: any) => {
      // wait for the reponse to be updated in the before:response event
      return responsePromise.then(() => {
        // res.send(obj) should merge response with object automatically
        res.send(obj);
      });
    });
  } else {
    // respond to the request with object (static response)
    replyFn(obj);
    emitInterceptionEvent(req, obj);
  }
}

function responseFromPact(
  obj: any,
  req: any
): [C8yPactRecord | undefined | null, any] {
  const p = Cypress.c8ypact?.current;
  const record = p?.nextRecordMatchingRequest(req, getBaseUrlFromEnv());
  if (record) {
    const r = record.modifiedResponse || record.response;
    const response = {
      body: r.body,
      headers: r.headers,
      statusCode: r.status,
      statusMessage: r.statusText,
    };

    // obj could be a string
    if (_.isObjectLike(obj) && !_.isArrayLike(obj)) {
      _.extend(obj, response);
    } else if (_.isString(obj) || _.isArrayLike(obj)) {
      obj = response;
    }
  } else {
    failForStrictMocking();
  }
  return [record, obj];
}

function failForStrictMocking() {
  if (!Cypress.c8ypact.isMockingEnabled()) return;

  const strictMocking =
    Cypress.c8ypact?.getConfigValue("strictMocking", true) === true;
  if (strictMocking) {
    const error = new Error(
      "Mocking failed in intercept. No recording found for request. Do re-recording or disable Cypress.c8ypact.config.strictMocking."
    );
    error.name = "C8yPactError";
    throw error;
  }
}

function hasStaticResponseKeys(obj: any) {
  return (
    !_.isArray(obj) &&
    (_.intersection(_.keys(obj), STATIC_RESPONSE_KEYS).length || _.isEmpty(obj))
  );
}

function hasStaticResponseWithOptionsKeys(obj: any) {
  return (
    !_.isArray(obj) &&
    (_.intersection(_.keys(obj), STATIC_RESPONSE_WITH_OPTIONS_KEYS).length ||
      _.isEmpty(obj))
  );
}
