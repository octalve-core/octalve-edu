import { expect, test } from "@playwright/test";
import { cookieHeader } from "../support/http";

// Task 0051: a sign-in that returns no token must fail where it happened, not as a 401 later (loginAs returns `token: null`, and `cookieHeader(login.token!)` used to turn that into `name=null`).
test.describe("cookieHeader", () => {
  test("builds the cookie from a token, under the default or a given name", () => {
    expect(cookieHeader("abc123")).toMatch(/^[^=]+=abc123$/);
    expect(cookieHeader("abc123", "other")).toBe("other=abc123");
  });

  test("throws, saying why, when the sign-in gave no token: null, undefined or empty", () => {
    for (const none of [null, undefined, ""]) {
      expect(() => cookieHeader(none), String(none)).toThrow(
        /no session token .*the sign-in that should have produced it did not set a session cookie/,
      );
    }
  });

  test("a deliberate token string, even a made-up one, is not refused (some specs send one on purpose)", () => {
    expect(() => cookieHeader("old-session")).not.toThrow();
  });
});
