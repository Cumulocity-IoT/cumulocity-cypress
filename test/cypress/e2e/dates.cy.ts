import * as localeTest from "./../support/test";
import { Locale } from "cumulocity-cypress/lib/commands/dates";

import localeEn from "@angular/common/locales/en";
import angularEs from "@angular/common/locales/es";
import { enUS } from "date-fns/locale";

describe("dates", () => {
  // en: [
  //   'dd/MM/y, HH:mm', 'd MMM y, HH:mm:ss', "d MMMM y 'at' HH:mm:ss X", "EEEE, d MMMM y 'at' HH:mm:ss 'GMT'X",
  //   'dd/MM/y', 'd MMM y', 'd MMMM y', 'EEEE, d MMMM y',
  //   'HH:mm', 'HH:mm:ss', 'HH:mm:ss X', "HH:mm:ss 'GMT'X"
  // ]
  // see https://date-fns-interactive.netlify.app/ for datefns testing playground

  context("register locales", () => {
    it("should have loaded locales", () => {
      expect(localeEn).to.not.be.undefined;
      expect(enUS).to.not.be.undefined;
      expect(localeTest.default).to.not.be.undefined;
      expect(angularEs).to.not.be.undefined;
    });

    it("should auto register packaged default languages", () => {
      cy.setLanguage("en");
      cy.wrap("26 May 2023, 15:59:00")
        .toISODate()
        .then((result) => {
          expect(result).to.equal("2023-05-26T13:59:00.000Z");
        });
    });

    it("should allow registering additional locales", () => {
      // does not parse US date format as en-GB locale uses different date format
      cy.setLanguage("en");
      cy.wrap("May 26, 2023, 3:59:00 PM")
        .toISODate()
        .then((result) => {
          expect(result).to.be.undefined;
        });

      // uses en (en-US) locale to parse the date (different from default en-GB)
      // US format: "May 26, 2023, 3:59:00 PM" vs GB format: "26 May 2023, 15:59:00"
      cy.then(() => {
        registerLocale("en", localeEn, enUS);
        cy.setLanguage("en");
        cy.wrap("May 26, 2023, 3:59:00 PM")
          .toISODate()
          .then((result) => {
            expect(result).to.equal("2023-05-26T13:59:00.000Z");
          });
      });
    });

    after(() => {
      // fix locales that might have been overwritten in tests
      registerDefaultLocales();
    });
  });

  context("date-fns", () => {
    beforeEach(() => {
      // use test locale to test completely custom locale mappings
      // days: Test0... (come up with something )
      // months: Alpha, ... (Greek Alphabet)
      registerLocale("test", localeTest.default, null);
    });

    it("should register datefns", () => {
      cy.setLanguage("en").then(() => {
        expect(Cypress.datefns).to.not.be.undefined;
        const options: {
          locale?: Locale;
        } = Cypress.datefns.getDefaultOptions();
        expect(options.locale).to.not.be.undefined;
      });
    });

    it("should use Angular locale to parse and format dates", () => {
      // check en is using Sept and german Sep for September
      // Note, the MMM pattern is not used by Angular in german locale, just used here for testing
      cy.setLanguage("en").then(() => {
        const testDate = Cypress.datefns.format(
          Cypress.datefns.parseISO("2023-09-03T22:00:00.000Z"),
          "d MMM y"
        );
        expect(testDate).to.equal("4 Sept 2023");

        const newDate = Cypress.datefns.parse(
          "Tuesday 5 Sept 2023",
          "EEEE d MMM y",
          new Date()
        );
        expect(newDate.toISOString()).to.equal("2023-09-04T22:00:00.000Z");
      });

      cy.setLanguage("de").then(() => {
        const testDate = Cypress.datefns.format(
          Cypress.datefns.parseISO("2023-09-04T22:00:00.000Z"),
          "d MMM y"
        );
        expect(testDate).to.equal("5 Sep 2023");

        const newDate = Cypress.datefns.parse(
          "Dienstag 5 Sep 2023",
          "EEEE d MMM y",
          new Date()
        );
        expect(newDate.toISOString()).to.equal("2023-09-04T22:00:00.000Z");
      });

      // @ts-expect-error: language test is not defined
      cy.setLanguage("test").then(() => {
        const testDate = Cypress.datefns.format(
          Cypress.datefns.parseISO("2023-02-03T22:00:00.000Z"),
          "EEEE d MMM y"
        );
        expect(testDate).to.equal("Silverday 3 Deep. 2023");

        const testDate2 = Cypress.datefns.format(
          Cypress.datefns.parseISO("2023-06-03T22:00:00.000Z"),
          "EEE d MMMM y"
        );
        expect(testDate2).to.equal("Ra 4 Highsun 2023");

        const newDate = Cypress.datefns.parse(
          "Am 5 Lowsun 2023",
          "EEEE d MMMM y",
          new Date()
        );
        expect(newDate.toISOString()).to.equal("2023-09-04T22:00:00.000Z");
      });
    });
  });

  context("toISODate", () => {
    beforeEach(() => {
      cy.setLanguage("en");
    });

    it("should create date from formatted string", () => {
      cy.wrap("26 May 2023, 15:59:00")
        .toISODate()
        .then((result) => {
          expect(result).to.equal("2023-05-26T13:59:00.000Z");
        });
      cy.toISODate("2023-03-25T12:00:00.000Z").then((result) => {
        expect(result).to.equal("2023-03-25T12:00:00.000Z");
      });
      cy.wrap("15 June 2015 at 9:03:01 +01")
        .toISODate()
        .then((result) => {
          expect(result).to.equal("2015-06-15T08:03:01.000Z");
        });
    });

    it("should create dates from array of formatted strings", () => {
      cy.toISODate([
        "26 May 2023, 15:59:00",
        "15 June 2015 at 9:03:01 +01",
        "26 May 2023",
        "2023-03-25T12:00:00.000Z",
      ]).then((result) => {
        expect(result).to.deep.eq([
          "2023-05-26T13:59:00.000Z",
          "2015-06-15T08:03:01.000Z",
          "2023-05-25T22:00:00.000Z",
          "2023-03-25T12:00:00.000Z",
        ]);
      });
    });

    it("should create date from number", () => {
      cy.wrap(1685052000000)
        .toISODate()
        .then((result) => {
          expect(result).to.eq("2023-05-25T22:00:00.000Z");
        });
    });

    it("should create dates from array of numbers", () => {
      cy.wrap([1685052000000, 1328872342000])
        .toISODate()
        .then((result) => {
          expect(result).to.deep.eq([
            "2023-05-25T22:00:00.000Z",
            "2012-02-10T11:12:22.000Z",
          ]);
        });
    });

    it("should return array if single value is passed in array", () => {
      cy.toISODate([1685052000000]).then((result) => {
        expect(result).to.deep.eq(["2023-05-25T22:00:00.000Z"]);
      });
      cy.toISODate(["26 May 2023, 15:59:00"]).then((result) => {
        expect(result).to.deep.eq(["2023-05-26T13:59:00.000Z"]);
      });
    });

    it("should create date from formatted date without time", () => {
      cy.toISODate("26 May 2023").then((result) => {
        expect(result).to.equal("2023-05-25T22:00:00.000Z");
      });
    });

    it("should create date from formatted time only", () => {
      const expectedDate = new Date();
      expectedDate.setHours(10, 12, 0, 0);
      cy.wrap("10:12:00")
        .toISODate()
        .then((result) => {
          expect(result).to.equal(expectedDate.toISOString());
        });
    });

    it("should allow overriding format", () => {
      cy.toISODate("26/5/23", { format: "d/M/yy" }).then((result) => {
        expect(result).to.equal("2023-05-25T22:00:00.000Z");
      });
      cy.toISODate(["3/12/23", "26/5/24", "26/4/23"], {
        format: "d/M/yy",
      }).then((result) => {
        expect(result).to.deep.eq([
          "2023-12-02T23:00:00.000Z", // daylight saving time, so only one hour to GMT
          "2024-05-25T22:00:00.000Z",
          "2023-04-25T22:00:00.000Z",
        ]);
      });
    });

    it("should allow overriding language", () => {
      cy.toISODate(["3.12.2023", "26.5.2024", "26.04.23"], {
        language: "de",
      }).then((result) => {
        expect(result).to.deep.eq([
          "2023-12-02T23:00:00.000Z", // daylight saving time, so only one hour to GMT
          "2024-05-25T22:00:00.000Z",
          "2023-04-25T22:00:00.000Z",
        ]);
      });
    });

    it("should prefer argument over previousSubject", () => {
      cy.wrap("3/12/23")
        .toISODate("26/5/24", {
          format: "d/M/yy",
        })
        .then((result) => {
          expect(result).to.eq("2024-05-25T22:00:00.000Z");
        });
    });

    it("should work with invalid dates", () => {
      cy.wrap("-").toISODate().should("eq", undefined);
      cy.wrap("-").toISODate({ invalid: "keep" }).should("eq", "-");
    });

    it("should work with invalid dates and ignore option", () => {
      cy.wrap("-")
        .toISODate({ invalid: "ignore" })
        .then((result) => {
          expect(result).to.eq(undefined);
        });
      cy.wrap(["-", "-"])
        .toISODate({ invalid: "ignore" })
        .then((result) => {
          expect(result).to.deep.eq([]);
        });
    });

    it("should work with invalid input - undefined", (done) => {
      const errorListener = (err: Error) => {
        expect(err.message).to.contain(
          "No or undefined source provided to cy.toDate."
        );
        done();
      };
      cy.once("fail", errorListener);

      cy.wrap(undefined).toISODate();
    });

    it("should work with invalid input - empty object", (done) => {
      const errorListener = (err: Error) => {
        expect(err.message).to.contain(
          "No or undefined source provided to cy.toDate."
        );
        done();
      };
      cy.once("fail", errorListener);
      cy.wrap({}).toISODate();
    });

    it("should work with invalid input - array with undefined and empty object", (done) => {
      const errorListener = (err: Error) => {
        expect(err.message).to.contain(
          "No or undefined source provided to cy.toDate."
        );
        done();
      };
      cy.once("fail", errorListener);
      cy.wrap([undefined, {}]).toISODate();
    });

    it("should filter based on keep or ignore option", () => {
      cy.toISODate(
        [
          "5/26/23, 3:59 PMasasas",
          "15 June 2015 at 9:03:01 +01",
          "26 May 2023",
          "2023-03-25T12:00:00.000Z",
        ],
        { invalid: "ignore" }
      ).then((result) => {
        expect(result).to.deep.eq([
          "2015-06-15T08:03:01.000Z",
          "2023-05-25T22:00:00.000Z",
          "2023-03-25T12:00:00.000Z",
        ]);
      });
      cy.toISODate(
        [
          "5/26/23, 3:59 PMADSASDAS",
          "15 June 2015 at 9:03:01 +01",
          "26 May 2023",
          "2023-03-25T12:00:00.000Z",
        ],
        { invalid: "keep" }
      ).then((result) => {
        expect(result).to.deep.eq([
          "5/26/23, 3:59 PMADSASDAS",
          "2015-06-15T08:03:01.000Z",
          "2023-05-25T22:00:00.000Z",
          "2023-03-25T12:00:00.000Z",
        ]);
      });
    });

    it("fails with error for invalid input with throw option", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          "could not be converted into a valid date"
        );
        done();
      });

      cy.toISODate(
        [
          "15 June 2015 at 9:03:01 +01",
          "26 May 2023",
          "5/26/23, 3:59 PMADSASDAS",
          "2023-03-25T12:00:00.000Z",
        ],
        { invalid: "throw" }
      );
    });

    it("throws error on locale id not being registered", (done) => {
      // @ts-expect-error: language UNSUPPORTED is not registered
      cy.setLanguage("UNSUPPORTED");
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          'Missing locale data for the locale "UNSUPPORTED".'
        );
        done();
      });

      cy.toISODate("15 June 2015 at 9:03:01 +01");
    });
  });

  context("dateFormat", () => {
    beforeEach(() => {
      cy.setLanguage("en");
    });

    it("get c8y angular format from date string", () => {
      cy.dateFormat("3/12/23").should("eq", "dd/MM/y");
      cy.dateFormat("26 October 2023").should("eq", "d MMMM y");
      cy.dateFormat("30 Nov 2018, 16:22:30").should("eq", "d MMM y, HH:mm:ss");
    });
  });

  context("dateFormat - failures", () => {
    beforeEach(() => {
      cy.setLanguage("en");
    });

    it("fails with error for invalid input and throw option enabled", (done) => {
      cy.once("fail", (err) => {
        done();
      });

      cy.dateFormat("3/12/23121", { invalid: "throw" });
    });

    it("fails without error for invalid source and ignore option enabled", (done) => {
      cy.once("fail", (err) => {
        done();
      });

      cy.dateFormat("3/12/23121", { invalid: "ignore" }).then((result) => {
        throw new Error("Expected error. Should not get here.");
      });
    });
  });

  context("compareDates", () => {
    const isoDate = new Date(Date.UTC(2018, 10, 30, 15, 22, 30, 600));

    it("compares date string with current date", () => {
      cy.compareDates("30/11/2018", isoDate).should("eq", true);
      cy.compareDates("30 November 2018", isoDate).should("eq", true);
      cy.compareDates("30 Nov 2018, 16:22:30", isoDate).should("eq", true);
      cy.compareDates("30/11/2018, 16:22", isoDate).should("eq", true);
    });

    it("compares date string iso formatted date string", () => {
      cy.compareDates("30/11/2018, 16:22", isoDate.toISOString()).should(
        "eq",
        true
      );

      cy.compareDates("25/05/2023, 16:22", "2023-05-25T14:22:12.320Z").should(
        "eq",
        true
      );

      cy.compareDates("25/05/2023, 18:22", "2023-05-25T14:22:12.320Z").should(
        "eq",
        false
      );
    });
  });

  context("compareDates - failures", () => {
    const isoDate = new Date(Date.UTC(2018, 10, 30, 15, 22, 30, 600));

    beforeEach(() => {
      cy.setLanguage("en");
    });

    it("fails with error for invalid source and throw option enabled", (done) => {
      cy.once("fail", (err) => {
        done();
      });
      cy.compareDates("30/11/20181", isoDate, { invalid: "throw" }).then(() => {
        throw new Error("Expected error. Should not get here.");
      });
    });

    it("fails without error for invalid source and ignore option enabled", () => {
      cy.once("fail", (err) => {
        throw new Error("Did not expected error. Should not get here.");
      });
      cy.compareDates("30/11/201823", isoDate, { invalid: "ignore" }).then(
        (result) => {
          expect(result).to.be.false;
        }
      );
    });
  });
});
