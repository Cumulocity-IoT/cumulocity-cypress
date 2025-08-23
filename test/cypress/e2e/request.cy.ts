import {
  expectHttpRequest,
  stubResponses,
  initRequestStub,
  url as _url,
  stubEnv,
  basicAuthorization,
} from "../support/testutils";
const { _, Promise } = Cypress;

describe("request", () => {
  const testToken =
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE3NTU5Nzc0NzUsImV4cCI6MTc4NzUxMzQ3NSwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsInhzcmZUb2tlbiI6IjIzNG5tMjM0bm0yMzQyMzQiLCJ0ZW4iOiJ0MTIzNDU2NyIsInVzZXIiOiJ0b2tlbnVzZXIiLCJiYXNlVXJsIjoiaHR0cHM6Ly9teXRlc3QuYzh5LmlvIn0.wKGIxJrUnT0NNyd198mfxegV6kncYsNFhGa6MFSSKCE";

  beforeEach(() => {
    initRequestStub();
  });

  afterEach(() => {
    cy.clearAllLocalStorage();
    cy.clearAllCookies();
  });

  context("auth from environment", () => {
    it("should use auth from env variables", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.auth).to.eq(basicAuthorization("admin", "password"));
        expect(request.cookies).to.deep.eq({});
        expect(request.body).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
      });
    });

    it("should use cookie auth from env and add x-xsrf-token header", () => {
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.be.undefined;
        expect(request.url).to.eq("/my/test/request");
        expect(request.method).to.eq("GET");
        expect(request.body).to.deep.eq({});

        const headers = response.body.request.headers;
        const cookies: any = { authorization: "abc", "XSRF-TOKEN": "1234" };
        expect(request.cookies).to.deep.eq(cookies);
        expect(headers).to.have.property("x-xsrf-token", "1234");
        expect(headers).to.not.have.property("authorization");
      });
    });

    it("should not override cookie with basic auth", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.be.undefined;

        const headers = response.body.request.headers;
        const cookies: any = { authorization: "abc", "XSRF-TOKEN": "1234" };
        expect(request.cookies).to.deep.eq(cookies);
        expect(headers).to.have.property("x-xsrf-token", "1234");
        expect(headers).to.not.have.property("authorization");
      });
    });

    it("should use bearer jwt token", () => {
      stubEnv({ C8Y_TOKEN: testToken });
      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.eq(`Bearer ${testToken}`);
        expect(request.headers).to.have.property(
          "authorization",
          `Bearer ${testToken}`
        );
      });
    });

    it("should prefer cookie over bearer auth", () => {
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");
      stubEnv({ C8Y_TOKEN: testToken });

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.be.undefined;

        const headers = response.body.request.headers;
        const cookies: any = { authorization: "abc", "XSRF-TOKEN": "1234" };
        expect(request.cookies).to.deep.eq(cookies);
        expect(headers).to.have.property("x-xsrf-token", "1234");
        expect(headers).to.not.have.property("authorization");
      });
    });

    it("should use cookie auth from cy.login", () => {
      cy.login({ user: "admin", password: "password" });

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.be.undefined;

        const headers = response.body.request.headers;
        const cookies: any = {
          authorization: "eyJhbGciOiJ",
          "XSRF-TOKEN": "pQWAHZQfhLRcDVqVsCjV",
        };
        expect(request.cookies).to.deep.eq(cookies);
        expect(headers).to.have.property(
          "x-xsrf-token",
          "pQWAHZQfhLRcDVqVsCjV"
        );
        expect(headers).to.not.have.property("authorization");
      });
    });

    it("should use auth from options", () => {
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");
      stubEnv({ C8Y_TOKEN: testToken });

      cy.request({
        method: "POST",
        url: "/my/test/request",
        auth: { user: "abc", password: "xyz" },
      }).then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.eq(basicAuthorization("abc", "xyz"));
      });
    });

    it("should not support previousSubject", () => {
      // fail if behaviour changes in new cypress versions
      cy.getAuth({ user: "admin", password: "password" })
        .request({
          url: "/my/test/request",
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          const request = response.body.request;
          expect(request.auth).to.be.undefined;
        });
    });
  });

  context("auth from useAuth()", () => {
    it("use auth configured with useAuth command", () => {
      cy.useAuth({ user: "admin", password: "password" });

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.auth).to.eq(basicAuthorization("admin", "password"));
        expect(request.cookies).to.deep.eq({});
        expect(request.body).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
      });
    });

    it("do not override auth in request", () => {
      cy.useAuth({ user: "admin", password: "password" });

      cy.request({
        method: "POST",
        url: "/my/test/request",
        auth: { user: "myadmin", password: "mypassword" },
      }).then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.method).to.eq("POST");
        expect(request.auth).to.eq(basicAuthorization("myadmin", "mypassword"));
        expect(request.cookies).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
      });
    });

    it("should not override cookie and add auth header", () => {
      cy.useAuth({ user: "admin", password: "password" });
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.auth).to.be.undefined;

        const headers = response.body.request.headers;
        const cookies: any = { authorization: "abc", "XSRF-TOKEN": "1234" };
        expect(request.cookies).to.deep.eq(cookies);
        expect(headers).to.have.property("x-xsrf-token", "1234");
        expect(headers).to.not.have.property("authorization");
      });
    });
  });

  context("auth from test config overrides", () => {
    it(
      "use auth from config overrides",
      { auth: { user: "myadmin", password: "mypassword" } },
      () => {
        cy.request({
          method: "POST",
          url: "/my/test/request",
          auth: { user: "myadmin", password: "mypassword" },
        }).then(() => {
          expectHttpRequest({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "myadmin", password: "mypassword" },
            body: undefined,
          });
        });
      }
    );

    it(
      "do not override auth in request",
      { auth: { user: "admin", password: "password" } },
      () => {
        cy.request({
          method: "POST",
          url: "/my/test/request",
          auth: { user: "myadmin", password: "mypassword" },
        }).then(() => {
          expectHttpRequest({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "myadmin", password: "mypassword" },
            body: undefined,
          });
        });
      }
    );
  });

  context("preferBasicAuth", () => {
    const auth = { user: "myadmin", password: "mypassword" };
    it("should prefer basic auth", () => {
      cy.setCookie("XSRF-TOKEN", "1234");
      cy.setCookie("authorization", "abc");

      cy.request({
        method: "POST",
        url: "/my/test/request",
        auth,
        preferBasicAuth: true,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.method).to.eq("POST");
        expect(request.auth).to.eq(basicAuthorization("myadmin", "mypassword"));
        // expect(request.cookies).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
      });
    });

    it("should prefer basic auth with useAuth", () => {
      cy.useAuth(auth);

      cy.request("/my/test/request").then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.auth).to.eq(basicAuthorization("myadmin", "mypassword"));
        expect(request.cookies).to.deep.eq({});
        expect(request.body).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
      });
    });

    it("should prefer basic auth over bearer auth", () => {
      stubEnv({
        C8Y_TOKEN: testToken,
        C8Y_USERNAME: "myadmin",
        C8Y_PASSWORD: "mypassword",
      });

      cy.request({
        method: "POST",
        url: "/my/test/request",
        auth,
        preferBasicAuth: true,
      }).then((response) => {
        expect(response.status).to.eq(200);
        const request = response.body.request;
        expect(request.url).to.eq("/my/test/request");
        expect(request.auth).to.eq(basicAuthorization("myadmin", "mypassword"));
        // expect(request.cookies).to.deep.eq({});
        expect(request.headers).to.not.have.property("x-xsrf-token");
        expect(request.headers).to.have.property(
          "authorization",
          basicAuthorization("myadmin", "mypassword")
        );
      });
    });
  });

  context("request command overwrite", () => {
    // @ts-expect-error
    const orgRequestFn = Cypress.cy["request"];

    beforeEach(() => {
      // @ts-expect-error
      Cypress.cy["request"] = _.cloneDeep(orgRequestFn);
    });

    it("overwritten request uses auth from env variables", () => {
      Cypress.Commands.overwrite("request", (originalFn, ...args) => {
        // assume its called with options as a single argument
        const options = args[0];
        // set custom timeout to verify overwritten request is used
        options.timeout = 100077;
        return originalFn(options);
      });

      stubEnv({ C8Y_USERNAME: "admin2", C8Y_PASSWORD: "password2" });

      cy.request({
        method: "POST",
        url: "/my/test/request",
      }).then(() => {
        expectHttpRequest({
          url: _url(`/my/test/request`),
          method: "POST",
          auth: { user: "admin2", password: "password2" },
          body: undefined,
          timeout: 100077,
        });
      });
    });

    it(
      "overwritten requests uses auth from config overrides",
      { auth: { user: "admin", password: "password" } },
      () => {
        Cypress.Commands.overwrite("request", (originalFn, ...args) => {
          // assume its called with options as a single argument
          const options = args[0];
          // set custom timeout to verify overwritten request is used
          options.timeout = 100099;
          return originalFn(options);
        });

        cy.request({
          method: "POST",
          url: "/my/test/request",
        }).then(() => {
          expectHttpRequest({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "admin", password: "password" },
            body: undefined,
            timeout: 100099,
          });
        });
      }
    );

    it("overwritten request uses auth from useAuth()", () => {
      Cypress.Commands.overwrite("request", (originalFn, ...args) => {
        // assume its called with options as a single argument
        const options = args[0];
        // set custom timeout to verify overwritten request is used
        options.timeout = 100088;
        return originalFn(options);
      });

      cy.useAuth({ user: "admin", password: "password" });

      cy.request({
        method: "POST",
        url: "/my/test/request",
      }).then(() => {
        expectHttpRequest({
          url: _url(`/my/test/request`),
          method: "POST",
          auth: { user: "admin", password: "password" },
          body: undefined,
          timeout: 100088,
        });
      });
    });
  });

  context("retryRequest", () => {
    let lastLog: any;
    let delaySpy: Cypress.Agent<sinon.SinonSpy<any[], any>>;

    beforeEach(() => {
      delaySpy = cy.spy(Promise, "delay");

      cy.on("log:added", (attrs, log) => {
        if (attrs.name === "request") {
          lastLog = log;
        }
      });
    });

    it("should retry requests", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      stubResponses([
        {
          isOkStatusCode: false,
          status: 400,
          body: undefined,
        },
        {
          isOkStatusCode: false,
          status: 400,
          body: undefined,
        },
        {
          isOkStatusCode: true,
          status: 200,
          body: undefined,
        },
      ]);

      cy.retryRequest(
        {
          method: "POST",
          url: "/my/test/request",
          retryDelay: 1000,
          retries: 2,
        },
        (response) => {
          return response.status === 200;
        }
      ).then((response) => {
        expect(delaySpy).to.be.calledWith(1000, "wait");
        expect(delaySpy).to.be.callCount(2);

        expectHttpRequest(
          Array(3).fill({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "admin", password: "password" },
            body: undefined,
          })
        );
        expect(response).to.not.be.undefined;
        expect(response.status).to.eq(200);
        expect(response.isOkStatusCode).to.eq(true);
      });
    });

    it("should fail when retry requests exceeds max - failOnStatusCode true", (done) => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      stubResponses(
        Array(3).fill({
          isOkStatusCode: false,
          status: 400,
          body: undefined,
        })
      );

      Cypress.on("fail", (error) => {
        expect(delaySpy).to.be.calledWith(555, "wait");
        expect(delaySpy).to.be.callCount(2);

        expectHttpRequest(
          Array(3).fill({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "admin", password: "password" },
            body: undefined,
          })
        );

        expect(lastLog.get("error")).to.eq(error);
        expect(lastLog.get("state")).to.eq("failed");

        done();
      });

      cy.retryRequest(
        {
          method: "POST",
          url: "/my/test/request",
          failOnStatusCode: true,
          retryDelay: 555,
          retries: 2,
        },
        (response) => {
          return response.status === 200;
        }
      );
    });

    it("should fail when retry requests exceeds max - failOnStatusCode false", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      stubResponses(
        Array(3).fill({
          isOkStatusCode: false,
          status: 400,
          body: undefined,
        })
      );

      cy.retryRequest(
        {
          method: "POST",
          url: "/my/test/request",
          failOnStatusCode: false,
          retryDelay: 222,
          retries: 2,
        },
        (response) => {
          return response.status === 200;
        }
      ).then((response) => {
        expect(delaySpy).to.be.calledWith(222, "wait");
        expect(delaySpy).to.be.callCount(2);

        expectHttpRequest(
          Array(3).fill({
            url: _url(`/my/test/request`),
            method: "POST",
            auth: { user: "admin", password: "password" },
            body: undefined,
          })
        );

        expect(response).to.not.be.undefined;
        expect(response.status).to.eq(400);
        expect(response.isOkStatusCode).to.eq(false);
      });
    });
  });
});
