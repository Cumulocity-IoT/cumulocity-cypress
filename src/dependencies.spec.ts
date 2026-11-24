/// <reference types="jest" />

import * as fs from "fs";
import * as path from "path";
import * as semver from "semver";
import * as yaml from "yaml";

// Checks that cumulocity-cypress and the pact runner support the Cypress versions they
// are tested with, and that the dependencies used with them in the browser install and
// work with all of these versions.

const root = process.cwd();

function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function lockedCypressVersion(lockfile: string): string {
  return readJson(lockfile).packages?.["node_modules/cypress"]?.version;
}

// the Cypress versions of the cypress-compatibility job of the CI tests, e.g. "13" for
// the latest 13.x version, as installed with npm install cypress@13
function compatibilityTestedCypressVersions(): string[] {
  const workflow = yaml.parse(
    fs.readFileSync(path.join(root, ".github/workflows/test.yml"), "utf8")
  );
  const versions =
    workflow?.jobs?.["cypress-compatibility"]?.strategy?.matrix?.cypress;
  return Array.isArray(versions) ? versions.map(String) : [];
}

const manifests = [
  {
    name: "cumulocity-cypress",
    file: "package.json",
    lockfile: "package-lock.json",
    cypressRange: (pkg: any) => pkg.peerDependencies?.cypress,
    // the versions the CI tests run with (.github/workflows/test.yml): the locked
    // version in the cypress job, and older versions in the cypress-compatibility job.
    // Adding Cypress 16 must not drop older versions.
    supported: [
      ...compatibilityTestedCypressVersions(),
      lockedCypressVersion("package-lock.json"),
    ],
  },
  {
    // the pact runner installs its own Cypress version, and the published
    // cumulocity-cypress (see "pact runner Cypress 16" below)
    name: "pact runner",
    file: "packages/pact-runner/package.json",
    lockfile: "packages/pact-runner/package-lock.json",
    cypressRange: (pkg: any) => pkg.dependencies?.cypress,
    supported: [lockedCypressVersion("packages/pact-runner/package-lock.json")],
  },
];

// the latest published cumulocity-cypress version without Cypress 16 support
const LAST_RELEASE_WITHOUT_CYPRESS_16 = "1.9.0";

describe("pact runner Cypress 16", () => {
  const pkg = readJson("packages/pact-runner/package.json");

  // The pact runner installs cumulocity-cypress from npm, not the version of this
  // branch. Versions up to 1.9.0 use Cypress.env(), which Cypress 16 removed, so the
  // runner fails with Cypress 16 unless it requires a cumulocity-cypress release with
  // Cypress 16 support. Raise its cumulocity-cypress range together with Cypress.
  it("should only allow Cypress 16 with a cumulocity-cypress release supporting it", () => {
    const cypressRange: string = pkg.dependencies.cypress;
    if (!semver.intersects(cypressRange, ">=16.0.0")) return;
    const minVersion = semver.minVersion(
      pkg.dependencies["cumulocity-cypress"]
    );
    expect(minVersion).not.toBeNull();
    expect(semver.gt(minVersion!, LAST_RELEASE_WITHOUT_CYPRESS_16)).toBe(true);
  });
});

describe("CI tests", () => {
  // the dependency tests below would pass without checking older versions
  it("should test Cypress 13, 14 and 15 in the cypress-compatibility job", () => {
    const versions = compatibilityTestedCypressVersions();
    for (const major of [13, 14, 15]) {
      expect(versions.some((v) => semver.minVersion(v)?.major === major)).toBe(
        true
      );
    }
  });
});

describe.each(manifests)("$name dependencies", (manifest) => {
  const pkg = readJson(manifest.file);
  const lock = readJson(manifest.lockfile);
  const cypressRange: string = manifest.cypressRange(pkg);
  const lockedCypress = lock.packages?.["node_modules/cypress"];
  const lockedGrep = lock.packages?.["node_modules/@cypress/grep"];

  it("should declare a valid Cypress range", () => {
    expect(semver.validRange(cypressRange)).not.toBeNull();
  });

  // a version of the CI tests can be a range, e.g. "13" for the latest 13.x version
  it.each(manifest.supported)("should support Cypress %s", (version) => {
    expect(semver.validRange(version)).not.toBeNull();
    expect(semver.subset(version, cypressRange)).toBe(true);
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
      expect(semver.subset(version, grepPeerRange)).toBe(true);
    }
  );
});
