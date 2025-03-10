import { findCommonParent, getUnionDOMRect } from "cumulocity-cypress/lib/commands/highlight";

describe("highlight", () => {
  beforeEach(() => {
    cy.visit("/highlight.html");
  });

  describe("highlighting elements", () => {
    it("should highlight a single element", () => {
      cy.get("#foo").highlight({ border: "2px solid red" });
      cy.get("#foo").should("have.css", "border", "2px solid rgb(255, 0, 0)");
    });

    it("should highlight a single element with default styles", () => {
      cy.get("#foo").highlight();
      cy.get("#foo").should("have.css", "outline-color", "rgb(255, 147, 0)");
    });

    it("should highlight multiple elements by adding container element - 2 elements", () => {
      cy.get("#div, #foo").highlight({ border: "2px solid blue" });

      cy.get("body > div[_c8yscrn-highlight-container]")
        .should("exist")
        .should("have.css", "border", "2px solid rgb(0, 0, 255)")
        .should("have.css", "width", "100px")
        .should("have.css", "height", "150px");
    });

    it("should highlight multiple elements by adding container element - 3 elements", () => {
      cy.get("#div, #foo, #border").highlight({ border: "2px solid blue" });

      cy.get("body > div[_c8yscrn-highlight-container]")
        .should("exist")
        .should("have.css", "border", "2px solid rgb(0, 0, 255)")
        // +2px for the border of #border styled element
        .should("have.css", "width", "102px")
        .should("have.css", "height", "252px");
    });

    it("should highlight multiple elements using multi option", () => {
      cy.get("#div, #foo").highlight(
        { border: "2px solid blue" },
        { multiple: true }
      );
      cy.get("body > div[_c8yscrn-highlight-container]").should("not.exist");
      cy.get("#div").should("have.css", "border", "2px solid rgb(0, 0, 255)");
      cy.get("#foo").should("have.css", "border", "2px solid rgb(0, 0, 255)");
    });

    it("should clear highlights", () => {
      cy.get("#foo").highlight({ border: "2px solid green" });
      cy.clearHighlights();
      cy.get("#foo").should(
        "not.have.css",
        "border",
        "2px solid rgb(0, 128, 0)"
      );
    });

    it("should highlight with custom styles", () => {
      cy.get("#foo").highlight({ backgroundColor: "yellow" });
      cy.get("#foo").should("have.css", "background-color", "rgb(255, 255, 0)");
    });

    it("should highlight using width and height options", () => {
      // get the width and height of the element "div"
      cy.get("#div").then(($div) => {
        const width = $div.width();
        const height = $div.height();
        expect(width).to.be.greaterThan(0);
        expect(height).to.be.greaterThan(0);

        cy.get("#div").highlight(
          { backgroundColor: "yellow" },
          { width: 0.5, height: 0.5 }
        );
        cy.get("div[_c8yscrn-highlight-container]")
          .should("exist")
          // use backgroundColor instead of border as border might increase the width and height
          .should("have.css", "backgroundColor", "rgb(255, 255, 0)")
          .should("have.css", "width", width! * 0.5 + "px")
          .should("have.css", "height", height! * 0.5 + "px");
      });
    });

    it("should highlight using width and height options with absolute values", () => {
      cy.get("#div").highlight(
        { backgroundColor: "yellow" },
        { width: 100, height: 100 }
      );
      cy.get("div[_c8yscrn-highlight-container]")
        .should("exist")
        .should("have.css", "backgroundColor", "rgb(255, 255, 0)")
        .should("have.css", "width", "100px")
        .should("have.css", "height", "100px");
    });

    it("should highlight using width and height with multi option", () => {
      cy.get("#div, #foo").highlight(
        { backgroundColor: "yellow" },
        { width: 0.5, height: 0.5, multiple: true }
      );
      cy.get("div[_c8yscrn-highlight-container]")
        .should("exist")
        .should("have.length", 2);

      cy.get("div[_c8yscrn-highlight-container]")
        .eq(0)
        .should("have.css", "backgroundColor", "rgb(255, 255, 0)")
        .should("have.css", "width", "25px")
        .should("have.css", "height", "25px");
      cy.get("div[_c8yscrn-highlight-container]")
        .eq(1)
        .should("have.css", "backgroundColor", "rgb(255, 255, 0)")
        .should("have.css", "width", "50px")
        .should("have.css", "height", "50px");
    });

    it("should clear existing highlights before applying new ones", () => {
      cy.get("#div").highlight({ border: "2px solid orange" });
      cy.get("#foo").highlight({ border: "2px solid pink" }, { clear: true });
      cy.get("#div").should(
        "not.have.css",
        "border",
        "2px solid rgb(255, 165, 0)"
      );
      cy.get("#foo").should(
        "have.css",
        "border",
        "2px solid rgb(255, 192, 203)"
      );
    });

    it("should highlight multiple cells in a column", () => {
      cy.get("td:nth-child(2)").highlight({ border: "6px solid green" });
      cy.get("div[_c8yscrn-highlight-container]")
        .should("exist")
        .should("have.css", "border", "6px solid rgb(0, 128, 0)");
    });

    it("should restore the original styles after clearing highlights", () => {
      cy.get("#border").highlight({ border: "2px solid red" });
      cy.get("#border").should(
        "have.css",
        "border",
        "2px solid rgb(255, 0, 0)"
      );
      cy.clearHighlights();
      cy.get("#border").should("have.css", "border", "1px solid rgb(0, 0, 0)");
    });
  });
  
  describe("getUnionDOMRect", () => {
    it("should return the union of the bounding rects of the elements relative to the viewport", () => {
      cy.get("#div, #foo").then(($elements) => {
        const rect = getUnionDOMRect($elements);
        expect(rect).to.deep.equal(new DOMRectReadOnly(8, 8, 100, 150));
        expect(rect.toJSON()).to.deep.equal({
          left: 8,
          top: 8,
          width: 100,
          height: 150,
          right: 108,
          bottom: 158,
          x: 8,
          y: 8,
        });
      });
    });

    it("should return the union of the bounding rects of 3 elements relative to the viewport", () => {
      cy.get("#div, #foo, #border").then(($elements) => {
        const rect = getUnionDOMRect($elements);
        expect(rect).to.deep.equal(new DOMRectReadOnly(8, 8, 102, 252));
        // #border is +2 in width and height from border style of the element
        expect(rect.toJSON()).to.deep.equal({
          x: 8,
          y: 8,
          width: 102,
          height: 252,
          top: 8,
          right: 110,
          bottom: 260,
          left: 8,
        });
      });
    });

    it("should return the union of the bounding rects of the elements relative to a parent", () => {
      cy.get("#div, #foo").then(($elements) => {
        const rect = getUnionDOMRect($elements, Cypress.$("body").get(0));
        expect(rect).to.deep.equal(new DOMRectReadOnly(0, 0, 100, 150));
        expect(rect.toJSON()).to.deep.equal({
          left: 0,
          top: 0,
          width: 100,
          height: 150,
          right: 100,
          bottom: 150,
          x: 0,
          y: 0,
        });
      });
    });

    it("should return the bounding rect of a single element relative to the viewport", () => {
      cy.get("#foo").then(($element) => {
        const rect = getUnionDOMRect($element);
        expect(rect.toJSON()).to.deep.equal({
          left: 8,
          top: 8,
          width: 50,
          height: 50,
          right: 58,
          bottom: 58,
          x: 8,
          y: 8,
        });
      });

      it("should return the bounding rect of a single element relative to the parent", () => {
        cy.get("#foo").then(($element) => {
          const rect = getUnionDOMRect($element, Cypress.$("body").get(0));
          expect(rect.toJSON()).to.deep.equal({
            left: 0,
            top: 0,
            width: 50,
            height: 50,
            right: 50,
            bottom: 50,
            x: 0,
            y: 0,
          });
        });
      });
    });
  });

  describe("findCommonParent", () => {
    it("should return the common parent element 1", () => {
      cy.visit("/dtm.newasset.html").then(() => {
        const $elements = Cypress.$(".bottom-drawer .card-footer button");
        const commonParent = findCommonParent($elements);
        expect(commonParent).to.have.class("card-footer");
      });
    });

    it("should return the common parent element 2", () => {
      cy.visit("/dtm.newasset.html").then(() => {
        const $elements = Cypress.$("main .d-flex");
        expect($elements.length).to.eq(8);
        const commonParent = findCommonParent($elements);
        expect(commonParent?.tagName?.toLocaleLowerCase()).to.eq(
          "c8y-repeat-section"
        );
      });
    });
  });
});
