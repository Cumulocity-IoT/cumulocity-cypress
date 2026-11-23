// @cypress/grep 5 declares its types only in the exports of its package.json, which the
// moduleResolution of this project doesn't support
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { register } = require("@cypress/grep");

/**
 * Registers `@cypress/grep` for the c8yscrn CLI, with all supported Cypress versions.
 *
 * cumulocity-cypress uses `@cypress/grep` 5, the last version that installs with
 * Cypress 13 and 14, as later versions require Cypress 15.10 or later. It reads and
 * writes its options with `Cypress.env()`, which Cypress 16 removed, and which throws
 * with Cypress 15.10 and later if `allowCypressEnv` is false. `Cypress.env()` is then
 * replaced by a function using `Cypress.expose()`, where the plugin exposes the
 * variables of `config.env`, such as `grepTags`.
 */
export function registerCypressGrep(): void {
  const cypress = Cypress as any;
  if (typeof cypress.expose === "function" && !isCypressEnvUsable(cypress)) {
    cypress.env = (...args: any[]) => cypress.expose(...args);
  }
  register();
}

function isCypressEnvUsable(cypress: any): boolean {
  if (typeof cypress.env !== "function") return false;
  try {
    cypress.env();
    return true;
  } catch {
    return false;
  }
}
