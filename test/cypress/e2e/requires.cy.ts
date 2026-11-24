import { c8yEnv } from "cumulocity-cypress/shared/cypressenv";
import { isSystemVersionSatisfyingCurrentTestRequirements } from "cumulocity-cypress/lib/commands/requires";
import { stubEnv } from "cypress/support/testutils";

const { _, semver } = Cypress;

function p(v: string) {
  return semver.parse(v);
}

// required as the tested methods are protected / private
describe("c8ypact versions", function () {
  before(() => {
    // do not skip tests with unsatisfied version requirements
    c8yEnv("C8Y_IGNORE_REQUIRES_SKIP", "1");
  });

  context("semver", function () {
    it("should register Cypress.semver", function () {
      expect(Cypress.semver).to.not.be.undefined;
    });
  });

  context("isSystemVersionSatisfyingCurrentTestRequirements", function () {
    before(() => {
      c8yEnv("C8Y_SYSTEM_VERSION", "1.2.3");
      c8yEnv("C8Y_SHELL_VERSION", "2.5.0");
    });

    after(() => {
      c8yEnv("C8Y_SYSTEM_VERSION", undefined);
      c8yEnv("C8Y_SHELL_VERSION", undefined);
    });

    it(
      "should return true if system version is satisfied",
      { requires: ["1.2"] },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if system version is satisfied specified as object",
      { requires: { system: ["1.2"] } },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if shell version is satisfied",
      { requires: { shell: ["2"] } },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if shell and system version are satisfied",
      { requires: { shell: ["2"], system: ["1.2"] } },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return false if one of shell and system versions are not satisfied",
      { requires: { shell: ["2.6"], system: ["1.2"] } },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.false;
      }
    );

    it(
      "should return true if system version is satisfied with multiple ranges",
      { requires: ["2.3.4", "1"] },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if shell version is satisfied with multiple ranges",
      { requires: { shell: ["1.3.4", "2.5"] } },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return false if system version is not satisfied",
      { requires: ["1.3"] },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.false;
      }
    );

    it(
      "should return false if shell version is not satisfied",
      { requires: ["3.0"] },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.false;
      }
    );

    it(
      "should return true if no version is required",
      { requires: [] },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if no version is required with empty object",
      { requires: {} },
      function () {
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return false if no system version is set",
      { requires: ["1.3"] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: undefined });
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.false;
      }
    );

    it(
      "should return false if no shell version is set",
      { requires: ["2.5"] },
      function () {
        stubEnv({ C8Y_SHELL_VERSION: undefined });
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.false;
      }
    );

    it(
      "should return true if no system version is set and null is defined in required versions",
      { requires: ["1.3", null] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: undefined });
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );

    it(
      "should return true if no shell version is set and null is defined in required versions",
      { requires: { shell: ["2.5", null] } },
      function () {
        stubEnv({ C8Y_SHELL_VERSION: undefined });
        expect(isSystemVersionSatisfyingCurrentTestRequirements()).to.be.true;
      }
    );
  });
});
