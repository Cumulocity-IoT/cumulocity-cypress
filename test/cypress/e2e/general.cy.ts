import { url } from "../support/testutils";
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
});
