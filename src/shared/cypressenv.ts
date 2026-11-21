/**
 * Synchronous access to the Cypress environment that works with all supported Cypress
 * versions.
 *
 * Cypress 16 removed `Cypress.env()`. Values that can be read synchronously in the browser
 * are now set with `Cypress.expose()`, and the `expose` configuration object. The
 * `configureC8yPlugin` and `configureC8yScreenshotPlugin` plugins copy `config.env` into
 * `config.expose`, so the variables configured for cumulocity-cypress stay available.
 *
 * - Reads use `Cypress.env()` as long as it exists (Cypress 15 and before), so values
 *   that tests still set with `Cypress.env()` are seen, and fall back to
 *   `Cypress.expose()` for values that are only exposed. With Cypress 16, or if
 *   `Cypress.env()` throws (`allowCypressEnv: false`), reads use `Cypress.expose()`.
 * - Writes go to `Cypress.expose()` and, if it still exists, to `Cypress.env()`, so both
 *   return the same values.
 */

type CypressEnvAccessor = {
  (): Record<string, any>;
  (key: string): any;
  (key: string, value: any): void;
  (object: Record<string, any>): void;
};

type CypressWithEnv = {
  env?: CypressEnvAccessor;
  expose?: CypressEnvAccessor;
};

function cypressInstance(): CypressWithEnv | undefined {
  return typeof Cypress === "undefined"
    ? undefined
    : (Cypress as unknown as CypressWithEnv);
}

function callSafe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    // Cypress 15.10+ throws on Cypress.env() if allowCypressEnv is false
    return undefined;
  }
}

/**
 * Returns all variables of the Cypress environment.
 */
export function c8yEnv(): Record<string, any>;
/**
 * Returns the value of the given variable of the Cypress environment, or undefined.
 * @param key The name of the variable.
 */
export function c8yEnv(key: string): any;
/**
 * Sets the value of the given variable of the Cypress environment for the remainder of
 * the run.
 * @param key The name of the variable.
 * @param value The value to set.
 */
export function c8yEnv(key: string, value: any): void;
/**
 * Sets the values of the given variables of the Cypress environment for the remainder
 * of the run. Values are merged with existing values.
 * @param object The variables to set.
 */
export function c8yEnv(object: Record<string, any>): void;
export function c8yEnv(
  keyOrObject?: string | Record<string, any>,
  ...value: any[]
): any {
  const cypress = cypressInstance();
  if (cypress == null) {
    return keyOrObject == null ? {} : undefined;
  }
  const expose =
    typeof cypress.expose === "function" ? cypress.expose : undefined;
  const env = typeof cypress.env === "function" ? cypress.env : undefined;

  if (keyOrObject == null) {
    return {
      ...(expose ? expose() : {}),
      ...(env ? callSafe(() => env()) : {}),
    };
  }

  if (typeof keyOrObject === "object" || value.length > 0) {
    const args = [keyOrObject, ...value] as [any, any];
    expose?.(...args);
    if (env) {
      callSafe(() => env(...args));
    }
    return undefined;
  }

  const fromEnv = env ? callSafe(() => env(keyOrObject)) : undefined;
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return expose ? expose(keyOrObject) : undefined;
}
