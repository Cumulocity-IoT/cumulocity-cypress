export type ScreenshotSetup = {
  /**
   * The base URL used for all relative requests.
   * @format uri
   */
  baseUrl?: string;
  /**
   * The title used for root group of screenshot workflows
   */
  title?: string;
  /**
   * The global settings for all screenshots
   */
  global?: ScreenshotSettings & TestcaseOptions & GlobalVisitOptions;
  /**
   * The screensht workflows
   */
  screenshots: Screenshot[];
};

export type TestcaseOptions = {
  /**
   * Tags allow grouping and filtering of screenshots (optional)
   */
  tags?: string[];
  /**
   * The shell is used to dermine the version of the application used by
   * "requires" (optional)
   * @examples ["cockpit, devicemanagement, oee"]
   */
  shell?: string;
  /**
   * Requires the shell application to have the a version in the given range.
   * The range must be a valid semver range. If requires is configured and shell
   * version does not fullfill the version requirement, the screenshot workflow
   * will be skipped.
   * @format semver-range
   * @examples ["1.x, ^1.0.0, >=1.0.0 <2.0.0"]
   */
  requires?: SemverRange;
};

export type SemverRange = string;

export type GlobalVisitOptions = {
  /**
   * Load Cumulocity with the given language
   * @example "en"
   */
  language?: "en" | "de" | string;
  /**
   * The login user alias. Configure *user*_username and *user*_password env
   * variables to set the actual user id and password.
   * @examples ["admin"]
   */
  user?: string;
  /**
   * The date to simulate when running the screenshot workflows
   * @format date-time
   * @examples ["2024-09-26T19:17:35+02:00"]
   */
  date?: string;
};

export type Screenshot = GlobalVisitOptions &
  TestcaseOptions & {
    /**
     * The name of the screenshot image as relative path
     * @examples ["/images/cockpit/dashboard.png"]
     */
    image: string;
    /**
     * The URI to visit
     * @examples ["/apps/cockpit/index.html#/"]
     */
    visit: string | Visit;
    /**
     * The actions to perform in the screenshot workflow. The last action
     * is always a screenshot action. If no actions are defined or last actions is
     * not a screenshot action, a screenshot is taken of the current state of
     * the application.
     */
    do?: Action[] | Action;
    /**
     * Run only this screenshot workflow and all other workflows that
     * have only setting enabled
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
  };

type ScreenshotSettings = {
  /**
   * The width in px to use for the browser window
   * @minimum 0
   * @default 1920
   * @TJS-type integer
   */
  viewportWidth?: number;
  /**
   * The height in px to use for the browser window
   * @minimum 0
   * @default 1080
   * @TJS-type integer
   */
  viewportHeight?: number;
  /**
   * The type of capturing the screenshot. When fullPage is used,
   * the application is captured in its entirety from top to bottom.
   * Setting is ignored when screenshots are taken for a selected element.
   */
  capture?: "viewport" | "fullPage";
  /**
   * The padding in px used to alter the dimensions of a screenshot of an
   * element.
   * @minimum 0
   * @TJS-type integer
   */
  padding?: number;
  /**
   * Whether to scale the app to fit into the browser viewport.
   */
  scale?: boolean;
  /**
   * Overwrite existing screenshots. By enabling this setting, existing
   * screenshots might be deleted before running the screenshot workflow.
   */
  overwrite?: boolean;
  /**
   * When true, prevents JavaScript timers (setTimeout, setInterval, etc)
   * and CSS animations from running while the screenshot is taken.
   */
  disableTimersAndAnimations?: boolean;
};

export type Visit = GlobalVisitOptions & {
  /**
   * The URL to visit. Currently only an URI relative to the base URL is 
   * supported.
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
   * @examples ["c8y-navigator-outlet c8y-app-icon"]
   * @default "c8y-navigator-outlet c8y-app-icon"
   */
  selector?: string;
};

export type ClickAction = {
  /**
   * A click action triggers a click event on the selected DOM element.
   */
  click?: {
    /**
     * The selector to click
     */
    selector: Selector;
  };
};

export type TypeAction = {
  /**
   * A type action triggers a type event on the selected DOM element. Use to
   * simulate typing in an input field.
   */
  type?: {
    /**
     * The selector to type
     */
    selector: Selector;
    /**
     * The value to type
     */
    value: string;
  };
};

export type TextAction = {
  /**
   * A text action modifies the text value of selected DOM element.
   */
  text?: {
    /*
     * The selector to modify
     */
    selector: Selector;
    /**
     * The value to set
     */
    value: string;
  };
};

export type WaitAction = {
  /**
   * A wait action waits for the given time in ms.
   * @TJS-type integer
   */
  wait?: number;
};

export type HighlightActionProperties = {
  /**
   * The selector of the DOM element
   */
  selector: Selector;
  /**
   * The border style. Use any valid CSS border style.
   * @examples ["1px solid red"]
   */
  border?: string;
  /**
   * The CSS styles to apply to the selected  element. Use any valid CSS styles.
   * @examples ["background-color: yellow", "outline: dashed", "outline-offset: +3px"]
   */
  styles?: any;
};

export type HighlightAction = {
  highlight?: HighlightActionProperties | HighlightActionProperties[];
};

export type ScreenshotClipArea = {
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
   * The width of the clip area. If negative, the width is subtracted from the
   * viewport width.
   * @TJS-type integer
   */
  width: number;
  /**
   * The height of the clip area. If negative, the height is subtracted from the
   * viewport height.
   * @TJS-type integer
   */
  height: number;
};

export type Selector =
  | string
  | {
      "data-cy"?: string;
    };

export type ScreenshotAction = {
  /**
   * The screenshot action triggers a screenshot of the current state of the
   * application.
   */
  screenshot?: {
    /**
     * The path to store the screenshot. This is the relative path used
     * within the screenshot folder.
     */
    path?: string;
    /**
     * The clip area within the screenshot image. The clip area is defined
     * by the top-left corner (x, y) and the width and height of the clip area.
     */
    clip?: ScreenshotClipArea;
    /**
     * The selector of the DOM element to capture
     */
    selector?: Selector;
  };
};

export type Action =
  | ClickAction
  | TypeAction
  | ScreenshotAction
  | HighlightAction
  | TextAction
  | WaitAction;

// Internal types used within C8yScreenshotRunner
// This will not be exposed to schema.json

export interface C8yScreenshotOptions {
  baseUrl: string;
  config: string;
  folder: string;
  open: boolean;
  browser: string;
  tags: string[];
  quiet: boolean;
  setup: ScreenshotSetup;
  init: boolean;
}

export type C8yScreenshotActionHandler = (
  action: any,
  item: Screenshot,
  options: any
) => void;
