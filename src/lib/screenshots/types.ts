// See https://github.com/json-schema-org/json-schema-spec/issues/1087
// for details on intersections and types with JSON schema. Basically,
// using & to combine types is not supported by JSON schema and will
// result in copying the properties of the intersection into the resulting
// subschemas.
import { IUser } from "@c8y/client";
import { C8yBaseUrl, C8yHighlightOptions } from "../../shared/types";
import { ODiffOptions } from "odiff-bin";

export type ScreenshotSetup = {
  /**
   * The base URL used for all relative requests.
   * @format uri
   */
  baseUrl?: C8yBaseUrl;
  /**
   * The title used for root group of screenshot workflows
   */
  title?: string;
  /**
   * The global settings for all screenshots
   */
  global?: GlobalOptions & ScreenshotSettings & ScreenshotOptions;
  /**
   * Definition of shared selectors to use in the screenshot workflows
   */
  selectors?: SharedSelector | SharedSelector[];
  /**
   * The screenshot workflows
   */
  screenshots: (Screenshot & ScreenshotOptions)[];
};

export interface GlobalOptions {
  /**
   * The selector to wait for when visiting a page
   * @default "c8y-drawer-outlet c8y-app-icon .c8y-icon"
   * @examples ["c8y-drawer-outlet c8y-app-icon .c8y-icon"]
   */
  visitWaitSelector?: string;
  /**
   * The defaulft style to highlight elements. By default, an organge border of 2px width is used to highlight elements.
   * @examples [{ "outline": "2px", "outline-style": "solid", "outline-offset": "-2px", "outline-color": "#FF9300" }, { "border": "2px solid red" }]
   */
  highlightStyle?: any;
}

export type SemverRange = string;

type UserType = Partial<
  Pick<
    IUser,
    | "userName"
    | "firstName"
    | "lastName"
    | "email"
    | "phone"
    | "id"
    | "displayName"
  >
>;

export interface ScreenshotOptions {
  /**
   * Tags allow grouping and filtering of screenshots (optional)
   */
  tags?: string[];
  /**
   * The shell is used to dermine the version of the application used by "requires" (optional)
   * @examples ["cockpit, devicemanagement, oee"]
   */
  shell?: string;
  /**
   * Requires the shell application to have the a version in the given range. The range must be a valid semver range. If requires is configured and shell version does not fullfill the version requirement, the screenshot workflow will be skipped.
   * @format semver-range
   * @examples ["1.x, ^1.0.0, >=1.0.0 <2.0.0"]
   */
  requires?: SemverRange;
  /**
   * Load Cumulocity with the given language
   * @example "en"
   */
  language?: "en" | "de" | string | string[];
  /**
   * A user object with properties used to mock the user information in Cumulocity. This is useful to anonymize the user information in the screenshots.
   */
  user?: string | UserType;
  /**
   * The alias referencing the username and password to login. Configure the username and password using *login*_username and *login*_password env variables. If set to false, login is disabled and visit is performed unauthenticated.
   * @examples [["admin", false]]
   */
  login?: string | false;
  /**
   * The date to simulate when running the screenshot workflows
   * @format date-time
   * @examples ["2024-09-26T19:17:35+02:00"]
   */
  date?: string;
  /**
   * Viewport position to which an element should be scrolled before executing commands. The default is false.
   * @default false
   */
  scrollBehavior?: "center" | "top" | "bottom" | "nearest" | false;
}

export interface Screenshot {
  /**
   * The name of the screenshot image as relative path
   * @examples ["/images/cockpit/dashboard.png"]
   */
  image: string;
  /**
   * The title of the screenshot workflow. The title is used to group the screenshots. To provide a hierarchy of titles, use an array of strings.
   */
  title?: string | string[];
  /**
   * The URI to visit. This typically a relative path to the baseUrl.
   * @examples ["/apps/cockpit/index.html#/"]
   */
  visit: string | Visit;
  /**
   * The actions to perform in the screenshot workflow. The last actioncis always a screenshot action. If no actions are defined or last actions is not a screenshot action, a screenshot is taken of the current state of the application.
   */
  actions?: Action[] | Action;
  /**
   * Run only this screenshot workflow and all other workflows that have only setting enabled
   */
  only?: boolean;
  /**
   * Skip this screenshot workflow
   */
  skip?: boolean;
  /**
   * The configuration and settings of the screenshot
   */
  settings?: ScreenshotSettings;
}

