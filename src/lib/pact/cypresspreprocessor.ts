import {
  C8yDefaultPactPreprocessor,
  C8yPact,
  C8yPactPreprocessorOptions,
  C8yPactRecord,
} from "../../shared/c8ypact";

const { _ } = Cypress;

/**
 * The C8yCypressEnvPreprocessor is a preprocessor implementation that uses
 * Cypress environment variables to configure C8yPactPreprocessorOptions.
 *
 * Options are deep merged in the following order:
 * - Cypress environment variables
 * - C8yPactPreprocessorOptions passed to the apply method
 * - C8yPactPreprocessorOptions passed to the constructor
 * - Cypress.c8ypact.config value for preprocessor
 */
export class C8yCypressEnvPreprocessor extends C8yDefaultPactPreprocessor {
  apply(
    obj: Partial<Cypress.Response<any> | C8yPactRecord | C8yPact>,
    options?: C8yPactPreprocessorOptions
  ): void {
    super.apply(obj, this.resolveOptions(options));
  }

  resolveOptions(
    options?: Partial<C8yPactPreprocessorOptions>
  ): C8yPactPreprocessorOptions {
    let preprocessorConfigValue: C8yPactPreprocessorOptions = {};
    if (
      Cypress.c8ypact &&
      typeof Cypress.c8ypact.getConfigValue === "function"
    ) {
      preprocessorConfigValue =
        Cypress.c8ypact.getConfigValue<C8yPactPreprocessorOptions>(
          "preprocessor"
        ) ?? {};
    }

    return _.defaultsDeep(
      {
        ignore: Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE"),
        obfuscate: Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE"),
        obfuscationPattern: Cypress.env("C8Y_PACT_PREPROCESSOR_PATTERN"),
      } as C8yPactPreprocessorOptions,
      options,
      this.options,
      preprocessorConfigValue,
      {
        ignore: [],
        obfuscate: [],
        obfuscationPattern:
          C8yDefaultPactPreprocessor.defaultObfuscationPattern,
      }
    );
  }
}
