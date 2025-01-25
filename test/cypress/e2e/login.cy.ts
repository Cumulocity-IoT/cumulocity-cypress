import {
  expectHttpRequest,
  initRequestStub,
  url as _url,
} from "../support/testutils";

const { _, $ } = Cypress;

describe("login", () => {
  let url: string;
  const testAuthorizationCookie = "eyJhbGciOiJ";
  const testXsrfTokenCookie = "pQWAHZQfhLRcDVqVsCjV";

  beforeEach(() => {
    Cypress.session.clearAllSavedSessions();
    initRequestStub();

    Cypress.env("C8Y_TENANT", "t702341987");
    url = _url(`/tenant/oauth?tenant_id=t702341987`);

    // response is mocked with set-cookie headers in test-server.ts
  });

  context("without cy.session", () => {
    it("login with user and password", () => {
      let validationCalled = false;
      cy.login("user", "password", {
        useSession: false,
        disableGainsight: false,
        hideCookieBanner: false,
        validationFn: cy.stub(() => {
          validationCalled = true;
        }),
      }).then((auth) => {
        // we do not want auth to be returned
        expect(auth).to.be.undefined;
        expect(validationCalled).to.be.true;
        expect(Cypress.env("C8Y_LOGGED_IN_USER")).to.eq("user");

        cy.getCookie("authorization").then((cookie) => {
          expect(cookie?.value).to.eq(testAuthorizationCookie);
        });
        cy.getCookie("XSRF-TOKEN").then((cookie) => {
          expect(cookie?.value).to.eq(testXsrfTokenCookie);
        });

        expectHttpRequest({
          url,
          method: "POST",
          body: {
            grant_type: "PASSWORD",
            username: "user",
            password: "password",
            tfa_code: undefined,
          },
          form: true,
        });
      });
    });

    it("login with test annotation", { auth: "testadmin" }, () => {
      Cypress.env("testadmin_username", "testuser");
      Cypress.env("testadmin_password", "testpasswd");

      cy.getAuth()
        .login({
          useSession: false,
          validationFn: cy.stub(() => {}),
        })
        .then((auth) => {
          expect(auth).to.be.undefined;
          cy.getCookie("authorization").then((cookie) => {
            expect(cookie?.value).to.eq(testAuthorizationCookie);
          });
          cy.getCookie("XSRF-TOKEN").then((cookie) => {
            expect(cookie?.value).to.eq(testXsrfTokenCookie);
          });

          expect(Cypress.env("C8Y_LOGGED_IN_USER")).to.eq("testuser");
          expect(Cypress.env("C8Y_LOGGED_IN_USER_ALIAS")).to.eq("testadmin");
        });
    });

    it("login reset c8yclient", () => {
      cy.getAuth({
        user: "admin",
        password: "mypassword",
        tenant: "t12345678",
      })
        .c8yclient()
        .then((client) => {
          expect(client).to.not.be.undefined;
          expect(cy.state("c8yclient")).to.not.be.undefined;
        });

      let validationCalled = false;
      cy.login("user", "password", {
        useSession: false,
        hideCookieBanner: false,
        disableGainsight: false,
        validationFn: cy.stub(() => {
          validationCalled = true;
        }),
      }).then(() => {
        expectHttpRequest({ url });
        expect(validationCalled).to.be.true;
        expect(Cypress.env("C8Y_LOGGED_IN_USER")).to.eq("user");
        expect(cy.state("c8yclient")).to.be.undefined;
      });
    });

    it("login with subject from cypress chain", () => {
      let validationCalled = false;
      cy.getAuth("x", "y")
        .login({
          useSession: false,
          hideCookieBanner: false,
          disableGainsight: false,
          validationFn: cy.stub(() => {
            validationCalled = true;
          }),
        })
        .then(() => {
          expectHttpRequest({
            url,
            method: "POST",
            body: {
              grant_type: "PASSWORD",
              username: "x",
              password: "y",
              tfa_code: undefined,
            },
            form: true,
          });
          expect(Cypress.env("C8Y_LOGGED_IN_USER")).to.eq("x");
          expect(validationCalled).to.be.true;
        });
    });
  });

  context("use cy.session", () => {
    it("login set cookies in session", () => {
      cy.login({
        user: "pvtuser",
        password: "pvtpassword",
        tenant: "t702341987",
      }).then((auth) => {
        Cypress.session.getCurrentSessionData().then((sessionData) => {
          expect(sessionData.cookies).to.not.be.undefined;
          expect(sessionData.cookies).to.have.length(2);
          expect(sessionData.cookies![0].name).to.eq("authorization");
          expect(sessionData.cookies![0].value).to.eq(testAuthorizationCookie);
          expect(sessionData.cookies![1].name).to.eq("XSRF-TOKEN");
          expect(sessionData.cookies![1].value).to.eq(testXsrfTokenCookie);
        });

        cy.getCookies().then((cookies) => {
          expect(cookies).to.have.length(2);
          expect(cookies[0].name).to.eq("authorization");
          expect(cookies[0].value).to.eq(testAuthorizationCookie);
          expect(cookies[1].name).to.eq("XSRF-TOKEN");
          expect(cookies[1].value).to.eq(testXsrfTokenCookie);
        });

        expect(auth).to.be.undefined;
        expect(Cypress.env("C8Y_LOGGED_IN_USER")).to.eq("pvtuser");
      });
    });

    it("hideCookieBanner", () => {
      cy.login(
        {
          user: "pvtuser",
          password: "pvtpassword",
          tenant: "t702341987",
        },
        {
          hideCookieBanner: true,
        }
      ).then(() => {
        cy.window().then((win) => {
          const c = win.localStorage.getItem("acceptCookieNotice");
          expect(c).to.not.be.null;
          const cookie = JSON.parse(c!);
          expect(cookie).to.deep.eq({ required: true, functional: true, marketing: true });
        });
      });
    });

    it("gainsight is disabled", (done) => {
      cy.login(
        {
          user: "pvtuser",
          password: "pvtpassword",
          tenant: "t702341987",
        },
        {
          disableGainsight: true,
        }
      ).then(() => {
        Cypress.once("fail", (err) => {
          expect(err.message).to.eq(
            "Intercepted Gainsight API key call, but Gainsight should have been disabled. Failing..."
          );
          done();
        });

        cy.then(() => {
          $.get(_url(`/tenant/system/options/gainsight/api.key`));
        });
      });
    });
  });

  context("authentication", () => {
    it("login throws error without auth", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("cy.login() requires authentication");
        done();
      });

      cy.getAuth().login({
        useSession: false,
        validationFn: cy.stub(() => {}),
      });
    });
  });
});
