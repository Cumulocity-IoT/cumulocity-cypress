import {
  C8yAuthOptions,
  C8yDefaultPact,
  C8yPactFetchClient,
} from "cumulocity-cypress/c8ypact";
import { BasicAuth, IFetchResponse } from "@c8y/client";
import { encodeBase64 } from "../../../src/shared/c8yclient";
import {
  url as _url,
  initLoginRequestStub,
  initRequestStub,
  stubCypressPactConfig,
  stubResponse,
} from "../support/testutils";

import { C8yQicktypeSchemaGenerator } from "cumulocity-cypress/contrib/quicktype";

describe("c8ypact fetchclient", () => {
  beforeEach(() => {
    Cypress.env("C8Y_PACT_MODE", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_LOGGED_IN_USER", undefined);
    Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", undefined);
    Cypress.c8ypact.schemaGenerator = new C8yQicktypeSchemaGenerator();
  });

  afterEach(() => {
    // delete recorded pacts after each test
    cy.then(() => {
      cy.task("c8ypact:remove", Cypress.c8ypact.getCurrentTestId()).then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact).to.be.null;
        });
      });
    });
  });

  const auth = { user: "test", password: "test", userAlias: "admin" };
  const basicAuth = `Basic ${encodeBase64(auth.user + ":" + auth.password)}`;

  context("authentication", () => {
    it("should get CookieAuth from environment", () => {
      cy.setCookie("XSRF-TOKEN", "pQWAHZQfh")
        .setCookie("Authorization", "eyJhbGciOiJ")
        .then(() => {
          Cypress.env("C8Y_LOGGED_IN_USER", "test");
          Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", "admin");
          const client = new C8yPactFetchClient({
            cypresspact: Cypress.c8ypact,
          });
          const options = client.getFetchOptions({});
          expect(options.headers).to.have.property("X-XSRF-TOKEN", "pQWAHZQfh");
          expect(options.headers).to.have.property("UseXBasic", true);
          expect(options.headers).to.have.property(
            "Authorization",
            `Bearer eyJhbGciOiJ`
          );
          // @ts-expect-error
          expect(client.getUser()).to.deep.eq(["test", "admin"]);
        });
    });

    it.skip("should get CookieAuth from cy.oauthLogin authOptions", () => {
      Cypress.session.clearAllSavedSessions();
      Cypress.Cookies.debug(true);
      initRequestStub();
      initLoginRequestStub("pQWAHZQfhLRcDVqVsCjV", "eyJhbGciOiJ", "t702341987");

      cy.oauthLogin({
        user: "test1",
        password: "pvtpassword1",
        userAlias: "admin1",
      }).then((auth: C8yAuthOptions) => {
        expect(auth).to.have.property("xsrfToken", "pQWAHZQfhLRcDVqVsCjV");
        expect(auth).to.have.property("bearer", "eyJhbGciOiJ");
        const client = new C8yPactFetchClient({
          cypresspact: Cypress.c8ypact,
          auth,
        });
        const options = client.getFetchOptions({});
        expect(options.headers).to.have.property(
          "X-XSRF-TOKEN",
          "pQWAHZQfhLRcDVqVsCjV"
        );
        expect(options.headers).to.have.property(
          "Authorization",
          `Bearer eyJhbGciOiJ`
        );
        expect(options.headers).to.have.property("UseXBasic", true);
        // @ts-expect-error
        expect(client.getUser()).to.deep.eq(["test1", "admin1"]);
      });
    });

    it.skip("should create BasicAuth from authOptions without Cookies", () => {
      Cypress.session.clearAllSavedSessions();
      Cypress.Cookies.debug(true);
      initRequestStub();
      initLoginRequestStub(undefined, undefined, "t702341987");

      const u = {
        user: "test2",
        password: "pvtpassword2",
        userAlias: "admin2",
      };
      cy.oauthLogin(u).then((auth: C8yAuthOptions) => {
        expect(auth).to.not.have.property("xsrfToken");
        expect(auth).to.not.have.property("bearer");
        const client = new C8yPactFetchClient({
          cypresspact: Cypress.c8ypact,
          auth,
        });
        const options = client.getFetchOptions({});
        expect(options.headers).to.have.property(
          "Authorization",
          `Basic ${encodeBase64(`t702341987/${u.user}:${u.password}`)}`
        );
        expect(options.headers).to.have.property("UseXBasic", true);
        // @ts-expect-error
        expect(client.getUser()).to.deep.eq(["test2", "admin2"]);
      });
    });

    it("should use auth from authOptions", () => {
      const u = {
        user: "test3",
        password: "pvtpassword3",
        userAlias: "admin3",
      };
      const client = new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth: new BasicAuth(u),
      });
      const options = client.getFetchOptions({});
      expect(options.headers).to.have.property(
        "Authorization",
        `Basic ${encodeBase64(`${u.user}:${u.password}`)}`
      );
      expect(options.headers).to.have.property("UseXBasic", true);
      // @ts-expect-error
      expect(client.getUser()).to.deep.eq(["test3", undefined]);
    });

    it("should use auth from authOptions with alias from env", () => {
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", "admin3");
      const u = {
        user: "test3",
        password: "pvtpassword3",
      };
      const client = new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth: new BasicAuth(u),
      });
      const options = client.getFetchOptions({});
      // @ts-expect-error
      expect(client.getUser()).to.deep.eq(["test3", "admin3"]);
    });
  });

  context("recording", { auth }, () => {
    let user: C8yAuthOptions = {
      user: "test",
      password: "pvtpassword",
      userAlias: "admin",
    };

    const createFetchClient = () => {
      return new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth: new BasicAuth(user),
      });
    };

    const log = { log: false };

    beforeEach(() => {
      Cypress.env("C8Y_PACT_MODE", "recording");
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", user.userAlias);
    });

    it("should record pact objects", () => {
      cy.wrap(
        createFetchClient().fetch(
          "/inventory/managedObjects?fragmentType=abcd",
          log
        )
      ).then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.info).to.have.property(
            "baseUrl",
            Cypress.config("baseUrl")
          );

          expect(pact?.records).to.have.length(1);
          const r = pact?.records[0];
          expect(r?.request).to.not.be.undefined;
          expect(r?.request).to.have.property("method", "GET");
          expect(r?.request).to.have.property(
            "url",
            "/inventory/managedObjects?fragmentType=abcd"
          );
          expect(r?.response).to.not.be.undefined;
          expect(r?.response).to.have.property("status", 200);
          expect(r?.response).to.have.property("headers");
          expect(r?.auth).to.deep.eq({
            user: auth.user,
            userAlias: "admin",
            type: "BasicAuth",
          });
          expect(r?.response.body).to.have.property("managedObjects");
          expect(r?.response.$body).to.not.be.undefined;
        });
      });
    });

    it("should record pact object and call savePact callback", () => {
      Cypress.c8ypact.on.savePact = (pact) => {
        pact.records[0].response.status = 299;
        return pact;
      };
      const callbackSpy = cy.spy(Cypress.c8ypact.on, "savePact");
      cy.wrap(
        createFetchClient().fetch(
          "/inventory/managedObjects?fragmentType=abcd",
          log
        )
      ).then(() => {
        Cypress.c8ypact.on = {};

        expect(callbackSpy).to.be.calledOnce;
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records[0].response).to.have.property("status", 299);
        });
      });
    });

    it("should record pact object and call saveRecord callback", () => {
      Cypress.c8ypact.on.saveRecord = (record) => {
        record.response.status = 299;
        return record;
      };
      const callbackSpy = cy.spy(Cypress.c8ypact.on, "saveRecord");
      cy.wrap(
        createFetchClient().fetch(
          "/inventory/managedObjects?fragmentType=abcd",
          log
        )
      ).then(() => {
        Cypress.c8ypact.on = {};

        expect(callbackSpy).to.be.calledOnce;
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records[0].response).to.have.property("status", 299);
        });
      });
    });

    it("should not record pact object if savePact callback returns undefined", () => {
      Cypress.c8ypact.on.savePact = (pact) => {
        return undefined;
      };
      const callbackSpy = cy.spy(Cypress.c8ypact.on, "savePact");
      cy.wrap(
        createFetchClient().fetch(
          "/inventory/managedObjects?fragmentType=abcd",
          log
        )
      ).then(() => {
        Cypress.c8ypact.on = {};

        expect(callbackSpy).to.be.calledOnce;
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact).to.be.null;
        });
      });
    });

    it("should not record pact object if saveRecordcallback returns undefined", () => {
      Cypress.c8ypact.on.saveRecord = (pact) => {
        return undefined;
      };
      const callbackSpy = cy.spy(Cypress.c8ypact.on, "saveRecord");
      cy.wrap(
        createFetchClient().fetch(
          "/inventory/managedObjects?fragmentType=abcd",
          log
        )
      ).then(() => {
        Cypress.c8ypact.on = {};

        expect(callbackSpy).to.be.calledOnce;
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact).to.be.null;
        });
      });
    });

    it("should record only required auth properties", () => {
      const auth = new BasicAuth(user);
      // @ts-expect-error - additional property should not be stored in auth
      auth.xsrfToken = "pQWAHZQfh";
      const client = new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth,
      });
      cy.wrap(
        client.fetch("/inventory/managedObjects?fragmentType=abcd", log)
      ).then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          const r = pact?.records[0];
          expect(r?.auth).to.deep.eq({
            user: auth.user,
            userAlias: "admin",
            type: "BasicAuth",
          });
        });
      });
    });

    it("should record failing requests", () => {
      initRequestStub();
      stubResponse(
        new window.Response("Resource not found", {
          status: 404,
          statusText: "Not Found",
        })
      );

      const client = new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth: new BasicAuth(user),
      });
      cy.wrap(
        client.fetch("/inventory/notfound").catch((failure) => {
          return failure;
        })
      ).then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records).to.have.length(1);
          expect(pact?.info).to.have.property(
            "baseUrl",
            Cypress.config("baseUrl")
          );

          const r = pact?.records[0];
          expect(r?.request).to.not.be.undefined;
          expect(r?.request).to.have.property("url", "/inventory/notfound");
          expect(r?.request).to.have.property("method", "GET");
          expect(r?.request).to.have.property("headers");
          expect(r?.request.headers).to.have.property("Authorization");
          expect(r?.response.status).to.eq(404);
          expect(r?.response).to.have.property("headers");
          expect(r?.response.headers).to.have.property("content-type");
          expect(r?.response.statusText).to.eq("Not Found");
          expect(r?.response.body).to.eq("Resource not found");
        });
      });
    });
  });

  context("mocking", { auth }, () => {
    let user: C8yAuthOptions = {
      user: "test",
      password: "pvtpassword",
      userAlias: "admin",
    };

    const createFetchClient = () => {
      return new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth: new BasicAuth(user),
      });
    };

    const response: Cypress.Response<any> = {
      status: 201,
      statusText: "OK",
      headers: { "content-type": "application/json1" },
      body: { name: "t123456789" },
      duration: 100,
      requestHeaders: { "content-type": "application/json2" },
      requestBody: { id: "abc123124" },
      allRequestResponses: [],
      isOkStatusCode: false,
      method: "POST",
      url: _url("/inventory/managedObjects?fragmentType=abcd"),
    };

    const errorResponse: Cypress.Response<any> = {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json1" },
      body: "Resource not found",
      duration: 100,
      requestHeaders: { "content-type": "application/json2" },
      allRequestResponses: [],
      isOkStatusCode: false,
      method: "GET",
      url: _url("/inventory/notfound"),
    };

    beforeEach(() => {
      Cypress.env("C8Y_PACT_MODE", "apply");
      expect(Cypress.c8ypact.isMockingEnabled()).to.be.true;
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", user.userAlias);
      Cypress.c8ypact.current = C8yDefaultPact.from(response, {
        id: "123",
        baseUrl: Cypress.config("baseUrl") || "",
      });
    });

    it("should return recorded response", () => {
      cy.wrap(
        createFetchClient().fetch("/inventory/managedObjects?fragmentType=abcd")
      ).then(
        // @ts-expect-error
        async (response: IFetchResponse) => {
          expect(response.status).to.eq(201);
          expect(await response.json()).to.deep.eq({ name: "t123456789" });
          expect(response.headers.get("content-type")).to.eq(
            "application/json1"
          );
        }
      );
    });

    it("should return failed response", () => {
      Cypress.c8ypact.current = C8yDefaultPact.from(errorResponse, {
        id: "123",
        baseUrl: Cypress.config("baseUrl") || "",
      });

      cy.wrap(createFetchClient().fetch("/inventory/notfound")).then(
        // @ts-expect-error
        async (response: IFetchResponse) => {
          expect(response.status).to.eq(404);
          expect(await response.text()).to.eq("Resource not found");
          expect(response.headers.get("content-type")).to.eq(
            "application/json1"
          );
          expect(response.statusText).to.eq("Not Found");
        }
      );
    });

    it("should throw error if no recorded response is found for request", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.name).to.eq("C8yPactError");
        expect(err.message).to.contain("Mocking failed in C8yPactFetchClient.");
        done();
      });

      stubCypressPactConfig({ strictMocking: true });
      expect(Cypress.c8ypact.config.strictMocking).to.be.true;
      cy.wrap(createFetchClient().fetch("/inventory/notfound"));
    });

    it("should not throw error if strictMocking is disabled", () => {
      stubCypressPactConfig({ strictMocking: false }, true);
      expect(Cypress.c8ypact.config.strictMocking).to.be.false;
      Cypress.c8ypact.current = null;
      cy.wrap(
        createFetchClient().fetch("/inventory/managedObjects?fragmentType=abcd")
      ).then(
        // @ts-expect-error
        async (response: IFetchResponse) => {
          expect(response.status).to.eq(200);
        }
      );
    });

    it("should return recorded response with different baseUrl", () => {
      const client = createFetchClient();
      cy.wrap(client.fetch("/inventory/managedObjects?fragmentType=abcd")).then(
        // @ts-expect-error
        async (response: IFetchResponse) => {
          expect(client.baseUrl).to.not.eq("https://mytest.com");
          expect(response.status).to.eq(201);
          expect(await response.json()).to.deep.eq({ name: "t123456789" });
          expect(response.headers.get("content-type")).to.eq(
            "application/json1"
          );
        }
      );
    });

    it("should call mockRecord callback", () => {
      Cypress.c8ypact.on.mockRecord = (record) => {
        expect(record).to.not.be.null;
        if (record) {
          record.response.status = 208;
        }
        return record;
      };

      const mockSpy = cy.spy(Cypress.c8ypact.on, "mockRecord");

      cy.wrap(
        createFetchClient().fetch("/inventory/managedObjects?fragmentType=abcd")
      ).then(
        // @ts-expect-error
        async (response: IFetchResponse) => {
          expect(mockSpy).to.be.calledOnce;
          expect(response.status).to.eq(208);
        }
      );
    });

    it("should not mock if mockRecord callback returns undefined", () => {
      Cypress.c8ypact.on.mockRecord = (record) => {
        return undefined;
      };

      const mockSpy = cy.spy(Cypress.c8ypact.on, "mockRecord");
      cy.wrap(
        createFetchClient().fetch("/inventory/managedObjects?fragmentType=abcd")
      ).then(
        // @ts-expect-error
        (response: IFetchResponse) => {
          expect(mockSpy).to.be.calledOnce;
          expect(response.status).to.eq(200);
        }
      );
    });

    it("should mock if mockRecord callback is undefined", () => {
      Cypress.c8ypact.on.mockRecord = undefined;

      cy.wrap(
        createFetchClient().fetch("/inventory/managedObjects?fragmentType=abcd")
      ).then(
        // @ts-expect-error
        (response: IFetchResponse) => {
          expect(response.status).to.eq(201);
        }
      );
    });
  });
});
