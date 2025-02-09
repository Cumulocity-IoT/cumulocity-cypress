import "../lib/commands";
import "../lib/commands/c8ypact";
import "cypress-file-upload";

import { pactId } from "../shared/c8ypact";

import {
  Action,
  C8yScreenshotFileUploadOptions,
  Screenshot,
  ScreenshotSetup,
  Visit,
} from "../lib/screenshots/types";

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import schema from "./schema.json";
import {
  findCommonParent,
  getElementPositionWithinParent,
  getSelector,
  imageName,
} from "./runner-helper";

const { _ } = Cypress;

export type C8yScreenshotActionHandler = (
  action: any,
  that: C8yScreenshotRunner,
  item: Screenshot,
  options: any
) => void;

const taskLog = { log: true };

export class C8yScreenshotRunner {
  readonly config: ScreenshotSetup;

  private customizedElements: Array<[JQuery<HTMLElement>, any]> = [];
  private highlightElements: Array<JQuery<HTMLElement>> = [];

  actionHandlers: {
    [key: string]: C8yScreenshotActionHandler;
  };

  constructor(config?: ScreenshotSetup) {
    this.config =
      config ??
      loadDataFromLocalStorage("_c8yscrnConfig") ??
      Cypress.env("_c8yscrnyaml");
    if (!this.config) {
      throw new Error(
        "C8yScreenshotRunner requires configuration. You must pass a valid configuration when creating a C8yScreenshotRunner."
      );
    }

    const schemaMatcher = new C8yAjvSchemaMatcher();
    const valid = schemaMatcher.ajv.validate(schema, this.config);
    if (!valid) {
      throw new Error(`Invalid config file. ${schemaMatcher.ajv.errorsText()}`);
    }

    this.actionHandlers = {};
    this.registerActionHandler("click", this.click);
    this.registerActionHandler("type", this.type);
    this.registerActionHandler("highlight", this.highlight);
    this.registerActionHandler("screenshot", this.screenshot);
    this.registerActionHandler("text", this.text);
    this.registerActionHandler("wait", this.wait);
    this.registerActionHandler("fileUpload", this.fileUpload);
  }

  registerActionHandler(key: string, handler: C8yScreenshotActionHandler) {
    this.actionHandlers[key] = handler.bind(this);
  }

