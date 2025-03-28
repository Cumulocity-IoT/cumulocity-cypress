import { IDeviceCredentials } from "@c8y/client";
import {
  url as _url,
  getConsolePropsForLogSpy,
  stubEnv,
} from "../support/testutils";

const { _, $ } = Cypress;

describe("auth", () => {
  context("getAuth", () => {
    beforeEach(() => {
      Cypress.env("myauthuser_password", "myadminpassword");
      Cypress.env("C8Y_TENANT", "t1234567");
    });

    it("always returns wrapped auth options", () => {
      const auth = cy.getAuth("admin", "password");
      expect(Cypress.isCy(auth)).to.be.true;
      expect(Cypress.isCy(auth.getAuth())).to.be.true;

      auth.getAuth().then((result) => {
        expect(result?.user).to.eq("admin");
        expect(result?.password).to.eq("password");
        expect(result?.tenant).to.eq("t1234567");
      });

      cy.wrap({ user: "admin", password: "password" })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.eq("t1234567");
        });
    });

    it("accepts chained input from prev subject", () => {
      cy.wrap(["user", "password"])
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("user");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.eq("t1234567");
        });
      cy.wrap({ user: "admin", password: "other" })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("other");
          expect(result?.tenant).to.eq("t1234567");
        });
      Cypress.env("admin_password", "password");
      cy.wrap("admin")
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.eq("t1234567");
        });
    });

    it("should not overwrite tenant from env", () => {
      cy.wrap({ user: "admin", password: "password", tenant: "t7654321" })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.eq("t7654321");
        });
    });

    it("should use userAlias from options if available", () => {
      cy.wrap({ userAlias: "myauthuser", type: "CookieAuth" })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("myauthuser");
          expect(result?.password).to.eq("myadminpassword");
          expect(result?.tenant).to.eq("t1234567");
          expect(result?.userAlias).to.eq("myauthuser");
          expect(result?.type).to.eq("CookieAuth");
        });
    });

    it("should filter additional keys", () => {
      cy.wrap({
        user: "admin",
        password: "password",
        tenant: "t7654321",
        test: "test",
        x: "y",
      })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.eq("t7654321");
          expect(Object.keys(result!)).to.have.length(3);
          expect(
            _.isEqual(
              Object.keys(result!).sort(),
              ["user", "password", "tenant"].sort()
            )
          ).to.be.true;
        });
    });

    it("should work without tenant environment variable", () => {
      Cypress.env("C8Y_TENANT", undefined);
      cy.wrap({ user: "admin", password: "password" })
        .getAuth()
        .then((result) => {
          expect(result?.user).to.eq("admin");
          expect(result?.password).to.eq("password");
          expect(result?.tenant).to.be.undefined;
        });
    });

    it(
      "should get auth from test annotation",
      { auth: { user: "myadmin", password: "mypassword" } },
      () => {
        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("myadmin");
          expect(result?.password).to.eq("mypassword");
          expect(result?.tenant).to.eq("t1234567");
        });
      }
    );

    it(
      "should get auth from test annotation with password from environment",
      { auth: "myauthuser" },
      () => {
        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("myauthuser");
          expect(result?.password).to.eq("myadminpassword");
          expect(result?.tenant).to.eq("t1234567");
          expect(result?.userAlias).to.eq("myauthuser");
        });
      }
    );

    it(
      "should get auth from test annotation with userAlias and type",
      { auth: { userAlias: "myauthuser", type: "CookieAuth" } },
      () => {
        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("myauthuser");
          expect(result?.password).to.eq("myadminpassword");
          expect(result?.tenant).to.eq("t1234567");
          expect(result?.userAlias).to.eq("myauthuser");
          expect(result?.type).to.eq("CookieAuth");
        });
      }
    );

    it("should get auth options from IDeviceCredentials with username key", () => {
      const dc: IDeviceCredentials = {
        username: "myusername",
        password: "mypassword",
        id: "123",
        self: "https://localhost",
        tenantId: "t1234567890",
      };
      cy.getAuth(dc).then((result) => {
        expect(result?.user).to.eq("myusername");
        expect(result?.password).to.eq("mypassword");
        expect(result?.tenant).to.eq("t1234567890");
        expect(Object.keys(result!)).to.have.length(3);
        expect(
          _.isEqual(
            Object.keys(result!).sort(),
            ["user", "password", "tenant"].sort()
          )
        ).to.be.true;
      });
    });

    it("should not throw if no auth options found", () => {
      cy.getAuth().then((auth) => {
        expect(auth).to.be.undefined;
      });
    });

    it("should throw for userAlias without auth options", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.eq(
          "No authentication found for userAlias xyz. Configure authentication using xyz_username and xyz_password environment variables."
        );
        done();
      });
      cy.getAuth("xyz");
    });

    it("should throw for userAlias without auth options and with auth in env", (done) => {
      stubEnv({
        C8Y_USERNAME: "xyz",
        C8Y_PASSWORD: "xyz"
      });

      Cypress.once("fail", (err) => {
        expect(err.message).to.eq(
          "No authentication found for userAlias xyz. Configure authentication using xyz_username and xyz_password environment variables."
        );
        done();
      });

      cy.getAuth("xyz");
    });


    it("should log auth and auth env variables", () => {
      stubEnv({
        C8Y_USERNAME: "myusername",
        C8Y_PASSWORD: "mypassword",
        admin_username: "admin",
        admin_password: "password",
        abc: "def",
        aca: "def",
      });
      const logSpy: sinon.SinonSpy = cy.spy(Cypress, "log").log(false);

      cy.getAuth("admin").then((auth) => {
        const props = getConsolePropsForLogSpy(logSpy, "getAuth");
        expect(props).to.not.be.undefined;
        expect(props.env).to.not.be.undefined;
        expect(props.arguments).to.deep.eq([undefined, "admin"]);
        expect(props.getauthoptions).to.deep.eq({
          password: "password",
          user: "admin",
          userAlias: "admin",
          tenant: "t1234567",
        });
        expect(Object.keys(props.env)).to.have.length(5);
        expect(props.env).to.deep.eq({
          C8Y_USERNAME: "myusername",
          C8Y_PASSWORD: "mypassword",
          admin_username: "admin",
          admin_password: "password",
          // from environment / defined in beforeEach
          myauthuser_password: "myadminpassword",
        });
      });
    });
  });

  context("useAuth", () => {
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t1234567");
    });

    it("store and restore auth in current test context", () => {
      cy.useAuth("admin", "password");

      cy.getAuth().then((result) => {
        expect(result?.user).to.eq("admin");
        expect(result?.password).to.eq("password");
        expect(result?.tenant).to.eq("t1234567");
      });
    });

    it("store and restore auth with tenant", () => {
      cy.useAuth({
        user: "admin",
        password: "password",
        tenant: "t7654321",
      });

      cy.getAuth().then((result) => {
        expect(result?.user).to.eq("admin");
        expect(result?.password).to.eq("password");
        expect(result?.tenant).to.eq("t7654321");
      });
    });

    it("should allow to overwrite auth", () => {
      cy.useAuth({
        user: "admin",
        password: "password",
        tenant: "t7654321",
      });

      cy.useAuth({
        user: "admin2",
        password: "password2",
        tenant: "t76543210",
      });

      cy.getAuth().then((result) => {
        expect(result?.user).to.eq("admin2");
        expect(result?.password).to.eq("password2");
        expect(result?.tenant).to.eq("t76543210");
      });
    });

    it(
      "should allow to overwrite auth from annotation",
      { auth: "myauthuser" },
      () => {
        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("myauthuser");
          expect(result?.password).to.eq("myadminpassword");
          expect(result?.tenant).to.eq("t1234567");
        });

        cy.useAuth({
          user: "admin2",
          password: "password2",
          tenant: "t76543210",
        });

        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("admin2");
          expect(result?.password).to.eq("password2");
          expect(result?.tenant).to.eq("t76543210");
        });
      }
    );

    it(
      "should use previousSubject instead of annotation",
      { auth: "myauthuser" },
      () => {
        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("myauthuser");
          expect(result?.password).to.eq("myadminpassword");
          expect(result?.tenant).to.eq("t1234567");
        });

        cy.getAuth({ user: "test", password: "test" }).useAuth();

        cy.getAuth().then((result) => {
          expect(result?.user).to.eq("test");
          expect(result?.password).to.eq("test");
        });
      }
    );

    it("should not throw if no auth options found", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.eq(
          "No authentication found for userAlias xyz. Configure authentication using xyz_username and xyz_password environment variables."
        );
        done();
      });

      cy.useAuth("xyz");
    });

    it("should throw for userAlias without auth options and with auth in env", (done) => {
      stubEnv({
        C8Y_USERNAME: "xyz",
        C8Y_PASSWORD: "xyz"
      });

      Cypress.once("fail", (err) => {
        expect(err.message).to.eq(
          "No authentication found for userAlias xyz. Configure authentication using xyz_username and xyz_password environment variables."
        );
        done();
      });
      
      cy.getAuth("xyz");
    });
    
    it("should not throw for undefined object", () => {
      cy.useAuth(undefined as any);
    });

    it("should log auth and auth env variables", () => {
      stubEnv({
        C8Y_USERNAME: "myusername",
        C8Y_PASSWORD: "mypassword",
        admin_username: "admin",
        admin_password: "password",
        abc: "def",
        aca: "def",
      });
      const logSpy: sinon.SinonSpy = cy.spy(Cypress, "log").log(false);

      cy.useAuth("admin");
      cy.then(() => {
        const props = getConsolePropsForLogSpy(logSpy, "useAuth");
        expect(props).to.not.be.undefined;
        expect(props.env).to.not.be.undefined;
        expect(props.arguments).to.deep.eq([undefined, "admin"]);
        expect(props.getauthoptions).to.deep.eq({
          password: "password",
          user: "admin",
          userAlias: "admin",
          tenant: "t1234567",
        });
        expect(Object.keys(props.env)).to.have.length(5);
        expect(props.env).to.deep.eq({
          C8Y_USERNAME: "myusername",
          C8Y_PASSWORD: "mypassword",
          admin_username: "admin",
          admin_password: "password",
          // from environment / defined in beforeEach
          myauthuser_password: "myadminpassword",
        });
      });
    });
  });
});