export interface ScreenshotSettings {
  /**
   * The width in px to use for the browser window
   * @minimum 0
   * @default 1440
   * @TJS-type integer
   */
  viewportWidth?: number;
  /**
   * The height in px to use for the browser window
   * @minimum 0
   * @default 900
   * @TJS-type integer
   */
  viewportHeight?: number;
  /**
   * The capturing type for the screenshot. When 'fullPage' is used, the application is captured in its entirety from top to bottom. Setting is ignored when screenshots are taken for a selected DOM element. The default is 'viewport'.
   * Note that 'fullPage' screenshots will have a different height than specified in 'viewportHeight'.
   * @examples [["viewport", "fullPage"]]
   * @default "viewport"
   */
  capture?: "viewport" | "fullPage";
  /**
   * The padding in px used to alter the dimensions of a screenshot of an element.
   * @minimum 0
   * @TJS-type integer
   */
  padding?: number;
  /**
   * Whether to scale the app to fit into the browser viewport.
   */
  scale?: boolean;
  /**
   * Overwrite existing screenshots. By enabling this setting, existing screenshots might be deleted before running the screenshot workflow.
   */
  overwrite?: boolean;
  /**
   * When true, prevents JavaScript timers (setTimeout, setInterval, etc) and CSS animations from running while the screenshot is taken.
   */
  disableTimersAndAnimations?: boolean;
  /**
   * Options to configure the diffing of screenshots.
   */
  diff?: ForwardedOdiffOptions;
  /**
   * The timeouts supported by Cypress.
   */
  timeouts?: {
    /**
     * The time, in milliseconds, to wait until most DOM based commands are considered timed out.
     * @examples [10000]
     * @default 4000
     * @TJS-type integer
     */
    default?: number;
    /**
     * The time, in milliseconds, to wait for the page to load. This is used for visit actions.
     * @examples [30000]
     * @default 60000
     * @TJS-type integer
     */
    pageLoad?: number;
    /**
     * The time, in milliseconds, to wait for a response from a network request. Also applies to screenshot action.
     * @examples [60000]
     * @default 30000
     * @TJS-type integer
     */
    screenshot?: number;
  };
}

interface ForwardedOdiffOptions
  extends Pick<
    ODiffOptions,
    | "threshold"
    | "ignoreRegions"
    | "antialiasing"
    | "diffColor"
    | "outputDiffMask"
  > {}

export interface DiffOptions extends ForwardedOdiffOptions {
  targetFolder?: string;
  skipMove?: boolean;
}

export interface Visit {
  /**
   * The URL to visit. Currently only an URI relative to the base URL is supported.
   * @format uri-reference
   */
  url: string;
  /**
   * The timeout in ms to wait for the page to load.
   * @examples [30000]
   * @TJS-type integer
   */
  timeout?: number;
  /**
   * The selector to wait for before taking the screenshot.
   * @examples ["c8y-drawer-outlet c8y-app-icon .c8y-icon"]
   */
  selector?: string;
}

export interface ClickAction {
  /**
   * If true, the click event is triggered on all matching elements. The default is false.
   * @default false
   */
  multiple?: boolean;
  /**
   * If true, the click event is triggered even if the element is not visible. The default is false.
   * @default false
   */
  force?: boolean;
}

// Cypress.PositionType
type CyPositionType =
  | "topLeft"
  | "top"
  | "topRight"
  | "left"
  | "center"
  | "right"
  | "bottomLeft"
  | "bottom"
  | "bottomRight";

