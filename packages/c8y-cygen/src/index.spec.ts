import { CYGEN_VERSION } from "./index.js";

describe("c8y-cygen scaffold", () => {
  it("exposes a version constant", () => {
    expect(CYGEN_VERSION).toBe("0.1.0");
  });
});