  run() {
    const CyScreenshotSettingsKeys = [
      "capture",
      "scale",
      "padding",
      "overwrite",
      "disableTimersAndAnimations",
    ];

    const global = this.config.global;

    const defaultOptions: Partial<Cypress.ScreenshotOptions> = _.defaults(
      _.omitBy(_.pick(global ?? {}, CyScreenshotSettingsKeys), _.isNil),
      {
        overwrite: false,
        scale: false,
        disableTimersAndAnimations: true,
        capture: "viewport" as const,
      }
    );

    describe(this.config.title ?? `screenshot workflow`, () => {
      before(() => {
        const login = global?.login ?? global?.user;
        cy.getAuth(login as any).then((auth) => {
          if (auth != null && login !== false) {
            cy.wrap(auth, { log: false }).getShellVersion(global?.shell);
          }
        });
      });

      beforeEach(() => {
        Cypress.session.clearAllSavedSessions();
        if (Cypress.env("C8Y_CTRL_MODE") != null) {
          cy.wrap(c8yctrl(), { log: false });
        }
      });

      this.config.screenshots?.forEach((item) => {
        const annotations: any = {};

        this.customizedElements = [];
        this.highlightElements = [];

        const required = item.requires ?? global?.requires;
        if (required != null) {
          annotations.requires = {
            shell: _.isArray(required) ? required : [required],
          };
        }

        const tags = item.tags ?? this.config.global?.tags;
        if (tags != null) {
          annotations.tags = _.isArray(tags) ? tags : [tags];
        }

        annotations.scrollBehavior = false;
        if (item.scrollBehavior != null) {
          annotations.scrollBehavior = item.scrollBehavior;
        }

        let fn = item.only === true ? it.only : it;
        fn = item.skip === true ? it.skip : fn;

        fn.apply(null, [
          `${item.image}`,
          annotations,
          // @ts-expect-error
          () => {
            const login =
              item.login ?? global?.login ?? item.user ?? global?.user;

            const user = login === false ? undefined : login;
            cy.getAuth(user as any).then((auth) => {
              if (auth != null && login !== false) {
                cy.wrap(auth, { log: false }).getTenantId();
              }
            });

            const width =
              item.settings?.viewportWidth ?? global?.viewportWidth ?? 1440;
            const height =
              item.settings?.viewportWidth ?? global?.viewportHeight ?? 900;
            cy.viewport(width, height);

            const options = _.defaults(
              _.omitBy(
                _.pick(item.settings ?? {}, CyScreenshotSettingsKeys),
                _.isNil
              ),
              defaultOptions
            );

            const visitDate = item.date ?? global?.date;
            if (visitDate) {
              cy.clock(new Date(visitDate));
            }

            cy.getAuth(user as any).then((auth) => {
              if (auth != null && login !== false) {
                cy.wrap(user, { log: false }).login();
              }
            });

            const visitObject = this.getVisitObject(item.visit);
            const url = visitObject?.url ?? (item.visit as string);
            const visitSelector =
              visitObject?.selector ??
              global?.visitWaitSelector ??
              "c8y-drawer-outlet c8y-app-icon .c8y-icon";
            cy.task(
              "debug",
              `Visiting ${url} Selector: ${visitSelector}`,
              taskLog
            );
            const visitTimeout = visitObject?.timeout;

            const language = item.language ?? global?.language ?? "en";
            cy.visitAndWaitForSelector(
              url,
              language as any,
              visitSelector,
              visitTimeout
            );

            if (global?.disableTimersAndAnimations === true) {
              cy.document().then((doc) => {
                const style = doc.createElement("style");
                style.innerHTML = `
                * {
                 animation: none !important;
                 transition: none !important;
                }
                `;
                doc.head.appendChild(style);
              });
            }

            let actions = item.actions == null ? [] : item.actions;
            actions = _.isArray(actions) ? actions : [actions];
            actions.forEach((action) => {
              const handlerKey = Object.keys(action)[0];
              const handler = this.actionHandlers[handlerKey];
              if (handler) {
                if (
                  isScreenshotAction(action) &&
                  !(
                    _.isString(action.screenshot) ||
                    _.isArray(action.screenshot)
                  )
                ) {
                  const clipArea = action.screenshot?.clip;
                  if (clipArea) {
                    options["clip"] = {
                      x: Math.max(clipArea.x, 0),
                      y: Math.max(clipArea.y, 0),
                      width:
                        clipArea.width < 0
                          ? width + clipArea.width
                          : clipArea.width,
                      height:
                        clipArea.height < 0
                          ? height + clipArea.height
                          : clipArea.height,
                    };
                  }
                }
                handler(_.get(action, handlerKey), this, item, options);
              }
            });

            const lastAction = _.last(actions);
            if (
              _.isEmpty(actions) ||
              !lastAction ||
              !isScreenshotAction(lastAction)
            ) {
              const name = imageName(item.image);
              cy.task("debug", `Taking screenshot ${name}`, taskLog);
              cy.task("debug", `Options: ${JSON.stringify(options)}`, taskLog);
              cy.screenshot(name, options);
            }
          },
        ]);
      });
    });
  }

  protected click(action: Action["click"]) {
    const selector = getSelector(action, this.config.selectors);
    const click = !_.isObject(action) ? { selector } : action;
    if (selector == null) return;

    const multiple = _.get(click, "multiple", false);
    const force = _.get(click, "force", false);
    cy.get(selector).click(_.omitBy({ multiple, force }, (v) => v === false));
  }

  protected type(action: Action["type"]) {
    const selector = getSelector(action, this.config.selectors);
    if (selector == null || action == null) return;
    if (_.isString(action.value)) {
      if (action.clear === true) {
        cy.get(selector).clear();
      }
      cy.get(selector).type(action.value);
    } else if (_.isArray(action.value)) {
      const values: (string | null)[][] = _.isArray(action.value)
        ? _.isArray(action.value[0])
          ? (action.value as string[][])
          : [action.value as string[]]
        : [[action.value]];

      values.forEach((formInput) => {
        cy.get(selector).within(($withElement) => {
          const $elements = Cypress.$($withElement).find(
            "input[type=text], textarea"
          );
          const length = Math.min($elements.length, formInput.length);
          formInput.forEach((value, index) => {
            if (index >= length) return;
            if (value != null && value !== "") {
              if (action.clear === true) {
                cy.wrap($elements[index]).clear();
              }
              cy.wrap($elements[index]).type(value);
            }
          });
        });
        cy.then(() => {
          const submit = getSelector(action.submit, this.config.selectors);
          if (submit == null) return;
          const elementExists = Cypress.$(submit).length > 0;
          if (!elementExists) return;
          cy.get(submit).click();
          cy.wait(500, { log: false });
        });
      });
    }
  }

