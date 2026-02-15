# Cypress commands for Cumulocity

Collection of commands and utilities to be used for automating tests for [Cumulocity IoT](https://www.cumulocity.com) with [Cypress](https://www.cypress.io). Also use the repository to discuss questions and issues when testing your Cumulocity IoT applications with Cypress.

Contribute by raising pull requests. All commands must be documented and, if possible, tested using test suite in this repository.

# Content
<!-- set markdown.extension.toc.levels 2..6 - level 1 is ignored in auto generated toc -->
- [Overview of commands](#overview-of-commands)
- [Screenshot automation](#screenshot-automation)
- [Installation and setup](#installation-and-setup)
  - [Peer dependencies](#peer-dependencies)
  - [Load plugin](#load-plugin)
  - [Import commands](#import-commands)
  - [Environment variables](#environment-variables)
  - [Environment variables from go-c8y-cli](#environment-variables-from-go-c8y-cli)
- [Additional frameworks](#additional-frameworks)
- [Concepts](#concepts)
  - [Authentication and credentials](#authentication-and-credentials)
    - [Authentication via getAuth and useAuth commands](#authentication-via-getauth-and-useauth-commands)
    - [Authentication via test case annotations](#authentication-via-test-case-annotations)
    - [Authentication via environment variables](#authentication-via-environment-variables)
    - [Passing authentication to cy.request](#passing-authentication-to-cyrequest)
  - [Chaining of commands](#chaining-of-commands)
  - [c8y/client and Web SDK types](#c8yclient-and-web-sdk-types)
  - [Recording of requests and responses](#recording-of-requests-and-responses)
  - [Component testing](#component-testing)
- [Development](#development)
  - [Debugging](#debugging)
    - [Console log debugging](#console-log-debugging)
    - [Debugging in Visual Studio Code](#debugging-in-visual-studio-code)
  - [Testing](#testing)
    - [Test access of DOM elements](#test-access-of-dom-elements)
    - [Test requests](#test-requests)
    - [Test interceptions](#test-interceptions)
- [Useful links](#useful-links)
- [Disclaimer](#disclaimer)

## Overview of commands

Current set of commands include

General commands

- `visitAndWaitForSelector`
- `setLanguage`
- `acceptCookieBanner`, `showCookieBanner`, `disableCookieBanner`
- `disableGainsight`
- `highlight`, `clearHighlights`, `screenshot`

Authentication related commands
- `login`
- `setAuth`
- `useAuth`
- `bootstrapDeviceCredentials`
- `oauthLogin`

Date related commands
- `toDate`
- `toISODate`
- `compareDates`

More information on date handling can be found in [Date Handling](./doc/Date%20Handling.md).
  
Administration related commands
- `getCurrentTenant` and `getTenantId`
- `createUser` and `deleteUser`
- `assignUserRoles` and `clearUserRoles`
- `createGlobalRole` and `deleteGlobalRoles`
- `getSystemVersion` and `getShellVersion`

Component testing
- `mount`

[Integration and API testing](./doc/API%20and%20Integration%20Testing.md) related commands
- `c8yclient`, `c8yclientf`
- `c8ymatch`
- `retryRequest`
- `request`

See [Integration and API testing](./doc/API%20and%20Integration%20Testing.md) for more information.

## Screenshot automation

With the `c8yscrn` command, `cumulocity-cypress` provides a tool to automate taking screenshots of your Cumulocity IoT applications as part of your test suite or CI/CD workflows. See [Screenshot automation](./doc/Screenshot%20Automation.md) for more information.

## Installation and setup

Add dependency to your package.json and install via npm or yarn.

```bash
npm install --save-dev cumulocity-cypress
```

### Peer dependencies

`cumulocity-cypress` requires some peer dependencies to be installed in your project for all commands to work as expected. This is to make sure the exact versions of the dependencies in your tested project are used by `cumulocity-cypress`.

Make sure the following dependencies are installed in your project:
- `cypress`
- `@c8y/client`
- `angular-common`

### Load plugin

`cumulocity-cypress` comes with a Cypress plugin that needs to be loaded in your `cypress.config.ts` file. Currently, this is only required for recording and mocking of requests and responses, but it is recommended to load the plugin in any case.

```typescript
import { defineConfig } from "cypress";
import { configureC8yPlugin } from "cumulocity-cypress/plugin";

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

### Import commands

To use the `cumulocity-cypress` commands in your Cypress tests, import the commands in  your projects `e2e.supportFile` (e.g. `cypress/support/e2e.ts`).

```typescript
import "cumulocity-cypress/commands";
```

This will import the standard commands, including for example login, authentication, date conversion, administration. 

Optional commands for import (only import if really needed):

```typescript
// Import extension for cy.request() to support authentication
import "cumulocity-cypress/commands/request";
// Import commands for recording and mocking of requests and responses
import "cumulocity-cypress/commands/c8ypact";
// Enable recording and mocking for cy.intercept()
import "cumulocity-cypress/commands/intercept";
```

See [API and Integration Testing](./doc/API%20and%20Integration%20Testing.md) for more information on how to enable recording and matching of requests and responses using `cy.c8yclient` and `cy.intercept`.

Import the `mount` command for component testing of Cumulocity Angular components.

```typescript
import "cumulocity-cypress/commands/mount";
```

### Environment variables

The easiest way to configure environment variables is to create a `cypress.env.json` file in your project. Use this file to pass for example credentials needed for the tests or any other environment variable supported by `cumulocity-cypress`. Of course, environment variables can be set in any other way as described in [Cypress documentation](https://docs.cypress.io/guides/guides/environment-variables#Setting).

```json
{
  "admin_username": "admin",
  "admin_password": "password",
  "noaccess_username": "noaccess",
  "noaccess_password": "password"
}
```

A list of supported environment variables can be found in Environment variables section of the [API and Integration Testing](./doc/API%20and%20Integration%20Testing.md#environment-variables) documentation.

It is also recommended to init certain environment variables in a global before hook of your tests. `C8Y_TENANT` for example is used by `cumulocity-cypress` if a tenant id is required. Some commands like `login`, `c8yclient` or all administration commands require a tenant id. Setting the tenant id once in global before hook will make sure it is available for all tests.

```typescript
before(() => {
  cy.getAuth("admin")
    .getCurrentTenant()
    .then((tenant) => {
      Cypress.env("C8Y_TENANT", tenant.body.name);
    })
    .then(() => {
      expect(Cypress.env("C8Y_TENANT")).not.be.undefined;
    });
  // or just simply call getTenantId() as this sets the tenant id env variable automatically
  cy.getAuth("admin").getTenantId();
});
```

### Environment variables from go-c8y-cli 

If you are using [go-c8y-cli](https://goc8ycli.netlify.app) to manage your Cumulocity IoT environments, you can use the `set-session` command to set environment variables for your Cypress tests. This allows you to easily switch between different environments and configurations using `go-c8y-cli` session providers.

The easiest way to pass environment variables to Cypress and cumulocity-cypress automtically, is to use `configureEnvVariables()` in your `cypress.config.ts` file. 

```typescript
import { defineConfig } from "cypress";
import { configureC8yPlugin, configureEnvVariables } from "cumulocity-cypress/plugin";

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      configureC8yPlugin(on, config);
      configureEnvVariables(config);

      // important to return the config object
      return config;
    },
  },
});
```

## Additional frameworks

Other frameworks that might help improve efficiency, quality and reliability of Cypress tests include:

- [cypress-commands](https://github.com/Lakitna/cypress-commands)
- [cypress-map](https://github.com/bahmutov/cypress-map)
- [cypress-recurse](https://github.com/bahmutov/cypress-recurse)
- [cypress-file-upload](https://github.com/abramenal/cypress-file-upload)

## Concepts

To use the custom commands provided in this library across different projects, it comes with some concepts to allow more flexible use.

The most important use case has been accessing credentials for authentication, as probably every project uses a different approach to pass credentials into it's tests.

### Authentication and credentials

This library supports different ways to configure authentication and credentials in your tests. The `getAuth` and `useAuth` commands create or read authentication options from environment and pass or configure it for given commands or the entire test.

Within this library, all commands must use and support authentication based on `C8yAuthOptions`. `C8yAuthOptions` are compatible with authentication options used in

- `cy.request()` as defined in [HTPP Authentication](https://github.com/request/request#http-authentication)
- `ICredentials` as defined by `c8y/client`

#### Authentication via getAuth and useAuth commands

For accessing authentication credentials, the `getAuth()` and `useAuth()` commands are provided. Both accept any arguments and create, if possible, a `C8yAuthOptions` object.

```typescript
// get auth options from Cypress env variables, test annotation or cy.useAuth()
cy.getAuth();

// user "admin" and password from "admin_password" Cypress env variable
cy.getAuth("admin");

// user and password given as strings
cy.getAuth("admin", "password");

// use C8yAuthOptions (for chaining commands)
cy.getAuth({ user: "admin", password: "password" });
```

`getAuth()` and `useAuth()` support chaining by accepting arguments as previous subjects. All commands requiring authentication should accept `C8yAuthOptions` object as it's first (previous subject) argument.

```typescript
// without chaining
cy.getAuth().then((auth) => {
  cy.createUser(auth, "newuser");
});

// with chaining
cy.getAuth().createUser("newuser");
```

With `useAuth()` the `C8yAuthOptions` object will be available for all commands within the scope of the test. Use if there is more than one command requiring authentication or if not all commands in a chain yield auth options.

```typescript
cy.useAuth("admin");

cy.deleteUser("newuser");
cy.createUser({
  userName: "newuser",
  password: "newpassword",
  email: "newuser@example.com",
  displayName: "New User",
});
cy.getApplicationsByName("OEE").subscribeApplications("newuser");

// using getAuth() to pass auth options into login will override the
// authentication options configured via cy.useAuth()
cy.getAuth("newuser").login();
```

#### Authentication via test case annotations

Instead of calling `useAuth()`, it is also possible to annotate the test with authentication options.

```typescript
it(
  "my test requiring authentication",
  { auth: { user: "myadmin", password: "mypassword" } },
  () => {
    // commands will use auth passed from annotation
  }
);

it("another test requiring authentication", { auth: "myadmin" }, () => {
  // commands will use auth from annotation with password from env variable
});
```

#### Authentication via environment variables

To provide authentication options into all tests, use `C8Y_TOKEN` (for Bearer authentication) or `C8Y_USERNAME` and `C8Y_PASSWORD` env variables (for Basic authentication). Set env variables in your tests or use one of the ways descibed in [Cypress documentation](https://docs.cypress.io/guides/guides/environment-variables#Setting).

When both token and username/password are provided, the token will be preferred.

Example for setting environment variables in your tests:

```typescript
// Bearer authentication (preferred)
Cypress.env("C8Y_TOKEN", "your-jwt-token");

// Or Basic authentication
Cypress.env("C8Y_USERNAME", "admin");
Cypress.env("C8Y_PASSWORD", "password");
```

You can also use user aliases to configure authentication for specific users. User aliases support both token-based and username/password authentication:

```typescript
// Token-based authentication for admin user
Cypress.env("admin_token", "admin-jwt-token");

// Or username/password authentication for admin user
Cypress.env("admin_username", "admin");
Cypress.env("admin_password", "password");
```

When using user aliases, token authentication takes precedence over username/password if both are configured.

#### Passing authentication to cy.request

With `import "cumulocity-cypress/commands/request"`, it is also possible to add authentication support to `cy.request()` command. If enabled, `cy.request()` will use authentication from environment, `useAuth()` and test case auth annotation. As this feature is considered experimental, it is not automatically imported.

Note: chaining authentication into `cy.request()` is not supported as `cy.request()` does not support previous subject and always is a parent in the Cypress chain.

> **Note**: Add the import before other imports (not related to this library). This is required in case `cy.request()` is overwritten. If any `cy.overwrite("request", ...)` is called after the import, `cy.request()` will not automatically use the authentication.

```typescript
it(
  "use request with authentication from test annotation",
  { auth: "admin" },
  function () {
    cy.request({
      method: "GET",
      url: "/path/to/some/resource",
    }).then((response) => {
      // do something
    });
  }
);

// same as
it("standard request authentication", function () {
  cy.request({
    method: "GET",
    url: "/path/to/some/resource",
    auth: { user: "admin", password: "password" },
  }).then((response) => {
    // do something
  });
});
```

### Chaining of commands

Custom commands provided by this library support chaining. This means commands accept `previousSubject` and yield it's result for next command in the chain.

Instead of having one command with a lot of arguments, chaining allows splitting into multiple commands.

```typescript
cy.getAuth("admin", "password").login();
cy.wrap("admin").getAuth().login();
```

### c8y/client and Web SDK types

In general, all custom commands use `c8y/client` type definitions working with Cumulocity API.

To interact with Cumulocity REST endpoints, `cy.c8yclient` custom command is provided. `cy.c8yclient` mimics `cy.request` to easily exchange or replace `cy.request` within your tests. For compatibility, the yielded result of `cy.c8yclient` is a `Cypress.Response<T>` (as used by `cy.request`) to make all assertions work as expected for `cy.request` and `cy.c8yclient`.

See [API and Integration Testing](./doc/API%20and%20Integration%20Testing.md) for more information.

### Recording of requests and responses

`cumulocity-cypress` allows to record requests and responses when running e2e, component or API tests. This recordings can be used to match against or mock requests and responses in following runs and to share or document the tested component's use of APIs with other teams or projects.

See [API and Integration Testing](./doc/API%20and%20Integration%20Testing.md) for more information.

### Component testing

`cumulocity-cypress` provides fully configured `cy.mount` command for testing Cumulocity Angular components. For general information on component testing in Cypress, see [Component Testing](https://docs.cypress.io/guides/component-testing/introduction).

The `cy.mount` command comes with capabilities to easily record and mock API requests and responses for component tests. For recording, `cy.mount` allows running component tests against a configured `C8Y_BASEURL` and record responses for mocking. 

> **Note**: Configuration of baseUrl via `C8Y_BASEURL` environment variable is required as Cypress component tests do not allow configuration of a baseUrl. Component tests are expected to run using mocked data.

## Development

### Debugging

Debugging Cypress tests is tricky. To help debugging custom commands, this library comes with needed setup for debugging in Cypress.

#### Console log debugging

All custom commands of this library are logged within the Command Log of the [Cypress App](https://docs.cypress.io/guides/core-concepts/cypress-app). By clicking the logged command in Command Log of Cypress App, extra information are printed to the console for debugging. Extra information should include at least subject as well as the value yielded by the command. Every command can add any additional information.

Use `consoleProps` object to pass additional information as in the following example.

```typescript
// get $args from arguments passed to the command
const [auth, userOptions] = $args;
const consoleProps = {
  // include authentication and user options passed as arguments
  auth: auth,
  userOptions: userOptions,
};

Cypress.log({
  name: "createUser",
  // custom message (title) shown in command log
  message: userOptions.userName,
  consoleProps: () => consoleProps,
});

// do something

cy.request({
  method: "POST",
  url: "/user/" + tenant.name + "/users",
  auth: auth,
  body: userOptions,
}).should((response) => {
  // add more details to console props
  consoleProps.response = response;
});
```

When adding extra information to the log, keep overall object size in mind. You might run out of memory in case of extensive logging with many large command log entries.

See [Get console log for commands](https://docs.cypress.io/guides/guides/debugging#Get-console-logs-for-commands) from Cypress documentation for more details.

#### Debugging in Visual Studio Code

Debugging in Visual Studio Code is not very straight forward, but after all it is or should be possible. The project does contain the launch configuration `Attach to Chrome`, wich requires the Cypress app to be started with `npm run test:open`.

Once Cypress App has been started, select run and debug `Attach to Chrome` launch configuration and restart your test(s) in the Cypress App using `Rerun all tests`.

Create breakpoints for Cypress commands using `debugger` statement.

```typescript
it.only("debugging test", () => {
  debugger;
  // to debug getCurrentTenant(), place another debugger statement
  // in the implementation of getCurrentTenant()
  cy.getAuth("admin")
    .getCurrentTenant()
    .then((tenant) => {
      // to debug result of getCurrentTenant, place debugger in then()
      debugger;
      expect(tenant.name).to.equal("mytenant");
      expect(Cypress.env("C8Y_TENANT")).to.deep.equal({ name: "mytenant" });
    });
});
```

For more information see [Debug just like you always do](https://docs.cypress.io/guides/guides/debugging#Debug-just-like-you-always-do) in the official Cypress documentation.

### Testing

Cypress is used for testing commands. All tests are located in `test/cypress` folder. If needed, add HTML fixtures in `test/cypress/app/` folder.

Run tests using

```bash
npm run cypress
```

or with opening the Cypress console

```bash
npm run cypress:open
```

Jest unit tests are located in src/ folder as `*.spec.ts` files. Run jest tests using

```bash
npm run jest
```

#### Test access of DOM elements

tbd.

#### Test requests

Testing requests and the processing of it's responses a set of utilities is provided by this library.

```typescript
// can be called in beforeEach() hook
initRequestStub();

stubResponse<ICurrentTenant>({
  isOkStatusCode: true,
  status: 200,
  body: { name: "mytenant" },
});

cy.getAuth("admin")
  .getCurrentTenant()
  .then((tenant) => {
    expectHttpRequest({
      url: url(`/tenant/currentTenant`),
      method: "GET",
      auth: { user: "admin", password: "password" },
    });
    expect(tenant.name).to.equal("mytenant");
    expect(Cypress.env("C8Y_TENANT")).to.deep.equal({ name: "mytenant" });
  });
```

#### Test interceptions

Interceptions are a very important concept to test with stubbed network responses. If custom commands use interceptions, it can be easily triggered using `JQueryStatic` provided by Cypress.

```typescript
$.get(url(`/tenant/currentTenant.json`));
```

If interceptions do not just stub a response, but modify the response from server, mock the service with fixtures in `app` folder. You might need to append an extension to the endpoint to get the right content type however.

```typescript
const { $ } = Cypress;

cy.disableGainsight()
  .as("interception")
  .then(() => {
    return $.get(url(`/tenant/currentTenant.json`));
  })
  .then((response) => {
    expect(response.customProperties.gainsightEnabled).to.eq(false);
  })
  .wait("@interception");
```

## Useful links

📘 Explore the Knowledge Base  
Dive into a wealth of Cumulocity IoT tutorials and articles in our [Tech Community Knowledge Base](https://tech.forums.softwareag.com/tags/c/knowledge-base/6/cumulocity-iot).

💡 Get Expert Answers  
Stuck or just curious? Ask the Cumulocity IoT experts directly on our [Forum](https://tech.forums.softwareag.com/tags/c/forum/1/Cumulocity-IoT).

🚀 Try Cumulocity IoT  
See Cumulocity IoT in action with a [Free Trial](https://techcommunity.softwareag.com/en_en/downloads.html).

✍️ Share Your Feedback  
Your input drives our innovation. If you find a bug, please create an issue in the repository. If you’d like to share your ideas or feedback, please post them [here](https://tech.forums.softwareag.com/c/feedback/2).

More to discover

- [Recommended E2E testing framework](https://tech.forums.softwareag.com/t/recommended-e2e-testing-framework/285616)
- [How to setup component testing in CY8 CLI](https://tech.forums.softwareag.com/t/how-to-setup-component-testing-in-cy8-cli/285731)

## Disclaimer

These tools are provided as-is and without warranty or support. They do not constitute part of the Software AG product suite. Users are free to use, fork and modify them, subject to the license agreement. While Software AG welcomes contributions, we cannot guarantee to include every contribution in the master project.
