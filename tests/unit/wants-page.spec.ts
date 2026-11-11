import "../support/env";
import { test, expect } from "@playwright/test";
import { wantsPage } from "@/lib/api/wants-page";

// Does a request want a web page rather than data? (task 0043) The two public verification routes send a browser that opens an old printed address to the page, and give everything else the JSON,
// so what counts as "a browser" is the whole of that decision.

test.describe("a request that asks for a web page", () => {
  test("what a browser sends when it follows a link or a phone camera opens a QR code", () => {
    for (const accept of [
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8", // Chrome and Edge
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", // Safari and Firefox
      "text/html",
      "TEXT/HTML",
      " text/html ; q=0.5 ",
      "application/json;q=0.9, text/html",
    ])
      expect(wantsPage(accept), accept).toBe(true);
  });
});

test.describe("a request that asks for data, or for nothing in particular", () => {
  test("a script, curl, a fetch for JSON, a client that sends no Accept, or one that accepts anything", () => {
    for (const accept of [
      null,
      undefined,
      "",
      "*/*",
      "application/json",
      "application/json, text/plain, */*",
      "text/plain",
      "application/xhtml+xml",
      "text/htmlx",
      "image/webp",
    ])
      expect(wantsPage(accept), String(accept)).toBe(false);
  });

  test("text/html that the client refuses with q=0 is not a request for a page", () => {
    for (const accept of ["text/html;q=0", "text/html; q=0.0, */*", "application/json, text/html;q=0"])
      expect(wantsPage(accept), accept).toBe(false);
  });
});
