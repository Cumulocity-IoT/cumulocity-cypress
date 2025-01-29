import {
  C8yDefaultPactRunner,
  C8yDefaultPactRecord,
} from "cumulocity-cypress/c8ypact";

const { _ } = Cypress;

// required as the tested methods are protected / private
class C8yTestPactRunner extends C8yDefaultPactRunner {
  test_createHeader(pact: any, info: any): any {
    return this.createHeader(pact);
  }

  test_createURL(
    pact: any | string,
    info: any | string = {}
  ): string | undefined {
    if (_.isString(pact)) {
      pact = { request: { url: pact } };
    }
    if (_.isString(info)) {
      info = { baseUrl: info };
    }
    return this.createURL(pact, info);
  }

  test_createFetchOptions(pact: any, info: any): any {
    return this.createFetchOptions(pact, info);
  }

  test_updateURLs(value: string, info: any): string {
    return this.updateURLs(value, info);
  }

  addReplacementId(key: string, value: string): void {
    this.idMapper[key] = value;
  }

  resetReplacementIds(): void {
    this.idMapper = {};
  }
}

describe("c8ypactrunner", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
  });

  context("C8yDefaultPactRunner", function () {
    let runner: C8yTestPactRunner;

    beforeEach(() => {
      Cypress.env("C8Y_PACT_MODE", "apply");
      runner = new C8yTestPactRunner();
      runner.addReplacementId("68124542292", "57124692250");
      runner.addReplacementId("75117556935", "87117556934");
    });

    it("should remove not required headers", function () {
      const pact = new C8yDefaultPactRecord(
        {
          headers: {
            "X-XSRF-TOKEN": "********",
            Authorization: "Bearer ******",
            "content-type": "application/json",
            accept: "application/json",
            UseXBasic: true,
          },
        },
        {
          headers: {
            "content-type": "application/json2",
          },
        },
        {}
      );
      expect(runner.test_createHeader(pact, {})).to.deep.eq({
        "content-type": "application/json",
        accept: "application/json",
        UseXBasic: true,
      });
    });

    it("should create url by removing base url from pact url", function () {
      expect(
        runner.test_createURL(
          "https://oee-dev.eu-latest.cumulocity.com/devicecontrol/newDeviceRequests",
          "https://oee-dev.eu-latest.cumulocity.com"
        )
      ).to.eq(`/devicecontrol/newDeviceRequests`);
      expect(
        runner.test_createURL(
          `${Cypress.config().baseUrl}/devicecontrol/newDeviceRequests`
        )
      ).to.eq(`/devicecontrol/newDeviceRequests`);
    });

    it("should create url by replacing ids", function () {
      expect(
        runner.test_createURL(
          `${Cypress.config().baseUrl}/inventory/managedObjects/68124542292`
        )
      ).to.eq("/inventory/managedObjects/57124692250");
      expect(
        runner.test_createURL(
          `/inventory/managedObjects/68124542292/assign/asset/75117556935`
        )
      ).to.eq("/inventory/managedObjects/57124692250/assign/asset/87117556934");
    });

    it("should create fetchoptions with body having ids replaced and headers removed", function () {
      expect(
        runner.test_createFetchOptions(
          new C8yDefaultPactRecord(
            {
              headers: {
                "X-XSRF-TOKEN": "********",
                Authorization: "Bearer ******",
                "content-type": "application/json",
                accept: "application/json",
                UseXBasic: true,
              },
              body: {
                externalId: "85A4265B-5A14-4360-86A7-C82ED51D8AA0",
                type: "c8y_Serial",
                managedObject: {
                  id: "68124542292",
                },
              },
            },
            {},
            {}
          ),
          {}
        )
      ).to.deep.eq({
        method: "GET",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          UseXBasic: true,
        },
        body: '{"externalId":"85A4265B-5A14-4360-86A7-C82ED51D8AA0","type":"c8y_Serial","managedObject":{"id":"57124692250"}}',
      });
    });

    it("should update tenants in body with baseUrl and C8Y_TENANT", function () {
      Cypress.env("C8Y_TENANT", "t123456789");
      Cypress.config().baseUrl = "https://test.eu-latest.cumulocity.com";
      expect(
        runner.test_updateURLs(
          JSON.stringify({
            body: {
              sel1: "https://t617206445.eu-latest.cumulocity.com/identity/externalIds/c8y_Serial/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
              sel2: "https://my-test.eu-latest.cumulocity.com/identity/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
              managedObject: {
                self: "https://t617206445.eu-latest.cumulocity.com/inventory/managedObjects/68124542292",
                id: "68124542292",
              },
            },
          }),
          {
            tenant: "t617206445",
            baseUrl: "https://my-test.eu-latest.cumulocity.com",
          }
        )
      ).to.eq(
        JSON.stringify({
          body: {
            sel1: "https://t123456789.eu-latest.cumulocity.com/identity/externalIds/c8y_Serial/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
            sel2: "https://test.eu-latest.cumulocity.com/identity/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
            managedObject: {
              self: "https://t123456789.eu-latest.cumulocity.com/inventory/managedObjects/68124542292",
              id: "68124542292",
            },
          },
        })
      );
    });

    it("should update tenants with different instance", function () {
      Cypress.env("C8Y_TENANT", "t123456789");
      Cypress.config().baseUrl = "https://test.us.cumulocity.com";
      expect(
        runner.test_updateURLs(
          JSON.stringify({
            body: {
              sel1: "https://t617206445.eu-latest.cumulocity.com/identity/externalIds/c8y_Serial/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
              managedObject: {
                self: "https://my-test.eu-latest.cumulocity.com/inventory/managedObjects/68124542292",
                id: "68124542292",
              },
            },
          }),
          {
            tenant: "t617206445",
            baseUrl: "https://my-test.eu-latest.cumulocity.com",
          }
        )
      ).to.eq(
        JSON.stringify({
          body: {
            sel1: "https://t123456789.us.cumulocity.com/identity/externalIds/c8y_Serial/85A4265B-5A14-4360-86A7-C82ED51D8AA0",
            managedObject: {
              self: "https://test.us.cumulocity.com/inventory/managedObjects/68124542292",
              id: "68124542292",
            },
          },
        })
      );
    });
  });
});
