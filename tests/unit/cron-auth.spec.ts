import { test, expect } from "@playwright/test";
import { checkCronAuthorization, CRON_SECRET_MIN_LENGTH } from "@/lib/queue/cron-auth";

// Task 0057: the dispatch route is called by a scheduler, not by a person, so its only credential is a bearer secret (Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`). It must
// FAIL CLOSED: no secret, or a secret too short to be one, means nothing runs, whatever the caller sends.

const SECRET = "s3cret-0123456789-abcdef";

test.describe("the cron secret check", () => {
  test("a secret that is not configured, or is too short, refuses everything, even a header that matches it", () => {
    for (const secret of [undefined, "", "short", "x".repeat(CRON_SECRET_MIN_LENGTH - 1)]) {
      expect(checkCronAuthorization(`Bearer ${secret}`, secret)).toBe("not-configured");
      expect(checkCronAuthorization(null, secret)).toBe("not-configured");
    }
  });

  test("a secret of the minimum length is a secret", () => {
    const secret = "x".repeat(CRON_SECRET_MIN_LENGTH);
    expect(checkCronAuthorization(`Bearer ${secret}`, secret)).toBe("ok");
  });

  test("the right bearer token is accepted", () => {
    expect(checkCronAuthorization(`Bearer ${SECRET}`, SECRET)).toBe("ok");
  });

  test("no header, another scheme, a wrong or a near-miss token, an empty token, or extra text is denied", () => {
    const denied = [
      null,
      undefined,
      "",
      SECRET, // the secret without the scheme
      `Basic ${SECRET}`,
      `bearer ${SECRET}`, // the scheme is spelled as Vercel sends it
      "Bearer ",
      "Bearer",
      `Bearer ${SECRET.slice(0, -1)}`, // one character short
      `Bearer ${SECRET}x`, // one character long
      `Bearer ${SECRET.toUpperCase()}`,
      `Bearer ${SECRET} `, // a trailing space
      ` Bearer ${SECRET}`,
      `Bearer ${SECRET}\nBearer ${SECRET}`,
    ];
    for (const header of denied) expect(checkCronAuthorization(header, SECRET), JSON.stringify(header)).toBe("denied");
  });

  test("a token as long as the secret but different is denied (the comparison does not stop at a length check)", () => {
    const wrong = SECRET.replace(/.$/, SECRET.endsWith("f") ? "0" : "f");
    expect(wrong).toHaveLength(SECRET.length);
    expect(checkCronAuthorization(`Bearer ${wrong}`, SECRET)).toBe("denied");
  });
});
