import {
  C8yRequireConfigOption,
  isVersionSatisfyingRequirements,
} from "../../shared/versioning";

import * as semver from "semver";
import { getShellVersionFromEnv, getSystemVersionFromEnv } from "../utils";

const { _ } = Cypress;

interface C8yRequire {
  /**
   * Versions of system and shells required to run the test. System version is read from C8Y_SYSTEM_VERSION
   * or C8Y_VERSION environment variables, the shell version and name are read from C8Y_SHELL_VERSION and
   * C8Y_SHELL_NAME env variables. If the required versions are not satisfying the requirements,
   * the test is skipped. Required versions are defined as arrays of semver formatted ranges, as
   * for example `1.2.3`, `^1.2.3`, `1.2.x`, `>=1 <=2.3.4`, etc. Default shell is `cockpit` if no
   * C8Y_SHELL_NAME is defined.
   *
   * Tests are skipped if a version requirement is added and required system or shell versions are not
   * defined. To also run the test when required versions are not defined, add `null` to the list of
   * required versions.
   *
   * Use `C8Y_IGNORE_REQUIRES_SKIP` environment variable to disable skipping tests for unsatisfied
   * version requirements.
   *
   * @example
   * it('should run only on system version 1.2.3', { requires: ['1.2.3'] }, () => {
   *  // test code
   * });
   *
   * it('should run only for shell version 1020.1.0', { requires: { shell: ['1020.1.0'] } }, () => {
   *   // test code
   * });
   *
   * it('should run only for system version 1.2.3 and shell version 1020.1.0',
   *   { requires: { system: ['1.2.3'], shell: ['1020.1.0'] } }, () => {
   *  // test code
   * });
   *
   */
  requires?: C8yRequireConfigOption;
}

declare global {
  namespace Cypress {
    interface Cypress extends C8yRequire {
      semver: typeof semver;
    }

    // use interface C8yRequire so doc is used and to avoid duplication

    interface SuiteConfigOverrides extends C8yRequire {}

    interface TestConfigOverrides extends C8yRequire {}

    interface RuntimeConfigOptions extends C8yRequire {}
  }
}

if (Cypress.semver == null) {
  Cypress.semver = semver;
}

beforeEach(function () {
  if (
    Cypress.env("C8Y_IGNORE_REQUIRES_SKIP") == null &&
    // backward compatibility
    Cypress.env("C8Y_PACT_IGNORE_VERSION_SKIP") == null &&
    isSystemVersionSatisfyingCurrentTestRequirements() === false
  ) {
    this.skip();
  }
});

/**
 * Checks if `Cypress.config().requires` matches environment for the current test.
 * @returns `true` if the system version satisfies the requirements of the current test, `false` otherwise.
 */
export function isSystemVersionSatisfyingCurrentTestRequirements(): boolean {
  const requires = Cypress.config().requires;
  if (requires == null) return true;

  if (_.isArrayLike(requires)) {
    return isVersionSatisfyingRequirements(
      getSystemVersionFromEnv(),
      requires as string[]
    );
  } else {
    let systemResult = true;
    if (requires.system != null) {
      systemResult = isVersionSatisfyingRequirements(
        getSystemVersionFromEnv(),
        requires.system
      );
    }
    let shellResult = true;
    if (requires.shell != null) {
      shellResult = isVersionSatisfyingRequirements(
        getShellVersionFromEnv(),
        requires.shell
      );
    }
    return systemResult && shellResult;
  }
}
