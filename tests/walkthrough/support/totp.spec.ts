import { test, expect } from "@playwright/test";
import { Authenticator, base32Decode, hotp, stepAt, totpAt } from "./totp";

// RFC 6238 Appendix B (SHA-1, the secret "12345678901234567890"): the published eight-digit codes, whose last six digits are what an authenticator app shows.
const SECRET = Buffer.from("12345678901234567890");
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

test.describe("The authenticator stand-in gives the codes a phone would", () => {
  test("the RFC 6238 test vectors, at eight and at six digits", () => {
    for (const [seconds, code] of VECTORS) {
      expect(totpAt(SECRET, seconds * 1000, 8), `${seconds} s`).toBe(code);
      expect(totpAt(SECRET, seconds * 1000, 6), `${seconds} s`).toBe(code.slice(-6));
    }
  });

  test("RFC 4226 Appendix D: the first HOTP values", () => {
    expect([0, 1, 2, 3, 4].map((counter) => hotp(SECRET, counter))).toEqual(["755224", "287082", "359152", "969429", "338314"]);
  });

  test("the setup key as the screen shows it (groups of four) is the secret", () => {
    // "12345678901234567890" in base32 is GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    expect(base32Decode("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ").equals(SECRET)).toBe(true);
    expect(base32Decode("gezdgnbvgy3tqojqgezdgnbvgy3tqojq").equals(SECRET)).toBe(true);
    expect(() => base32Decode("GEZD 1NBV")).toThrow(/not in a base32 setup key/);
  });

  test("a code is never given twice from one thirty-second step: the second waits for the next", async () => {
    const phone = new Authenticator("GEZD GNBV GY3T QOJQ GEZD GNBV GY3T QOJQ");
    const first = await phone.nextCode();
    const stepOfFirst = stepAt(Date.now());
    const before = Date.now();
    const second = await phone.nextCode();
    expect(stepAt(Date.now())).toBeGreaterThan(stepOfFirst - 1);
    expect(Date.now() - before).toBeLessThan(31_000);
    expect(first).toMatch(/^\d{6}$/);
    expect(second).toMatch(/^\d{6}$/);
    expect(second).toBe(hotp(SECRET, stepAt(Date.now())));
  });
});
