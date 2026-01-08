import {
  getConsolePropsForLogSpy,
  getMessageForLogSpy,
  setupLoggerSetSpy,
  stubEnv,
  url,
} from "../support/testutils";
const { $, _ } = Cypress;

describe("general", () => {
  context("disableGainsight", () => {
    it("current tenant returns gainsightEnabled false", () => {
      cy.disableGainsight()
        .as("interception")
        .then(() => {
          return $.get(url(`/tenant/currentTenant`));
        })
        .then((response) => {
          expect(response.customProperties.gainsightEnabled).to.eq(false);
        })
        .wait("@interception");
    });

    it("gainsight api.key request will throw exception", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.eq(
          "Intercepted Gainsight API key call, but Gainsight should have been disabled. Failing..."
        );
        done();
      });

      cy.disableGainsight()
        .as("interception")
        .then(() => {
          $.get(url(`/tenant/system/options/gainsight/api.key`));
        });
    });
  });

  context("CookieBanner", () => {
    beforeEach(() => {
      cy.window().then((win) => {
        const cookie = win.localStorage.getItem("acceptCookieNotice");
        expect(cookie).to.be.null;
      });
    });

    it("hideCookieBanner should configure acceptCookieNotice", () => {
      cy.hideCookieBanner()
        .as("interception")
        .then(() => $.get(url(`/apps/public/public-options/options.json?_=a`)))
        .then(() => {
          cy.window().then((win) => {
            const cookie = win.localStorage.getItem("acceptCookieNotice");
            expect(cookie).to.be.not.null;
            expect(JSON.parse(cookie!)).to.deep.eq({
              required: true,
              functional: true,
              marketing: true,
              policyVersion: "2",
            });
          });
        });
    });

    it("acceptCookieBanner should configure acceptCookieNotice", () => {
      cy.acceptCookieBanner(false, false, false)
        .as("interception")
        .then(() => $.get(url(`/apps/public/public-options/options.json?_=b`)))
        .then(() => {
          cy.window().then((win) => {
            const cookie = win.localStorage.getItem("acceptCookieNotice");
            expect(cookie).to.be.not.null;
            expect(JSON.parse(cookie!)).to.deep.eq({
              required: false,
              functional: false,
              marketing: false,
              policyVersion: "2",
            });
          });
        });
    });

    it("acceptCookieBanner should intercept app options", () => {
      cy.acceptCookieBanner(false, false, true)
        .as("interception")
        .then(() =>
          $.get(url(`/apps/public/public-options@app-cockpit/options.json?_=c`))
        )
        .then(() => {
          cy.window().then((win) => {
            const cookie = win.localStorage.getItem("acceptCookieNotice");
            expect(cookie).to.be.not.null;
            expect(JSON.parse(cookie!)).to.deep.eq({
              required: false,
              functional: false,
              marketing: true,
              policyVersion: "2024-12-03",
            });
          });
        });
    });

    it("showCookieBanner should remove acceptCookieNotice", () => {
      cy.acceptCookieBanner(false, false, false).then(() => {
        cy.window().then((win) => {
          const cookie = win.localStorage.getItem("acceptCookieNotice");
          expect(cookie).to.be.not.null;
        });
      });

      cy.showCookieBanner().then(() => {
        cy.window().then((win) => {
          const cookie = win.localStorage.getItem("acceptCookieNotice");
          expect(cookie).to.be.null;
        });
      });
    });

    it("disableCookieBanner should remove cookieBanner", () => {
      cy.disableCookieBanner()
        .as("interception")
        .then(() =>
          $.get(url(`/apps/public/public-options@app-cockpit/options.json?_=c`))
        )
        .then((response) => {
          expect(response.cookieBanner).to.be.undefined;
          expect(response.cookiePreferences).to.not.be.undefined;
          cy.window().then((win) => {
            const cookie = win.localStorage.getItem("acceptCookieNotice");
            expect(cookie).to.be.null;
          });
        })
        .wait("@interception");
    });

    it("disableCookieBanner should ignore errors returned by the server", () => {
      cy.disableCookieBanner()
        .as("interception")
        .then(() => {
          return cy.then(() => {
            // do not return jQuery promise directly, because it would fail the test on error
            return new Promise<{ status: number; responseText?: string }>(
              (resolve) => {
                $.get({
                  url: url(
                    `/apps/public/public-options@app-error/options.json`
                  ),
                })
                  .done((data, textStatus, xhr) => {
                    resolve({ status: xhr.status, responseText: data });
                  })
                  .fail((xhr) => {
                    resolve({
                      status: xhr.status,
                      responseText: xhr.responseText,
                    });
                  });
              }
            );
          });
        })
        .then((response) => {
          expect(response.status).to.eq(404);
          expect(response.responseText).to.contain("404 Not Found");
        })
        .wait("@interception");
    });
  });

  context("setLanguage", () => {
    it("should call setLocale to init language ", () => {
      const language = "en"; // replace with the language you want to test
      const setLanguageStub = cy.stub(global, "setLocale");
      cy.setLanguage(language).then(() => {
        expect(setLanguageStub).to.be.calledWith(language);
      });
    });

    it("should update localStorage to set c8y_language", () => {
      const language = "en"; // replace with the language you want to test
      cy.window().then((win) => {
        const lang = win.localStorage.getItem("c8y_language");
        expect(lang).to.be.null;
      });

      cy.setLanguage(language).then(() => {
        expect(window.localStorage.getItem("c8y_language")).to.eq(language);
        cy.window().then((win) => {
          const lang = win.localStorage.getItem("c8y_language");
          expect(lang).to.deep.eq(language);
        });
      });
    });

    it("should intercept inventory request and update language key", () => {
      cy.setLanguage("de")
        .as("interception")
        .then(() => {
          return $.get(
            url(`/inventory/managedObjects?fragmentType=languageXYZ`)
          );
        })
        .then((response) => {
          expect(response.managedObjects[0].languageXYZ).to.eq("de");
        })
        .wait("@interception");
    });
  });

  context("visitAndWaitForSelector", () => {
    beforeEach(() => {
      // Stub cy.setLanguage to avoid side effects
      cy.stub(cy, "setLanguage").as("setLanguageStub");
      // Stub cy.get to avoid waiting for selectors
      cy.stub(cy, "get").returns({
        should: cy.stub().resolves(),
      } as any);
    });

    it("should call cy.visit with URL and no query string when no remotes provided", () => {
      const visitStub = cy.stub(cy, "visit").resolves();

      cy.visitAndWaitForSelector("/test-url").then(() => {
        expect(visitStub).to.be.calledWith("/test-url", undefined);
      });
    });

    it("should call cy.visit with remotes query string when remotes option provided", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = '{"my-plugin":["myPluginViewProviders"]}';

      cy.visitAndWaitForSelector("/test-url", {
        remotes: remotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", { qs: { remotes, forceUrlRemotes: false } });
      });
    });

    it("should call cy.visit with remotes object when remotes option provided", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = { "my-plugin": ["myPluginViewProviders"] };

      cy.visitAndWaitForSelector("/test-url", {
        remotes: remotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", { qs: { remotes: JSON.stringify(remotes), forceUrlRemotes: false } });
      });
    });

    it("should call cy.visit with remotes from C8Y_SHELL_EXTENSION env when not in options", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const envRemotes = '{"env-plugin":["envViewProviders"]}';
      stubEnv({ C8Y_SHELL_EXTENSION: envRemotes });

      cy.visitAndWaitForSelector("/test-url").then(() => {
        expect(visitStub).to.be.calledWith("/test-url", {
          qs: { remotes: envRemotes, forceUrlRemotes: false },
        });
      });
    });

    it("should prefer remotes option over C8Y_SHELL_EXTENSION env", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const optionRemotes = '{"option-plugin":["optionViewProviders"]}';
      const envRemotes = '{"env-plugin":["envViewProviders"]}';
      stubEnv({ C8Y_SHELL_EXTENSION: envRemotes });

      cy.visitAndWaitForSelector("/test-url", {
        remotes: optionRemotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", {
          qs: { remotes: optionRemotes, forceUrlRemotes: false },
        });
      });
    });

    it("should build URL with remotes and forceUrlRemotes option if both are set", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = '{"my-plugin":["myPluginViewProviders"]}';

      cy.visitAndWaitForSelector("/test-url", {
        remotes: remotes,
        forceUrlRemotes: true,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", {
          qs: { remotes, forceUrlRemotes: true },
        });
      });
    });

    it("should build URL with remotes and forceUrlRemotes option set to false if not provided", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = '{"my-plugin":["myPluginViewProviders"]}';

      cy.visitAndWaitForSelector("/test-url", {
        remotes: remotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", {
          qs: { remotes, forceUrlRemotes: false },
        });
      });
    });

    it("should build URL with shell target from options", () => {
      const visitStub = cy.stub(cy, "visit").resolves();

      cy.visitAndWaitForSelector("home", {
        shell: "cockpit",
      }).then(() => {
        expect(visitStub).to.be.calledWith(
          "/apps/cockpit/index.html#/home",
          undefined
        );
      });
    });

    it("should build URL with shell target from C8Y_SHELL_TARGET env", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      stubEnv({ C8Y_SHELL_TARGET: "devicemanagement" });

      cy.visitAndWaitForSelector("devices").then(() => {
        expect(visitStub).to.be.calledWith(
          "/apps/devicemanagement/index.html#/devices",
          undefined
        );
      });
    });

    it("should build URL with shell target from C8Y_SHELL_NAME env when C8Y_SHELL_TARGET not set", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      stubEnv({ C8Y_SHELL_NAME: "administration" });

      cy.visitAndWaitForSelector("users").then(() => {
        expect(visitStub).to.be.calledWith(
          "/apps/administration/index.html#/users",
          undefined
        );
      });
    });

    it("should prefer shell option over C8Y_SHELL_TARGET env", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      stubEnv({ C8Y_SHELL_TARGET: "devicemanagement" });

      cy.visitAndWaitForSelector("home", {
        shell: "cockpit",
      }).then(() => {
        expect(visitStub).to.be.calledWith(
          "/apps/cockpit/index.html#/home",
          undefined
        );
      });
    });

    it("should combine shell and remotes options", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = '{"my-plugin":["myPluginViewProviders"]}';

      cy.visitAndWaitForSelector("home", {
        shell: "cockpit",
        remotes: remotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/apps/cockpit/index.html#/home", {
          qs: { remotes, forceUrlRemotes: false },
        });
      });
    });

    it("should log shell url and remotes in Cypress log message", () => {
      const visitStub = cy.stub(cy, "visit").resolves();
      const remotes = '{"my-plugin":["myPluginViewProviders"]}';

      const logSpy = cy.spy(Cypress, "log").log(false);
      const cleanup = setupLoggerSetSpy("visitAndWaitForSelector");

      cy.visitAndWaitForSelector("home", {
        shell: "cockpit",
        remotes: remotes,
      }).then(() => {
        expect(visitStub).to.be.calledWith("/apps/cockpit/index.html#/home", {
          qs: { remotes, forceUrlRemotes: false },
        });
        expect(
          getMessageForLogSpy(logSpy, "visitAndWaitForSelector")
        ).to.contain("/apps/cockpit/index.html#/home " + remotes);
        const consoleProps = getConsolePropsForLogSpy(
          logSpy,
          "visitAndWaitForSelector"
        );
        expect(consoleProps.shell).to.eq("cockpit");
        expect(consoleProps.remotes).to.eq(remotes);
        cleanup();
      });
    });

    it("should work with positional parameters and no remotes", () => {
      const visitStub = cy.stub(cy, "visit").resolves();

      cy.visitAndWaitForSelector(
        "/test-url",
        "en",
        "[data-cy=test]",
        5000
      ).then(() => {
        expect(visitStub).to.be.calledWith("/test-url", undefined);
      });
    });

    it("should call setLanguage with provided language option", () => {
      cy.stub(cy, "visit").resolves();

      cy.visitAndWaitForSelector("/test-url", {
        language: "de",
      }).then(() => {
        expect(cy.setLanguage).to.be.calledWith("de");
      });
    });

    it("should call setLanguage with default language when not provided", () => {
      cy.stub(cy, "visit").resolves();

      cy.visitAndWaitForSelector("/test-url").then(() => {
        expect(cy.setLanguage).to.be.calledWith("en");
      });
    });
  });
});
