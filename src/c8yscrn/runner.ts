import "../lib/commands";
import "../lib/commands/c8ypact";
import "../lib/commands/screenshot";

import "cypress-file-upload";

import { pactId } from "../shared/c8ypact";
import { C8yHighlightStyleDefaults } from "../shared/types";

import { CyHttpMessages } from "cypress/types/net-stubbing";

import {
  Action,
  C8yScreenshotFileUploadOptions,
  Screenshot,
  ScreenshotOptions,
  ScreenshotSetup,
  SelectableHighlightAction,
  Visit,
} from "../lib/screenshots/types";

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import schema from "./schema.json";
import { getSelector, imageName } from "./runner-helper";

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

  actionHandlers: {
    [key: string]: C8yScreenshotActionHandler;
  };

  private language: string | undefined;

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
    this.registerActionHandler("screenshot", this.screenshot);
    this.registerActionHandler("text", this.text);
    this.registerActionHandler("wait", this.wait);
    this.registerActionHandler("fileUpload", this.fileUpload);
    this.registerActionHandler("blur", this.blur);
    this.registerActionHandler("focus", this.focus);
    this.registerActionHandler("scrollTo", this.scrollTo);

    if ((Cypress.env("_c8yscrnHighlight") ?? false) != false) {
      this.registerActionHandler("highlight", this.highlight);
    }
  }

  registerActionHandler(key: string, handler: C8yScreenshotActionHandler) {
    this.actionHandlers[key] = handler.bind(this);
  }

  run() {
    // reset language
    this.language = undefined;
    // init global settings
    const global = this.config.global;

    const CyScreenshotSettingsKeys = [
      "capture",
      "scale",
      "padding",
      "overwrite",
      "disableTimersAndAnimations",
    ];
    const defaultOptions: Partial<Cypress.ScreenshotOptions> = _.defaults(
      _.omitBy(_.pick(global ?? {}, CyScreenshotSettingsKeys), _.isNil),
      {
        overwrite: false,
        scale: false,
        disableTimersAndAnimations: true,
        capture: "viewport" as const,
      }
    );

    let globalLogin = global?.login;
    if (_.isString(global?.user) && globalLogin == null) {
      // backwards compatibility
      globalLogin = global.user;
    }

    describe(this.config.title ?? `screenshot workflow`, () => {
      before(() => {
        (_.isString(globalLogin)
          ? cy.getAuth(globalLogin)
          : cy.wrap(undefined)
        ).then((auth) => {
          if (auth != null && globalLogin !== false) {
            cy.wrap(auth, { log: false })
              .getShellVersion(global?.shell)
              .then((version) => {
                debug(
                  `Set shell version ${version} for ${
                    global?.shell ?? Cypress.env("C8Y_SHELL_NAME")
                  } `
                );
              });
            cy.wrap(auth, { log: false })
              .getTenantId()
              .then((tenantId) => {
                debug(`Set tenantId ${tenantId} `);
              });
          } else {
            const hint =
              globalLogin === false
                ? "Login disabled."
                : "No login or auth configured.";
            debug(
              `Skipped setting shellVersion. ${hint} Falling back to C8Y_SHELL_VERSION: ${Cypress.env(
                "C8Y_SHELL_VERSION"
              )}`
            );
            debug(
              `Skipped setting tenantId. ${hint} Falling back to C8Y_TENANT: ${Cypress.env(
                "C8Y_TENANT"
              )}`
            );
          }
        });
      });

      beforeEach(() => {
        Cypress.session.clearAllSavedSessions();
        if (Cypress.env("C8YCTRL_MODE") != null) {
          cy.wrap(c8yctrl(), { log: false });
        }
      });

      this.config.screenshots?.forEach((item) => {
        const annotations: any = {};

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

        const l = item.language ?? global?.language ?? "en";
        const languages = _.isArray(l) ? l : [l];
        languages.forEach((language) => {
          this.language = language === languages[0] ? undefined : language;

          fn.apply(null, [
            `${item.image} (${language})`,
            annotations,
            // @ts-expect-error
            () => {
              let login =
                item.login ?? global?.login ?? item.user ?? global?.user;
              const skipLogin = login === false;
              if (!_.isString(login)) {
                login = undefined;
              }

              debug(`Running screenshot: ${item.image}`);
              debug(`Using annotations: ${JSON.stringify(annotations)}`);

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
                debug(`Setting visit date to ${visitDate}`);
                cy.clock(new Date(visitDate));
              }

              const user = item.user ?? global?.user;
              this.interceptCurrentUser(user);

              (_.isString(login) ? cy.getAuth(login) : cy.wrap(undefined)).then(
                (auth) => {
                  if (auth != null && !skipLogin) {
                    const username =
                      auth.user ?? auth.username ?? auth.userAlias;
                    debug(`Logging in as ${username}`);
                    cy.wrap(auth, { log: false }).login();
                  } else {
                    if (!skipLogin) {
                      debug(
                        `Skipped login. ${
                          user ? user + "not" : "No login or auth"
                        } configured.`
                      );
                    } else {
                      debug(`Skipped login. Login is disabled.`);
                    }
                  }
                }
              );

              const visitObject = this.getVisitObject(item.visit);
              const url = visitObject?.url ?? (item.visit as string);
              const visitSelector =
                visitObject?.selector ??
                global?.visitWaitSelector ??
                "c8y-drawer-outlet c8y-app-icon .c8y-icon";
              debug(`Visiting ${url} Selector: ${visitSelector}`);
              const visitTimeout = visitObject?.timeout;

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
                    const padding = action.screenshot?.padding;
                    if (padding != null) {
                      options.padding = padding;
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
                const name = imageName(item.image, this.language);
                debug(`Taking screenshot ${name}`);
                debug(`Options: ${JSON.stringify(options)}`);
                cy.screenshot(name, options);
              }
            },
          ]);
        });
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
    if (action.blur === true) {
      cy.then(() => {
        cy.focused().blur();
      });
    }
  }

  protected highlight(action: Action["highlight"], that: C8yScreenshotRunner) {
    const highlights = _.isArray(action) ? action : [action];
    cy.wrap(highlights).each(
      (
        highlight:
          | string
          | SelectableHighlightAction
          | { clear: true }
          | undefined
      ) => {
        if (highlight && _.isObject(highlight) && highlight.clear === true) {
          cy.clearHighlights();
          return;
        }

        const selector = getSelector(highlight, this.config.selectors);
        if (selector == null) return;

        const highlightStyle: any = {
          ...C8yHighlightStyleDefaults,
          ...(that?.config.global?.highlightStyle ?? {}),
        };

        if (_.isObject(highlight)) {
          if (highlight?.styles != null) {
            _.extend(highlightStyle, highlight.styles);
          }
          if (highlight?.border != null) {
            if (_.isString(highlight.border)) {
              _.extend(highlightStyle, { border: highlight.border });
            } else {
              _.extend(highlightStyle, { ...highlight.border });
            }
          }
          if (highlight?.offset != null) {
            _.extend(highlightStyle, {
              "outline-offset": highlight.offset,
            });
          }
          if (highlight?.clear === true) {
            cy.clearHighlights();
            highlight.clear = false;
          }
        }

        cy.get(selector).highlight(
          highlightStyle,
          _.isObject(highlight) ? highlight : {}
        );
      }
    );
  }

  protected scrollTo(action: Action["scrollTo"]) {
    if (action == null) return;
    let selector = getSelector(action, this.config.selectors);
    if (selector != null) {
      cy.get(selector).scrollIntoView();
    } else if (_.isString(action)) {
      return;
    } else if ("position" in action && action.position != null) {
      if (_.isArray(action.position)) {
        cy.scrollTo(action.position[0], action.position[1]);
      } else if (_.isString(action.position)) {
        cy.scrollTo(action.position as Cypress.PositionType);
      }
    } else if ("element" in action) {
      selector = getSelector(action.element, this.config.selectors);
      if (selector == null) return;
      if (_.isObject(action.element)) {
        if ("offset" in action.element && _.isArray(action.element.offset)) {
          cy.get(selector).scrollIntoView({
            offset: {
              top: action.element.offset[0],
              left: action.element.offset[1],
            },
          });
        } else {
          cy.get(selector).scrollIntoView();
        }
      } else {
        cy.get(selector).scrollIntoView();
      }
    }
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
      debug(`File upload selector or file path is missing`);
      return;
    }

    cy.task<C8yScreenshotFileUploadOptions>("c8yscrn:file", {
      path: filePath,
      ..._.pick(fileUpload, ["encoding", "fileName"]),
    }).then((file) => {
      if (file == null) {
        debug(`File ${filePath} not found`);
        return;
      }

      debug(`Uploading file ${filePath} to ${selector}`);

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

      debug(
        `Fixture data: ${JSON.stringify({
          ...fixtureData,
          fileContent: "...",
        })}`
      );
      debug(
        `File processing options: ${JSON.stringify(fileProcessingOptions)}`
      );

      cy.get(selector).attachFile(fixtureData, fileProcessingOptions);
    });
  }

  protected blur(action: Action["blur"]) {
    const selector = getSelector(action, this.config.selectors);
    if (selector == null) {
      cy.focused().blur();
    } else {
      cy.get(selector).blur();
    }
  }

  protected focus(action: Action["focus"]) {
    const selector = getSelector(action, this.config.selectors);
    if (selector == null) return;
    cy.get(selector).focus();
  }

  protected screenshot(
    action: Action["screenshot"],
    _that: C8yScreenshotRunner,
    item: Screenshot,
    options: Cypress.ScreenshotOptions
  ) {
    const name = _.isString(action) ? action : action?.path ?? item.image;
    const selector = !_.isString(action)
      ? getSelector(action, this.config.selectors)
      : undefined;

    debug(`Taking screenshot ${name} selector: ${selector}`);
    debug(`Options: ${JSON.stringify(options)}`);

    if (selector != null) {
      cy.get(selector).then(($elements) => {
        cy.wrap($elements).screenshot(imageName(name, this.language), options);
      });
    } else {
      cy.screenshot(imageName(name, this.language), options);
    }
  }

  protected getVisitObject(visit: string | Visit): Visit | undefined {
    return _.isString(visit) ? undefined : visit;
  }

  protected userId: string | undefined = undefined;
  protected interceptCurrentUser(user: ScreenshotOptions["user"]) {
    this.userId = undefined;
    if (user != null && _.isObject(user)) {
      cy.intercept(
        { method: "GET", pathname: `/user/currentUser*` },
        (req: CyHttpMessages.IncomingHttpRequest) => {
          req.continue((res) => {
            this.userId = res.body.id;
            res.body = {
              ...res.body,
              ...user,
            };
          });
        }
      ).as("currentUser");

      cy.intercept(
        {
          method: "GET",
          path: /\/application\/applicationsByUser\/.*(\?.*)?/,
        },
        (req: CyHttpMessages.IncomingHttpRequest) => {
          if (this.userId != null && user.id != null) {
            const encodedCurrentUserID = encodeURIComponent(user.id);
            const encodedActualUserID = encodeURIComponent(this.userId);
            if (req.url.includes(encodedCurrentUserID)) {
              req.url = req.url.replace(
                encodedCurrentUserID,
                encodedActualUserID
              );
            }
          }
          req.continue();
        }
      ).as("applicationsByUser");
    }
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

function debug(message: string, options?: any) {
  cy.task("debug", message, options ?? taskLog);
}

export function isRecording(): boolean {
  return (
    Cypress.env("C8YCTRL_MODE") === "recording" ||
    Cypress.env("C8YCTRL_MODE") === "record"
  );
}

export function isScreenshotAction(action: Action): boolean {
  return "screenshot" in action;
}

function loadDataFromLocalStorage(key: string) {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}
