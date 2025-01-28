import { findCommonParent } from "../../../src/c8yscrn/runner-helper";

describe("screenshot", () => {
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
      expect(commonParent?.tagName?.toLocaleLowerCase()).to.eq("c8y-repeat-section");
      });
    });
  });
});