  protected highlight(action: Action["highlight"], that: C8yScreenshotRunner) {
    const highlights = _.isArray(action) ? action : [action];

    highlights?.forEach((highlight) => {
      cy.then(() => {
        if (_.isObject(highlight) && (highlight?.clear ?? false) === true) {
          this.customizedElements.forEach(([$element, styles]) => {
            $element.css(styles);
          });
          this.highlightElements.forEach(($element) => {
            $element.remove();
          });

          this.customizedElements = [];
          this.highlightElements = [];
        }
      });

      const selector = getSelector(highlight, this.config.selectors);
      if (selector == null) return;

      const highlightStyle = {
        outline: "2px",
        "outline-style": "solid",
        "outline-offset": "-2px",
        "outline-color": "#FF9300",
        ...that?.config.global?.highlightStyle ?? {},
      };

      const applyHighlightStyle = (
        $element: JQuery<HTMLElement>,
        styles: any
      ) => {
        if ($element.length === 0) return;
        if (
          $element.length > 1 ||
          (!_.isString(highlight) &&
            (highlight?.width != null || highlight?.height != null))
        ) {
          // we need to wait for the element to transition and animate into final
          // position before we can calculate the absolute highlight area
          cy.wait(500, { log: false }).then(() => {
            let $parent = findCommonParent($element);
            if (!$parent) {
              $parent = Cypress.$("body").get(0);
            } else {
              // make sure the new container is positioned correctly
              Cypress.$($parent).css("position", "relative");
            }

            const unionRect = $element.toArray().reduce(
              (acc, el) => {
                const rect = getElementPositionWithinParent(el, $parent);
                acc.top = Math.min(acc.top, rect.top);
                acc.left = Math.min(acc.left, rect.left);
                acc.bottom = Math.max(acc.bottom, rect.bottom);
                acc.right = Math.max(acc.right, rect.right);
                return acc;
              },
              {
                top: Infinity,
                left: Infinity,
                bottom: -Infinity,
                right: -Infinity,
              }
            );

            let width = unionRect.right - unionRect.left;
            if (!_.isString(highlight) && highlight?.width != null) {
              width =
                highlight.width <= 1
                  ? width * highlight.width
                  : highlight.width;
            }

            let height = unionRect.bottom - unionRect.top;
            if (!_.isString(highlight) && highlight?.height != null) {
              height =
                highlight.height <= 1
                  ? height * highlight.height
                  : highlight.height;
            }

            const css = {
              position: "absolute",
              top: `${unionRect.top}px`,
              left: `${unionRect.left}px`,
              width: `${width}px`,
              height: `${height}px`,
              zIndex: 9999,
              pointerEvents: "none",
              ...styles,
            };
            const $container = Cypress.$(
              "<div _c8yscrn-highlight-container></div>"
            ).css(css);
            Cypress.$($parent).append($container);
            this.highlightElements.push($container);
          });
        } else {
          const styledProperties = Object.keys(styles);
          const currentStyles = $element.css(styledProperties);
          this.customizedElements.push([$element, currentStyles]);
          $element.css(styles);
        }
      };

      cy.get(selector).then(($element) => {
        const style = {};
        if (!_.isString(highlight)) {
          if (highlight?.styles != null) {
            _.extend(style, highlight.styles);
          }
          if (highlight?.border != null) {
            if (_.isString(highlight.border)) {
              _.extend(style, { border: highlight.border });
            } else {
              _.extend(style, {
                ...highlightStyle,
                ...highlight.border,
              });
            }
          }
          if (
            _.isEmpty(style) &&
            (highlight?.width != null || highlight?.height != null)
          ) {
            _.extend(style, highlightStyle);
          }
          applyHighlightStyle($element, style);
        } else {
          applyHighlightStyle($element, highlightStyle);
        }
      });
    });
  }

  protected text(action: Action["text"]) {
    const selector = getSelector(action, this.config.selectors);
    const value = action?.value;
    if (selector == null || value == null) return;
    cy.get(selector).then(($element) => {
      $element.text(value);
    });
  }

