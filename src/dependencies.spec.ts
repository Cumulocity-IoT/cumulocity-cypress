/// <reference types="jest" />

import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";

// Checks that cumulocity-cypress and the pact runner support the Cypress versions they
// are tested with, and that the dependencies used with them in the browser install and
// work with all of these versions.

const root = process.cwd();

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

const manifests = [
  {
    name: "cumulocity-cypress",
    file: "package.json",
    lockfile: "package-lock.json",
    cypressRange: (pkg: any) => pkg.peerDependencies?.cypress,
    // the versions the CI tests run with (.github/workflows/test.yml), adding Cypress
    // 16 must not drop older versions
    supported: ["13.0.0", "14.5.4", "15.21.2", "16.3.0"],
  },
  {
    // the pact runner installs its own Cypress version
    name: "pact runner",
    file: "packages/pact-runner/package.json",
    lockfile: "packages/pact-runner/package-lock.json",
    cypressRange: (pkg: any) => pkg.dependencies?.cypress,
    supported: ["15.21.2", "16.3.0"],
  },
];

describe.each(manifests)("$name dependencies", (manifest) => {
  const pkg = readJson(manifest.file);
  const lock = readJson(manifest.lockfile);
  const cypressRange: string = manifest.cypressRange(pkg);
  const lockedCypress = lock.packages?.["node_modules/cypress"];
  const lockedGrep = lock.packages?.["node_modules/@cypress/grep"];

  it("should declare a valid Cypress range", () => {
    expect(semver.validRange(cypressRange)).not.toBeNull();
  });

  it.each(manifest.supported)("should support Cypress %s", (version) => {
    expect(semver.satisfies(version, cypressRange)).toBe(true);
  });

  it("should lock Cypress within the supported range", () => {
    expect(lockedCypress?.version).toBeDefined();
    expect(semver.satisfies(lockedCypress.version, cypressRange)).toBe(true);
  });

  // npm refuses to install a dependency whose peer range excludes the installed Cypress
  it.each(manifest.supported)(
    "should lock a @cypress/grep version that installs with Cypress %s",
    (version) => {
      expect(lockedGrep?.version).toBeDefined();
      const grepPeerRange = lockedGrep.peerDependencies?.cypress ?? "*";
      expect(semver.satisfies(version, grepPeerRange)).toBe(true);
    }
  );
});
