import {
  C8yAuthOptions,
  C8yPactAuthObject,
  isAuthOptions,
  isPactAuthObject,
  toPactAuthObject,
} from "../auth";
import { C8yClient, C8yClientOptions } from "../c8yclient";
import {
  C8yPactRecord,
  C8yPactRequest,
  C8yPactResponse,
  toPactRequest,
  toPactResponse,
} from "./c8ypact";

import _ from "lodash";

/**
 * Default implementation of C8yPactRecord. Use C8yDefaultPactRecord.from to create
 * a C8yPactRecord from a Cypress.Response object or an C8yPactRecord object.
 */
export class C8yDefaultPactRecord implements C8yPactRecord {
  request: C8yPactRequest;
  response: C8yPactResponse<any>;
  options?: C8yClientOptions;
  auth?: C8yPactAuthObject;
  createdObject?: string;
  modifiedResponse?: C8yPactResponse<any>;

  constructor(
    request: C8yPactRequest,
    response: C8yPactResponse<any>,
    options?: C8yClientOptions,
    auth?: C8yPactAuthObject,
    createdObject?: string,
    modifiedResponse?: C8yPactResponse<any>
  ) {
    this.request = request;
    this.response = response;

    if (options) this.options = options;
    if (auth) this.auth = auth;
    if (createdObject) this.createdObject = createdObject;
    if (modifiedResponse) this.modifiedResponse = modifiedResponse;

    if (request?.method?.toLowerCase() === "post") {
      const newId = response.body?.id;
      if (newId) {
        this.createdObject = newId;
      }
    }
  }

  /**
   * Creates a C8yPactRecord from a Cypress.Response or an C8yPactRecord object.
   * @param obj The Cypress.Response<any> or C8yPactRecord object.
   * @param client The C8yClient for options and auth information.
   */
  static from(
    obj: Cypress.Response<any> | C8yPactRecord | Partial<Cypress.Response<any>>,
    auth?: C8yAuthOptions,
    client?: C8yClient
  ): C8yPactRecord {
    // if (obj == null) return obj;
    if ("request" in obj && "response" in obj) {
      return new C8yDefaultPactRecord(
        _.get(obj, "request"),
        _.get(obj, "response"),
        _.get(obj, "options") || {},
        _.get(obj, "auth"),
        _.get(obj, "createdObject"),
        _.get(obj, "modifiedResponse")
      );
    }

    const r = _.cloneDeep(obj);
    return new C8yDefaultPactRecord(
      toPactRequest(r) || {},
      toPactResponse(r) || {},
      client?._options,
      isAuthOptions(auth) || isPactAuthObject(auth)
        ? toPactAuthObject(auth)
        : client?._auth
        ? toPactAuthObject(client?._auth)
        : undefined
    );
  }

  /**
   * Returns the date of the response.
   */
  date(): Date | null {
    const date = _.get(this.response, "headers.date");
    if ((date && _.isString(date)) || _.isNumber(date) || _.isDate(date)) {
      return new Date(date);
    }
    return null;
  }

  /**
   * Converts the C8yPactRecord to a Cypress.Response object.
   */
  toCypressResponse<T>(): Cypress.Response<T> {
    const result = _.cloneDeep(this.response);
    _.extend(result, {
      ...(result.status && {
        isOkStatusCode: result.status > 199 && result.status < 300,
      }),
      ...(this.request.headers && {
        requestHeaders: Object.fromEntries(
          Object.entries(this.request.headers || [])
        ),
      }),
      ...(this.request.url && { url: this.request.url }),
      ...(result.allRequestResponses && { allRequestResponses: [] }),
      ...(this.request.body && { requestBody: this.request.body }),
      method: this.request.method || this.response.method || "GET",
    });
    return result as Cypress.Response<T>;
  }
}

export function createPactRecord(
  response: Partial<Cypress.Response<any>>,
  client?: C8yClient,
  options: {
    loggedInUser?: string;
    loggedInUserAlias?: string;
    authType?: string;
  } = {}
): C8yPactRecord {
  let auth: C8yAuthOptions | undefined = undefined;
  const envUser = options.loggedInUser;
  const envAlias = options.loggedInUserAlias;
  const envType = options.authType;
  const envAuth = {
    ...(envUser && { user: envUser }),
    ...(envAlias && { userAlias: envAlias }),
    ...(envAlias && { type: envType ?? "CookieAuth" }),
  };

  if (client?._auth) {
    // do not pick the password. passwords must not be stored in the pact.
    auth = _.defaultsDeep(client._auth, envAuth);
    if (client._auth.constructor != null) {
      if (!auth) {
        auth = { type: client._auth.constructor.name };
      } else {
        auth.type = client._auth.constructor.name;
      }
    }
  }
  if (!auth && (envUser || envAlias)) {
    auth = envAuth;
  }

  // only store properties that need to be exposed. do not store password.
  auth = auth ? toPactAuthObject(auth) : auth;
  return C8yDefaultPactRecord.from(response, auth, client);
}