  protected wait(action: Action["wait"]) {
    if (action == null) return;
    if (_.isNumber(action)) {
      cy.wait(action);
    } else if (_.isObjectLike(action)) {
      const selector = getSelector(action, this.config.selectors);
      if (selector != null) {
        const timeout = action.timeout ?? 4000;
        const chainer = action.assert;
        if (chainer != null) {
          if (_.isString(chainer)) {
            cy.get(selector, { timeout }).should(chainer);
          } else if (chainer.value == null) {
            cy.get(selector, { timeout }).should(chainer.chainer);
          } else if (_.isArray(chainer.value)) {
            cy.get(selector, { timeout }).should(
              chainer.chainer,
              ...chainer.value
            );
          } else {
            cy.get(selector, {
              timeout,
            }).should(chainer.chainer, chainer.value);
          }
        } else {
          cy.get(selector, { timeout });
        }
      }
    }
  }

  protected fileUpload(action: Action["fileUpload"]) {
    const defaultSelector = '[type$="file"]';
    let fileUpload: Action["fileUpload"] = undefined;
    if (_.isString(action)) {
      fileUpload = { selector: defaultSelector, file: action };
    } else if (action != null) {
      fileUpload = action;
    }

    const selector = getSelector(fileUpload, this.config.selectors);
    const filePath = fileUpload?.file;
    if (selector == null || filePath == null) {
      cy.task("debug", `File upload selector or file path is missing`, taskLog);
      return;
    }

    cy.task<C8yScreenshotFileUploadOptions>("c8yscrn:file", {
      path: filePath,
      ..._.pick(fileUpload, ["encoding", "fileName"]),
    }).then((file) => {
      if (file == null) {
        cy.task("debug", `File ${filePath} not found`, taskLog);
        return;
      }

      cy.task("debug", `Uploading file ${filePath} to ${selector}`, taskLog);

      const attachData =
        file.encoding === "binary"
          ? Cypress.Blob.binaryStringToBlob(file.data)
          : file.data;
      const fixtureData = _.omitBy(
        {
          fileContent: attachData,
          fileName: fileUpload?.fileName ?? file.filename,
          ..._.pick(file, ["encoding", "lastModified", "mimeType"]),
          ..._.pick(fileUpload, ["encoding", "lastModified", "mimeType"]),
        },
        _.isNil
      );
      const fileProcessingOptions = _.omitBy(
        _.pick(fileUpload, ["subjectType", "force", "allowEmpty"]),
        _.isNil
      );

      cy.task(
        "debug",
        `Fixture data: ${JSON.stringify({
          ...fixtureData,
          fileContent: "...",
        })}`,
        taskLog
      );
      cy.task(
        "debug",
        `File processing options: ${JSON.stringify(fileProcessingOptions)}`,
        taskLog
      );

      cy.get(selector).attachFile(fixtureData, fileProcessingOptions);
    });
  }

  protected screenshot(
    action: Action["screenshot"],
    _that: C8yScreenshotRunner,
    item: Screenshot,
    options: any
  ) {
    const name = _.isString(action) ? action : action?.path ?? item.image;
    const selector = !_.isString(action)
      ? getSelector(action, this.config.selectors)
      : undefined;

    const logmessage = `Taking screenshot ${name} Selector: ${selector}`;
    cy.task("debug", logmessage, taskLog);
    cy.task("debug", `Options: ${JSON.stringify(options)}`, taskLog);

    if (selector != null) {
      cy.get(selector).screenshot(imageName(name), options);
    } else {
      cy.screenshot(imageName(name), options);
    }
  }

  protected getVisitObject(visit: string | Visit): Visit | undefined {
    return _.isString(visit) ? undefined : visit;
  }
}

/**
 * Update c8yctrl pact file to be used for recording or mocking.
 * @param titleOrId An id or array of titles with names of suite or titles
 */
export function c8yctrl(
  titleOrId: string | string[] = Cypress.c8ypact.getCurrentTestId()
): Promise<Response> {
  const id = pactId(titleOrId);
  const parameter: string = isRecording()
    ? "?recording=true&clear"
    : "?recording=false";

  return (cy.state("window") as Cypress.AUTWindow).fetch(
    `${Cypress.config().baseUrl}/c8yctrl/current${parameter}&id=${id}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
}

export function isRecording(): boolean {
  return Cypress.env("C8Y_CTRL_MODE") === "recording";
}

export function isClickAction(action: Action): boolean {
  return "click" in action;
}

export function isTypeAction(action: Action): boolean {
  return "type" in action;
}

export function isHighlightAction(action: Action): boolean {
  return "highlight" in action;
}

export function isScreenshotAction(action: Action): boolean {
  return "screenshot" in action;
}

function loadDataFromLocalStorage(key: string) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}
