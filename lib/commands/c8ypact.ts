import { C8yDefaultPactMatcher } from "../pacts/matcher";

declare global {
  namespace Cypress {
    interface Cypress {
      c8ypact: C8yPact;
    }

    interface SuiteConfigOverrides {
      c8ypact: string;
    }

    interface TestConfigOverrides {
      c8ypact: string;
    }

    interface RuntimeConfigOptions {
      c8ypact: string;
    }
  }

  interface C8yPact {
    matcher: C8yPactMatcher;
    currentPactIdentifier: () => string;
    currentPactFilename: () => string;
    currentNextPact: <T = any>() => Cypress.Chainable<Cypress.Response<T>>;
    currentPacts: () => Cypress.Chainable<Cypress.Response<any>[]>;
    savePact: (response: Cypress.Response<any>) => void;
    isRecordingEnabled: () => boolean;
    failOnMissingPacts: boolean;
  }

  interface C8yPactMatcher {
    match: (obj1: unknown, obj2: unknown) => boolean;
  }
}

Cypress.c8ypact = {
  currentPactIdentifier: pactIdentifier,
  currentPacts,
  currentPactFilename,
  currentNextPact: getNextPact,
  isRecordingEnabled,
  savePact,
  matcher: new C8yDefaultPactMatcher(),
  failOnMissingPacts: false,
};

before(() => {
  if (!Cypress.c8ypact.isRecordingEnabled()) {
    cy.task("c8ypact:load", Cypress.config().fixturesFolder, { log: logTasks });
  }
});

beforeEach(() => {
  if (Cypress.c8ypact.isRecordingEnabled()) {
    cy.task("c8ypact:remove", Cypress.c8ypact.currentPactIdentifier(), {
      log: logTasks,
    });
  }
});

const logTasks = false;

function pactIdentifier(): string {
  let key = Cypress.currentTest?.titlePath?.join("--");
  if (key == null) {
    key = Cypress.spec?.relative?.split("/").slice(-2).join("--");
  }
  return Cypress.config().c8ypact || key.replace(/ /g, "_");
}

function isRecordingEnabled(): boolean {
  return Cypress.env("C8Y_PACT_MODE") === "recording";
}

function savePact(response: Cypress.Response<any>) {
  const pact = Cypress.c8ypact.currentPactIdentifier();
  if (pact) {
    const folder = Cypress.config().fixturesFolder;
    cy.task(
      "c8ypact:save",
      {
        pact,
        response,
        folder,
      },
      { log: logTasks }
    );
  }
}

function currentPacts(): Cypress.Chainable<Cypress.Response<any>[]> {
  return cy.task("c8ypact:get", Cypress.c8ypact.currentPactIdentifier(), {
    log: logTasks,
  });
}

function currentPactFilename(): string {
  const pactId = Cypress.c8ypact.currentPactIdentifier();
  return `${Cypress.config().fixturesFolder}/c8ypact/${pactId}.json`;
}

function getNextPact(): Cypress.Chainable<Cypress.Response<any>> {
  return cy.task("c8ypact:next", Cypress.c8ypact.currentPactIdentifier(), {
    log: logTasks,
  });
}