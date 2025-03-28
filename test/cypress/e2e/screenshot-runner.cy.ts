/// <reference types="cypress" />

import {
  ScreenshotSetup,
  C8yScreenshotRunner,
} from "cumulocity-cypress/c8yscrn";
import { stubEnv } from "cypress/support/testutils";

const { _ } = Cypress;

const screenshot1: ScreenshotSetup["screenshots"][0] = {
  image: "cockpit/index.html",
  visit: "/apps/cockpit/index.html#",
  tags: ["cockpit"],
  actions: [
    {
      click: "button",
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
};

const screenshot2: ScreenshotSetup["screenshots"][0] = {
  image: "mytag/index2.html",
  visit: "/apps/cockpit/index.html#",
  tags: ["mytag"],
  actions: [
    {
      click: "button",
    },
  ],
};

const workflow: ScreenshotSetup = {
  title: "My Screenshots",
  baseUrl: "https://localhost:8080",
  global: {
    tags: ["dtm", "c8yscrn"],
    login: false,
  },
  screenshots: [screenshot1, screenshot2],
};

describe("C8yScreenshotRunner", () => {
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
      expect(runner.config).to.deep.eq(workflow);
    });

    it("should initialize with config from env", () => {
      Cypress.env("_c8yscrnyaml", workflow);
      const runner = new C8yScreenshotRunner();
      expect(runner).to.be.an.instanceOf(C8yScreenshotRunner);
      expect(runner.config).to.deep.eq(workflow);
      Cypress.env("_c8yscrnyaml", undefined);
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

  context("run", () => {
    let describeStub: sinon.SinonStub;
    let contextStub: sinon.SinonStub;
    let itStub: sinon.SinonStub;
    let beforeEachStub: sinon.SinonStub;
    let beforeStub: sinon.SinonStub;

    beforeEach(() => {
      describeStub = cy.stub(window, "describe").callsFake((title, fn) => {
        fn();
      });
      contextStub = cy.stub(window, "context").callsFake((title, fn) => {
        fn();
      });
      itStub = cy.stub(window, "it").callsFake((title, fn) => {
        if (typeof fn === "function") fn();
      });
      beforeEachStub = cy.stub(window, "beforeEach").callsFake((fn) => {
        if (fn) fn();
      });
      beforeStub = cy.stub(window, "before").callsFake((fn) => {
        if (fn) fn();
      });
    });

    afterEach(() => {
      describeStub.restore();
      contextStub.restore();
      itStub.restore();
      beforeEachStub.restore();
      beforeStub.restore();
    });

    it("should create tests for run()", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.run();

      // Assert that describe, context, and it were called
      expect(contextStub).to.have.been.called;
      expect(itStub).to.have.been.calledWith("index.html (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });
      expect(itStub.getCall(1).args[0]).to.eq("index2.html (en)");
      expect(itStub.getCall(1).args[1]).to.deep.eq({
        tags: ["mytag"],
        scrollBehavior: false,
      });
      expect(beforeEachStub).to.have.been.called;
    });

    it("should create tests for run() with tag", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.run({ tags: ["cockpit"] });

      // Assert that describe, context, and it were called
      expect(contextStub).to.have.been.calledWith("cockpit");
      expect(itStub).to.have.been.calledOnceWith("index.html (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });
      expect(beforeEachStub).to.have.been.called;
    });

    it("should create tests for run() with title filter", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.run({ titles: ["cockpit", "index.html"] });

      // Assert that describe, context, and it were called
      expect(contextStub).to.have.been.called;
      expect(itStub).to.have.been.calledOnceWith("index.html (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });
      expect(beforeEachStub).to.have.been.called;
    });

    it("should create tests for run() with image filter", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.run({ images: ["cockpit/index.html"] });

      // Assert that describe, context, and it were called
      expect(contextStub).to.have.been.called;
      expect(itStub).to.have.been.calledOnceWith("index.html (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });
      expect(beforeEachStub).to.have.been.called;
    });

    it("should create tests for runSuite()", () => {
      const runner = new C8yScreenshotRunner(workflow);
      runner.runSuite();

      // Assert that describe, context, it, and beforeEach were called
      expect(describeStub).to.have.been.calledWith(workflow.title);

      expect(contextStub).to.have.been.calledTwice;
      expect(contextStub.getCall(0).args[0]).to.eq("cockpit");
      expect(contextStub.getCall(1).args[0]).to.eq("mytag");

      expect(itStub).to.have.been.calledTwice;
      expect(itStub).to.have.been.calledWith("index.html (en)", {
        tags: ["cockpit"],
        scrollBehavior: false,
      });
      expect(itStub.getCall(1).args[0]).to.eq("index2.html (en)");
      expect(itStub.getCall(1).args[1]).to.deep.eq({
        tags: ["mytag"],
        scrollBehavior: false,
      });
      expect(beforeEachStub).to.have.been.called;
    });

    it("should create tests with multiple languages", () => {
      const w = _.cloneDeep(workflow);
      w.global!.language = ["en", "de"];

      const runner = new C8yScreenshotRunner(w);
      runner.run({ tags: ["cockpit"] });

      expect(itStub).to.have.been.calledTwice;
      expect(contextStub).to.have.been.calledOnceWith("cockpit");
      expect(itStub.getCall(0).args[0]).to.eq("index.html (en)");
      expect(itStub.getCall(1).args[0]).to.eq("index.html (de)");
      expect(beforeEachStub).to.have.been.called;
    });
  });
});
