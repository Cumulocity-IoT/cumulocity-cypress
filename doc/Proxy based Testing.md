# c8yctrl

With the `c8yctrl` command, `cumulocity-cypress` provides a tool providing a HTTP controller that allows serving static builds of Web SDK based applications or plugins and proxying API requests to Cumulocity. As an intermediary service, `c8yctrl` can record and mock proxied requests and with this allow running tests without requiring a Cumulocity backend.

Use `c8yctrl` for 
- testing shell and remotes without deploying them to Cumulocity
- offline testing by recording and mocking API requests
- e2e, component and microservice unit testing

`c8yctrl` does not require using `cumulocity-cypress` in your e2e or component tests.

<!-- set markdown.extension.toc.levels 2..6 - level 1 is ignored in auto generated toc -->
- [Usage](#usage)
  - [Static sources](#static-sources)
  - [Recording and mocking](#recording-and-mocking)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [Command Line Arguments](#command-line-arguments)
  - [Parameters](#parameters)
  - [Configuration File](#configuration-file)
- [How it works](#how-it-works)
- [Rest Interface](#rest-interface)
  - [POST /c8yctrl/current](#post-c8yctrlcurrent)
    - [Parameters](#parameters-1)
  - [GET /c8yctrl/current](#get-c8yctrlcurrent)
  - [DELETE /c8yctrl/current](#delete-c8yctrlcurrent)
  - [POST /c8yctrl/current/clear](#post-c8yctrlcurrentclear)
  - [GET /c8yctrl/current/request?](#get-c8yctrlcurrentrequest)
  - [GET /c8yctrl/current/response?](#get-c8yctrlcurrentresponse)
  - [GET /c8yctrl/log](#get-c8yctrllog)
  - [POST /c8yctrl/log](#post-c8yctrllog)
  - [PUT /c8yctrl/log](#put-c8yctrllog)
  - [Using c8yctrl with cumulocity-cypress](#using-c8yctrl-with-cumulocity-cypress)
  - [From Cypress tests](#from-cypress-tests)
  - [For microservices](#for-microservices)

## Usage

`c8yctrl` is designed as an intermediary service, a middleware, in between your test framework and a Cumulocity tenant. To use your tests with `c8yctrl`, you need to configure your tests to not directly access a Cumulocity tenant, but instead use the `c8yctrl` service as the baseUrl for all requests. This is the same for E2E tests and possibly component tests, but also for microservices that require or access a Cumulocity tenant.

For Cypress E2E tests, use the cypress.config.ts file to configure the baseUrl for the tests:

```typescript
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:8181',
  },
})
```

A microservice .property file could configugure the baseUrl for `c8yctrl` be the management tenant of the Cumulocity instance you want to test against. Authentication is not required, as the microservice will take care of the authenticating.

```properties
application.name=demo-microservice
application.key=demo-microservice
C8Y.bootstrap.register=true
C8Y.bootstrap.tenant=management
C8Y.baseURL=http://localhost:8181
C8Y.bootstrap.user=servicebootstrap_testuser
C8Y.bootstrap.password=secret
C8Y.microservice.isolation=MULTI_TENANT
```

To start `c8yctrl` at least the baseUrl of the Cumulocity tenant must be provided. All other options, as for example the port the service needs to listen is optional and does come with defaults. The following command would for example start the controller on port `8181` with a given baseUrl. 

```shell
npx c8yctrl --baseUrl https://abc.eu-latest.cumulocity.com --port 8181
```

For all configuration options see the [Configuration](#configuration) section. 

### Static sources

One of the main use cases of `c8yctrl` is to serve builds of Web SDK based applications or plugins from a local folder without requiring deployment to a Cumulocity tenant. This could be useful for testing compatibility of plugin and shell in development environments or with minimal requirements in CI/CD workflows. By just serving static files, it is easily possible to setup different combinations of plugin and shell versions, again, without requiring deployment to Cumulocity IoT. 

To enable serving static files provide the path to folder representing the root of all files to be server using the `staticRoot` configuration option. `c8yctrl` will serve all files from the given folder without forwarding to baseUrl if the request path matches a file in the folder. To serve multiple plugins and even multiple shells, just copy or unzip all files of the shells and plugins to the root folder. 

A folder structure could look like this:

```
/path/to/my/root
  /app
    /plugin1
    /plugin2
    /shell1
    /shell2
```

When starting `c8yctrl` with the following command, all files from the `/path/to/my/root` folder will be served as static files and are not proxied to the configured baseUrl. 

```shell
npx c8yctrl --baseUrl https://abc.eu-latest.cumulocity.com --port 8181 --staticRoot /path/to/my/root
```

### Recording and mocking

As an intermediary service in between your tests and a Cumulocity tenant, `c8yctrl` can record and mock requests and responses. Recording of requests and responses allows to easily create a set of mocks for your tests, without creating or maintaining the mocks manually. By enabling recording mode all requests are proxied to the configured Cumulocity tenant and requests, responses as well as some metadata are stored automatically via a configurable `C8yPactFileAdapter` implementation. As a default implementation,  `C8yPactDefaultFileAdapter` stores the recordings as JSON files of `C8yPact` format in a configured folder.

To mock responses, `c8yctrl` will use the existing recordings and return the recorded response if it matches the request. If no recording is available, `c8yctrl` will return an error response or if `strictMocking` is disabled, forward the request to the configured Cumulocity tenant.

There is different ways to enable recording and mocking. When starting `c8yctrl`, use the `--recording` option with value `true` or the `C8Y_PACT_MODE` environment variable with value `recording` to enable recording of all requests and responses. 

Another option is to use the REST interface of `c8yctrl` to enable recording and mocking at runtime. This is meant to change the recording mode in between your tests and allows to run tests in your suites with different recording modes. See the [Rest Interface](#rest-interface) section for more details.

> **Note:** By default, recorded requests will be appended to the existing recording. If you want to clear the existing recordings before enabling recording mode, use the `clear` parameter in the REST interface or or remove recoded files.

## Configuration

`c8yctrl` can be configured using environment variables, command line arguments or a configuration file. Environment variables and command line arguments have the highest priority and allow configuration of options required to start the HTTP controller. This is useful for CI/CD pipelines or running the controller in a container and overwriting the configuration at runtime.

The section on [Configuration File](#configuration-file) provides details on custom TypeScript configuration file for more complex setups.

### Environment Variables

The following environment variables are currently supported:

```shell
C8Y_PACT_FOLDER=/path/to/my/recordings
C8Y_BASE_URL=https://abc.eu-latest.cumulocity.com
C8Y_BASE_USERNAME=myuser
C8Y_BASE_PASSWORD=mypassword
C8Y_BASE_TENANT=t123456
C8Y_STATIC_ROOT=/path/to/my/static/files
C8Y_HTTP_PORT=8181
C8Y_PACT_MODE=recording
```

It's recommended to use `.env` or `.c8yctrl` files to store environment variables. Both files will be automatically loaded by `c8yctrl`.

### Command Line Arguments

All environment variables can be passed as command line arguments. The following command line arguments are supported:

```shell
npx c8yctrl --folder /path/to/my/recordings \ 
            --baseUrl https://abc.eu-latest.cumulocity.com \
            --user myuser \
            --password mypassword \
            --tenant t123456 \
            --staticRoot /path/to/my/static/files \
            --port 8181 \
            --mode apply \
            --recordingMode append \
            --log true \
            --logLevel info \
            --logFile /path/to/logfile.log \
            --accessLogFile /path/to/accesslog.log \
            --apps cockpit/1.0.0 \
            --config /path/to/my/custom.config.ts
```

The following table maps command line arguments to their corresponding environment variables:

| Command Line Argument | Environment Variable       |
|-----------------------|----------------------------|
| `--folder`            | `C8Y_PACT_FOLDER`          |
| `--baseUrl`           | `C8Y_BASE_URL`             |
| `--user`              | `C8Y_BASE_USERNAME`        |
| `--password`          | `C8Y_BASE_PASSWORD`        |
| `--tenant`            | `C8Y_BASE_TENANT`          |
| `--staticRoot`        | `C8Y_STATIC_ROOT`          |
| `--port`              | `C8Y_HTTP_PORT`            |
| `--mode`              | `C8Y_PACT_MODE`            |
| `--recordingMode`     | `C8Y_PACT_RECORDING_MODE`  |
| `--log`               | `C8Y_LOG`                  |
| `--logLevel`          | `C8Y_LOG_LEVEL`            |
| `--logFile`           | `C8Y_LOG_FILE`             |
| `--accessLogFile`     | `C8Y_ACCESS_LOG_FILE`      |
| `--apps`              | `C8Y_APPS`                 |
| `--config`            | `C8Y_CONFIG`               |

### Parameters

Environment variables and command line arguments are mapped to the following configuration options:

- `baseUrl` - The base URL of the Cumulocity tenant to proxy requests to.

- `tenant` - The tenant id of the Cumulocity tenant configured in the `baseUrl`. The tenant id is required for login if the `username` and `password` are provided.

- `username` - The username to authenticate with the Cumulocity tenant.

- `password` - The password to authenticate with the Cumulocity tenant.

- `folder` - The folder where recordings are stored. By providing a folder, the controller will use `C8yPactDefaultFileAdapter` to store recordings in the given folder. Each file will be named by the given id of the recording.

- `staticRoot` - The root folder where static files are served from. The controller will always serve static files if the request path matches a file in the folder. If served from `staticRoot`, the controller will not proxy the request to the `baseUrl`.

- `port` - The port the controller listens on. The default port is `8181`.

- `mode` - The mode the controller is running in. Possible values are `apply`, `mock`, `record`, `forward`.

- `recordingMode` - The recording mode to use for recording requests and responses. Possible values are `append`, `new`, `replace`, `refresh`.

- `log` - Enable or disable logging.

- `logLevel` - The log level used for logging.

- `logFile` - The path of the logfile.

- `accessLogFile` - The path of the access logfile.

- `apps` - Array of static folder app names and semver ranges separated by '/'.

- `config` - The path to the config file.

If `username` and `password` parameters are provided, `c8yctrl` will automatically login to the configured Cumulocity tenant and pass all requests authenticated. Authentication in your tests will not be required in this case.

### Configuration File

The configuration file is a TypeScript file that exports a function with a single argument of type `Partial<C8yPactHttpControllerConfig>` containing all configuration options provided in the environment variables and command line arguments.

 > **Note:** Options from the configuration file do not override options from environment variables or command line arguments. This is by design to allow different configurations for CI/CD pipelines.

By default, `c8yctrl` looks for a file named `c8yctrl.config.ts` in the current working directory. You can specify a different configuration file using the `--config` command line argument.

```bash
npx c8yctrl --config /path/to/my/custom.config.ts
```

Sample `c8yctrl.config.ts` registering a file logger with custom log format and log level. The config argument is optional and is only required if a different config file than `c8yctrl.config.ts` is used. 

```typescript
import { C8yPactHttpControllerConfig } from 'cumulocity-cypress-ctrl';

export default (config: Partial<C8yPactHttpControllerConfig>) => {
  config.logLevel = "debug";
  config.preprocessor = new C8yDefaultPactPreprocessor({
    obfuscate: ["request.headers.Authorization", "response.body.password"],
    obfuscationPattern: "****",
  });
};
```

For more details on available configuration options, see `C8yPactHttpControllerConfig` interface.

A more complex configuration file can be found in the [contributions](./contributions) folder.

## How it works

`c8yctrl` can be considered a intermediary service or middleware that tries to serve static files from a given folder and proxies all other requests to a given Cumulocity tenant. As it is acting as a middleware, `c8yctrl` can record and mock requests based on its current configuration.

On startup, `c8yctrl` will authenticate with the Cumulocity tenant configured in `baseUrl` and `tenant` using the provided credentials. If authentication is successful, the controller will automatically add the `Authorization` header or cookies to all requests proxied to the `baseUrl`. If no authentication is provided, the client must login, for example using `cy.login()` as part of the test.

When receiving a request, `c8yctrl` will check if the request path matches a file in the `staticRoot` folder. If a file is found, the controller will serve the file and not proxy the request to the `baseUrl`. If no file is found, the controller will proxy the request to the `baseUrl`.

## Rest Interface

`c8yctrl` provides a REST interface to configure the HTTP controller at runtime. The interface is available via `/c8yctrl` and provides the following endpoints.

### POST /c8yctrl/current

The `/c8yctrl/current` endpoint allows creating a new recording for a given id or title. The endpoint accepts a JSON body or query parameters with the following properties:

```json
{
  "title": "Test case title",
  "mode": "apply",
  "recordingMode": "append",
  "clear": true,
  "strictMocking": true
}
```

#### Parameters

- `title` - The title of the test case being recorded. An `id` is generated from the title and used to store the recording. Might be an array of strings representing the suite hierarchy and test case title.
- `mode` - The mode the controller is running in. Possible values are `apply`, `mock`, `record`, `forward`.
- `recordingMode` - The recording mode to use for recording requests and responses. Possible values are `append`, `new`, `replace`, `refresh`.
- `clear` - If set to `true`, the controller will clear the existing recording before recording new following requests.
- `strictMocking` - If set to `true`, the controller will send an `errorResponseRecord` if no recording is available to mock the response. If set to `false`, the controller will forward the request to `baseUrl` (without recording the response).

### GET /c8yctrl/current

Gets the current `C8yPact` including its configuration (`C8yPactInfo`) and number of recorded requests.

### DELETE /c8yctrl/current

Resets the current `C8yPact`. This will however not delete any data!

### POST /c8yctrl/current/clear

Clears the current `C8yPact` records. This will not delete the pact itself.

### GET /c8yctrl/current/request?

Returns an object with the provided keys per request from the current pact. Supports special key `size` to get the size in byte of a request body.

Useful to retrieve for example urls of requests without getting all pact data. 

### GET /c8yctrl/current/response?

Returns an object with the provided keys per response from the current pact. Supports special key `size` to get the size in byte of a response body.

### GET /c8yctrl/log

Gets the current log level of the controller.

### POST /c8yctrl/log

Sends a log message to the controller. The log message is forwarded to the logger registered in the controller. The body of the request should be a JSON object with the following properties:

```json
{
  "level": "info",
  "message": "This is a log message"
}
```

### PUT /c8yctrl/log

Update logger configuration. Supports config parameters via body or query.

```json
{
  "level": "debug",
}
```

The body of the request should be a JSON object. Only property currently supported is `level`. Possible values are `debug`, `info`, `warn`, `error`.

### Using c8yctrl with cumulocity-cypress

### From Cypress tests

To use `c8yctrl` from Cypress tests without or an older version of  `cumulocity-cypress`, it is needed to configure `c8yctrl` directly using its REST interface. 

The following example creates new recordings for each test case and suite. The title of the recording is the test case title including all suite names in its hierarchy. Without recording suites, requests in `before()` hooks might not be recorded or assigned to the wrong test case. The global `before()` hook must be ha

For recording of global or suite hooks, such as `before()`, use the global `before()` hook to create a new recording with a custom title and 


it is important to also create a recording for the global `before()` hook to ensure that requests in the global hook are recorded. 


```typescript
before(() => {
  // required if requests need to be recorded in global before () hook
  cy.wrap(c8yctrl('global before hook')).then((response: Response) => {
    // run requests from here as for example
    cy.getAuth('admin').getCurrentTenant();
  });

  // create recording for all suite start events. without, requests might be
  // recorded for the previous (currently active) test case.
  // this will ensure for every suite start a new recording is created
  const runner = Cypress.mocha.getRunner();
  runner.on('suite', (suite) => c8yctrl(getSuiteTitles(suite)));
});

// create recording for each test. name for the recording will be the test title
// including all suites it its hierarchy
beforeEach(() => {
  cy.wrap(c8yctrl(), { log: false });
});

function getSuiteTitles(suite) {
  if (suite.parent && !_.isEmpty(suite.parent.title)) {
    return [...getSuiteTitles(suite.parent), suite.title];
  } else {
    return [suite.title];
  }
}

// sample wrapper for c8yctrl REST interface. extend as needed.
function c8yctrl(title: string | string[] = Cypress.currentTest.titlePath) {
  const recording = Cypress.env('C8Y_PACT_MODE') === 'recording';
  const parameter: string = recording ? '?recording=true&clear' : '?recording=false';

  return (cy.state('window') as Cypress.AUTWindow).fetch(
    `${Cypress.config().baseUrl}/c8yctrl/current${parameter}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
      }),
    }
  );
}
```

### For microservices

tbd