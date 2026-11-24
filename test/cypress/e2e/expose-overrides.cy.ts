import { c8yEnv } from "cumulocity-cypress/shared/cypressenv";

// test and suite overrides of expose are supported with Cypress 15.17 and later. Skip
// the tests before they run with older versions.
const describeWithExpose = Cypress.semver.gte(Cypress.version, "15.17.0")
  ? describe
  : describe.skip;

describeWithExpose("expose test overrides", () => {
  it(
    "should read variables of expose test overrides with c8yEnv()",
    { expose: { C8Y_TEST_OVERRIDE: "override" } },
    () => {
      expect(c8yEnv("C8Y_TEST_OVERRIDE")).to.eq("override");
    }
  );

  it("should not keep variables of expose test overrides", () => {
    expect(c8yEnv("C8Y_TEST_OVERRIDE")).to.be.undefined;
  });

  context(
    "with suite override",
    { expose: { C8Y_TEST_OVERRIDE: "suite" } },
    () => {
      it("should read variables of expose suite overrides with c8yEnv()", () => {
        expect(c8yEnv("C8Y_TEST_OVERRIDE")).to.eq("suite");
      });
    }
  );
});
