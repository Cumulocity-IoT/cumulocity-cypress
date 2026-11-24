/// <reference types="jest" />

import * as main from "./index";
import { c8yEnv } from "./shared/cypressenv";

describe("cumulocity-cypress", () => {
  it("should export c8yEnv()", () => {
    expect(main.c8yEnv).toBe(c8yEnv);
  });
});
