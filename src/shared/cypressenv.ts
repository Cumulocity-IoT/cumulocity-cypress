/**
 * Synchronous access to the Cypress environment that works with all supported Cypress
 * versions.
 *
 * Cypress 16 removed `Cypress.env()`. Values that can be read synchronously in the browser
 * are now set with `Cypress.expose()`, and the `expose` configuration object. The
 * `configureC8yPlugin` and `configureC8yScreenshotPlugin` plugins copy `config.env` into
 * `config.expose`, so the variables configured for cumulocity-cypress stay available.
 *
 * - Reads use `Cypress.expose()`, and fall back to `Cypress.env()` for variables that are
 *   not exposed, e.g. if the plugin isn't used.
 * - Writes go to `Cypress.expose()` and, if it still exists, to `Cypress.env()`, so both
 *   return the same values.
 * - With Cypress 15.10 to 15.x, `Cypress.env()` and `Cypress.expose()` are separate
 *   stores. Values set with `Cypress.env()`, including `env` test overrides, are also
 *   set in `Cypress.expose()` (see {@link syncEnvToExpose}), so they are seen as well.
 * - With the plugin option `exposeCredentials: false`, credentials of `config.env` are
 *   not exposed. They are read with `cy.env()` before each spec and test instead (see
 *   {@link loadC8yCredentials}), and returned for variables that are not exposed.
 */

type CypressEnvAccessor = {
  (): Record<string, any>;
  (key: string): any;
  (key: string, value: any): void;
  (object: Record<string, any>): void;
  reset?: () => Record<string, any>;
};

type CypressWithEnv = {
  env?: CypressEnvAccessor;
  expose?: CypressEnvAccessor;
};

const SYNCED = "__c8yEnvSyncedToExpose";
// the original Cypress.env() replaced by syncEnvToExpose()
const UNSYNCED = "__c8yEnvUnsynced";

/**
 * The exposed variable with the names of the credentials the plugin did not expose
 * (`exposeCredentials: false`). Their values are read with `cy.env()`.
 */
export const C8Y_CREDENTIAL_KEYS = "_c8yCredentialKeys";

// the credentials read with cy.env() (see loadC8yCredentials), stored on the Cypress
// instance to share them if this module is bundled more than once, e.g. by a spec
const CREDENTIALS = "__c8yCredentials";

function credentials(): Record<string, any> {
  return (cypressInstance() as any)?.[CREDENTIALS] ?? {};
}

function setCredentials(values: Record<string, any>): void {
  const cypress = cypressInstance() as any;
  if (cypress != null) cypress[CREDENTIALS] = values;
}

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

// the arguments of a write: (key, value) or (object), as in Cypress' setter_getter
function isWrite(args: any[]): boolean {
  return (
    args.length > 1 ||
    (args.length === 1 && args[0] != null && typeof args[0] === "object")
  );
}

/**
 * Keeps `Cypress.expose()` up to date with `Cypress.env()` for Cypress 15.10 to 15.x,
 * where both exist as separate stores: `Cypress.env()` is replaced by a function that
 * also writes values to `Cypress.expose()`. Cypress applies and restores `env` test
 * overrides with `Cypress.env()` and `Cypress.env.reset()`, so they are written to
 * `Cypress.expose()` as well.
 *
 * Writes with `Cypress.expose()` are not written to `Cypress.env()`, as `expose` test
 * overrides are restored by deleting them from `Cypress.expose()`, which can't be
 * detected. As reads prefer `Cypress.expose()`, its values are seen anyway.
 *
 * Does nothing with Cypress 14 and 16, if `Cypress.env()` is not allowed
 * (`allowCypressEnv: false`), and if already called for the current `Cypress` instance.
 */
