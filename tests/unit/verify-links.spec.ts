import "../support/env";
import { test, expect } from "@playwright/test";
import { appOrigin, verifyLink, verifyPageUrl } from "@/lib/app-url";
import { VERIFY_CODE, parseVerifyCode } from "@/lib/results/verify-code";

// The address printed on a report card for checking a mark (task 0038): where it comes from, what it looks like, and how a typed or pasted code is read.

const CODE = "0123456789abcdef0123456789abcdef";

test.describe("the address links are printed with", () => {
  const saved = process.env.APP_URL;
  test.afterEach(() => {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  });

  test("APP_URL wins, without a trailing slash; the request's own address is the fallback; the development address is the last resort", () => {
    process.env.APP_URL = "https://octalve.example/";
    expect(appOrigin("http://internal:3000")).toBe("https://octalve.example");
    process.env.APP_URL = "  https://octalve.example///  ";
    expect(appOrigin()).toBe("https://octalve.example");
    delete process.env.APP_URL;
    expect(appOrigin("https://from-the-request.example/")).toBe("https://from-the-request.example");
    expect(appOrigin()).toBe("http://localhost:3000");
  });

  test("a setting that is not a web address is not used (no script, no relative path, no spaces)", () => {
    for (const bad of [
      "javascript:alert(1)",
      "octalve.example",
      "/relative",
      "https://has space.example",
      "https://x.example?q=1",
      "",
      "   ",
    ]) {
      process.env.APP_URL = bad;
      expect(appOrigin("https://fallback.example"), bad).toBe("https://fallback.example");
      expect(appOrigin("also bad"), bad).toBe("http://localhost:3000");
    }
  });

  test("the check page and a mark's link are full addresses with no API path in them", () => {
    expect(verifyPageUrl("https://octalve.example")).toBe("https://octalve.example/verify");
    expect(verifyLink("https://octalve.example", CODE)).toBe(`https://octalve.example/verify/${CODE}`);
    expect(verifyLink("https://octalve.example", CODE)).not.toContain("/api/");
  });
});

test.describe("reading a code that was typed or pasted", () => {
  test("a bare code, in any letter case and with spaces around it", () => {
    expect(parseVerifyCode(CODE)).toBe(CODE);
    expect(parseVerifyCode(`  ${CODE.toUpperCase()}\n`)).toBe(CODE);
  });
  test("the whole verification link, with or without a trailing slash, query or fragment", () => {
    for (const link of [
      `https://octalve.example/verify/${CODE}`,
      `https://octalve.example/verify/${CODE}/`,
      `http://localhost:3000/verify/${CODE}?utm=1`,
      `https://octalve.example/verify/${CODE}#top`,
      `/verify/${CODE}`,
      ` HTTPS://OCTALVE.EXAMPLE/VERIFY/${CODE.toUpperCase()} `,
    ])
      expect(parseVerifyCode(link), link).toBe(CODE);
  });
  test("anything else is not a code: short, long, wrong letters, an API address, a code in the middle of other text", () => {
    for (const input of [
      "",
      "abc",
      CODE.slice(1),
      `${CODE}0`,
      CODE.replace(/.$/, "g"),
      `https://octalve.example/api/v1/verify/${CODE}x`,
      `see ${CODE} for details`,
      `https://octalve.example/verify/${CODE}/extra`,
    ])
      expect(parseVerifyCode(input), input).toBeNull();
  });
  test("the code shape is the one the public API accepts", () => {
    expect(VERIFY_CODE.test(CODE)).toBe(true);
    expect(VERIFY_CODE.test(CODE.toUpperCase())).toBe(false);
  });
});
