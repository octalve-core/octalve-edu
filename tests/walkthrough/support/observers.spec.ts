import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Observers, staysOnThisMachine } from "./observers";

const CORS = { "access-control-allow-origin": "*" };

test.describe("The observers see what a person would, and judge it", () => {
  test("only this machine is reachable", () => {
    for (const url of [
      "http://localhost:3320/x",
      "http://127.0.0.1:3000/",
      "http://[::1]:3000/",
      "data:text/html,hi",
      "blob:http://localhost/1",
      "about:blank",
    ]) {
      expect(staysOnThisMachine(url), url).toBe(true);
    }
    for (const url of ["https://example.com/a.png", "http://localhost.evil.example/", "https://fonts.googleapis.com/css"])
      expect(staysOnThisMachine(url), url).toBe(false);
  });

  test("a script error and a console error are blockers; a warning is only listed", async ({ page, context }) => {
    const observers = new Observers(page);
    await observers.start(context);
    observers.setStep(7);
    await page.setContent("<title>t</title><main>hi</main>");
    await page.evaluate(() => {
      console.warn("careful");
      console.error("broken");
      setTimeout(() => {
        throw new Error("boom");
      }, 0);
    });
    await expect.poll(() => observers.observations.some((o) => o.kind === "page-error")).toBe(true);
    const by = (kind: string) => observers.observations.filter((o) => o.kind === kind);
    expect(by("console-warning")).toMatchObject([{ severity: "listed", detail: "careful", step: 7 }]);
    expect(by("console-error")).toMatchObject([{ severity: "blocker", detail: "broken", step: 7 }]);
    expect(by("page-error")).toMatchObject([{ severity: "blocker", detail: "boom" }]);
    expect(observers.blockers().length).toBe(2);
  });

  test("a refusal (4xx) is listed, a server error (5xx) is a blocker, a failed request is listed", async ({ page, context }) => {
    const observers = new Observers(page);
    await observers.start(context);
    // Registered after the observers' own route, so it answers first: this stands in for a server.
    await context.route("http://localhost:3999/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/refused")) return route.fulfill({ status: 403, headers: CORS, body: "no" });
      if (url.endsWith("/broken")) return route.fulfill({ status: 500, headers: CORS, body: "oops" });
      return route.abort("connectionrefused");
    });
    await page.setContent("<title>t</title><main>hi</main>");
    await page.evaluate(async () => {
      await fetch("http://localhost:3999/refused");
      await fetch("http://localhost:3999/broken");
      await fetch("http://localhost:3999/gone").catch(() => undefined);
    });
    await expect.poll(() => observers.observations.filter((o) => o.kind === "request-failed").length).toBeGreaterThan(0);
    const http = observers.observations.filter((o) => o.kind === "http-error");
    expect(http.map((o) => [o.severity, o.detail.slice(0, 3)])).toEqual([
      ["listed", "403"],
      ["blocker", "500"],
    ]);
    expect(observers.observations.find((o) => o.kind === "request-failed")?.severity).toBe("listed");
    // The browser's own "Failed to load resource" console line for the 403 is the same event, not a second finding.
    expect(observers.observations.filter((o) => o.kind === "console-error" && o.severity === "blocker").map((o) => o.detail)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/status of 403/)]),
    );
  });

  test("a cancelled page prefetch (?_rsc=) is the framework working, not a failed request; any other cancelled request still is listed", async ({
    page,
    context,
  }) => {
    const observers = new Observers(page);
    await observers.start(context);
    await context.route("http://localhost:3999/**", (route) => route.abort("aborted"));
    await page.setContent("<title>t</title><main>hi</main>");
    await page.evaluate(async () => {
      await fetch("http://localhost:3999/finance?_rsc=abc123").catch(() => undefined);
      await fetch("http://localhost:3999/api/data").catch(() => undefined);
    });
    await expect.poll(() => observers.observations.filter((o) => o.kind === "request-failed").length).toBeGreaterThan(0);
    const failed = observers.observations.filter((o) => o.kind === "request-failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toContain("/api/data");
  });

  test("a request that would leave the machine is refused and is a blocker", async ({ page, context }) => {
    const observers = new Observers(page);
    await observers.start(context);
    await page.setContent("<title>t</title><main>hi</main>");
    await page.evaluate(() => fetch("https://example.com/tracker.js").catch(() => undefined));
    await expect.poll(() => observers.observations.some((o) => o.kind === "external-request")).toBe(true);
    expect(observers.observations.find((o) => o.kind === "external-request")).toMatchObject({
      severity: "blocker",
      detail: "the app calls https://example.com/tracker.js",
    });
  });

  test("axe: a missing image description is critical and blocks; the list is saved as evidence", async ({ page, context }) => {
    const observers = new Observers(page);
    await observers.start(context);
    await page.setContent(
      '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hi</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>',
    );
    await observers.scan();
    const alt = observers.observations.find((o) => o.rule === "image-alt");
    expect(alt).toMatchObject({ kind: "axe", impact: "critical", severity: "blocker" });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "observers-")), "nested", "observations.json");
    observers.save(file);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).some((o: { rule?: string }) => o.rule === "image-alt")).toBe(true);
  });

  test("axe scans a path once, and not a data: page", async ({ page, context }) => {
    const observers = new Observers(page);
    await observers.start(context);
    await context.route("http://localhost:3998/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hi</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>',
      }),
    );
    await page.setContent("<title>t</title>");
    await observers.axeOnNewRoute();
    expect(observers.observations).toEqual([]);
    await page.goto("http://localhost:3998/finance");
    await observers.axeOnNewRoute();
    const first = observers.observations.length;
    expect(first).toBeGreaterThan(0);
    await observers.axeOnNewRoute();
    expect(observers.observations.length).toBe(first);
  });
});
