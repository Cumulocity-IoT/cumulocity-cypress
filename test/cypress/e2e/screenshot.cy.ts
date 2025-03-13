import "cumulocity-cypress/lib/commands/screenshot";

describe("highlight", () => {
  beforeEach(() => {
    cy.visit("/highlight.html");
  });

  it("should take screenshot with more than one element", () => {
    cy.get("#foo, #div")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 100,
            height: 150,
          });
        },
      });
  });

  it("should take screenshot with more than one element with options", () => {
    cy.get("#padding, #padding2")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 220,
            height: 120,
          });
        },
        padding: 10,
      });
  });

  it("should take screenshot with 2 padding options", () => {
    cy.get("#padding, #padding2")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 240,
            height: 120,
          });
        },
        padding: [10, 20],
      });
  });

  it("should take screenshot with 4 padding options", () => {
    cy.get("#padding, #padding2")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 260,
            height: 140,
          });
        },
        padding: [10, 20, 30, 40],
      });
  });

  it("should take screenshot with 4x0 padding options", () => {
    cy.get("#padding, #padding2")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 200,
            height: 100,
          });
        },
        padding: [0, 0, 0, 0],
      });
  });

  it("should take screenshot with null padding options", () => {
    cy.get("#padding, #padding2")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot({
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.dimensions).to.deep.eq({
            width: 200,
            height: 100,
          });
        },
        padding: null as any,
      });
  });

  it("should use name and options", () => {
    cy.get("#foo, #div")
      .then((subject) => {
        expect(subject).to.have.length(2);
        return cy.wrap(subject);
      })
      .screenshot("my-test-screenshot", {
        onAfterScreenshot: (subject, details) => {
          expect(subject).to.have.length(1);
          expect(details.name).to.eq("my-test-screenshot");
          expect(details.dimensions).to.deep.eq({
            width: 100,
            height: 150,
          });
        },
      });
  });
});
