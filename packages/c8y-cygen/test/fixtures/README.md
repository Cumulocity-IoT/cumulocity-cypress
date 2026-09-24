# Fixtures

`cypress-run-mixed-pass-fail.json` and `cypress-run-spec-compile-error.json` are
**real, captured `cypress.run()` output** (cypress@14.5.4), not hand-authored JSON.

They were produced by running a throwaway two-test spec (one passing assertion,
one deliberately failing assertion, `screenshotOnRunFailure: true`) and a
deliberately-invalid-JavaScript spec through `cypress.run()` programmatically,
then saving the resolved result object as-is. This is what `cypressRunner.spec.ts`
asserts against, so `parseCypressRunResult`'s test-failure/spec-failure split and
the screenshot-to-test matching are verified against ground truth rather than an
assumed shape.
