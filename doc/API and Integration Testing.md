# API and Integration tests

The [Cypress](https://www.cypress.io/) testing framework provides only some very basic capabilities for API and Integration testing. This is why it is typically not first choice when considering a testing framework for Integration tests. As Cypress is widely used for E2E testing, `cumulocity-cypress` adds capabilities to enable teams to easily and efficiently extend their E2E test for API and Integration testing. Depending on the requirements, `cumulocity-cypress` can also help with mocking to derive contract tests from existing E2E or component tests.

Summary of capabilities:
* `cy.c8yclient` to replace `cy.request` and to interact with Cumulocity IoT APIs
* Recording of requests and responses for `cy.c8yclient` and `cy.intercept`
* Object based matching of responses against recorded responses
* JSON-Schema based matching of response bodies
* Docker based test runner for recorded requests and responses
* Mocking of responses for `cy.intercept` from recorded requests and responses
* Configuration via environment variables

Planned capabilities:
* Configuration of expected schema per content type or url
* Docker based mocking server for recorded requests and responses

Contents of this document:
- [API testing with Cypress](#api-testing-with-cypress)
- [cy.c8yclient](#cyc8yclient)
  - [Authentication](#authentication)
    - [Bootstrap and device credentials](#bootstrap-and-device-credentials)
    - [Custom authentication](#custom-authentication)
  - [Chaining of requests](#chaining-of-requests)
    - [Cypress command chain](#cypress-command-chain)
    - [Array of c8yclient functions](#array-of-c8yclient-functions)
    - [Array of Promises](#array-of-promises)
  - [Schema validation](#schema-validation)
  - [Custom REST endpoints](#custom-rest-endpoints)
  - [Logging](#logging)
  - [Options](#options)
- [Recording of requests and responses](#recording-of-requests-and-responses)
  - [Setup](#setup)
  - [File format](#file-format)
  - [Configuration](#configuration)
  - [Identifier](#identifier)
  - [Preprocessing](#preprocessing)
  - [Recording JSON-Schema](#recording-json-schema)
  - [Recording of created objects](#recording-of-created-objects)
  - [Interceptions](#interceptions)
  - [Environment variables](#environment-variables)
  - [Limitations](#limitations)
- [Matching](#matching)
  - [Schema based matching](#schema-based-matching)
  - [Object based matching](#object-based-matching)
  - [Strict matching](#strict-matching)
- [Mocking](#mocking)
- [Runner](#runner)
  - [Installation](#installation)
  - [Running tests](#running-tests)
- [Disclaimer](#disclaimer)

## API testing with Cypress

With `cy.request` Cypress allows sending requests against any REST API. The responses can be matched against expectations as in the following example.

```javascript
describe('Simple API test', () => {
  it('test API with fixtures should create managed object', () => {
    cy.fixture('api/managedObject.json').then((managedObject) => {
      cy.request({
        method: "POST",
        url: `${baseUrl}/inventory/managedObjects`,
        body: managedObject,
        auth: { user: "admin", password: "password" },
        headers: {
          Accept: "application/json",
        },
      }).then((response) => {
        expect(response.status).to.eq(201)
        expect(response.body).to.have.property('id')
      })
    })
  })
})
```

All configuration of the request, as for example the url and headers as well as authentication needs to be set up per request resulting in a lot of code within your API tests. Chaining multiple request will also result in deeply nested and unreadable code making it hard to maintain.

For general introduction of Cypress capabilities for API testing, see [Cypress API Testing](https://docs.cypress.io/guides/guides/network-requests.html#Testing-Strategies).

`cumulocity-cypress` comes with some basic extensions to `cy.request`. To enable authentication and custom command for retrying of requests an additional import is required in your support file.

```typescript
import "cumulocity-cypress/lib/commands/request";
```

Automatic retrying of failed request can be used via `cy.retryRequest` as in the following example.

```typescript
cy.retryRequest(
  {
    method: "POST",
    url: "/my/test/request",
    retryDelay: 1000,
    retries: 2,
  },
  (response) => {
    return response.status === 200;
  }
).then((response) => {
  expect(response.status).to.eq(200);
  expect(response.isOkStatusCode).to.eq(true);
});
```

`cy.request` and `cy.retryRequest` support authentication from `cy.useAuth` and test case annotation. See [README](../README.md) for more details.

## cy.c8yclient

To interact with Cumulocity IoT REST endpoints, the `cy.c8yclient` custom command is provided as a drop-in replacement for `cy.request`. As the name suggests it is a wrapper for the Cumulocity IoT Web SDK `c8y/client`. 

`cy.c8yclient` mimics `cy.request` by yielding a `Cypress.Response<T>` to replace `cy.request` without changing or updating your tests or assertions.

```typescript
cy.c8yclient<IManagedObject>((c) => c.inventory.create(managedObject))
  .then((response) => {
    expect(response.status).to.eq(201)
    expect(response.body).to.have.property('id')
  });

// allow all status codes without failing the test
cy.c8yclientf((c) => c.user.delete("usertodelete"))
  .then((response) => {
    expect(response.status).to.be.oneOf([204, 404]);
  });
```

Configuration supports most of the options accepted by `cy.request`, as for example defined by `Cypress.Loggable` and `Cypress.Failable` interfaces. With `cy.c8yclientf` a convenience command allows expecting failing requests without explicetely configuring `failOnStatusCode: false` as an additional configuration option.

### Authentication

`cy.c8yclient` is using `cy.getAuth`, `cy.useAuth` and `cy.login` commands for authentication.

With this, it will automatically pick the authentication from environment. Login first with `cy.login`, provide `BasicAuth` using `cy.getAuth`, `cy.useAuth` or configure as annotation in your test case. See [README](../README.md) for more details. To override environment auth, pass authentication into `cy.c8yclient` as previous subject by chaining `cy.getAuth` with `cy.c8yclient` as `cy.getAuth("admin").c8yclient(...)`.

Please note, `cy.c8yclient` will choose `CookieAuth` if there is a `X-XSRF-TOKEN` cookie. When using `CookieAuth` the `BasicAuth` headers will NOT be added, even if configured. This is important as basic authentication is disabled by default in Cumulocity IoT. To override the default behaviour, pass `preferBasicAuth: true` option. By enabling `preferBasicAuth`, `BasicAuth` will be used for the request instead of `CookieAuth` even if a `X-XSRF-TOKEN` is found.

```typescript
// login and create auth cookie 
cy.getAuth("admin").login();
cy.c8yclient((c) => c.user.delete("usertodelete"), options);

// pass as basic auth into c8yclient, overriding cookie auth
cy.getAuth("admin")
  .c8yclient((c) => c.user.delete("usertodelete"))
```

#### Bootstrap and device credentials

Using bootstrap authentication and possibly device credentials is supported by `cy.c8yclient`. `cumulocity-cypress` even provides `cy.bootstrapDeviceCredentials` wrapping `/devicecontrol/deviceCredentials` requests. Bootstrap credentials should be provided as environment variables named `devicebootstrap_username` and `devicebootstrap_password` to enable use with `cy.getAuth("devicebootstrap")`. This is not required, but `cumulocity-cypress` uses `devicebootstrap` when running tests from recorded requests and responses.

Following example uses bootstrap authentication and device credentials.

```typescript
it(
  "should register device with device credentials",
  { auth: "admin" },
  function () {
    // use admin credentials to create device registration
    cy.c8yclient((c) => c.deviceRegistration.create({ id }));
    cy.getAuth("devicebootstrap").bootstrapDeviceCredentials(id);
    cy.c8yclient((c) => c.deviceRegistration.accept(id));
    cy.getAuth("devicebootstrap")
      .bootstrapDeviceCredentials(id)
      .useAuth();

    // after useAuth, device credentials are used for all requests
    cy.c8yclientf((c) => c.inventory.create(deviceObject));
});
```

#### Custom authentication

If `cy.getAuth` and `cy.useAuth` are not sufficient for your use case, you can provide a custom `Client` to `cy.c8yclient` as in the following example.

``` typescript
const token = await login(...)
const auth = new BearerAuth(token);
const client = new Client(auth, baseUrl);
// optional - should get the tenant from environment or query from tenant/currentTenant
client.core.tenant = tenantName;

cy.c8yclient((c) => c.user.delete("usertodelete"), { client });
```

### Chaining of requests

To avoid nesting of depending requests and to improve readability of test code, `cy.c8yclient` supports different chaining options. 

#### Cypress command chain

Use Cypress command chain to pass results from one `cy.c8yclient` request into another one. Response will be passed as second argument to the next command in the chain. Provide type information for response body if not automatically determined by typescript.

```typescript
cy.c8yclient<ICurrentTenant>((client) => client.tenant.current())
  .c8yclient<IManagedObject, ICurrentTenant>((c, tenantResponse) => {
    // do something with tenantResponse and query managed object
    console.log(tenantResponse.body.domainName);
    return c.inventory.detail(1, { withChildren: false });
  })
  .then((response) => {
    // response body will be of type IManagedObject
    console.log(response.body.lastUpdated);
  });
```

#### Array of c8yclient functions

`cy.c8yclient` supports array of c8y/client functions. Response will be passed as second argument to next function in the array. Provided type information is used for response body of last function in the array.

```typescript
cy.c8yclient<IManagedObject>([
  (c) => c.tenant.current(),
  (c, tenantResponse: Cypress.Response<ICurrentTenant>) => {
    // do something with tenant response and query managed object
    return c.inventory.detail(1, { withChildren: false });
  },
]).then((response) => {
  // response body will be of type IManagedObject
  console.log(response.body.lastUpdated);
});
```

#### Array of Promises 

Provide an array of Promises. This is useful to filter and map responses of previous requests. 

```typescript
cy.c8yclient((c) => c.userGroup.list({ pageSize: 10000}))
  .c8yclient((c, groups) => {
    const assignments = permissions
      .map(p => groups.body.find(group => group.name === "mygroupname"))
      .filter(group => !!group)
      .map(group => c.userGroup.addUserToGroup(group.id, <userself>));
      return assignments
    })
  .then((response) => {
    ...
  })
```

### Schema validation

To validate a reponse body against a JSON schema, `cy.c8yclient` allows providing JSON schema as part of it's options. If a schema is provided, the response body is automatically validated against the schema and `cy.c8yclient` will fail the test if schema does not match the body.

By default `C8yAjvSchemaMatcher` is used to match response body and schema. [Ajv](https://ajv.js.org/) is a very robust and performant JSON schema validator supporting different versions of JSON schema drafts. 

```typescript
cy.c8yclient((c) => c.core.fetch("/api/custom/"), {
    schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
        },
      },
    },
  });
```

Register a custom schema matcher by providing an implementation of `C8ySchemaMatcher` to `Cypress.c8ypact.schemaMatcher`. To add custom format validation, use

```typescript
Cypress.c8ypact.schemaMatcher.ajv.addFormat("myformat", {
  type: "string",
  validate: (v) => isMyFormat(x),
});
```

### Custom REST endpoints

If a REST endpoint is not supported by `c8y/client` or if for example a microservice is providing an endpoint to be tested, use the following approach to request using `cy.c8yclient`. For custom APIs consider adding services into `c8y/client`.

```typescript
cy.c8yclient(
  (c) =>
    c.core.fetch("/application/applicationsByName/" + appName, {
      headers: {
        accept:
          "application/vnd.com.nsn.cumulocity.applicationcollection+json",
      },
    }),
)
.then((response) => {
  // ...
})
```

### Logging

`cy.c8yclient` logs requests, responses and other information using the [Cypress console log](https://docs.cypress.io/guides/guides/debugging#Get-console-logs-for-commands). To disable logging set `Cypress.c8yclient.config.log` to `false`.

File based logging is planned, but not yet available.

### Options

The following options are supported by `cy.c8yclient` via it's options argument:
```typescript
const options: C8yClientOptions = {
  // log requests and responses to the Cypress console log
  log: true,
  // A JSON schema to validate the response body against. If a schema is provided the,
  // response `body` will be automatically validated against the schema and the 
  // test will fail if schema does not match the body object. 
  schema: {},
  // if enabled, `BasicAuth` is used instead of `CookieAuth` even if a `X-XSRF-TOKEN` is found
  preferBasicAuth: false,
  // A `c8y/client`  `Client` instance to use for request instead of the one created automatically. 
  client: bearerAuthClient,
  // if enabled `cy.c8yclient` will not skip authentication for `c8y/client` instance
  skipClientAuthentication: false,
  // if disabled, `cy.c8yclient` will not fail the test on failing status codes
  failOnStatusCode: false,
  // if disabled, `cy.c8yclient` will not fail the test on failing pact validation
  failOnPactValidation: true,
  // if disabled, `cy.c8yclient` will not record or match against contracts
  ignorePact: false,
  // the base url to use for the request. This allows overriding `Cypress.config().baseUrl` per request.
  baseUrl: "https://mytenant.cumulocity.com"
}
```

## Recording of requests and responses

`cumulocity-cypress` allows to record requests and responses when running E2E or API tests. This recordings can be used to match against or mock requests and responses in following runs and to share or document the tested component's use of APIs with other teams or projects. Recording, matching and sharing of requests and responses is a key use case for consumer driven contract testing with recordings being considered _Contracts_ or _Pacts_.

 To enable "recording" of requests and responses configure the `C8Y_PACT_MODE` environment variable. In "recording" mode, `cy.c8yclient` and `cy.intercept` will store requests and responses as well as required meta data for the current test case. Per test case, a separate file is created. Existing files will be deleted before recording and recreated.

```bash
`C8Y_PACT_MODE="recording"`
```

If recording is disabled, `cy.c8yclient` will check if a recorded pact is available for the current test case and match all requests and their responses against the recorded pacts. If objects do not match, the test will fail automatically. 

With `cy.intercept` the recorded pacts are used to mock responses for requests.

If recording is disabled, `cy.c8yclient` and `cy.intercept` use the `C8yPact` object for the current running test from `Cypress.c8ypact.current`. If `null`, there is no recorded pact for the current test. Disable recording simply by setting `C8Y_PACT_MODE` to `undefined`.

### Setup

To enable `cumulocity-cypress` recording capabilities, the c8y plugin needs to be configured in the Cypress config file (e.g. `cypress.config.js`) of the project. If the plugin is not loaded, `cy.c8yclient` and `cy.intercept` will not record any data even if `C8Y_PACT_MODE` is set to `recording`!

```javascript
const { defineConfig } = require("cypress");
const { configureC8yPlugin } = require("cumulocity-cypress/plugin/");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      configureC8yPlugin(on, config);
      // important to return the config object
      return config;
    },
  },
});
```

Update the project's `e2e.supportFile` (e.g. `cypress/support/e2e.ts`) to import `c8ypact` and `intercept` commands. As `intercept` requires `c8ypact` recording, it automatically imports `c8ypact`.

Overview of commands:

```typescript
import "cumulocity-cypress/lib/commands/";
import "cumulocity-cypress/lib/commands/c8ypact";
import "cumulocity-cypress/lib/commands/intercept";
import "cumulocity-cypress/lib/commands/request";
```

By importing `request` command, only authentication and retrying of requests is enabled for `cy.request`. There is currently no support for recording or matching of requests and responses supported by `cy.request`.

Without importing `c8ypact` or `intercept` commands, recording capabilities are disabled and `cy.c8yclient` and `cy.intercept` will not record any data even if `C8Y_PACT_MODE` is set to `recording`! If you experience issues after importing either of the commands, try to remove the import and check if the issue persists.

### File format

A recorded pact is a JSON file containing an object of type `C8yPact` which has a `C8yPactInfo` and an array of `C8yPactRecord` objects as well as a unique `id`. Each `record` contains at least one `C8yPactRequest` and `C8yPactResponse` as well as `options` and `auth` settings used for the recording

For storing and loading from or to custom locations and formats, implement a custom `C8yPactFileAdapter` and register when configuring the plugin. This would allow for example to store pacts in a database or importing and exporting in HAR or any other format. By default `cumulocity-cypress` uses `C8yPactDefaultFileAdapter` to store and load pacts from the file system in a configurable folder. 

```typescript
const { defineConfig } = require("cypress");
const { configureC8yPlugin } = require("cumulocity-cypress/lib/plugin/");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const adapter = new MyCustomFileAdapter();
      configureC8yPlugin(on, config, {
        pactFolder: "/my/custom/pact/location",
        pactAdapter: adapter,
      });
      return config;
    },
  },
});
```

### Configuration

Configuration of recording and matching is available via `Cypress.c8ypact`. It allows for example registration of custom object or schema matchers and provides configuration interface using `Cypress.c8ypact.config`. 

```typescript
Cypress.c8ypact.config = {
  // allow additional properties in the response body
  strictMatching: true,
  // fail the test if there is no pact or the pact does not have a record for a request
  failOnMissingPacts: true,
  // log requests and responses to the Cypress console log
  log: false,
  // information about the producing component
  producer: { name: "MyMicroservic", version: "1.0.0" },
  // information about the consuming component
  consumer: { name: "Myself", version: "3.1.0" },
  // tags to be used for filtering pacts
  tags: ["api"],
  // description for the recorded tests
  description: "Testing APIs for my microservice",
  // enable/disable recording and matching
  ignore: false,
  // preprocessor options to apply for recorded and matched requests and responses
  preprocessor: {
    ignore: ["request.headers.Authorization", "request.headers.UseXBasic"],
    obfuscate: ["body.password", "request.headers.Authorization"],
    obfuscationPattern: "********",
  },
};
```

All configuration options are optional and can be overwritten by per test case or suite using annotations or (for some) by environment variables.

```typescript
context("device tests", { cypact: { ignore: true } }, () => {
  it(
    "should register device",
    {
      c8ypact: {
        ignore: false,
        strictMatching: false,
        failOnMissingPacts: false,
      },
    },
    function () {
      cy.c8yclient((c) => c.deviceRegistration.create({ id }));
    }
  );
});
```

### Identifier

Every pact must have a unique identifier. By default the identifier is a combination of the test case name and the test suite name. If a test case is run multiple times, the identifier should be the same. To provide a custom identifier, use the `c8ypact` annotation as in the following example.

```typescript
it(
"should register device with device",
  {
    c8ypact: {
      id: "my-custom-id",
    },
  },
  function () {
    ...
  }
);
```

Providing custom ids helps avoiding problems when changing test case names or suites names in your tests.

### Preprocessing

Preprocessing allows to modify requests and responses before storing them as a pact or matching against a pact. This is useful to remove dynamic values from requests and responses, such as ids or timestamps. It might however also be used to obfuscate properties, such as request headers or passwords in response bodies. 

Sample set of preprocessor options including some important headers to ignore. `content-enconding` and `transfer-encoding` should be ignored for example to avoid zlib and encoding issues. You might also use preprocessing to keep your pact objects clean and remove whatever is not relevant for the test.

```typescript
Cypress.c8ypact.config.preprocessor = {
  ignore: [
    "request.headers.cookie",
    "request.headers.accept-encoding",
    "response.headers.cache-control",
    "response.headers.content-length",
    "response.headers.content-encoding",
    "response.headers.transfer-encoding",
    "response.headers.keep-alive",
  ],
  obfuscate: [
    "request.headers.Authorization",
    "request.headers.X-XSRF-TOKEN",
    "response.body.password",
  ],
  obfuscationPattern: "********",
}
```

To use a custom preprocessor, register a custom implementation of `C8yPactPreprocessor` with `Cypress.c8ypact.preprocessor`. With this any kind of preprocessing rules and configuration can be implemented.

### Recording JSON-Schema

When recording requests and responses, `cy.c8yclient` will automatically generate JSON schemas for the response body. This is useful to validate responses against a schema instead of the object itself. If a schema is found for the response body, it will be used for validation instead of the response object itself.

The schema is stored in the pact response object as `$body`.

```json
"response": {
  "status": 201,
  "body": {
    ...
  },
  "$body": {
    "type": "object",
    "properties": {
      ...
    },
    "required": [
      ...
    ]
  },
  "headers": {
    ....
  }
},
```

>**Note:** By, default there is no schema generator registered and with this schema will not be automatically generated. To enable schema generation, set `Cypress.c8ypact.schemaGenerator` to a custom implementation of `C8ySchemaGenerator`. This is the same for schema matching. To enable schema matching, set `Cypress.c8ypact.schemaMatcher` to a custom implementation of `C8ySchemaMatcher`.

`cumulocity-cypress` comes with `C8yQicktypeSchemaGenerator` that uses [quicktype](https://quicktype.io/) to generate JSON schemas for response bodies. For schema matching, is provided `C8yAjvSchemaMatcher` based on [Ajv](https://ajv.js.org/) JSON schema validator. 

To enable schema generation or matching, register the implementations to use for example in your support file.

```typescript
import { C8yQicktypeSchemaGenerator } from "cumulocity-cypress/contrib/quicktype";
Cypress.c8ypact.schemaGenerator = new C8yQicktypeSchemaGenerator();

import { C8yAjvJson6SchemaMatcher } from "cumulocity-cypress/contrib/ajv";
Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
// should be optional in browser runtimes. Node.js runtime, such as in the plugin, this is required
C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;
```

The `C8yAjvJson6SchemaMatcher` uses [Ajv](https://ajv.js.org/) JSON schema validator with JSON schema draft 6. You might want to use different schema version and register with `C8yAjvSchemaMatcher` by imorting schema definition as for example from `ajv/lib/refs/json-schema-draft-06.json`.

> **Important:** The schema generator and matcher implementations MUST support browser runtime. Node.js specific code will not work and will cause issues when running tests in the browser.

To disable schema generation, set `Cypress.c8ypact.schemaGenerator` to `undefined`.

### Recording of created objects

API and Integration test also require to create objects in the backend, such as managed objects in the context of Cumulocity IoT. When running the test and matching against a recorded pact, the created objects will have different ids and matching will fail. `cy.c8yclient` automatically stores created objects and ids in the pact to replace them when rerunning with the new id. 

Ids will be replaced in request and response bodies as well as urls.

### Interceptions

Recording of interceptions during E2E or UI tests is directly built into `cy.intercept`. No changes are required for existing tests to enable recording and mocking of interceptions. 

```typescript
cy.intercept("GET", "/inventory/managedObjects/*").as("managedObject");
```

Interceptions with static RouteHandlers will also record the actual request and response. This means `cy.intercept` will send the request and store it's actual response as `body`. The mocked response passed as static RouteHandler to `cy.intercept` will be stored as `modifiedResponse`, including headers and body. This allows matching of a schema against the actual response as well as the modified response. This is meant to fail tests even if the mocked responses do not match the current schema of the API. 

```typescript
cy.intercept(
  "/inventory/*",
  (req) => {
    req.continue((res) => {
      res.send({
        statusCode: 404,
        body: {
          message: "Object not found",
        },
      });
    });
  }
).as("inventory");
```

If recording is disabled, `cy.intercept` will use the recorded pacts to mock responses for requests. To find a matching record for the intercepted request in the pact, `cy.intercept` uses a request matcher with the configuration options from `Cypress.c8ypact.config.requestMatching`. 

Finding recorded requests in the pact is not only based on the URL, but also for example the request method. 

### Environment variables

`cumulocity-cypress` supported environment variables for recording and matching of requests and response have the prefix `C8Y_PACT_`. 

Internally used variables (consider read-only):
- `C8Y_PACT_ENABLED` (string) - has configureC8yPlugin been called in cypress.config.js
- `C8Y_PACT_INTERCEPT_ENABLED` (boolean) - is enabled for `cy.intercept`
- `C8Y_PACT_FOLDER` (string) - folder where pacts are stored and restored from

User defined variables:
- `C8Y_PACT_MODE` (string) - if set to `recording` requests and responses will be saved
- `C8Y_PACT_IGNORE` (string) - disable all pacts by default and enable for specific test cases
- `C8Y_PACT_PREPROCESSOR_OBFUSCATE` (string[]) - pact property paths to be obfuscated before saving or matching pacts. Use for example to obfuscate passwords or other sensitive data.
- `C8Y_PACT_PREPROCESSOR_PATTERN` (string) - pattern to use for obfuscation, by default `********` is used
- `C8Y_PACT_PREPROCESSOR_IGNORE` (string[]) - pact properties to ignore and not save

More environment variables are planned to be used for configuration.

### Limitations

Currently known limitations of the recording and matching capabilities are:
* `cy.clock` timestamps are not recorded and used when matching or rerunning tests
* recording of binary data is not supported and might cause unexpected behaviour
* header names are matched case sensitive that might cause issues with `cy.c8yclient` and `cy.intercept` recording compatibility
* supporting only one created object per test case

## Matching

If `C8Y_PACT_MODE` is undefined and there is a pact for the current test, `cy.c8yclient` will automatically match against stored requests and responses and fail the test if objects do not match. The `cy.c8ymatch` command is used for matching a `Cypress.Response<T>` object against a `C8yPactRecord` stored in the current pact. Results are logged to the Cypress console log. `cy.c8ymatch` is automatically called by `cy.c8yclient` if recording is disabled and there is a pact object for the current test. 

By recording and automatically matching against recorded pacts, `cy.c8yclient` provides an easy and efficient way of creating and maintaining API tests. To update a pact, simply rerun the test with recording enabled. For example the following test is in fact an Integration Test that automatically does all validation and matching without having any custom expectations. Run once in recording mode and all following runs will match against the recorded pact.

```typescript
it("should register device with device", function () {
  cy.c8yclient((c) => c.deviceRegistration.create({ id }));
});
```

`cy.intercept` currently does not any matching. This is planned for upcoming releases.

### Schema based matching

By default, schema based matching is used to match response bodies against recorded schemas. If there is no schema found for an object, the object itself is used for matching.

To disable schema based matching, set `Cypress.c8ypact.schemaMatcher` to `undefined`. To register a custom schema matcher, provide an implementation of `C8ySchemaMatcher` and register with `Cypress.c8ypact.schemaMatcher`.

Schema based matching is also used by object based matcher `C8yDefaultPactMatcher` allowing to mix object an schema based matching. If there is a property found in the pact object having a prefix `$` it is considered a schema and used for matching.

### Object based matching

Default object matching for `C8yPact` objects, matches requests and responses. Additional information such as `info`, `auth` and `options` are not matched.

With `C8yDefaultPactMatcher` a preconfigured object matcher is provided by `cumulocity-cypress`. It iterates over all properties within the request and response objects and uses matchers registered per property to match the objects. A property matcher must implement the `C8yPactMatcher` interface and can implement any custom matching required. Predefined matchers include:
* `C8yNumberMatcher` for matching numbers
* `C8yStringMatcher` for matching strings
* `C8yISODateMatcher` for matching ISO dates
* `C8yIgnoreMatcher` for ignoring the property
* `C8ySameTypeMatcher` for checking objects have the same type
* `C8yIdentifierMatcher` for matching Cumulocity ids to be string of numbers
* `C8yPactBodyMatcher` for matching Cumulocity response bodies

`C8yPactBodyMatcher` comes with a set of predefined property matchers for common Cumulocity response object properties, including `id`, `statistics`, `creationTime`, `password`, etc.

Register a custom matcher for a specific property or define your own matcher for object matching via `Cypress.c8ypact.matcher`.

```typescript
Cypress.c8ypact.matcher.addPropertyMatcher("myproperty", new C8yNumberMatcher());
Cypress.c8ypact.matcher.propertyMatchers(["body"], new MyCustomResponseBodyMatcher());
// or 
Cypress.c8ypact.matcher = new MyCustomPactMatcher();
```

`C8yPactBodyMatcher` uses `Cypress.c8ypact.schemaMatcher` to match a property if a schema is found for the property. Schemas are expected to be stored in a property with a prefix `$` in the matched pact object.

### Strict matching

Strict matching configuration allows to define if additional properties in the response body are allowed or not. By default, strict matching is enabled and will fail the test if additional properties are found in the response body. 

Configure strict matching via `Cypress.c8ypact.config.strictMatching`. 

## Mocking

tbd.

## Runner

The `cumulocity-cypress` pact runner is a docker based test runner for recorded pact objects. It allows to rerun the recorded tests only from the pact files, the test case itself is not required. This is especially useful to share tests with other teams, rerun tests in different environments, etc. There is also no Cypress know how or Cypress itself required to run the tests.

When rerunning tests the same test structure or hierarchy of suites and tests is recreated as when recording the tests. 

### Installation

tbd. Needs to be published as in a registry.

### Running tests

The `./packages/pact-runner/pact-runner` script is the easiest way to run the pact runner. It will start the docker container and pass the required arguments to the runner. 

```bash
pactrunner ./pactfiles cypress.env.json
```

This is the same as running the following docker command.

```bash
docker run -v "/path/to/fixtures":/usr/src/app/cypress/fixtures -v "/path/to/cypress.env.json":/usr/src/app/cypress.env.json -it c8ypact-runner
```

The `cypress.env.json` file is required to provide the environment variables used for the tests. The `pactfiles` folder contains the pact files to be run.

Sample `cypress.env.json` file:
```json
{
  "baseUrl": "https://mytenant.cumulocity.com",
  "admin_username": "admin",
  "admin_password": "...",
  "devicebootstrap_username": "...",
  "devicebootstrap_password": ""
}
```

Same credentials are required as when recording the tests. If for example a user "admin" has been used for recording, the same user and password is required to run the tests. For example, if using `cy.getAuth("admin")` or `cy.login("admin")` the `admin_username` and `admin_password` environment variables are required to be defined in the cypress.env.json file.

## Disclaimer

These tools are provided as-is and without warranty or support. They do not constitute part of the Software AG product suite. Users are free to use, fork and modify them, subject to the license agreement. While Software AG welcomes contributions, we cannot guarantee to include every contribution in the master project.