export interface ScrollToAction {
  /**
   * The element to scroll to. Requires a selector or a DOM element. If the element is not visible, the page is scrolled to make the element visible.
   * The offset is applied when the element has been scrolled into view. The offset represents left and right pixel to scroll.
   */
  element?: string | ({ offset?: [number, number] } & Selectable);
  /**
   * The position to scroll to. The default is 'top'. Provide a string, an array of strings, or a number to scroll to a specific position.
   * @examples ["top", "bottom", ["top", "100px"], [0, 100], ["0%", "25%"]]
   */
  position?:
    | CyPositionType
    | [string, string]
    | [number, number];
}

export interface TypeAction {
  /**
   * The value to type into the selected DOM element. The value can be a string or an array of strings. If an array is provided, textfields within the selector are filled with the values in the array.
   *
   * For multistep forms, the value can be an array of strings. Each array represents a step in the form. The first value in the array is typed into the first textfield, the second value in the second textfield, and so on. Configure submit selector to continue to the next step of the form.
   */
  value: string | (string | null)[] | (string | null)[][];
  /**
   * If true, the text input is cleared before typing. The default is false.
   * @default false
   */
  clear?: boolean;
  /**
   * If true, the element is blurred after typing to remove the focus. The default is false.
   * @default false
   */
  blur?: boolean;
  /**
   * The submit selector is triggered for every entry value. Use to go over multistep forms. If the submit selector is not found, the form is not automatically continued and multistep finishes.
   */
  submit?: string | Selectable;
}

export interface TextAction {
  /**
   * The value to set
   */
  value: string;
}

export interface WaitAction {
  /**
   * The timeout in ms to wait for
   * @TJS-type integer
   * @default 4000
   */
  timeout?: number;
  /**
   * The chainer assertion to wait for. This translates to a Cypress get().should().
   * See https://docs.cypress.io/api/commands/should
   */
  assert?:
    | string
    | {
        /**
         * The chainer assertion to. Could be any valid Cypress chainer. The chainer is not validated and may or may not have a value to assert.
         * @examples ["have.length", "eq", "be.visible"]
         */
        chainer: string;
        /**
         * The value to assert. The value is optional and may not be required by the chainer assertion.
         */
        value?: string | string[];
      };
}

export interface UploadFileAction {
  /**
   * The path to the file to upload. Resolve the file path relative to the current working directory. Currently, only a single file of types .json, .txt, .csv, .png, .jpg, .jpeg, .gif can be uploaded. If file does not have required extension, overwrite extension in the fileName property.
   */
  file: string;
  /**
   * The name of the file to use when uploading including file extension. If not provided, the file name is determined from the file path.
   * @examples ["file.txt"]
   */
  fileName?: string;
  /**
   * The encoding of the file. If not provided, the encoding is determined automatically. Default is 'utf8' or 'binary' depending of file extension.
   * @examples [["binary", "utf8"]]
   */
  encoding?: "binary" | "utf8" | "utf-8";
  /**
   * The type of the file input element. The default is 'input'.
   * @default "input"
   */
  subjectType?: "input" | "drag-n-drop";
  /**
   * If true, the file is uploaded even if the element is not visible. The default is false.
   * @default false
   */
  force?: boolean;
  /**
   * The MIME type of the file. If not provided, the MIME type is determined automatically.
   * @examples ["application/json", "text/csv", "image/png"]
   */
  mimeType?: string;
}

export interface HighlightAction extends C8yHighlightOptions {
  /**
   * The outline offset. The default is -2px.
   */
  offset?: string;
}

export type SelectableHighlightAction = HighlightAction & Selectable;

export interface ScreenshotClipArea {
  /**
   * The x-coordinate of the top-left corner of the clip area
   * @minimum 0
   * @TJS-type integer
   */
  x: number;
  /**
   * The y-coordinate of the top-left corner of the clip area
   * @minimum 0
   * @TJS-type integer
   */
  y: number;
  /**
   * The width of the clip area. If negative, the width is subtracted from the viewport width.
   * @TJS-type integer
   */
  width: number;
  /**
   * The height of the clip area. If negative, the height is subtracted from the viewport height.
   * @TJS-type integer
   */
  height: number;
}

