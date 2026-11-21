import { to_array, to_boolean } from "../../shared/util";
import {
  C8yDefaultPactPreprocessor,
  C8yPact,
  C8yPactPreprocessorDefaultOptions,
  C8yPactPreprocessorOptions,
  C8yPactRecord,
} from "../../shared/c8ypact";
import { c8yEnv } from "../../shared/cypressenv";

/**
 * The C8yCypressEnvPreprocessor is a preprocessor implementation that uses
 * Cypress environment variables to configure C8yPactPreprocessorOptions.
 *
 * Options are deep merged in the following order:
 * - Cypress environment variables
 * - C8yPactPreprocessorOptions passed to the apply method
 * - C8yPactPreprocessorOptions passed to the constructor
 * - Cypress.c8ypact.config value for preprocessor
 * - C8yPactPreprocessorDefaultOptions
 */
export class C8yCypressEnvPreprocessor extends C8yDefaultPactPreprocessor {
  apply(
    obj: Partial<Cypress.Response<any> | C8yPactRecord | C8yPact>,
    options?: C8yPactPreprocessorOptions
  ): void {
    super.apply(obj, options);
  }

  resolveOptions(
    options?: Partial<C8yPactPreprocessorOptions>
  ): C8yPactPreprocessorOptions {
    let preprocessorConfigValue: C8yPactPreprocessorOptions = {};
    if (Cypress.c8ypact?.config?.preprocessor) {
      preprocessorConfigValue = Cypress.c8ypact.config.preprocessor;
    }

    // Build env options, filtering out undefined values
    const envOptions: Partial<C8yPactPreprocessorOptions> = {};
    if (c8yEnv("C8Y_PACT_PREPROCESSOR_IGNORE") !== undefined) {
      envOptions.ignore = to_array(c8yEnv("C8Y_PACT_PREPROCESSOR_IGNORE"));
    }
    if (c8yEnv("C8Y_PACT_PREPROCESSOR_OBFUSCATE") !== undefined) {
      envOptions.obfuscate = to_array(
        c8yEnv("C8Y_PACT_PREPROCESSOR_OBFUSCATE")
      );
    }
    if (c8yEnv("C8Y_PACT_PREPROCESSOR_PATTERN") !== undefined) {
      envOptions.obfuscationPattern = c8yEnv(
        "C8Y_PACT_PREPROCESSOR_PATTERN"
      );
    }
    if (c8yEnv("C8Y_PACT_PREPROCESSOR_IGNORE_CASE") !== undefined) {
      envOptions.ignoreCase = to_boolean(
        c8yEnv("C8Y_PACT_PREPROCESSOR_IGNORE_CASE"),
        true
      );
    }

    // Merge in priority order (lowest to highest priority)
    return {
      ...C8yPactPreprocessorDefaultOptions,
      ...preprocessorConfigValue,
      ...this.options,
      ...options,
      ...envOptions,
    };
  }
}
