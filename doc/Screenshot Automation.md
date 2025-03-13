# Screenshot Automation 

With the `c8yscrn` command, `cumulocity-cypress` provides a tool to automate taking screenshots of your Cumulocity IoT applications as part of your test suite or CI/CD workflows. This document explains how to install and use the tool, its command-line options, configuration file structure, and integration with existing Cypress projects.

Built on top of [Cypress](https://www.cypress.io/), `c8yscrn` comes with all [screenshot capabilities](https://docs.cypress.io/api/commands/screenshot) provided by Cypress wrapped into a yaml workflow definition, without writing Cypress tests or Cypress know-how.

Summary of capabilities:
* Configuration of screenshot workflows in yaml format
* Actions to apply before taking screenshots (click, type, highlight, wait, etc.)
* Screenshots of the entire viewport, specific DOM elements, or custom-defined areas
* Login, language and date/time settings per screenshot workflow
* Configuration of viewport size, image padding and scaling, timeouts, and more
* Diffing of screenshots and diff image generation
* Tagging of screenshots and version requirements for filtering and grouping
* Standalone and integrated modes to run without or within existing Cypress projects
* Supported browsers (Chrome, Firefox, Electron)
* YAML validation and auto-completion for IDEs, e.g., Visual Studio Code
* Init command to create a default configuration file
* Environment variables for configuration settings via `.env` files

The yaml based screenshot workflows typically begin with a visit of a specific URL in the Cumulocity application, followed by a series of actions such as clicking buttons, typing text, or highlighting elements. After these interactions, the tool captures screenshots, which can be of the entire viewport, specific DOM elements, or custom-defined areas of the page.

Example of a screenshot workflow:
```yaml
global:
  language: en
  user: admin

screenshots:
  - image: /images/example
    visit: "/apps/example/index.html#/"
    actions:
      - type: 
        selector: "#search"
        value: "Test Input"
      - highlight:
        - selector: .c8y-right-drawer__header > .d-flex
          styles:
            outline: dashed
            "outline-offset": "+3px"
            "outline-color": "red"
        - selector: "#main-content"
          border: 2px solid green
      - click:
          selector: 
            data-cy: right-drawer-toggle-button
```

The example workflow creates a single screenshot. For the screenshot it first visits a specific URL in the Cumulocity "example" application, types text into a search field, highlights two elements on the page, and clicks a button. At the end of the workflow, `c8yscrn` automatically captures a screenshot of the page and stores it in the location defined by the root image property.

Contents of this document:
- [Installation and Usage](#installation-and-usage)
  - [For Standalone Users](#for-standalone-users)
    - [Installation](#installation)
    - [Command Line Options](#command-line-options)
    - [Logging](#logging)
  - [Integrate in to existing Cypress Projects](#integrate-in-to-existing-cypress-projects)
    - [Installation](#installation-1)
    - [Configuration](#configuration)
    - [Add a Test File for Screenshot workflow](#add-a-test-file-for-screenshot-workflow)
    - [Custom Commands](#custom-commands)
- [Environment Variables](#environment-variables)
- [Authentication](#authentication)
- [Selectors](#selectors)
- [Diffing](#diffing)
- [Tags](#tags)
- [Version Requirements](#version-requirements)
- [Worlflow File](#worlflow-file)
  - [Top-Level Configuration](#top-level-configuration)
  - [Global Settings](#global-settings)
  - [Screenshot Configuration](#screenshot-configuration)
  - [Actions](#actions)
  - [Examples](#examples)
    - [Minimal Example](#minimal-example)
    - [Complex Example](#complex-example)
- [Disclaimer](#disclaimer)

## Installation and Usage

The screenshot automation provided by `cumulocity-cypress` can be used standalone or within an existing Cypress project. The installation and usage differs slightly between these two usage scenarios.

### For Standalone Users

#### Installation

Install `cumulocity-cypress` globally and run the `c8yscrn` command from the command line:

```bash
npm install -g cumulocity-cypress

npx c8yscrn init
npx c8yscrn run --baseUrl http://localhost:8080
```

By default, it will look for a configuration file named `c8yscrn.config.yaml` in the current directory.

#### Command Line Options

`c8yscrn` supports the following commands:

```
Usage: c8yscrn [options]

Commands:
  c8yscrn run   Run workflows in headless mode
  c8yscrn open  Run workflows in Cypress open mode
  c8yscrn init  Initialize and create a new config file

Options:
  --version  Show version number                                                           [boolean]
  --help     Show help                                                                     [boolean]
```

To run the screenshot automation in headless mode, use the `run` command. The following options are supported:

```
c8yscrn run

Run workflows in headless mode

Options:
      --version        Show version number                                                 [boolean]
      --help           Show help                                                           [boolean]
  -c, --config         The yaml config file                [string] [default: "c8yscrn.config.yaml"]
  -u, --baseUrl        The Cumulocity base url                                              [string]
  -f, --folder         The target folder for the screenshots                                [string]
  -e, --failureFolder  The target folder for failure screenshots                            [string]
      --skipFailure    Disable failure screenshots                        [boolean] [default: false]
      --clear          Clear the target folder and remove all data        [boolean] [default: false]
  -b, --browser        Browser to use                                   [string] [default: "chrome"]
      --diff           Enable image diffing                               [boolean] [default: false]
      --diffFolder     Optional target folder for the diff images                           [string]
      --diffSkip       Skip screenshots without difference                 [boolean] [default: true]
  -h, --highlight      Enable or disable highlights in screenshots         [boolean] [default: true]
  -t, --tags           Run only screenshot workflows with the given tags                     [array]
```

When using `open` instead of `run`, the Cypress test runner will open in Cypress application. This can be useful for debugging and developing new screenshot workflows.

To get started, run the `init` command to create a new configuration file. This is important to create the config file including the correct location of the schema used for code completion and validation in VSC.

```bash
npx c8yscrn init
```

Init command supports the following options:

```
c8yscrn init

Initialize and create a new config file

Options:
  -c, --config   The yaml config file                      [string] [default: "c8yscrn.config.yaml"]
  -u, --baseUrl  The Cumulocity base url                                                    [string]
```

#### Logging

Logging can be enabled using the `DEBUG` environment variable. 

```
DEBUG=c8y:scrn:* npx c8yscrn run
```

or 

```
DEBUG=c8y:scrn:run npx c8yscrn run
```

The following logger are currently available:
* `c8y:scrn:config`
* `c8y:scrn:env`
* `c8y:scrn:startup`
* `c8y:scrn:plugin`
* `c8y:scrn:run`
* `c8y:scrn:run:screenshot`
* `c8y:scrn:run:fileupload`

### Integrate in to existing Cypress Projects

You can also integrate the screenshot automation into an existing Cypress project. This allows you to run the screenshot workflows alongside your existing Cypress tests or your custom Cypress based automation for taking screenshots. Use for example if you have more complex workflows that are easier to maintain in Cypress tests, but still have screenshots that can be easily automated with `c8yscrn` based workflows.

`cumulocity-cypress` also provides some capabilities to help you integrate the screenshot automation into your existing Cypress project. This includes custom commands, such as `cy.highlight`. See the [Custom Commands](#custom-commands) section for more details.

#### Installation

Install `cumulocity-cypress` in your Cypress project:

```bash
npm install --save-dev cumulocity-cypress
```

#### Configuration

Update your `cypress.config.ts` file to load the plugin required to configure the screenshot automation:

```typescript
import { defineConfig } from "cypress";
import { configureC8yScreenshotPlugin } from "cumulocity-cypress/plugin";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:8080",
    screenshotsFolder: "screenshots",
    setupNodeEvents(on, config) {
      configureC8yScreenshotPlugin(on, config);
      return config;
    },
  },
});
```

The `configureC8yScreenshotPlugin` function sets up the necessary event handlers and configurations for the `C8yScreenshotRunner` to work within your Cypress project. It enables features like:

- Loading and parsing the YAML configuration file
- Setting up custom commands for screenshot actions
- Configuring Cypress to handle the custom screenshot workflows

By default, the plugin looks for a configuration file named `c8yscrn.config.yaml` in the root of your project. You can customize the configuration file path by passing the name of the config file as an argument to the `configureC8yScreenshotPlugin` function:

```typescript
try {
  configureC8yScreenshotPlugin(on, config, "my-screenshot-config.yaml");
} catch (error: any) {
  throw new Error(`Error reading config file. ${error.message}`);
}
configureC8yScreenshotPlugin(on, config, "my-screenshot-config.yaml");
```

As an alternative you can also read the yaml configuration in `cypress.config.ts` and pass it to the plugin:

```typescript
import { loadConfigFile } from "cumulocity-cypress/plugin";

// read and validate the yaml configuration file
const myYamlConfig: ScreenshotSetup = loadConfigFile("my-screenshot-config.yaml");
configureC8yScreenshotPlugin(on, config, myYamlConfig);
```

#### Add a Test File for Screenshot workflow

Create a new file, e.g. `screenshot.cy.ts`, in your Cypress project folder to host `C8yScreenshotRunner`:

```typescript
import { C8yScreenshotRunner } from "cumulocity-cypress/screenshot";

describe('My Custom Screenshot Automation', () => {
  const runner = new C8yScreenshotRunner();
  runner.run();
});
```

When integrating into an existing Cypress project, you'll use the `C8yScreenshotRunner` in your test files. See the "Using C8yScreenshotRunner in Your Project" section for details.

#### Custom Commands

The following custom commands can be helpful when writing your own Cypress tests for automating screenshots:

**cy.highlight**

With `cy.highlight`, you can highlight elements on the page. This can be useful for drawing attention to specific parts of the UI in documentation screenshots. It allows highlighting single or multiple elements and takes CSS styles as options. 

```typescript
cy.get(".bottom-drawer .card-footer .btn-primary").highlight();
```

This example highlights the primary button in the footer of a card in the bottom drawer by applying the default highlight style. The default style is a solid orange border with a width of 2px defined as `C8yHighlightStyleDefaults`.

You can also customize the highlight style by passing an object with CSS properties to the `highlight` command:

```typescript
cy.get(".bottom-drawer .card-footer .btn-primary").highlight(
  { "background-color: yellow", "outline: dashed", "outline-offset: +3px" },
);
```

Using `cy.clearHighlights`, you can remove all previously applied highlights from the page. This is useful for workflows that take more than one screenshot.

For more information see the js doc for `cy.highlight`, `cy.clearHighlights` and `C8yHighlightStyleDefaults`.

**cy.screenshot**

By importing `cumulocity-cypress/commands/screenshot`, a custom implementation of the `cy.screenshot` command is provided. This allows you to take screenshots of multiple DOM elements. For screenshots of single DOM elements or the viewport, the default Cypress implementation is be used.

When taking screenshots of multiple DOM elements, the union rect of all elements is calculated and a screenshot is taken of the bounding box. This can be useful for capturing complex UI components that span multiple elements. By applying padding to the elements, you can expand the captured area around the specified elements.

```typescript
import "cumulocity-cypress/commands/screenshot";

cy.get(".bottom-drawer .card-footer .btn, ").screenshot({ padding: [10, 20]});
```

## Environment Variables

Environment variables can be used to overwrite configuration settings in the `c8yscrn.config.yaml` file. This can be useful for setting sensitive information like usernames and passwords, or for providing values for CI/CD environments.

The following environment variables are supported:
- `C8Y_BASEURL`: The base URL of the Cumulocity instance.
- `C8Y_TENANT`: The tenant id used for authentication. Will be determined from the base URL if not provided.
- `C8Y_USERNAME`: The username to use for authentication.
- `C8Y_PASSWORD`: The password to use for authentication.
- `C8Y_BROWSER`: The browser to use for running the screenshot workflows ("chrome", "firefox" or "electron").
- `C8Y_SHELL_VERSION`: The version of the shell application to validate `requires` version dependencies.
- `C8Y_SHELL_NAME`: The name of the shell application to use for determining the shell version (default is "cockpit").
- `C8Y_BROWSER_LAUNCH_ARGS`: Additional arguments to pass to the browser when launching.
- `C8Y_CHROME_LAUNCH_ARGS`: Additional arguments to pass to the Chrome browser when launching.
- `C8Y_FIREFOX_LAUNCH_ARGS`: Additional arguments to pass to the Firefox browser when launching.
- `C8Y_ELECTRON_LAUNCH_ARGS`: Additional arguments to pass to the Electron browser when launching.
- `C8Y_DISABLE_WEBSOCKET`: Disable websocket to reload changed screenshot worklow configuration.

To use different credentials in your workflows, see the [Authentication](#authentication) section for more details.

When using `c8yscrn` standalone, you can configure environment variables in a `.env` file or `.c8yscrn` file in the current working directory. This files should contain key-value pairs in the format `KEY=VALUE`.

When using the screenshot automation in an existing Cypress project, you can set environment variables in your `cypress.env.json` file or via the command line using the `--env` option. For more details see the [Cypress environment variables documentation](https://docs.cypress.io/guides/guides/environment-variables).

## Authentication

To authenticate with Cumulocity, you can 
- use `C8Y_USERNAME` and `C8Y_PASSWORD` environment variables
- set the `login` property in the `global` object of your configuration file
- set the `login` property of the `visit` object (overrides global setting)

The `login` property refers to an alias that is used to look up the actual user ID and password from the `*login*_username` and `*login*_password` environment variables. 

```yaml
global:
  login: admin
```

Define `admin` alias in `.c8yscrn` file:
```properties
admin_username: myusername
admin_password: mypassword
```

Define `admin` alias in `cypress.env.json` file:
```json
{
  "admin_username": "myusername",
  "admin_password": "mypassword"
}
```

By providing `false` to login property, you can explicitely disable the login action for a specific screenshot workflow. The following example disables the login action for the dashboard screenshot overwriting the global setting and resulting in a redirect to the login page.

```yaml
screenshots:
  - image: /images/dashboard
    visit: "/apps/cockpit/index.html#/"
    login: false
```

If not providing any authentication information, the visit action will be performed unauthenticated.

> **Note:**
> If all screenshot workflows use the same user for authentication, you can also use `C8Y_USERNAME` and `C8Y_PASSWORD` environment variables instead of defining a user alias.

## Selectors

A (CSS) selector is used to identify one or multiple DOM elements and is specified in the yaml configuration as string or object. While the string represents a CSS selector, the selector object currently only provides a convenience wrapper for Cypress's `data-cy` selectors. Selectors are required for actions like clicking, typing, highlighting, and waiting.

See [Understanding Selectors in Frontend Development and Cypress Testing](https://www.cypress.io/blog/understanding-selectors-in-testing) for more information on selectors and how they are used in Cypress.

Examples of selectors:
```yaml
- click:
  selector: .c8y-right-drawer__header > .d-flex
- wait:
  selector: "#main-content"
- click:
  selector:
    data-cy: right-drawer-toggle-button
```

Please note, a selector can match multiple elements. In this case, all elements will be affected by the action. If you want to target a specific element, make sure the selector returns a the target DOM element and not an array of elements. You might want to use `:first` or `:nth-child` to target a specific element.

To keep your selectors consistent and maintainable, consider using `data-cy` attributes for your tests. This allows you to target elements without relying on the structure or class names of your application. 

Another option to keep your workflow readably and maintainable is to use the definition of shared selectors in the global settings of your configuration file. Follow whatever naming convention you prefer, e.g., `rightDrawerHeader`, `treeview.collapse.first`, `treeview.collapse.first.checkbox`. `selectors` can be defined as a single object or an array of objects to help keep your configuration file even more organized and readable.

```yaml
selectors:
  rightDrawerHeader: .c8y-right-drawer__header > .d-flex
  treeview.collapse.first: ".c8y-tree-view-node .collapse-btn:first"
  treeview.collapse.first.checkbox: "c8y-tree-view-node:has(.collapse-btn:visible:first) .c8y-checkbox:first"
```

or 

```yaml
selectors:
  - rightDrawerHeader: .c8y-right-drawer__header > .d-flex
  - treeview.collapse.first: ".c8y-tree-view-node .collapse-btn:first"
  - treeview.collapse.first.checkbox: "c8y-tree-view-node:has(.collapse-btn:visible:first) .c8y-checkbox:first"
```

The names can be used for any `selector` property in the screenshot configuration:

```yaml
- click:
  selector: rightDrawerHeader
```

## Diffing

When diffing is enabled, `c8yscrn` compares the new screenshots with the existing ones in the target folder and generates diff images that highlight the differences. Please note, diffing might only work as expected when overwriting existing screenshots. If there is no screenshot at the target location, diffing obviously won't work.

The diff images can be stored in a separate folder, which can be configured using the `--diffFolder` option. If no folder is specified, the diff images will be stored in the same folder as the screenshot. By using the `--diffSkip` option, you can skip screenshots that don't have any differences. This can be useful when automatically running the screenshot workflows in CI/CD pipelines and possibly only processing the screenshots with differences (e.g. for a git commit and pull request).

To configure diffing options, use the `global.diff` property in the configuration file:

```yaml
global:
  diff:
    antialiasing: true
    threshold: 0.1
    diffColor: "#ff00ff"
    ignoreRegions:
      - x1: 0
        x2: 0
        y1: 100
        y2: 100
    outputDiffMask: true
```

See [odiff](https://github.com/dmtrKovalenko/odiff) documentation for more information on the available options.

## Tags

Tags are used to group and filter screenshot workflows. They can be defined globally or per screenshot. 

Tags are useful for organizing and categorizing screenshots, e.g., by functionality, feature, or test type. When running the `c8yscrn` command, you can specify tags to filter which screenshots to run.

```bash
npx c8yscrn --tags "dashboard, regression"
```

## Version Requirements

Version requirements allow you to specify the minimum version of the (shell) application required to run a screenshot workflow. This is required if a screenshot workflow needs to run against different versions of an application. If the (shell) application doesn't fulfill this requirement, the screenshot workflow will be skipped. 

To configure the application or plugin, use the `shell` property in the global settings or the specific screenshot configuration. The default shell application is `cockpit`. 

The `requires` property should be a [semver range](https://devhints.io/semver) that the application version must satisfy.

```yaml
global:
  shell: "myexampleapp"
  requires: ">=1019.0.0"

screenshots:
- image: /images/example
  requires: ">=1020.0.0"
```

## Worlflow File

The configuration file (`c8yscrn.config.yaml`) is the heart of your screenshot automation. It defines global settings and individual screenshot workflows. Here's a detailed explanation of its structure and properties:

```yaml
global:
  viewportWidth: 1440
  viewportHeight: 900
  language: en
  user: admin
  shell: "cockpit"
  requires: "1020"
  tags: 
    - export

screenshots:
  - image: /images/example1
    visit: "/apps/cockpit/index.html#/"
    tags: 
      - "dashboard"

  - image: /images/example2
    requires: ">=1019.0.0"
    visit:
      url: "/apps/cockpit/index.html#/"
    actions:
      - screenshot:          
          clip:
            x: 100
            y: 100
            width: -100
            height: -250

  # More screenshot configurations...
```

This section provides a detailed explanation of all available settings in the `c8yscrn.config.yaml` file. Each setting is described with its purpose, type, default value (if applicable), and any additional relevant information.

### Top-Level Configuration

```yaml
baseUrl: string
title: string
global: object
screenshots: array
```

**baseUrl**
- **Type**: string
- **Description**: The base URL used for all relative requests in your screenshot workflows. This value can be also passed and overwritten using the `--baseUrl` command-line option or the `C8Y_BASE_URL` env variable.
- **Example**: `https://your-cumulocity-tenant.com`

**title**
- **Type**: string
- **Description**: The title used for the root group of screenshot workflows. This can be useful for organizing and identifying your screenshot sets within existing Cypress projects.
- **Example**: `"Automated Screenshots"`

**global**
- **Type**: object
- **Description**: Global settings applied to all screenshots. These can be overridden by individual screenshot configurations. See the [Global Settings](#global-settings) section for details.

**screenshots**
- **Type**: array
- **Description**: An array of screenshot configurations. Each item in this array describes a single screenshot workflow. See the [Screenshot Configuration](#screenshot-configuration) section for details.
- **Required**: Yes

### Global Settings

The `global` object can contain the following properties:

```yaml
global:
  viewportWidth: number
  viewportHeight: number
  language: string
  user: string
  shell: string
  requires: string
  tags: array
  capture: string
  padding: number
  scale: boolean
  overwrite: boolean
  disableTimersAndAnimations: boolean
  timeouts:
    default: number
    pageLoad: number
    screenshot: number
  date: string
  visitWaitSelector: string
  highlightStyle: object
  diff: object
```

**viewportWidth**
- **Type**: number
- **Default**: 1440
- **Description**: The width of the browser viewport in pixels and with this the width of the screenshot image. This corresponds to Cypress's `viewportWidth` configuration. 
- **Example**: `1280`

**viewportHeight**
- **Type**: number
- **Default**: 900
- **Description**: The height of the browser viewport in pixels and with this the height of the screenshot image. This corresponds to Cypress's `viewportHeight` configuration.
- **Example**: `720`

**language**
- **Type**: string
- **Description**: The language to use when loading the Cumulocity application. This can be useful for capturing screenshots in different locales. Default language is `en`.
- **Example**: `"en"` or `"de"`

**login**
- **Type**: string | false
- **Description**: The alias referencing the username and password to login. Configure the username and password using *login*_username and *login*_password env variables. If set to false, login is disabled and visit is performed unauthenticated. See the [Authentication](#authentication) section for more details.
- **Example**: `"admin"` or `false`

**shell**
- **Type**: string
- **Description**: Specifies the shell application. This is used to determine the version of the application for the `requires` setting. See the [Version Requirements](#version-requirements) section for more details.
- **Examples**: `"cockpit"`, `"devicemanagement"`, `"oee"`

**requires**
- **Type**: string
- **Format**: semver-range
- **Description**: Requires the shell application to have a version in the given range. If the shell version doesn't fulfill this requirement, the screenshot workflow will be skipped. See the [Version Requirements](#version-requirements) section for more details.
- **Examples**: `"1.x"`, `"^1.0.0"`, `">=1.0.0 <2.0.0"`

**tags**
- **Type**: array of strings
- **Description**: Tags allow grouping and filtering of screenshots. These global tags are applied to all screenshots. See the [Tags](#tags) section for more details.
- **Example**: `["documentation", "regression"]`

**capture**
- **Type**: string
- **Allowed Values**: `"viewport"` or `"fullPage"`
- **Default**: `"viewport"`
- **Description**: Determines how the screenshot is captured. `"viewport"` captures only the visible area, while `"fullPage"` captures the entire scrollable page.
- **Note**: This setting is ignored for screenshots of DOM elements.

**padding**
- **Type**: number
- **Description**: The padding in pixels used to alter the dimensions of an element screenshot. This expands the captured area around the specified element.
- **Example**: `10`

**scale**
- **Type**: boolean
- **Default**: false
- **Description**: Whether to scale the application to fit into the browser viewport. This can be useful for responsive design testing.

**overwrite**
- **Type**: boolean
- **Default**: true
- **Description**: When true, existing screenshots will be overwritten. Otherwise, Cypress appends a counter to the file name to avoid overwriting.

**disableTimersAndAnimations**
- **Type**: boolean
- **Default**: true
- **Description**: When true, prevents JavaScript timers and CSS animations from running while the screenshot is taken. This can help ensure consistency in screenshots.

**timeouts**
- **Type**: object
- **Description**: Custom timeout settings for various operations.

**timeouts.default**
- **Type**: number
- **Default**: 4000
- **Description**: The time, in milliseconds, to wait until most DOM-based commands are considered timed out.

**timeouts.pageLoad**
- **Type**: number
- **Default**: 60000
- **Description**: The time, in milliseconds, to wait for the page to load. This is used for visit actions.

**timeouts.screenshot**
- **Type**: number
- **Default**: 30000
- **Description**: The time, in milliseconds, to wait for a screenshot to be taken.

**date**
- **Type**: string
- **Format**: date-time (e.g., "2024-09-26T19:17:35+02:00")
- **Description**: The date to simulate when running the screenshot workflows. This can be useful for capturing screenshots of date-dependent UI elements.

**visitWaitSelector**
- **Type**: string
- **Default**: "c8y-drawer-outlet c8y-app-icon .c8y-icon"
- **Description**: The default selector to wait for when visiting an URL. Use to overwrite internal default selector.

**highlightStyle**
- **Type**: object
- **Default**: `{ "outline": "2px", "outline-style": "solid", "outline-offset": "-2px", "outline-color": "#FF9300" }`
- **Description**: Custom styles for the highlight action. This can be used to change the appearance of highlighted elements and override the default styles.

**diff**
- **Type**: object
- **Description**: Configuration for image diffing. See the [Diffing](#diffing) section for more details.

Some of this options correspond directly to Cypress's screenshot command options. For more detailed information, refer to the [Cypress screenshot documentation](https://docs.cypress.io/api/commands/screenshot).

### Screenshot Configuration

Each `image` in the `screenshots` array represents a single workflow that could create one or more screenshots for a given url. 

```yaml
screenshots:
  - image: string
    visit: string or object
    tags: array
    requires: string
    actions: array
    only: boolean
    skip: boolean
    settings: object
```

**image**
- **Type**: string
- **Required**: Yes
- **Description**: The path where the screenshot will be saved, relative to the screenshots folder.
- **Example**: `"/images/dashboard.png"`

**visit**
- **Type**: string or object
- **Required**: Yes
- **Description**: The URL to visit before taking the screenshot. Can be a simple string or an object with additional options.

```yaml
visit: "/apps/cockpit/index.html#/"
```

**visit properties**
- **url**: (Required) The URL to visit.
- **language**: (Optional) Override the global language setting.
- **user**: (Optional) Override the global user setting.
- **timeout**: (Optional) Set a custom timeout for the page load.
- **selector**: (Optional) Wait for a specific element to be visible before proceeding.

```yaml
visit:
  url: "/apps/cockpit/index.html#/"
  language: "de"
  user: "admin"
  timeout: 30000
  selector: "#main-content"
```

**tags**
- **Type**: array of strings
- **Description**: Tags specific to this screenshot. These are combined with global tags.

**requires**
- **Type**: string
- **Format**: semver-range
- **Description**: Version requirement specific to this screenshot. Overrides the global `requires` setting.

**actions**
- **Type**: array of action objects
- **Description**: An array of actions to perform before taking the screenshot. See the [Actions](#actions) section for details on available actions.

**only**
- **Type**: boolean
- **Description**: When true, only this screenshot workflow will be run. Useful for debugging or focusing on a specific screenshot.

**skip**
- **Type**: boolean
- **Description**: When true, this screenshot workflow will be skipped.

**additional settings**
- **Description**: Screenshot-specific settings that override global settings. Can include any of the properties from the [global settings](#global-settings).

### Actions

Actions allow you to interact with the page before taking a screenshot. Available actions include:

**click**
```yaml
- click:
    selector: string or object
    multiple: boolean
    force: boolean
```
Clicks on the specified element. Use the `multiple` option to click on all matching elements, and the `force` option to bypass the element's visibility check. `force` is enabled by default.

**type**
```yaml
- type:
    selector: string or object
    value: string or string[] or string[][]
    clear: boolean
    submit: string or object
```

Types the specified value into the selected input field. If the `clear` option is set to true, the input field will be cleared before typing the new value. If the `value` is an array, the values will be typed in sequence into the text input fields with the selector.

```yaml
- type:
    selector: "#search"
    value: "Test Search"
- type:
    selector: ".split-view__detail"
    value:
      - "Windmill"
      - "Turns wind into energy"
- type:
    selector: ".split-view__detail"
    value: ["Windmill", "Turns wind into energy"]
    clear: true
```

The array of values might have more elements than the number of text input fields with the selector. In this case, the remaining values are ignored.

For multistep forms, the `value` can be configured an array of array, with each item in the array containing the values for `input[type="text"]` entry fields. The entry fields will be filled in order. At the end of the form(groupd), the `submit` selector is triggered to continue to the next step of the multistep form. Values are filled automatically as long as there are items in the `value` array.

```yaml
- type:
    selector: "c8y-form-group"
    value:
      - ["ABC", "DEF", "GHI"],
      - ["ABC", "DEF", "GHI", "JKL"],
      - ["ABC", "DEF"],
    submit: "[data-cy=continue-button]"
```

In the example, the `c8y-form-group` is a multistep form with 3 steps. Each step is continued by triggering the `submit` selector.

> **Note:**
> Only type `text` input fields are supported. Only fields within the selector of the type action are used.

**highlight**
```yaml
- highlight:
    selector: string or object
    border: string or object
    styles: object
    width: number
    height: number
    clear: boolean
```

Highlights the specified element. Useful for drawing attention to specific parts of the UI in documentation screenshots. `border` is a shorthand for setting the border style, and `styles` allows for more advanced styling. Values can be any valid CSS border or style property.

Highlighting works differently depending if the selector returns one or multiple elements. If the selector returns a single DOM element, the style or border is applied directly to the element. In case selector returns multiple elements, the surrounding bounding box for all elements is calculated and the style is applied to a new element that is created to represent the bounding box. Make sure animations are finished before highlighting multiple elements as positions are calculated based on the current state of the elements.

```yaml
- selector: .c8y-right-drawer__header > .d-flex
  styles:
    outline: dashed
    "outline-offset": "+3px"
    "outline-color": "red"
- selector: "#main-content"
  border: 2px solid green
```

By using `clear`, all previously highlighted changes will be reverted before adding the new highlight. This is useful for workflows taking more than just one screenshot.

**fileUpload**
```yaml
- fileUpload: string or object
    selector: string or object
    file: string
    fileName: string
    encoding: binary or utf8 or utf-8
    subjectType: input or drag-n-drop
    force: boolean
```

Uploads a file to the specified input field. The `file` property should be the path to the file to upload. Use `encoding` to specify the file encoding, and `subjectType` to choose between input or drag-and-drop file upload. The `force` option can be used to bypass the element's visibility check.

If no selector is provided, the file will be uploaded to the first file input field found on the page.

**screenshot**
```yaml
- screenshot: string or object
    selector: string or object
    clip:
      x: number
      y: number
      width: number
      height: number
    path: string
```
Takes a screenshot with specific options. If used within the `actions` array, this allows for multiple screenshots within a single workflow.

If a string is passed to screenshot, it will be used as the path for the screenshot.

**text**
```yaml
- text:
    selector: string or object
    value: string
```
Modifies the text content of the selected element.

**wait**
```yaml
- wait: number
```
or

```yaml
- wait:
    selector: string or object
    timeout: number
    assert: string
```
or
```yaml
- wait:
    selector: string or object
    timeout: number
    assert:
      chainer: string
      value: string or array
```

Waits for a specified time or for a condition to be met.

Chainer example for `assert`:
```yaml
- wait:
    selector: "[data-cy=myelement]"
    timeout: 10000
    assert: "be.visible"
```

### Examples

#### Minimal Example

```yaml
screenshots:
  - image: /images/dashboard
    visit: "/apps/cockpit/index.html#/"
```

#### Complex Example

```yaml
global:
  language: en
  login: admin
  shell: "oee"
  requires: "1017"
  tags: 
    - screenshot

screenshots:
  - image: /images/oee/dashboard
    visit: "/apps/oee/index.html#/"
    tags: 
      - "dashboard"

  - image: /images/oee/expanded-view
    requires: ">=1017.0.0"
    visit:
      url: "/apps/oee/index.html#/"
    actions:
      - click:
          selector:
            data-cy: expand-all
      - highlight:
          selector: "#main-content"
          border: 2px solid green
      - type: 
          selector: "#search"
          value: "Test Search"
      - screenshot:          
          clip:
            x: 100
            y: 100
            width: -100
            height: -250

  - image: /images/oee/custom-element
    visit: /apps/oee/index.html#/
    actions:
      - screenshot:
          selector: "#custom-element"

  - image: /images/oee/multi-step
    visit: /apps/oee/index.html#/
    actions:
      - screenshot:
          path: "/images/oee/step1"
      - click:
          selector:
            data-cy: next-button
      - screenshot:
          path: "/images/oee/step2"
      - text:
          selector: "[data-cy=result-value]"
          value: "Success"
      - screenshot:
          path: "/images/oee/step3"
```

## Disclaimer

These tools are provided as-is and without warranty or support. They do not constitute part of the Software AG product suite. Users are free to use, fork and modify them, subject to the license agreement. While Software AG welcomes contributions, we cannot guarantee to include every contribution in the master project.

For questions file an issue in the cumulocity-cypress repository.

📘 Explore the Knowledge Base  
Dive into a wealth of Cumulocity IoT tutorials and articles in our [Tech Community Knowledge Base](https://tech.forums.softwareag.com/tags/c/knowledge-base/6/cumulocity-iot).

💡 Get Expert Answers  
Stuck or just curious? Ask the Cumulocity IoT experts directly on our [Forum](https://tech.forums.softwareag.com/tags/c/forum/1/Cumulocity-IoT).

🚀 Try Cumulocity IoT  
See Cumulocity IoT in action with a [Free Trial](https://techcommunity.softwareag.com/en_en/downloads.html).

✍️ Share Your Feedback  
Your input drives our innovation. If you find a bug, please create an issue in the repository. If you’d like to share your ideas or feedback, please post them [here](https://tech.forums.softwareag.com/c/feedback/2).