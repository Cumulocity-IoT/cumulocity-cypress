import { getAuthCookies, getCookieValue } from "./cookies";
import * as setCookieParser from "set-cookie-parser";

describe("cookies", () => {
  describe("getAuthCookies", () => {
    describe("with headers.getSetCookie function", () => {
      it("should extract authorization and xsrfToken from response", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer123; Path=/; HttpOnly",
              "XSRF-TOKEN=token456; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle case-insensitive cookie names", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "Authorization=Bearer789; Path=/; HttpOnly",
              "xsrf-token=token012; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer789",
          xsrfToken: "token012",
        });
      });

      it("should handle missing authorization cookie", () => {
        const response = {
          headers: {
            getSetCookie: () => ["XSRF-TOKEN=token456; Path=/"],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: undefined,
          xsrfToken: "token456",
        });
      });

      it("should handle missing xsrfToken cookie", () => {
        const response = {
          headers: {
            getSetCookie: () => ["authorization=Bearer123; Path=/; HttpOnly"],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: undefined,
        });
      });

      it("should handle empty cookie array", () => {
        const response = {
          headers: {
            getSetCookie: (): string[] => [],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: undefined,
          xsrfToken: undefined,
        });
      });

      it("should handle quoted cookie values", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              'authorization="Bearer.Token-123_456"; Path=/; HttpOnly',
              'XSRF-TOKEN="token-789_012"; Path=/',
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer.Token-123_456",
          xsrfToken: "token-789_012",
        });
      });
    });

    describe("with headers.get function returning string", () => {
      it("should parse set-cookie string and extract cookies", () => {
        const response = {
          headers: {
            getSetCookie: undefined,
            get: (name: string) => {
              if (name === "set-cookie") {
                return "authorization=Bearer123; Path=/; HttpOnly, XSRF-TOKEN=token456; Path=/";
              }
              return null;
            },
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle set-cookie-parser compatibility", () => {
        const cookieString =
          "authorization=Bearer123; Path=/; HttpOnly, XSRF-TOKEN=token456; Path=/";
        const parsed = setCookieParser.splitCookiesString(cookieString);
        expect(parsed).toHaveLength(2);

        const response = {
          headers: {
            getSetCookie: undefined,
            get: (name: string) => {
              if (name === "set-cookie") {
                return cookieString;
              }
              return null;
            },
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle complex cookie values", () => {
        const response = {
          headers: {
            getSetCookie: undefined,
            get: (name: string) => {
              if (name === "set-cookie") {
                return "authorization=Bearer.Complex.Token123; Path=/; HttpOnly; Secure; SameSite=Strict, XSRF-TOKEN=abc-def-456; Path=/; SameSite=Lax";
              }
              return null;
            },
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer.Complex.Token123",
          xsrfToken: "abc-def-456",
        });
      });
    });

    describe("with headers.get function returning array", () => {
      it("should extract cookies from array", () => {
        const response = {
          headers: {
            getSetCookie: undefined,
            get: (name: string) => {
              if (name === "set-cookie") {
                return [
                  "authorization=Bearer123; Path=/; HttpOnly",
                  "XSRF-TOKEN=token456; Path=/",
                ];
              }
              return null;
            },
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle array with multiple cookies", () => {
        const response = {
          headers: {
            getSetCookie: undefined,
            get: (name: string) => {
              if (name === "set-cookie") {
                return [
                  "authorization=Bearer123; Path=/; HttpOnly",
                  "XSRF-TOKEN=token456; Path=/",
                  "sessionId=session789; Path=/",
                  "other=value; Path=/",
                ];
              }
              return null;
            },
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });
    });

    describe("with plain object headers", () => {
      it("should extract cookies from plain object", () => {
        const response = {
          headers: {
            "set-cookie": [
              "authorization=Bearer123; Path=/; HttpOnly",
              "XSRF-TOKEN=token456; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle case-insensitive header keys", () => {
        const response = {
          headers: {
            "Set-Cookie": [
              "authorization=Bearer123; Path=/; HttpOnly",
              "XSRF-TOKEN=token456; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle single cookie string", () => {
        const response = {
          headers: {
            "set-cookie": "authorization=Bearer123; Path=/; HttpOnly",
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: undefined,
        });
      });
    });

    describe("edge cases", () => {
      it("should return undefined when no set-cookie header exists", () => {
        const response = {
          headers: {
            get: (): string | null => null,
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toBeUndefined();
      });

      it("should return undefined when headers is empty object", () => {
        const response = {
          headers: {},
        } as any;

        const result = getAuthCookies(response);
        expect(result).toBeUndefined();
      });

      it("should handle cookies with URL-encoded characters", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer%20Special%3DToken; Path=/; HttpOnly",
              "XSRF-TOKEN=token%2Bwith%2Bplus; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer Special=Token",
          xsrfToken: "token+with+plus",
        });
      });

      it("should handle cookies with special characters", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer.Token-123_456,*?; Path=/; HttpOnly",
              "XSRF-TOKEN=token-789_012,*?; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer.Token-123_456,*?",
          xsrfToken: "token-789_012,*?",
        });
      });

      it("should handle duplicate cookie names (last one wins)", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=FirstValue; Path=/; HttpOnly",
              "authorization=SecondValue; Path=/; HttpOnly",
              "XSRF-TOKEN=token456; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result?.authorization).toBe("SecondValue");
        expect(result?.xsrfToken).toBe("token456");
      });

      it("should handle cookies with no value", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=; Path=/; HttpOnly",
              "XSRF-TOKEN=; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: undefined,
          xsrfToken: undefined,
        });
      });

      it("should handle malformed cookie strings gracefully", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer123",
              "invalid-cookie-format",
              "XSRF-TOKEN=token456",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result?.authorization).toBe("Bearer123");
        expect(result?.xsrfToken).toBe("token456");
      });

      it("should handle cookies with Max-Age and Expires attributes", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer123; Path=/; HttpOnly; Max-Age=3600; Expires=Wed, 21 Oct 2026 07:28:00 GMT",
              "XSRF-TOKEN=token456; Path=/; Max-Age=7200",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });

      it("should handle cookies with Domain attribute", () => {
        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=Bearer123; Path=/; HttpOnly; Domain=.example.com",
              "XSRF-TOKEN=token456; Path=/; Domain=subdomain.example.com",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result).toEqual({
          authorization: "Bearer123",
          xsrfToken: "token456",
        });
      });
    });

    describe("fallback to document.cookie", () => {
      let originalDocument: any;

      beforeEach(() => {
        originalDocument = global.document;
      });

      afterEach(() => {
        global.document = originalDocument;
      });

      it("should fallback to document.cookie when authorization not in headers", () => {
        global.document = {
          cookie: "authorization=FromDocument; XSRF-TOKEN=FromDoc456",
        } as any;

        const response = {
          headers: {
            getSetCookie: (): string[] => [],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result?.authorization).toBe("FromDocument");
        expect(result?.xsrfToken).toBe("FromDoc456");
      });

      it("should prioritize header cookies over document.cookie", () => {
        global.document = {
          cookie: "authorization=FromDocument; XSRF-TOKEN=FromDoc456",
        } as any;

        const response = {
          headers: {
            getSetCookie: () => [
              "authorization=FromHeader; Path=/; HttpOnly",
              "XSRF-TOKEN=FromHeader456; Path=/",
            ],
          },
        } as any;

        const result = getAuthCookies(response);
        expect(result?.authorization).toBe("FromHeader");
        expect(result?.xsrfToken).toBe("FromHeader456");
      });
    });

    describe("set-cookie-parser library compatibility", () => {
      it("should expoert set-cookie-parser functions", () => {
        expect(typeof setCookieParser.splitCookiesString).toBe("function");
        expect(typeof setCookieParser.parse).toBe("function");
      });

      it("should correctly parse cookies using splitCookiesString", () => {
        const cookieString =
          "foo=bar; Path=/; HttpOnly, baz=qux; Path=/; Secure";
        const split = setCookieParser.splitCookiesString(cookieString);
        expect(split).toHaveLength(2);
        expect(split[0]).toContain("foo=bar");
        expect(split[1]).toContain("baz=qux");
      });

      it("should correctly parse cookies using parse", () => {
        const cookies = [
          "foo=bar; Path=/; HttpOnly",
          "baz=qux; Path=/; Secure",
        ];
        const parsed = setCookieParser.parse(cookies);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].name).toBe("foo");
        expect(parsed[0].value).toBe("bar");
        expect(parsed[1].name).toBe("baz");
        expect(parsed[1].value).toBe("qux");
      });
    });
  });

  describe("getCookieValue", () => {
    let originalDocument: any;

    beforeEach(() => {
      originalDocument = global.document;
    });

    afterEach(() => {
      global.document = originalDocument;
    });

    it("should return cookie value when cookie exists", () => {
      global.document = {
        cookie: "authorization=Bearer123; XSRF-TOKEN=token456",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should return cookie value for different cookie names", () => {
      global.document = {
        cookie:
          "authorization=Bearer123; XSRF-TOKEN=token456; sessionId=session789",
      } as any;

      expect(getCookieValue("authorization")).toBe("Bearer123");
      expect(getCookieValue("XSRF-TOKEN")).toBe("token456");
      expect(getCookieValue("sessionId")).toBe("session789");
    });

    it("should return empty string when cookie does not exist", () => {
      global.document = {
        cookie: "authorization=Bearer123",
      } as any;

      const result = getCookieValue("nonexistent");
      expect(result).toBe("");
    });

    it("should return undefined when document is undefined", () => {
      global.document = undefined as any;

      const result = getCookieValue("authorization");
      expect(result).toBeUndefined();
    });

    it("should handle cookies at the start of the string", () => {
      global.document = {
        cookie: "authorization=Bearer123; other=value",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle cookies at the end of the string", () => {
      global.document = {
        cookie: "other=value; authorization=Bearer123",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle cookies in the middle of the string", () => {
      global.document = {
        cookie: "first=value1; authorization=Bearer123; last=value2",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle single cookie", () => {
      global.document = {
        cookie: "authorization=Bearer123",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle cookies with special characters in values", () => {
      global.document = {
        cookie: "authorization=Bearer.Token-123_456",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer.Token-123_456");
    });

    it("should handle cookies with spaces after semicolon", () => {
      global.document = {
        cookie: "first=value1;  authorization=Bearer123;   last=value2",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle empty cookie value", () => {
      global.document = {
        cookie: "authorization=; other=value",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("");
    });

    it("should not match partial cookie names", () => {
      global.document = {
        cookie:
          "pre_authorization=value1; authorization=Bearer123; authorization_post=value2",
      } as any;

      const result = getCookieValue("authorization");
      expect(result).toBe("Bearer123");
    });

    it("should handle cookie names with hyphens", () => {
      global.document = {
        cookie: "XSRF-TOKEN=token456; other=value",
      } as any;

      const result = getCookieValue("XSRF-TOKEN");
      expect(result).toBe("token456");
    });

    it("should be case-sensitive", () => {
      global.document = {
        cookie: "authorization=lower; Authorization=upper",
      } as any;

      expect(getCookieValue("authorization")).toBe("lower");
      expect(getCookieValue("Authorization")).toBe("upper");
    });
  });
});