export interface ScreenshotAction {
  /**
   * The path to store the screenshot. This is the relative path used within the screenshot folder.
   */
  path?: string;
  /**
   * The clip area within the screenshot image. The clip area is defined by the top-left corner (x, y) and the width and height of the clip area.
   */
  clip?: ScreenshotClipArea;
  /**
   * The padding applied to the screenshots of elements in px. If an array of numbers is provided, the padding is applied as defined by CSS shorthand property.
   */
  padding?:
    | number
    | [number]
    | [number, number]
    | [number, number, number]
    | [number, number, number, number];
}

export interface Action {
  /**
   * A blur action triggers a blur event on the selected DOM element to remove focus.
   */
  blur?: string | Selectable | true;
  /**
   * A click action triggers a click event on the selected DOM element.
   */
  click?: string | (ClickAction & Selectable);
  /**
   * Use the file upload action to upload a file using the file input element. Currently supported file types are .json, .txt, .csv, .png, .jpg, .jpeg, .gif.
   */
  fileUpload?: string | (UploadFileAction & Selectable);
  /**
   * A focus action triggers a focus event on the selected DOM element.
   */
  focus?: string | Selectable;
  /**
   * Use highlight action to visually highlight a selected DOM element in the screenshot. By default, the element is highlighted with an orange border. Use any valid CSS styles to highlight the element.
   * To clear existing highlights, set the clear property to true.
   */
  highlight?:
    | string
    | string[]
    | SelectableHighlightAction
    | (string | SelectableHighlightAction)[]
    | { clear: true };
  /**
   * The screenshot action triggers a screenshot of the current state of the application.
   */
  screenshot?: string | (ScreenshotAction & Partial<Selectable>);
  /**
   * A scroll action scrolls the page to a specific position or element. Use the position property to scroll to a specific position or the element property to scroll to a selected DOM element.
   */
  scrollTo?: string | ScrollToAction | Selectable;
  /**
   * A text action modifies the text value of selected DOM element.
   */
  text?: TextAction & Selectable;
  /**
   * A type action triggers a type event on the selected DOM element. Use to simulate typing in an input field.
   */
  type?: TypeAction & Selectable;
  /**
   * A wait action waits for the given time in ms or for a given chainer assertion.
   * @examples [1000, 10000]
   */
  wait?: number | WaitAction;
}

type SelectorDataCyProperties = {
  "data-cy"?: string;
};

type SelectorLanguageProperties = {
  /**
   * The language(s) this selector is valid for. If the language of the application matches the language of the selector, the selector is used to select the element.
   * If language is not supported by the selector, the selector is ignored.
   * @examples ["en", "de", ["en", "de"]]   
   */
  language?: string | string[];
};

type SelectorLocalizedProperties = {
  /**
   * Language key and localized selector mapping. Use for example to select elements based on the language of the application.
   * @examples [{ "de": "span.label-info:not(:contains('Objekt'))", "en": "span.label-info:not(:contains('Object'))" }]
   */
  localized?: {
    [key: string]: string;
  };
};

type SelectorProperties =
  | SelectorDataCyProperties
  | SelectorLanguageProperties
  | SelectorLocalizedProperties;

export type Selector = {
  /**
   * The selector to use to select the DOM element. The selector can be defined as string or an object with properties to select the element.
   */
  selector: string | SelectorProperties;
};

export type Selectable = Selector | SelectorProperties;

export type SharedSelector = {
  [key: string]: string;
};

// Internal types used within C8yScreenshotRunner
// This will not be exposed to schema.json

export interface C8yScreenshotOptions {
  baseUrl: string;
  config: string;
  folder: string;
  failureFolder: string;
  skipFailure: boolean;
  open: boolean;
  browser: "chrome" | "firefox" | "electron";
  browserLaunchArgs: string;
  tags: string[];
  quiet: boolean;
  setup: ScreenshotSetup;
  init: boolean;
  clear: boolean;
  diff: boolean;
  diffFolder: string;
  diffSkip: boolean;
  highlight: boolean;
}

export interface C8yScreenshotFileUploadOptions {
  data: any;
  path: string;
  filename: string;
  encoding: string;
  mimeType?: string;
}
