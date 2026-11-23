/// <reference types="jest" />

import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";

// Checks that the Cypress versions cumulocity-cypress and the pact runner declare to
// support are compatible with the dependencies used with them in the browser.

const root = process.cwd();

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

// first version with Cypress.expose() and cy.env(), used instead of Cypress.env()
const MIN_CYPRESS_VERSION = "15.10.0";
// Cypress 16 removed Cypress.env(), @cypress/grep 6 and later use Cypress.expose()
const MIN_GREP_VERSION_FOR_CYPRESS_16 = "6.0.0";

const manifests = [
  {
    name: "cumulocity-cypress",
    file: "package.json",
    lockfile: "package-lock.json",
    cypressRange: (pkg: any) => pkg.peerDependencies?.cypress,
  },
  {
    name: "pact runner",
    file: "packages/pact-runner/package.json",
    lockfile: "packages/pact-runner/package-lock.json",
    cypressRange: (pkg: any) => pkg.dependencies?.cypress,
  },
];

describe.each(manifests)("$name dependencies", (manifest) => {
  const pkg = readJson(manifest.file);
  const lock = readJson(manifest.lockfile);
  const cypressRange: string = manifest.cypressRange(pkg);
  const grepRange: string = pkg.dependencies?.["@cypress/grep"];
  const lockedCypress = lock.packages?.["node_modules/cypress"];
  const lockedGrep = lock.packages?.["node_modules/@cypress/grep"];

  it("should declare a supported Cypress range", () => {
    expect(semver.validRange(cypressRange)).not.toBeNull();
  });

  it(`should not support Cypress versions before ${MIN_CYPRESS_VERSION}`, () => {
    const minVersion = semver.minVersion(cypressRange)?.version;
    expect(minVersion).toBeDefined();
    expect(semver.gte(minVersion!, MIN_CYPRESS_VERSION)).toBe(true);
  });

  it("should use a @cypress/grep version that supports Cypress 16", () => {
    if (!semver.intersects(cypressRange, ">=16.0.0")) return;
    const minGrepVersion = semver.minVersion(grepRange)?.version;
    expect(minGrepVersion).toBeDefined();
    expect(semver.gte(minGrepVersion!, MIN_GREP_VERSION_FOR_CYPRESS_16)).toBe(
      true
    );
  });

  it("should lock Cypress within the supported range", () => {
    expect(lockedCypress?.version).toBeDefined();
    expect(semver.satisfies(lockedCypress.version, cypressRange)).toBe(true);
  });

  it("should lock a @cypress/grep version that supports the locked Cypress", () => {
    expect(lockedGrep?.version).toBeDefined();
    if (semver.gte(lockedCypress.version, "16.0.0")) {
      expect(
        semver.gte(lockedGrep.version, MIN_GREP_VERSION_FOR_CYPRESS_16)
      ).toBe(true);
    }
    const grepPeerRange = lockedGrep.peerDependencies?.cypress;
    if (grepPeerRange != null) {
      // every Cypress version cumulocity-cypress supports must be supported by grep
      expect(semver.subset(cypressRange, grepPeerRange)).toBe(true);
    }
  });
});