export function syncEnvToExpose(): void {
  const cypress = cypressInstance() as any;
  if (cypress == null) return;
  const env = cypress.env;
  const expose = cypress.expose;
  if (typeof env !== "function" || typeof expose !== "function") return;
  if (env[SYNCED] === true) return;
  try {
    env();
  } catch {
    return;
  }

  // exposed values that differed from Cypress.env() when it was reset, see synced.reset
  let preserved: Record<string, any> | undefined;

  const synced: any = function (this: any, ...args: any[]) {
    const result = env.apply(this, args);
    const toPreserve = preserved;
    preserved = undefined;
    if (isWrite(args)) {
      // the original Cypress.expose(), not the current one, which might be stubbed in a
      // test, e.g. when Cypress restores env test overrides before the stubs of the test
      callSafe(() => expose(...args));
      if (toPreserve != null) {
        callSafe(() => expose(toPreserve));
      }
    }
    return result;
  };
  Object.assign(synced, env);
  // Restoring env test overrides resets Cypress.env() and sets the variables of before
  // the test again. Variables only set by the override must be deleted from
  // Cypress.expose() as well: delete all variables that have the same value in both,
  // the variables to restore are set again right after. Exposed values that differ from
  // Cypress.env(), e.g. set explicitly in config.expose or with Cypress.expose(), are
  // set again after the next write, which would overwrite them.
  synced.reset = function (this: any, ...args: any[]) {
    const all = env();
    const exposed = expose();
    const differing: Record<string, any> = {};
    Object.keys(all).forEach((key) => {
      if (!(key in exposed)) return;
      if (exposed[key] === all[key]) {
        delete exposed[key];
      } else {
        differing[key] = exposed[key];
      }
    });
    preserved = Object.keys(differing).length > 0 ? differing : undefined;
    return env.reset.apply(this, args);
  };
  synced[SYNCED] = true;
  synced[UNSYNCED] = env;
  cypress.env = synced;
}

/**
 * Reads the credentials the plugin did not expose (`exposeCredentials: false`) with
 * `cy.env()`, so {@link c8yEnv} returns them synchronously. Values set with
 * `Cypress.expose()` are preferred. Replaces the credentials read before, and does
 * nothing if there are no such credentials or `cy.env()` is not available (before
 * Cypress 15.10).
 *
 * Called before each spec and test by cumulocity-cypress.
 *
 * @returns The chainable of `cy.env()`, or undefined if not called.
 */
export function loadC8yCredentials(): any {
  const cypress = cypressInstance();
  const keys =
    typeof cypress?.expose === "function"
      ? callSafe(() => cypress.expose!(C8Y_CREDENTIAL_KEYS))
      : undefined;
  const cyEnv =
    typeof cy !== "undefined" ? (cy as any).env : undefined;
  if (!Array.isArray(keys) || keys.length === 0 || typeof cyEnv !== "function") {
    setCredentials({});
    return undefined;
  }
  return cyEnv(keys, { log: false }).then((values: Record<string, any>) => {
    setCredentials(pickDefined(values));
  });
}

function pickDefined(values: Record<string, any> | undefined) {
  const result: Record<string, any> = {};
  Object.entries(values ?? {}).forEach(([key, value]) => {
    if (value !== undefined) result[key] = value;
  });
  return result;
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
  syncEnvToExpose();

  const expose =
    typeof cypress.expose === "function" ? cypress.expose : undefined;
  const env = typeof cypress.env === "function" ? cypress.env : undefined;

  if (keyOrObject == null) {
    return {
      ...(env ? callSafe(() => env()) : {}),
      ...credentials(),
      ...(expose ? expose() : {}),
    };
  }

  if (typeof keyOrObject === "object" || value.length > 0) {
    const args = [keyOrObject, ...value] as [any, any];
    expose?.(...args);
    if (env) {
      // c8yEnv() writes Cypress.expose() itself, which might be stubbed in a test. Write
      // Cypress.env() without mirroring the write into the original Cypress.expose().
      const unsynced = (env as any)[UNSYNCED] ?? env;
      callSafe(() => unsynced(...args));
    }
    return undefined;
  }

  // a variable in Cypress.expose() is returned even if its value is undefined, as it
  // has been unset there
  const exposed = expose ? expose() : undefined;
  if (exposed != null && keyOrObject in exposed) {
    return exposed[keyOrObject];
  }
  const loaded = credentials();
  if (keyOrObject in loaded) {
    return loaded[keyOrObject];
  }
  return env ? callSafe(() => env(keyOrObject)) : undefined;
}

syncEnvToExpose();
