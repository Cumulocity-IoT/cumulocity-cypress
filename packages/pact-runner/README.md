# Runner for pact tests

This package provides a runner for pact recording files created with cumulocity-cypress. Use this package to run tests from the recorded pact files or create a docker container to run the tests. When running the tests, the runner will create a Cypress test for each pact file and run the requests in the pact file against the specified Cumulocity tenant.

# Content
<!-- set markdown.extension.toc.levels 2..6 - level 1 is ignored in auto generated toc -->
- [Installation](#installation)
- [Running locally](#running-locally)
- [Running in a docker container](#running-in-a-docker-container)
- [Development builds of cumulocity-cypress](#development-builds-of-cumulocity-cypress)
- [Configuration](#configuration)

## Installation

To install, run the following command:

```bash
npm install
```

This will install latest public version of `cumulocity-cypress` and its dependencies, such as `cypress`.

## Running locally

To run the pact recordings, you need to have a Cumulocity tenant and a user with the required permissions for the recorded requests. You can specify the tenant and user credentials in the `cypress.env.json` file. The `cypress.env.json.env` file should contain the following env variables:

```json
{
  "baseUrl": "https://mytenant.c8y.io",
  "pactFolder": "/path/to/pact/files",
  "C8Y_USERNAME": "myUsername",
  "C8Y_PASSWORD": "myPassword",
}
```

With this, you can open or run the recorded pacts using Cypress with the following command:

```bash
npm run cypress
```
or 
```bash
npm run cypress:open
```

## Running in a docker container

To run the tests in a docker container, you need to build the docker image and run the container. The docker image is based on the `cypress/base` image and contains all necessary dependencies. To build the docker image, run the following command:

```bash
npm run package
npm run docker
```

This will build the docker image with the name `c8ypact-runner`. 

To run the tests in the docker container, run the following command:

```bash
./pactrunner /path/to/pact/files cypress.env.json
```

The first argument is the path to the directory containing the pact files. The second argument is the path to the `cypress.env.json` file. Using the `cypress.env.json` file, you can pass configuration, including the Cumulocity tenant and user credentials.

## Development builds of cumulocity-cypress

To use a development build of cumulocity-cypress, you can run the following command in the root of `cumulocity-cypress` repository:

```bash
npm run yalc:publish
```

You might need to install `yalc` globally:

```bash
npm install -g yalc
```

This will publish the development build of `cumulocity-cypress` to your local `yalc` repository. You can then install the development build in the `pact-runner` package and install in the docker container:

```bash
npm run package:dev
npm run docker:dev
```

## Configuration

The runner uses the following environment variables:

General
- `C8Y_PACT_RUNNER_BASEURL`: The base URL of the Cumulocity tenant.
- `C8Y_PACT_RUNNER_FOLDER`: The path to the directory containing the pact files.
- `C8Y_PACT_RUNNER_AUTH`: Overwrites the auth type for the requests. Possible values are `BasicAuth` and `CookieAuth`.

Authentication
- `C8Y_TENANT`: The tenant used to authenticate against the Cumulocity tenant. Used for `CookieAuth`.
- `C8Y_USERNAME`: The username used to authenticate against the Cumulocity tenant.
- `C8Y_PASSWORD`: The password used to authenticate against the Cumulocity tenant.

Filtering
- `C8Y_PACT_RUNNER_METHODS`: A comma-separated list of HTTP methods to filter the requests. 
- `C8Y_PACT_RUNNER_TAGS`: A comma-separated list of tags to filter the requests. 
- `C8Y_PACT_RUNNER_PATHS`: A comma-separated list of paths to filter the requests. 

All filters are optional. If filters are not set, all requests are executed.

Example:
```json
{
  "C8Y_PACT_RUNNER_BASEURL": "https://mytenant.c8y.io",
  "C8Y_PACT_RUNNER_FOLDER": "/path/to/pact/files",
  "C8Y_USERNAME": "myUsername",
  "C8Y_PASSWORD": "myPassword",
  "C8Y_PACT_RUNNER_METHODS": "GET,POST",
  "C8Y_PACT_RUNNER_TAGS": "tag1,tag2",
  "C8Y_PACT_RUNNER_PATHS": "/inventory/managedObjects,/alarm/alarms"
}
```
