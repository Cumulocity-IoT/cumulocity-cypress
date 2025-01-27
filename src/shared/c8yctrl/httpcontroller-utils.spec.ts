import { toBoolean } from "./httpcontroller-utils";

describe("httpcontroller utils", () => {
  describe("toBoolean", () => {
    it("should return the default value if input is null", () => {
      const defaultValue = true;
      const result = toBoolean(null as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return the default value if input is not a string", () => {
      const defaultValue = false;
      const result = toBoolean({} as any, defaultValue);
      expect(result).toBe(defaultValue);
    });

    it("should return true if input is 'true'", () => {
      const defaultValue = false;
      const result = toBoolean("true", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is not lowercase", () => {
      const defaultValue = false;
      const result = toBoolean("TrUe", defaultValue);
      expect(result).toBe(true);
    });

    it("should return true if input is '1'", () => {
      const defaultValue = false;
      const result = toBoolean("1", defaultValue);
      expect(result).toBe(true);
    });

    it("should return false if input is 'false'", () => {
      const defaultValue = true;
      const result = toBoolean("false", defaultValue);
      expect(result).toBe(false);
    });

    it("should return false if input is '0'", () => {
      const defaultValue = true;
      const result = toBoolean("0", defaultValue);
      expect(result).toBe(false);
    });
  });
});
