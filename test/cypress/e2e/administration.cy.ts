import { IUserGroup } from "@c8y/client";
import {
  expectC8yClientRequest,
  initRequestStub,
  stubEnv,
  stubResponses,
} from "../support/testutils";
import { C8yDefaultPact } from "cumulocity-cypress/c8ypact";
const { _, sinon } = Cypress;

declare global {
  interface Window {
    fetchStub: Cypress.Agent<sinon.SinonStub>;
  }
}

describe("administration", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_PLUGIN_LOADED", undefined);
    Cypress.env("C8Y_VERSION", undefined);
    Cypress.env("C8Y_SYSTEM_VERSION", undefined);
    Cypress.env("C8Y_SHELL_VERSION", undefined);
    Cypress.env("C8Y_SHELL_NAME", undefined);

    Cypress.c8ypact.current = null;

    initRequestStub();
    stubResponses([
      new window.Response(JSON.stringify({ name: "t1234" }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    ]);
  });

  context("deleteUser", () => {
    it("should delete user from user options", function () {
      stubResponses([
        new window.Response(null, {
          status: 204,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      cy.setCookie("XSRF-TOKEN", "123").then(() => {
        cy.getAuth({
          user: "admin",
          password: "mypassword",
          tenant: "t12345678",
        })
          .deleteUser({ userName: "test", displayName: "wewe" })
          .then((response) => {
            expect(response.status).to.eq(204);
            expectC8yClientRequest({
              url: `${Cypress.config().baseUrl}/user/t12345678/users/test`,
              auth: {
                user: "admin",
                password: "mypassword",
                tenant: "t12345678",
              },
              headers: { UseXBasic: true, "X-XSRF-TOKEN": "123" },
              method: "DELETE",
            });
          });
      });
    });

    it("should pass client options to c8yclient", function () {
      stubResponses([
        new window.Response(null, {
          status: 404,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t12345678" })
        .deleteUser(
          { userName: "test", displayName: "wewe" },
          { baseUrl: "https://abc.def.com", failOnStatusCode: true }
        )
        .then((response) => {
          expect(response.status).to.eq(404);
          expectC8yClientRequest({
            url: `https://abc.def.com/user/t12345678/users/test`,
            auth: {
              user: "admin",
              password: "mypassword",
              tenant: "t12345678",
            },
            headers: { UseXBasic: true },
            method: "DELETE",
          });
        });
    });

    it("throws error for missing user and logs username", (done) => {
      const spy = cy.spy(Cypress, "log").log(false);

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          "Missing argument. deleteUser() requires IUser object"
        );
        done();
      });

      cy.deleteUser({ user: "test" } as any);
    });

    it("should not overwrite cookie auth with auth from env", () => {
      stubResponses([
        new window.Response(null, {
          status: 204,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      stubEnv({
        C8Y_USERNAME: "admin",
        C8Y_PASSWORD: "mypassword",
        C8Y_TENANT: "t12345678",
      });
      cy.setCookie("XSRF-TOKEN", "123").then(() => {
        cy.deleteUser({ userName: "test", displayName: "wewe" }).then(
          (response) => {
            expect(response.status).to.eq(204);
            expectC8yClientRequest({
              url: `${Cypress.config().baseUrl}/user/t12345678/users/test`,
              auth: undefined,
              headers: { UseXBasic: true, "X-XSRF-TOKEN": "123" },
              method: "DELETE",
            });
          }
        );
      });
    });
  });

  context("clearUserRoles", () => {
    const groups = {
      references: [
        {
          group: {
            id: 1,
          },
        },
        {
          group: {
            id: 2,
          },
        },
      ],
    };

    it("should clear user roles assigned to a user", () => {
      stubResponses([
        new window.Response(
          JSON.stringify({
            groups,
          }),
          {
            status: 200,
            statusText: "OK",
          }
        ),
        new window.Response(null, {
          status: 204,
          statusText: "OK",
        }),
        new window.Response(null, {
          status: 204,
          statusText: "OK",
        }),
      ]);

      const authUser = {
        user: "admin",
        password: "mypassword",
        tenant: "t12345678",
      };
      const testUser = { userName: "test", displayName: "wewe" };

      cy.getAuth(authUser)
        .clearUserRoles(testUser)
        .then(() => {
          expectC8yClientRequest([
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/users/test`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groups/${groups.references[0].group.id}/users/${
                testUser.userName
              }`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
              method: "DELETE",
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groups/${groups.references[1].group.id}/users/${
                testUser.userName
              }`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
              method: "DELETE",
            },
          ]);
        });
    });

    it("should clear user roles and use client options", () => {
      stubResponses([
        new window.Response(
          JSON.stringify({
            groups,
          }),
          {
            status: 200,
            statusText: "OK",
          }
        ),
        new window.Response(null, {
          status: 204,
          statusText: "OK",
        }),
        new window.Response(null, {
          status: 204,
          statusText: "OK",
        }),
      ]);

      const authUser = {
        user: "admin",
        password: "mypassword",
        tenant: "t12345678",
      };
      const testUser = { userName: "test", displayName: "wewe" };

      cy.getAuth(authUser)
        .clearUserRoles(testUser, { baseUrl: "https://abc.def.com" })
        .then(() => {
          expectC8yClientRequest([
            {
              url: `https://abc.def.com/user/${authUser.tenant}/users/test`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
            },
            {
              url: `https://abc.def.com/user/${authUser.tenant}/groups/${groups.references[0].group.id}/users/${testUser.userName}`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
              method: "DELETE",
            },
            {
              url: `https://abc.def.com/user/${authUser.tenant}/groups/${groups.references[1].group.id}/users/${testUser.userName}`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
              method: "DELETE",
            },
          ]);
        });
    });
  });

  context("assignUserRoles", () => {
    const role1: Partial<IUserGroup> = {
      id: 1,
      name: "role1",
    };

    const role2: Partial<IUserGroup> = {
      id: 2,
      name: "role2",
    };

    const roles = [role1.name, role2.name];

    it("should assign roles to a user", () => {
      const authUser = {
        user: "admin",
        password: "mypassword",
        tenant: "t12345678",
      };
      const testUser = { userName: "test", displayName: "wewe" };

      stubResponses([
        new window.Response(
          JSON.stringify({
            self: `https://${Cypress.config().baseUrl}/user/${
              authUser.tenant
            }/users/${testUser.userName}`,
          }),
          {
            status: 200,
            statusText: "OK",
          }
        ),
        new window.Response(JSON.stringify(role1), {
          status: 200,
          statusText: "OK",
        }),
        new window.Response(
          JSON.stringify({
            data: {
              managedObject: {},
            },
          }),
          {
            status: 201,
            statusText: "OK",
          }
        ),
        new window.Response(JSON.stringify(role2), {
          status: 200,
          statusText: "OK",
        }),
        new window.Response(
          JSON.stringify({
            data: {
              managedObject: {},
            },
          }),
          {
            status: 201,
            statusText: "OK",
          }
        ),
      ]);

      cy.getAuth(authUser)
        .assignUserRoles(testUser, ["role1", "role2"])
        .then(() => {
          expectC8yClientRequest([
            {
              url: `${Cypress.config().baseUrl}/user/${authUser.tenant}/users/${
                testUser.userName
              }`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groupByName/${role1.name}`,
              auth: authUser,
              headers: { UseXBasic: true },
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groups/${role1.id}/users`,
              auth: authUser,
              headers: {
                UseXBasic: true,
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                user: {
                  self: `https://${Cypress.config().baseUrl}/user/${
                    authUser.tenant
                  }/users/${testUser.userName}`,
                },
              }),
              method: "POST",
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groupByName/${role2.name}`,
              auth: authUser,
              headers: { UseXBasic: true },
            },
            {
              url: `${Cypress.config().baseUrl}/user/${
                authUser.tenant
              }/groups/${role2.id}/users`,
              auth: authUser,
              headers: {
                UseXBasic: true,
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                user: {
                  self: `https://${Cypress.config().baseUrl}/user/${
                    authUser.tenant
                  }/users/${testUser.userName}`,
                },
              }),
              method: "POST",
            },
          ]);
        });
    });

    it("should assign user roles and use client options", () => {
      cy.clearAllSessionStorage();

      const baseUrl = "https://abc.def.com";
      const authUser = {
        user: "admin",
        password: "mypassword",
        tenant: "t987654",
      };
      const testUser = { userName: "test", displayName: "wewe" };

      stubResponses([
        new window.Response(
          JSON.stringify({
            self: `https://${baseUrl}/user/${authUser.tenant}/users/${testUser.userName}`,
          }),
          {
            status: 200,
            statusText: "OK",
          }
        ),
        new window.Response(JSON.stringify(role1), {
          status: 200,
          statusText: "OK",
        }),
        new window.Response(
          JSON.stringify({
            data: {
              managedObject: {},
            },
          }),
          {
            status: 201,
            statusText: "OK",
          }
        ),
        new window.Response(JSON.stringify(role2), {
          status: 200,
          statusText: "OK",
        }),
        new window.Response(
          JSON.stringify({
            data: {
              managedObject: {},
            },
          }),
          {
            status: 201,
            statusText: "OK",
          }
        ),
      ]);

      cy.getAuth(authUser)
        .assignUserRoles(testUser, ["role1", "role2"], { baseUrl })
        .then(() => {
          expectC8yClientRequest([
            {
              url: `${baseUrl}/user/${authUser.tenant}/users/${testUser.userName}`,
              auth: authUser,
              headers: { UseXBasic: true, accept: "application/json" },
            },
            {
              url: `${baseUrl}/user/${authUser.tenant}/groupByName/${role1.name}`,
              auth: authUser,
              headers: { UseXBasic: true },
            },
            {
              url: `${baseUrl}/user/${authUser.tenant}/groups/${role1.id}/users`,
              auth: authUser,
              headers: {
                UseXBasic: true,
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                user: {
                  self: `https://${baseUrl}/user/${authUser.tenant}/users/${testUser.userName}`,
                },
              }),
              method: "POST",
            },
            {
              url: `${baseUrl}/user/${authUser.tenant}/groupByName/${role2.name}`,
              auth: authUser,
              headers: { UseXBasic: true },
            },
            {
              url: `${baseUrl}/user/${authUser.tenant}/groups/${role2.id}/users`,
              auth: authUser,
              headers: {
                UseXBasic: true,
                accept: "application/json",
                "content-type": "application/json",
              },
              body: JSON.stringify({
                user: {
                  self: `https://${baseUrl}/user/${authUser.tenant}/users/${testUser.userName}`,
                },
              }),
              method: "POST",
            },
          ]);
        });
    });
  });

  context("getCurrentTenant", () => {
    it("should get current tenant using c8yclient", function () {
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t12345678" })
        .getCurrentTenant()
        .then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body.name).to.eq("t1234");
          expectC8yClientRequest({
            url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
            auth: {
              user: "admin",
              password: "mypassword",
              tenant: "t12345678",
            },
            headers: { UseXBasic: true },
          });
        });
    });

    it("should use client options", function () {
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t12345678" })
        .getCurrentTenant({
          baseUrl: "https://abc.def.com",
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest({
            url: `https://abc.def.com/tenant/currentTenant`,
            auth: {
              user: "admin",
              password: "mypassword",
              tenant: "t12345678",
            },
            headers: { UseXBasic: true },
          });
        });
    });
  });

  context("getTenantId", () => {
    it("should get tenant id using c8yclient", function () {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .getTenantId()
        .then((id) => {
          expect(id).to.eq("t1234");
          expect(window.fetchStub.callCount).to.equal(1);
        });
    });

    it("should use tenant id from auth", function () {
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t247652" })
        .getTenantId()
        .then((id) => {
          expect(id).to.eq("t247652");
          expect(window.fetchStub.callCount).to.equal(0);
        });
    });

    it("should use tenant id from env variable", function () {
      Cypress.env("C8Y_TENANT", "t232447652");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .getTenantId()
        .then((id) => {
          expect(id).to.eq("t232447652");
          expect(window.fetchStub.callCount).to.equal(0);
        });
    });

    it("should prefer tenant id from auth", function () {
      Cypress.env("C8Y_TENANT", "t232447652");
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t324678" })
        .getTenantId()
        .then((id) => {
          expect(id).to.eq("t324678");
          expect(window.fetchStub.callCount).to.equal(0);
        });
    });

    it("should not fail for CookieAuth", function () {
      cy.setCookie("XSRF-TOKEN", "123");
      cy.setCookie("authorization", "213412");

      stubEnv({
        C8Y_USERNAME: "admin",
        C8Y_PASSWORD: "mypassword",
        C8Y_TENANT: "t1234",
      });
      cy.getTenantId().then((id) => {
        expect(id).to.eq("t1234");
        expect(window.fetchStub.callCount).to.equal(0);
      });
    });

    it("should use tenant id from pact recording when mocking", function () {
      stubEnv({ C8Y_PACT_MODE: "mock", C8Y_PLUGIN_LOADED: "true" });
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: { url: "/tenant/currentTenant" } } as any],
        {
          tenant: "t987654321",
        } as any,
        "test"
      );
      cy.getTenantId().then((id) => {
        expect(id).to.equal("t987654321");
        expect(window.fetchStub.callCount).to.equal(0);
        expect(Cypress.env("C8Y_TENANT")).to.equal("t987654321");
      });
    });
  });

  context("getSystemVersion", () => {
    it("should use system version from C8Y_SYSTEM_VERSION env variable", function () {
      stubEnv({ C8Y_SYSTEM_VERSION: "10.6.0" });
      cy.getSystemVersion().then((version) => {
        expect(version).to.equal("10.6.0");
        expect(window.fetchStub.callCount).to.equal(0);
        expect(Cypress.env("C8Y_VERSION")).to.equal("10.6.0");
      });
    });

    it("should use system version from C8Y_VERSION env variable", function () {
      stubEnv({ C8Y_VERSION: "10.6.1" });
      cy.getSystemVersion().then((version) => {
        expect(version).to.equal("10.6.1");
        expect(window.fetchStub.callCount).to.equal(0);
        expect(Cypress.env("C8Y_SYSTEM_VERSION")).to.equal("10.6.1");
      });
    });

    it("should get system version from tenant system options and set C8Y_SYSTEM_VERSION", function () {
      stubResponses([
        new window.Response(
          JSON.stringify({
            options: [{ category: "system", key: "version", value: "10.1.11" }],
          }),
          {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
          }
        ),
      ]);
      cy.getAuth({ user: "admin", password: "p", tenant: "t123" })
        .getSystemVersion()
        .then((version) => {
          expect(version).to.equal("10.1.11");
          expect(window.fetchStub.callCount).to.equal(1);
          expect(Cypress.env("C8Y_SYSTEM_VERSION")).to.equal("10.1.11");
          expect(Cypress.env("C8Y_VERSION")).to.equal("10.1.11");
        });
    });

    it("should use system version from pact recording when mocking", function () {
      stubEnv({ C8Y_PACT_MODE: "mock", C8Y_PLUGIN_LOADED: "true" });
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: { url: "/tenant/system/options" } } as any],
        {
          version: { system: "10.8.1" },
        } as any,
        "test"
      );
      cy.getSystemVersion().then((version) => {
        expect(version).to.equal("10.8.1");
        expect(window.fetchStub.callCount).to.equal(0);
        expect(Cypress.env("C8Y_SYSTEM_VERSION")).to.equal("10.8.1");
        expect(Cypress.env("C8Y_VERSION")).to.equal("10.8.1");
      });
    });
  });

  context("getShellVersion", () => {
    it("should use system version from C8Y_SHELL_VERSION env variable", function () {
      stubEnv({ C8Y_SHELL_VERSION: "10.6.0" });
      cy.getShellVersion("cockpit").then((version) => {
        expect(version).to.equal("10.6.0");
        expect(window.fetchStub.callCount).to.equal(0);
      });
    });

    it("should use C8Y_SHELL_NAME env variable", function () {
      stubEnv({ C8Y_SHELL_NAME: "cockpit2" });
      stubResponses([
        new window.Response(
          JSON.stringify({
            version: "10.2.11",
          }),
          {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
          }
        ),
      ]);

      const auth = { user: "ad", password: "my", tenant: "t123" };
      cy.getAuth(auth)
        .getShellVersion({ sendImmediately: true })
        .then((version) => {
          expect(version).to.equal("10.2.11");
          expect(window.fetchStub.callCount).to.equal(1);
          expect(Cypress.env("C8Y_SHELL_VERSION")).to.equal("10.2.11");
          expect(Cypress.env("C8Y_SHELL_NAME")).to.equal("cockpit2");
          expectC8yClientRequest({
            url: `${Cypress.config().baseUrl}/apps/cockpit2/cumulocity.json`,
            auth,
          });
        });
    });

    it("should get system version from ui shell", function () {
      stubResponses([
        new window.Response(
          JSON.stringify({
            version: "10.1.11",
          }),
          {
            status: 200,
            statusText: "OK",
            headers: { "content-type": "application/json" },
          }
        ),
      ]);
      const auth = { user: "ad", password: "my", tenant: "t123" };
      cy.getAuth(auth)
        .getShellVersion("mycockpit")
        .then((version) => {
          expect(version).to.equal("10.1.11");
          expect(window.fetchStub.callCount).to.equal(1);
          expectC8yClientRequest({
            url: `${Cypress.config().baseUrl}/apps/mycockpit/cumulocity.json`,
            auth,
          });
          expect(Cypress.env("C8Y_SHELL_VERSION")).to.equal("10.1.11");
          expect(Cypress.env("C8Y_SHELL_NAME")).to.equal("mycockpit");
        });
    });
  });
});
