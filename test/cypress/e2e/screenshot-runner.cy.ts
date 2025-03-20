import {
  C8yScreenshotRunner,
  ScreenshotSetup,
} from "cumulocity-cypress/c8yscrn";
import { stubEnv } from "cypress/support/testutils";

import _ from "lodash";

describe("screenshot-runner", () => {
  const workflow: ScreenshotSetup = {
    title: "My Screenshots",
    baseUrl: "https://dtmdoc.latest.stage.c8y.io",
    global: {
      tags: ["dtm", "c8yscrn"],
      login: false,
    },

    screenshots: [
      {
        image: "dtm/asset-type/dtm-asset-type-export.png",
        visit: "/apps/digital-twin-manager/index.html#/assetmodels",
        tags: ["asset-type"],
        actions: [
          {
            click: "$navigator.toggle",
          },
          {
            highlight: {
              selector: ".bottom-drawer .card-footer .btn-primary",
              border: {
                "outline-offset": "2px",
              },
            },
          },
        ],
      },
    ],
  };

  context("initialization", () => {
    it("throws without config", function (done) {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          "C8yScreenshotRunner requires configuration."
        );
        done();
      });
      new C8yScreenshotRunner();
    });

    it("should initialize with config", () => {
      const runner = new C8yScreenshotRunner(workflow);
      expect(runner).to.be.an.instanceOf(C8yScreenshotRunner);
    });

    it("throws with invalid config", function (done) {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Invalid config file.");
        done();
      });
      new C8yScreenshotRunner({} as ScreenshotSetup);
    });

    it("should register action handlers", () => {
      const runner = new C8yScreenshotRunner(workflow);
      expect(runner.actionHandlers).to.have.property("click");
      expect(runner.actionHandlers).to.have.property("text");
      expect(runner.actionHandlers).to.have.property("screenshot");
      expect(runner.actionHandlers).to.have.property("fileUpload");
      expect(runner.actionHandlers).to.have.property("wait");
      expect(runner.actionHandlers).to.have.property("blur");
      expect(runner.actionHandlers).to.have.property("focus");
      expect(runner.actionHandlers).to.have.property("scrollTo");
      expect(runner.actionHandlers).to.have.property("highlight");
    });

    it("should register highlight action handler when enabled", () => {
      stubEnv({ _c8yscrnHighlight: true });

      const runner = new C8yScreenshotRunner(workflow);
      expect(runner.actionHandlers).to.have.property("highlight");
    });

    it("should not register highlight action handler when disabled", () => {
      stubEnv({ _c8yscrnHighlight: false });

      const runner = new C8yScreenshotRunner(workflow);
      expect(runner.actionHandlers).to.not.have.property("highlight");
    });
  });

  context("runSuite", () => {
    beforeEach(() => {
      cy.spy(global, "describe").as("describeSpy");
      cy.spy(global, "context").as("contextSpy");
      cy.spy(global, "it").as("itSpy");
    });

    it("should create Cypress test suite structure from workflow", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.runSuite();

      cy.get<sinon.SinonSpy>("@describeSpy").should(
        "be.calledWith",
        "My Screenshots"
      );
      cy.get<sinon.SinonSpy>("@contextSpy").should("be.calledTwice");
      cy.get<sinon.SinonSpy>("@itSpy").should(
        "be.calledWith",
        "dtm-asset-type-export.png (en)",
        { tags: ["asset-type"], scrollBehavior: false }
      );
    });

    it("should create Cypress test suite structure from workflow with multiple languages", () => {
      const w = { ...workflow, ...{ global: { language: ["en", "de"] } } };
      const runner = new C8yScreenshotRunner(w);
      runner.runSuite();

      // Verify the test structure was created correctly
      cy.get<sinon.SinonSpy>("@describeSpy").should(
        "be.calledWith",
        "My Screenshots"
      );
      cy.get<sinon.SinonSpy>("@contextSpy").should("be.calledTwice");
      cy.get<sinon.SinonSpy>("@itSpy").should("be.calledTwice");

      cy.get<sinon.SinonSpy>("@itSpy").should(
        "be.calledWith",
        "dtm-asset-type-export.png (en)",
        { tags: ["asset-type"], scrollBehavior: false }
      );
      cy.get<sinon.SinonSpy>("@itSpy").should(
        "be.calledWith",
        "dtm-asset-type-export.png (de)",
        { tags: ["asset-type"], scrollBehavior: false }
      );
    });
  });

  context.skip("run", () => {
    const screenshots = _.concat(workflow.screenshots, {
      image: "cockpit/index.png",
      visit: "/apps/cockpit/index.html#",
      tags: ["cockpit"],
      actions: [
        {
          click: "$navigator.toggle",
        },
        {
          highlight: {
            selector: ".bottom-drawer .card-footer .btn-primary",
            border: {
              "outline-offset": "2px",
            },
          },
        },
      ],
    });

    const workflowWith2Objects = _.cloneDeep(workflow);
    workflowWith2Objects.screenshots = screenshots;

    let describeStub: sinon.SinonStub;
    let contextStub: sinon.SinonStub;
    let itStub: sinon.SinonStub;
    let beforeEachStub: sinon.SinonStub;
    let beforeStub: sinon.SinonStub;

    beforeEach(() => {
      // Create chainable stubs for all Mocha functions
      describeStub = cy
        .stub(global, "describe")
        .callsFake(function (name, fn) {
          fn?.();
          return describeStub; // Return the stub to allow chaining
        })
        .as("describeSpy");

      contextStub = cy
        .stub(global, "context")
        .callsFake(function (name, fn) {
          fn?.();
          return contextStub;
        })
        .as("contextSpy");

      itStub = cy
        .stub(global, "it")
        .callsFake(function (name, options, fn) {
          // Handle the case where options is omitted
          if (typeof options === "function") {
            fn = options;
          }
          return itStub;
        })
        .as("itSpy");

      beforeEachStub = cy.stub(global, "beforeEach").as("beforeEachSpy");
      beforeStub = cy.stub(global, "before").as("beforeSpy");
    });

    afterEach(() => {
      describeStub.restore();
      contextStub.restore();
      itStub.restore();
      beforeEachStub.restore();
      beforeStub.restore();
    });

    it.skip("should filter tests when run() is called with options", () => {
      const runner = new C8yScreenshotRunner(workflowWith2Objects);
      runner.run({ tags: ["cockpit"] });

      cy.get("@describeSpy").should("not.be.called");
      cy.get("@contextSpy").should("be.calledOnceWith", "cockpit");
      cy.get("@beforeEachSpy").should("be.calledTwice"); // context + it
      cy.get("@itSpy").should("be.calledOnceWith", "index.png (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });

      cy.get("@itSpy").should(
        "not.be.calledWith",
        "dtm-asset-type-export.png (en)"
      );
    });
  });
});

// function getCurrentTestId(): string {
//   try {
//     // Get current test (safely)
//     const cypressAny = Cypress as any;

//     const currentTest =
//       Cypress.currentTest ||
//       Cypress.mocha?.getRunner()?.test ||
//       Cypress.state("test");

//     // Check if titlePath exists and is a function
//     if (currentTest && typeof currentTest.titlePath === "function") {
//       return currentTest.titlePath().join(" -- ");
//     } else if (currentTest && currentTest.fullTitle) {
//       // Fallback to fullTitle if available
//       return typeof currentTest.fullTitle === "function"
//         ? currentTest.fullTitle()
//         : currentTest.fullTitle;
//     }

//     // Final fallback
//     return "unknown-test-id";
//   } catch (e) {
//     console.warn("Error getting test ID:", e);
//     return "error-test-id";
//   }
// }
