import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Walk } from "./walk";
import { keyDelay, KEY_DELAY_MIN_MS, KEY_DELAY_MAX_MS } from "./pace";

const PAGE = "data:text/html,<title>t</title><label>Name <input id='a' value=''></label><button>Go</button>";
const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "walk-spec-"));

test.describe("The walk helpers do what the walkthrough rules say", () => {
  test("a key press is 35 to 80 ms after the last, at both ends and always", () => {
    expect(keyDelay(() => 0)).toBe(KEY_DELAY_MIN_MS);
    expect(keyDelay(() => 0.9999999)).toBe(KEY_DELAY_MAX_MS);
    expect(KEY_DELAY_MIN_MS).toBe(35);
    expect(KEY_DELAY_MAX_MS).toBe(80);
    // Many draws, two assertions: each expect() is a reported step, so one per draw would take half a minute.
    const draws = Array.from({ length: 5000 }, () => keyDelay());
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(35);
    expect(Math.max(...draws)).toBeLessThanOrEqual(80);
    expect(draws.every(Number.isInteger)).toBe(true);
  });

  test("walk.type presses keys one by one at human speed and replaces what was there", async ({ page }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await page.locator("#a").evaluate((el: HTMLInputElement) => (el.value = "left over"));
    const pressed: string[] = [];
    await page.exposeFunction("recordKey", (key: string) => pressed.push(key));
    await page.evaluate(() =>
      document.addEventListener("keydown", (e) => {
        if (!e.ctrlKey && !e.metaKey) (window as unknown as { recordKey: (k: string) => void }).recordKey(e.key);
      }),
    );
    const started = Date.now();
    await walk.type(page.locator("#a"), "Amina");
    const took = Date.now() - started;
    await expect(page.locator("#a")).toHaveValue("Amina");
    expect(pressed.filter((k) => k.length === 1).join("")).toBe("Amina");
    expect(walk.typingMs()).toBeGreaterThanOrEqual(5 * 35);
    expect(walk.typingMs()).toBeLessThanOrEqual(5 * 80);
    expect(took).toBeGreaterThanOrEqual(5 * 35);
  });

  test("the typing budget fails a run that types too long", async ({ page }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await walk.type(page.locator("#a"), "abc");
    expect(() => walk.assertTypingBudget()).not.toThrow();
    expect(() => walk.assertTypingBudget(0)).toThrow(/over the budget/);
  });

  test("walk.goOffline and walk.goOnline switch the network and say so in the caption; the browser's own network lines are expected only in between", async ({
    page,
  }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await walk.goOffline();
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await expect(page.locator("#wt-caption")).toHaveText("The network is switched off, as with airplane mode.");
    await walk.goOnline();
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    await expect(page.locator("#wt-caption")).toHaveText("The network is switched back on.");
  });

  test("walk.acceptNextConfirm presses OK on the question it was told about and Cancel on any other", async ({ page }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    const html = "<title>t</title><button id='b' onclick=\"document.title = String(confirm('Delete it?'))\">Go</button>";
    await walk.goto(`data:text/html,${encodeURIComponent(html)}`);
    await walk.acceptNextConfirm("Delete it?");
    await walk.click(page.locator("#b"));
    await expect(page).toHaveTitle("true");
    await walk.acceptNextConfirm("Something else?");
    await walk.click(page.locator("#b"));
    await expect(page).toHaveTitle("false");
    await expect(page.locator("#wt-caption")).toHaveText('The browser asks: "Something else?" and OK is pressed.');
  });

  test("a page is loaded once per tab; a second tab has its own first load", async ({ page, context }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    await expect(walk.goto(PAGE)).rejects.toThrow(/Forbidden/);
    const second = await context.newPage();
    const secondWalk = new Walk(second, tempDir());
    await secondWalk.init();
    await secondWalk.goto(PAGE);
    await expect(secondWalk.goto(PAGE)).rejects.toThrow(/Forbidden/);
  });

  test("a typed address opens a fresh tab, the walk follows it (caption, screenshot, observers) and closeTypedAddress brings the first tab back", async ({
    page,
  }) => {
    const dir = tempDir();
    const walk = new Walk(page, dir);
    await walk.init();
    await walk.goto(PAGE);
    const typed = "data:text/html,<title>typed</title><main><h1>Typed page</h1></main><script>console.error('typed tab error')</script>";
    const meta = { id: 7, title: "Typed address", role: "Visitor" as const, caption: "A address is typed.", covers: ["SET-01"] };
    await walk.step(meta, async () => {
      const tab = await walk.typedAddress(typed);
      expect(tab).not.toBe(page);
      expect(page.context().pages()).toHaveLength(2);
      await expect(tab.getByRole("heading", { name: "Typed page" })).toBeVisible();
      // the step's caption is on the tab the person is looking at
      await expect(tab.locator("#wt-caption")).toHaveText("A address is typed.");
      // one typed address at a time
      await expect(walk.typedAddress(typed)).rejects.toThrow(/already open/);
    });
    // the step's screenshot was taken of the typed tab, and the tab's console error was heard
    expect(fs.existsSync(path.join(dir, "step_007.png"))).toBe(true);
    expect(walk.observers.observations.some((o) => o.kind === "console-error" && /typed tab error/.test(o.detail))).toBe(true);
    await walk.closeTypedAddress();
    expect(page.context().pages()).toHaveLength(1);
    await expect(page.locator("#wt-caption")).toHaveText("A address is typed.");
    // the first tab still has only its one landing
    await expect(walk.goto(PAGE)).rejects.toThrow(/Forbidden/);
    await expect(walk.closeTypedAddress()).rejects.toThrow(/No typed-address tab/);
  });

  test("a step that ends on a page the action loaded afresh still has its own caption on it, not the bar's first text", async ({
    page,
  }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(PAGE);
    const meta = {
      id: 2,
      title: "A page loaded by the step",
      role: "Visitor" as const,
      caption: "The caption of this step.",
      covers: ["SET-01"],
    };
    await walk.step(meta, async () => {
      // a click on a link that loads a whole new document: the bar is drawn again from its initial text
      await page.goto("data:text/html,<title>next</title><main><h1>Next page</h1></main>");
    });
    await expect(page.locator("#wt-title")).toHaveText("A page loaded by the step");
    await expect(page.locator("#wt-caption")).toHaveText("The caption of this step.");
  });

  test("a step must cover real rows of the coverage matrix, and writes its screenshot and timeline entry", async ({ page }) => {
    const dir = tempDir();
    const walk = new Walk(page, dir);
    await walk.init();
    await walk.goto(PAGE);
    const meta = { id: 1, title: "t", role: "Visitor" as const, caption: "c" };
    await expect(walk.step({ ...meta, covers: [] }, async () => {})).rejects.toThrow(/covers no coverage-matrix row/);
    await expect(walk.step({ ...meta, covers: ["NOPE-99"] }, async () => {})).rejects.toThrow(/not a row of the coverage matrix/);
    await walk.step({ ...meta, covers: ["SET-01"] }, async () => {});
    expect(fs.existsSync(path.join(dir, "step_001.png"))).toBe(true);
    expect(walk.getTimeline()).toHaveLength(1);
    expect(walk.getTimeline()[0]!.covers).toEqual(["SET-01"]);
    expect(walk.getTimeline()[0]!.endMs).toBeGreaterThan(walk.getTimeline()[0]!.startMs);
  });

  test("the caption bar and cursor are there on every page a click reaches, with no script error", async ({ page, context }) => {
    const walk = new Walk(page, tempDir());
    await walk.init();
    // Registered after the walk's own routing, so it answers first: this stands in for the app.
    await context.route("http://localhost:3997/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: route.request().url().endsWith("/two")
          ? "<!doctype html><html lang='en'><head><title>two</title></head><body><main><h1>Two</h1></main></body></html>"
          : "<!doctype html><html lang='en'><head><title>one</title></head><body><main><h1>One</h1><a href='/two'>Go to two</a></main></body></html>",
      }),
    );
    await walk.goto("http://localhost:3997/one");
    await expect(page.locator("#walkthrough-overlay-root")).toHaveCount(1);
    await walk.click(page.getByRole("link", { name: "Go to two" }));
    await expect(page.getByRole("heading", { name: "Two" })).toBeVisible();
    // No step ran after the click: the bar must have been mounted by the page-load script itself.
    await expect(page.locator("#walkthrough-overlay-root")).toHaveCount(1);
    await expect(page.locator("#walkthrough-cursor")).toHaveCount(1);
    expect(walk.observers.observations.filter((o) => o.kind === "page-error")).toEqual([]);
  });

  test("finish() saves what the observers saw, and a strict run fails on a blocker", async ({ page }) => {
    const dir = tempDir();
    const walk = new Walk(page, dir);
    await walk.init();
    await walk.goto(PAGE);
    const file = path.join(dir, "observations.json");
    walk.finish(file, { strict: true });
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual([]);
    await page.evaluate(() => console.error("broken"));
    await expect.poll(() => walk.observers.blockers().length).toBe(1);
    expect(() => walk.finish(file, { strict: true })).toThrow(/1 blocking observation/);
    expect(() => walk.finish(file, { strict: false })).not.toThrow();
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))[0]).toMatchObject({ kind: "console-error", detail: "broken" });
  });

  test("the config allows no retries and no parallelism", () => {
    const config = fs.readFileSync(path.resolve(__dirname, "../../../playwright.walkthrough.config.ts"), "utf-8");
    expect(config).toMatch(/\bretries:\s*0\b/);
    expect(config).toMatch(/\bworkers:\s*1\b/);
    expect(config).toMatch(/\bfullyParallel:\s*false\b/);
    expect(config).toMatch(/width:\s*1280,\s*height:\s*720/);
  });

  test("in a recon run a chapter that fails is written down as a finding and the next chapter starts by typing the site address again; in a strict run it throws", async ({
    page,
  }) => {
    const before = process.env.WALKTHROUGH_MODE;
    process.env.WALKTHROUGH_MODE = "recon";
    const dir = tempDir();
    const walk = new Walk(page, dir);
    process.env.WALKTHROUGH_MODE = before;
    expect(walk.mode).toBe("recon");
    await walk.init();
    await walk.goto(PAGE);

    const failed = await walk.chapter("C01 A chapter that breaks", async () => {
      await walk.step({ id: 1, title: "t", role: "Visitor", caption: "c", covers: ["RTE-01"] }, async () => {
        await expect(page.getByRole("heading", { name: "Nothing like this" })).toBeVisible({ timeout: 300 });
      });
    });
    expect(failed).toBe(false);
    expect(walk.getFindings()).toHaveLength(1);
    expect(walk.getFindings()[0]).toMatchObject({ id: "F-01", chapter: "C01 A chapter that breaks", step: 1, status: "Not fixed" });
    expect(walk.getFindings()[0]!.what).toContain("Nothing like this");
    expect(fs.existsSync(walk.getFindings()[0]!.evidence)).toBe(true);

    // the page may be anywhere after a failure: the next chapter begins by typing the first address again (a second counted page load), and goes on
    await page.setContent("<title>elsewhere</title><p>somewhere else</p>");
    const next = await walk.chapter("C02 The one after", async () => {
      await expect(page.locator("#a")).toBeVisible();
    });
    expect(next).toBe(true);

    walk.saveFindings(path.join(dir, "evidence"));
    expect(fs.readFileSync(path.join(dir, "evidence", "findings.md"), "utf-8")).toContain("F-01 C01 A chapter that breaks");
    expect(JSON.parse(fs.readFileSync(path.join(dir, "evidence", "findings.json"), "utf-8"))).toHaveLength(1);

    process.env.WALKTHROUGH_MODE = "strict";
    const strict = new Walk(page, tempDir());
    process.env.WALKTHROUGH_MODE = before;
    expect(strict.mode).toBe("strict");
    await expect(
      strict.chapter("C01 Strict", async () => {
        throw new Error("a step failed");
      }),
    ).rejects.toThrow("a step failed");
    await expect(strict.recoverAt("data:text/html,x")).rejects.toThrow(/recon/);
  });

  test("the caption bar and cursor are drawn on a page whose content security policy refuses inline styles, and the policy is left as it was", async ({
    page,
  }) => {
    const walk = new Walk(page, tempDir());
    await page.route("http://localhost:3999/", (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: { "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'" },
        body: "<!doctype html><title>t</title><main>hi</main>",
      }),
    );
    await walk.init();
    await walk.goto("http://localhost:3999/");
    await expect(page.locator("#walkthrough-overlay-root")).toBeVisible();
    expect(await page.locator("#walkthrough-overlay-root").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    expect(await page.locator("#walkthrough-cursor").evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    // nothing of the harness is reported as the page's own violation
    expect(walk.observers.observations.filter((o) => o.kind === "console-error" && /Content Security Policy/.test(o.detail))).toEqual([]);
  });

  test("walk.chooseTheme clicks the toggle at least once, stops on the wanted theme, and says so when it cannot get there", async ({
    page,
  }) => {
    const toggle = `<button id="t" aria-label="Switch to light theme" onclick="const d=document.documentElement;d.dataset.theme=d.dataset.theme==='dark'?'light':'dark';this.setAttribute('aria-label',d.dataset.theme==='dark'?'Switch to light theme':'Switch to dark theme')">theme</button>`;
    const walk = new Walk(page, tempDir());
    await walk.init();
    await walk.goto(`data:text/html,<html data-theme="dark"><title>t</title><body>${encodeURIComponent(toggle)}</body></html>`);
    await walk.chooseTheme("light"); // dark -> light: one click
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await walk.chooseTheme("light"); // already light: still clicks (every pass shows the switch), and comes back
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await walk.chooseTheme("dark");
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  });
});
