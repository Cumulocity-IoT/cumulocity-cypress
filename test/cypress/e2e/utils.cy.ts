import { stubEnv } from "cypress/support/testutils";
import {
  getAuthOptions,
  getCookieAuthFromEnv,
  getSystemVersionFromEnv,
  getXsrfToken,
  normalizedArguments,
  normalizedArgumentsWithAuth,
  normalizedC8yclientArguments,
  persistAuth,
} from "../../../src/lib/utils";

describe("utils", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_USER", undefined);
    expect(Cypress.env("C8Y_USERNAME")).to.be.undefined;
    expect(Cypress.env("C8Y_PASSWORD")).to.be.undefined;
    expect(Cypress.env("C8Y_USER")).to.be.undefined;
    cy.clearAllLocalStorage();
    cy.clearAllCookies();
  });

  context("normalizedArguments", () => {
    it("from array of arrays", () => {
      const args = [
        [{ user: "admin", password: "password" }, "newuser"],
        ["business"],
      ];
      const result = normalizedArguments(args);
      expect(result?.length).to.eq(3);
      expect(result).to.deep.eq([
        { user: "admin", password: "password" },
        "newuser",
        ["business"],
      ]);
    });

    it("from array of objects", () => {
      const args = [
        { user: "admin", password: "password" },
        {
          userName: "newuser",
          password: "newpassword",
          email: "newuser@example.com",
          displayName: "New User",
        },
      ];
      const result = normalizedArguments(args);
      expect(result?.length).to.eq(2);
      expect(result).to.deep.eq([
        { user: "admin", password: "password" },
        {
          userName: "newuser",
          password: "newpassword",
          email: "newuser@example.com",
          displayName: "New User",
        },
      ]);
    });

    it("from object of arrays", () => {
      const args = {
        "0": [{ user: "admin", password: "password" }, "newuser"],
        "1": ["business"],
      };
      const result = normalizedArguments(args);
      expect(result?.length).to.eq(3);
      expect(result).to.deep.eq([
        { user: "admin", password: "password" },
        "newuser",
        ["business"],
      ]);
    });
  });

  context("normalizedArgumentsWithAuth", () => {
    it("should add auth from env replacing undefined previous subject", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      const args = [undefined, "business"];
      const result = normalizedArgumentsWithAuth(args);
      expect(result?.length).to.eq(2);
      expect(result).to.deep.eq([
        { user: "admin", password: "password" },
        "business",
      ]);
    });

    it("should add auth from env without previous subject", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      const args = ["business"];
      const result = normalizedArgumentsWithAuth(args);
      expect(result?.length).to.eq(2);
      expect(result).to.deep.eq([
        { user: "admin", password: "password" },
        "business",
      ]);
    });

    it("should return undefined for no args and cookie auth present", () => {
      cy.setCookie("XSRF-TOKEN", "123").then(() => {
        const result = normalizedArgumentsWithAuth([]);
        expect(result).to.deep.eq([undefined]);
      });
    });

    it("should return undefined if args are undefined", () => {
      const result = normalizedArgumentsWithAuth(undefined as any);
      expect(result).to.deep.eq([undefined]);
    });
  });

  context("normalizedC8yclientArguments", () => {
    it("should not add auth from env if cookie auth is present", () => {
      stubEnv({ C8Y_USERNAME: "admin", C8Y_PASSWORD: "password" });
      cy.setCookie("XSRF-TOKEN", "1234").then(() => {
        const args = [undefined, "business"];
        const result = normalizedC8yclientArguments(args);
        expect(result?.length).to.eq(2);
        expect(result).to.deep.eq([undefined, "business"]);
      });
    });

    it("should return undefined for no args and cookie auth present", () => {
      cy.setCookie("XSRF-TOKEN", "123").then(() => {
        const result = normalizedC8yclientArguments([]);
        expect(result).to.deep.eq([undefined]);
      });
    });

    it("should return undefined if arguments is undefined", () => {
      const result = normalizedC8yclientArguments(undefined as any);
      expect(result).to.deep.eq([undefined]);
    });
  });

  context("getAuthOptions", () => {
    it("auth options from auth options", () => {
      const result = getAuthOptions({
        user: "admin",
        password: "password",
      });
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("password");
    });

    it("auth options from auth options with additional argument", () => {
      const result2 = getAuthOptions(
        {
          user: "admin",
          password: "password",
        },
        {
          validationFn: () => {
            return false;
          },
        }
      );
      expect(result2?.user).to.eq("admin");
      expect(result2?.password).to.eq("password");
    });

    it("auth options from user and password from env variable", () => {
      Cypress.env("admin_password", "mypassword");
      const result = getAuthOptions("admin");
      expect(result).to.not.be.undefined;
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("mypassword");

      Cypress.env("admin_username", "oeeadmin2");
      Cypress.env("admin_password", "oeeadminpassword2");
      const result2 = getAuthOptions("admin");
      expect(result2).to.not.be.undefined;
      expect(result2?.user).to.eq("oeeadmin2");
      expect(result2?.password).to.eq("oeeadminpassword2");
    });

    it("auth options from user and password from env variable with additional argument", () => {
      Cypress.env("admin_username", undefined);
      Cypress.env("admin_password", "mypassword");
      const result = getAuthOptions("admin", {
        validationFn: () => {
          return false;
        },
      });
      expect(result).to.not.be.undefined;
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("mypassword");

      Cypress.env("admin_username", "oeeadmin");
      Cypress.env("admin_password", "oeeadminpassword");
      const result2 = getAuthOptions("admin", {
        validationFn: () => {
          return false;
        },
      });
      expect(result2).to.not.be.undefined;
      expect(result2?.user).to.eq("oeeadmin");
      expect(result2?.password).to.eq("oeeadminpassword");

      Cypress.env("admin_username", undefined);
      Cypress.env("admin_password", undefined);
    });

    it("auth options from user and password", () => {
      const result = getAuthOptions("admin2", "password2");
      expect(result?.user).to.eq("admin2");
      expect(result?.password).to.eq("password2");
    });

    it("auth options from user and password with login options", () => {
      const result2 = getAuthOptions("admin3", "password3", {
        validationFn: () => {
          return false;
        },
      });
      expect(result2?.user).to.eq("admin3");
      expect(result2?.password).to.eq("password3");
    });

    it("auth options from useAuth", () => {
      cy.useAuth("admin", "password");
      cy.then(() => {
        const result2 = getAuthOptions();
        expect(result2?.user).to.eq("admin");
        expect(result2?.password).to.eq("password");
      });
    });

    it(
      "auth options from test options",
      { auth: { user: "myadmin", password: "mypassword" } },
      () => {
        const result2 = getAuthOptions();
        expect(result2?.user).to.eq("myadmin");
        expect(result2?.password).to.eq("mypassword");
      }
    );

    it("auth options from env variables", () => {
      Cypress.env("C8Y_USERNAME", "oeeadmin");
      Cypress.env("C8Y_PASSWORD", "oeeadminpassword");

      const result = getAuthOptions();
      expect(result?.user).to.eq("oeeadmin");
      expect(result?.password).to.eq("oeeadminpassword");
    });

    it("auth options from env variables with C8Y_USER", () => {
      Cypress.env("C8Y_USER", "oeeadmin");
      Cypress.env("C8Y_PASSWORD", "oeeadminpassword");

      const result = getAuthOptions();
      expect(result?.user).to.eq("oeeadmin");
      expect(result?.password).to.eq("oeeadminpassword");
    });

    it("auth options in arguments overwrites auth env variables", () => {
      Cypress.env("C8Y_USERNAME", "admin");
      Cypress.env("C8Y_PASSWORD", "password");

      const result = getAuthOptions({
        user: "oeeadmin",
        password: "oeeadminpassword",
      });
      expect(result?.user).to.eq("oeeadmin");
      expect(result?.password).to.eq("oeeadminpassword");
    });

    it("auth options from __auth not overwritten by auth env variables", () => {
      Cypress.env("C8Y_USERNAME", "a");
      Cypress.env("C8Y_PASSWORD", "p");
      persistAuth({ user: "admin", password: "password" });
      const result = getAuthOptions();
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("password");
    });

    it("auth options from Cypress.config().auth not overwritten by auth env variables", () => {
      Cypress.env("C8Y_USERNAME", "a");
      Cypress.env("C8Y_PASSWORD", "p");
      Cypress.config("auth", { user: "admin", password: "password" });
      const result = getAuthOptions();
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("password");
      Cypress.config().auth = undefined;
    });

    it("auth options from env variables with login options", () => {
      Cypress.env("C8Y_USERNAME", "oeeadmin2");
      Cypress.env("C8Y_PASSWORD", "oeeadminpassword2");
      const result2 = getAuthOptions({
        validationFn: () => {
          return false;
        },
      });
      expect(result2?.user).to.eq("oeeadmin2");
      expect(result2?.password).to.eq("oeeadminpassword2");
    });

    it("auth options failure ", () => {
      const result1 = getAuthOptions({ abc: false });
      expect(result1).to.be.undefined;
      const result2 = getAuthOptions({ user: "test" });
      expect(result2).to.be.undefined;
      const result3 = getAuthOptions();
      expect(result3).to.be.undefined;
    });

    it("auth options from IUser", () => {
      const user = {
        userName: "admin",
        password: "password",
        email: "test@test.de",
        displayName: "Admin",
      };
      const result = getAuthOptions(user);
      expect(result?.user).to.eq("admin");
      expect(result?.password).to.eq("password");
      expect(result).to.not.have.property("email");
      expect(result).to.not.have.property("displayName");
    });
  });

  context("getCookieAuthFromEnv", () => {
    it("cookie auth from env", () => {
      cy.setCookie("XSRF-TOKEN", "1234").then(() => {
        const result = getCookieAuthFromEnv();
        expect(result).to.not.be.undefined;
      });
    });

    it("cookie auth from env failure", () => {
      const result = getCookieAuthFromEnv();
      expect(result).to.be.undefined;
    });
  });

  context("getXsrfToken", () => {
    it("should get xsrf token from env", () => {
      cy.setCookie("XSRF-TOKEN", "1234").then(() => {
        const result = getXsrfToken();
        expect(result).to.eq("1234");
      });
    });

    it("should return undefined without xsrf token cookie", () => {
      const result = getXsrfToken();
      expect(result).to.be.undefined;
    });

    it("should return undefined with empty xsrf token cookie", () => {
      cy.setCookie("XSRF-TOKEN", "").then(() => {
        const result = getXsrfToken();
        expect(result).to.be.undefined;
      });
    });
  });

  context("getSystemVersionFromEnv", () => {
    it("should get system version from env", () => {
      stubEnv({ C8Y_SYSTEM_VERSION: "10.7.0" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.7.0");
    });

    it("should get from C8Y_VERSION if C8Y_SYSTEM_VERSION is not present", () => {
      stubEnv({ C8Y_VERSION: "10.7.0" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.7.0");
    });

    it("should prefer C8Y_SYSTEM_VERSION over C8Y_VERSION", () => {
      stubEnv({ C8Y_SYSTEM_VERSION: "10.7.0", C8Y_VERSION: "10.8.0" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.7.0");
    });

    it("should return undefined without system version", () => {
      const result = getSystemVersionFromEnv();
      expect(result).to.be.undefined;
    });

    it("should return undefined for invalid system version", () => {
      stubEnv({ C8Y_SYSTEM_VERSION: "abd" });
      const result = getSystemVersionFromEnv();
      expect(result).to.be.undefined;
    });

    it("should return correct coerced semver version", () => {
      stubEnv({ C8Y_SYSTEM_VERSION: "abscs10.1" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.1.0");
    });

    it("should return coerced semver version", () => {
      stubEnv({ C8Y_SYSTEM_VERSION: "10" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.0.0");
    });

    it("should get system version from pact if mocking", () => {
      cy.stub(Cypress, "c8ypact").value({
        isEnabled: () => true,
        mode: () => "mock",
        current: {
          info: {
            version: {
              system: "11.7.0",
            },
          },
        },
      } as any);
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("11.7.0");
    });

    it("should prefer system version from env over pact when mocking", () => {
      cy.stub(Cypress, "c8ypact").value({
        isEnabled: () => true,
        mode: () => "mock",
        current: {
          info: {
            version: {
              system: "11.7.0",
            },
          },
        },
      } as any);
      stubEnv({ C8Y_SYSTEM_VERSION: "10.9.0" });
      const result = getSystemVersionFromEnv();
      expect(result).to.eq("10.9.0");
    });
  });
});
