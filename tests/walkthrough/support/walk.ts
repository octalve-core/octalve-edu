import type { Page, Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { pace, keyDelay, reconTypingScale, TYPING_BUDGET_MINUTES } from "./pace";
import { getOverlayInitScript } from "./overlay";
import { Observers } from "./observers";
import rows from "../coverage/rows.json";
import { RESUME_CHAPTER, chapterWanted, onlyChapters, requestCheckpoint } from "../../../scripts/walkthrough-run/checkpoint.mjs";

/// Every row id of the coverage matrix: a step may only claim a row that exists.
const KNOWN_ROWS = new Set<string>((rows as Array<{ id: string }>).map((row) => row.id));

/// The same eight names as the roles of the coverage matrix: the platform superadministrator above the schools (SaaS), the school administrator and the campus administrator, the two kinds of staff, the
/// pupil, the guardian and a visitor who has signed in to nothing.
export type WalkRole =
  | "Visitor"
  | "Platform superadmin"
  | "School administrator"
  | "Campus administrator"
  | "Teacher"
  | "Non-teaching staff"
  | "Pupil"
  | "Guardian";

/// The badge colour class (overlay.ts) of each role.
const ROLE_CLASS: Record<WalkRole, string> = {
  Visitor: "visitor",
  "Platform superadmin": "platform",
  "School administrator": "admin",
  "Campus administrator": "admin",
  Teacher: "teacher",
  "Non-teaching staff": "teacher",
  Pupil: "pupil",
  Guardian: "parent",
};

export interface StepMeta {
  id: number;
  title: string;
  role: WalkRole;
  caption: string;
  chapter?: string;
  /// The coverage-matrix rows this step proves (tests/walkthrough/coverage/rows.json). A step that proves nothing, or names a row that does not exist, is a bug in the journey.
  covers: string[];
}

export interface TimelineEntry extends StepMeta {
  startMs: number;
  endMs: number;
  screenshotPath: string;
}

/// A place where the journey could not go on as a person would have gone on. Written by a recon run (section 6.6 of task 0033); a strict run throws instead.
export interface Finding {
  id: string;
  chapter: string;
  /// The id of the step that was running, or null when the chapter failed before its first step.
  step: number | null;
  route: string;
  /// The failure as Playwright worded it (the expectation, the locator, the timeout): what a user would have met.
  what: string;
  /// The screenshot taken at the moment of failure.
  evidence: string;
  status: "Not fixed";
}

/// "recon" records a failed chapter as a finding and goes on to the next (never a deliverable); "strict" throws at the first failure. Strict unless the runner says recon.
export type WalkMode = "recon" | "strict";
export const walkMode = (): WalkMode => (process.env.WALKTHROUGH_MODE === "recon" ? "recon" : "strict");

export class Walk {
  private page: Page;
  private currentX: number = 200;
  private currentY: number = 200;
  private stepCount: number = 0;
  private gotoCount: number = 0;
  private recordingStartMs: number = 0;
  private timeline: TimelineEntry[] = [];
  private screenshotsDir: string;
  private currentRole: WalkRole = "Visitor";
  /// The step being run (a typed-address tab shows the same step badge and caption), and the first tab while a typed-address tab is open.
  private lastStep: StepMeta | null = null;
  private firstTab: Page | null = null;
  private typedMs: number = 0;
  private findings: Finding[] = [];
  /// Recon only: where the first page load went, and whether the last chapter stopped early (the next one then starts by typing that address again).
  private startUrl: string | null = null;
  private needsRecovery = false;
  /// The chapters that ran (a resumed recon names the chapters it wants, and a name that no chapter has is a typing mistake, said at the end).
  private ranChapters: string[] = [];
  readonly mode: WalkMode = walkMode();
  /// Always on: console, page errors, failed requests, response statuses, requests that would leave the machine, and axe after every new page.
  readonly observers: Observers;

  constructor(page: Page, screenshotsDir: string = "out/walkthrough/screenshots") {
    this.page = page;
    this.screenshotsDir = screenshotsDir;
    this.observers = new Observers(page);
  }

  /**
   * Initializes overlay, cursor simulation, and sets recording start time.
   */
  async init(): Promise<void> {
    this.recordingStartMs = Date.now();
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }

    await this.observers.start(this.page.context());

    // Re-inject overlay automatically across navigations
    await this.page.addInitScript(getOverlayInitScript());
    await this.injectOverlayNow();
  }

  private async injectOverlayNow(): Promise<void> {
    try {
      await this.page.evaluate((script) => {
        const fn = new Function(script);
        fn();
      }, getOverlayInitScript());
    } catch {
      // In case navigation is in flight
    }
  }

  /**
   * Safe single-landing navigation guard. Throws if called more than once.
   */
  async goto(url: string): Promise<void> {
    if (this.gotoCount > 0) {
      throw new Error(
        `Forbidden: page.goto called ${this.gotoCount + 1} times. All subsequent pages must be reached exclusively via user clicks and links.`,
      );
    }
    this.gotoCount++;
    this.startUrl ??= url;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.injectOverlayNow();
  }

  /**
   * Glides the simulated cursor smoothly to the specified screen coordinates.
   */
  async glideTo(targetX: number, targetY: number): Promise<void> {
    const startX = this.currentX;
    const startY = this.currentY;
    const steps = pace.glideSteps;

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // Smooth easeInOutQuad interpolation
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const x = Math.round(startX + (targetX - startX) * ease);
      const y = Math.round(startY + (targetY - startY) * ease);

      await this.page.evaluate(
        ({ cx, cy }) => {
          const cursor = document.getElementById("walkthrough-cursor");
          if (cursor) {
            cursor.style.transform = `translate(${cx}px, ${cy}px)`;
          }
        },
        { cx: x, cy: y },
      );
      await this.page.mouse.move(x, y);
      await new Promise((r) => setTimeout(r, 12));
    }

    this.currentX = targetX;
    this.currentY = targetY;
  }

  /**
   * Realistic human-paced click with visible cursor glide, hover pause, click ripple, and settle pause.
   */
  async click(locator: Locator): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) {
      throw new Error(`Cannot click element: bounding box is null.`);
    }

    const targetX = Math.round(box.x + box.width / 2);
    const targetY = Math.round(box.y + box.height / 2);

    await this.glideTo(targetX, targetY);
    await new Promise((r) => setTimeout(r, pace.beforeClick));

    // Inject visual click ripple
    await this.page.evaluate(
      ({ rx, ry }) => {
        const ripple = document.createElement("div");
        ripple.className = "wt-ripple";
        ripple.style.left = `${rx}px`;
        ripple.style.top = `${ry}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 400);
      },
      { rx: targetX, ry: targetY },
    );

    await locator.click();
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /**
   * Human-paced typing: glides cursor, clicks the field, clears it the way a person does (select all, delete) and presses one key at a time, 35 to 80 ms apart (a very fast typist).
   */
  async type(locator: Locator, text: string): Promise<void> {
    await this.click(locator);
    await this.page.keyboard.press("ControlOrMeta+A");
    await this.page.keyboard.press("Backspace");
    for (const character of text) {
      await this.page.keyboard.type(character);
      const delay = this.mode === "recon" ? keyDelay() * reconTypingScale : keyDelay();
      this.typedMs += delay;
      await new Promise((r) => setTimeout(r, delay));
    }
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /// Milliseconds spent between key presses so far (the typing budget counts it).
  typingMs(): number {
    return this.typedMs;
  }

  /// Fails the run when the typing alone is longer than a pass may contain: shorten the fixture text.
  assertTypingBudget(maxMinutes: number = TYPING_BUDGET_MINUTES): void {
    const minutes = this.typedMs / 60_000;
    if (minutes > maxMinutes)
      throw new Error(`Typing took ${minutes.toFixed(1)} minutes, over the budget of ${maxMinutes}. Shorten the fixture text.`);
  }

  /**
   * Selects an option from a <select> element with proper cursor glide and pacing.
   */
  async selectOption(locator: Locator, value: string): Promise<void> {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (box) {
      await this.glideTo(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2));
      await new Promise((r) => setTimeout(r, pace.beforeClick));
    }
    await locator.selectOption(value);
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /**
   * Chooses the theme the way a person does: by clicking the toggle (it is on the sign-in and setup screens as well as in the shell). The app ignores the system colour scheme and starts
   * dark, so a light pass has to click. Always clicks at least once, so that every pass shows the switch working, and stops when the page shows the wanted theme.
   */
  async chooseTheme(theme: "light" | "dark"): Promise<void> {
    const toggle = this.page.getByRole("button", { name: /^Switch to (light|dark) theme$/ });
    for (let attempt = 0; attempt < 2; attempt++) {
      const before = await this.page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
      await this.click(toggle);
      await this.page.waitForFunction((was) => (document.documentElement.dataset.theme ?? "dark") !== was, before);
      const now = await this.page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
      if (now === theme) return;
    }
    throw new Error(`The theme toggle did not reach the ${theme} theme in two clicks.`);
  }

  /// Replaces the words in the caption bar (the step sets them at its start; a helper that does something a person would not see otherwise says so here).
  private async caption(text: string): Promise<void> {
    await this.page.evaluate((words) => {
      const el = document.getElementById("wt-caption");
      if (el) el.textContent = words;
    }, text);
  }

  /**
   * The harness's one named exception to "nothing but a person's click changes what the app does" (OFF-01, the offline page): switches the network off, as a person does with
   * airplane mode, and says so in the caption. The browser's own "network is down" lines are expected until goOnline().
   */
  async goOffline(): Promise<void> {
    await this.caption("The network is switched off, as with airplane mode.");
    this.observers.setOffline(true);
    await this.page.context().setOffline(true);
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /// Switches the network back on (see goOffline) and says so in the caption.
  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false);
    this.observers.setOffline(false);
    await this.caption("The network is switched back on.");
    await new Promise((r) => setTimeout(r, pace.afterClick));
  }

  /**
   * The app asks "Are you sure?" with the browser's own confirmation box in a few places (removing a timetable period, deleting an announcement). A person answers by pressing OK, and this is
   * that: it answers the NEXT confirmation, and only if it asks the question given; any other question is dismissed (Cancel), so the step's own check of the result fails. The recording
   * does not show the browser's box, so the caption says what was asked.
   */
  async acceptNextConfirm(question: string): Promise<void> {
    await this.caption(`The browser asks: "${question}" and OK is pressed.`);
    this.page.once("dialog", (dialog) => {
      void (dialog.type() === "confirm" && dialog.message() === question ? dialog.accept() : dialog.dismiss());
    });
  }

  /// Writes the step's badge, role, title and caption into the bar of the tab the walk is on.
  private async showStep(meta: StepMeta): Promise<void> {
    await this.page.evaluate(
      ({ step, role, title, caption, slug }) => {
        const stepEl = document.getElementById("wt-step");
        const roleEl = document.getElementById("wt-role");
        const titleEl = document.getElementById("wt-title");
        const captionEl = document.getElementById("wt-caption");

        if (stepEl) stepEl.textContent = step;
        if (roleEl) {
          roleEl.textContent = role;
          roleEl.className = `wt-role-badge wt-role-${slug}`;
        }
        if (titleEl) titleEl.textContent = title;
        if (captionEl) captionEl.textContent = caption;
      },
      {
        step: `Step ${String(meta.id).padStart(2, "0")}`,
        role: meta.role,
        title: meta.title,
        caption: meta.caption,
        slug: ROLE_CLASS[meta.role],
      },
    );
  }

  /**
   * A typed address (decision D2). A person types an address into the address bar of a FRESH tab, and that is the one load the tab ever gets, counted by being the only one here. The walk's
   * cursor, caption bar, screenshots and observers move to the new tab, and stay there until closeTypedAddress() brings the first tab back; the first tab keeps its single landing.
   * Playwright records one video per tab, so what happens in this tab is in the screenshots, the PDF and the timeline and not in the first tab's recording.
   */
  async typedAddress(address: string): Promise<Page> {
    if (this.firstTab) throw new Error("A typed-address tab is already open: close it before typing another address.");
    const tab = await this.page.context().newPage();
    await tab.addInitScript(getOverlayInitScript());
    this.firstTab = this.page;
    this.page = tab;
    this.observers.follow(tab);
    await tab.goto(address, { waitUntil: "domcontentloaded" });
    await this.injectOverlayNow();
    if (this.lastStep) await this.showStep(this.lastStep);
    return tab;
  }

  /// Closes the typed-address tab and goes back to the first tab, with the step's caption on it again.
  async closeTypedAddress(): Promise<void> {
    const first = this.firstTab;
    if (!first) throw new Error("No typed-address tab is open.");
    const tab = this.page;
    this.page = first;
    this.firstTab = null;
    this.observers.follow(first);
    await tab.close();
    await first.bringToFront();
    if (this.lastStep) await this.showStep(this.lastStep);
  }

  /**
   * Executes a formal walkthrough step: updates the in-page overlay, records timestamps,
   * runs the action, settles DOM, captures screenshot, and dwells.
   */
  async step(meta: StepMeta, action: () => Promise<void>): Promise<void> {
    if (!Array.isArray(meta.covers) || meta.covers.length === 0)
      throw new Error(`Step ${meta.id} ("${meta.title}") covers no coverage-matrix row.`);
    for (const id of meta.covers) {
      if (!KNOWN_ROWS.has(id))
        throw new Error(`Step ${meta.id} ("${meta.title}") covers "${id}", which is not a row of the coverage matrix.`);
    }
    this.stepCount = meta.id;
    this.currentRole = meta.role;
    this.lastStep = meta;
    this.observers.setStep(meta.id);
    const startMs = Date.now() - this.recordingStartMs;

    // Update overlay in DOM
    await this.injectOverlayNow();
    await this.showStep(meta);

    // Execute user action
    await action();

    // Settle pause
    await new Promise((r) => setTimeout(r, pace.settle));

    // A click on a link that loads a whole new page (an emailed link, a sign-out) hands the step a page whose caption bar was drawn again from its initial text ("STEP 00, Initializing"); the
    // screenshot, the PDF and the video must carry the step's own caption, so it is drawn once more here. A page that is itself in the middle of loading is left to the next step.
    await this.showStep(meta).catch(() => undefined);

    // A page reached for the first time is scanned for accessibility before the screenshot (the scan changes nothing on the page).
    await this.observers.axeOnNewRoute();

    // Capture step screenshot
    const screenshotName = `step_${String(meta.id).padStart(3, "0")}.png`;
    const screenshotPath = path.join(this.screenshotsDir, screenshotName);
    await this.page.screenshot({ path: screenshotPath });

    // Dwell pause to comfortably frame caption
    await new Promise((r) => setTimeout(r, pace.dwell));

    const endMs = Date.now() - this.recordingStartMs;

    this.timeline.push({
      ...meta,
      startMs,
      endMs,
      screenshotPath,
    });
  }

  /**
   * Writes the recorded timeline metadata to timeline.json
   */
  saveTimeline(outputPath: string = "out/walkthrough/timeline.json"): void {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(this.timeline, null, 2), "utf-8");
  }

  /// Writes what the observers saw, and in a strict run (the final one) fails on any blocker. A recon run passes strict: false and reads the file.
  finish(observationsPath: string, options: { strict: boolean }): void {
    const unknown = onlyChapters(process.env).filter((name) => !this.ranChapters.includes(name));
    if (unknown.length > 0) throw new Error(`WALKTHROUGH_ONLY names a chapter the journey does not have: ${unknown.join(", ")}.`);
    this.observers.save(observationsPath);
    this.assertTypingBudget();
    const blockers = this.observers.blockers();
    if (options.strict && blockers.length > 0) {
      const first = blockers
        .slice(0, 5)
        .map((o) => `step ${o.step} ${o.route}: ${o.kind} ${o.detail}`)
        .join("\n  ");
      throw new Error(`${blockers.length} blocking observation(s); the first:\n  ${first}`);
    }
  }

  /**
   * A chapter of the journey: a run of steps that ends with the person signed out. In recon a failure is written down as a finding and the next chapter goes on (returns false);
   * in strict it is thrown. A chapter that does not know where it left the page starts with recoverAt(), which only recon may use.
   */
  async chapter(name: string, run: () => Promise<void>): Promise<boolean> {
    const only = onlyChapters(process.env);
    if (!chapterWanted(name, only)) return true;
    if (only.length > 0 && this.mode === "strict")
      throw new Error("WALKTHROUGH_ONLY is for a recon run: a strict run is the whole journey.");
    this.ranChapters.push(name);
    const ended = await this.runChapter(name, run);
    if (ended) await this.checkpoint(name);
    return ended;
  }

  /**
   * Recon only (the runner sets WALKTHROUGH_CHECKPOINTS=save): the chapter has ended without stopping, so ask the runner to save the database as it is now, and WAIT until it has, so that the
   * save is the state at the end of this chapter and can never include the first step of the next. The resume sign-in is not a chapter and is never saved.
   */
  async checkpoint(name: string): Promise<void> {
    if (process.env.WALKTHROUGH_CHECKPOINTS !== "save" || name === RESUME_CHAPTER) return;
    await requestCheckpoint(path.dirname(this.screenshotsDir), name);
  }

  private async runChapter(name: string, run: () => Promise<void>): Promise<boolean> {
    if (this.needsRecovery && this.startUrl) {
      // a chapter that stopped inside a typed-address tab leaves it open: the next chapter starts on the first tab
      if (this.firstTab) await this.closeTypedAddress();
      await this.recoverAt(this.startUrl);
      this.needsRecovery = false;
    }
    try {
      await run();
      return true;
    } catch (error) {
      if (this.mode === "strict") throw error;
      this.needsRecovery = true;
      const route = /^https?:/.test(this.page.url()) ? new URL(this.page.url()).pathname : this.page.url().slice(0, 30);
      const evidence = path.join(this.screenshotsDir, `failure_${String(this.findings.length + 1).padStart(2, "0")}.png`);
      await this.page.screenshot({ path: evidence }).catch(() => undefined);
      this.findings.push({
        id: `F-${String(this.findings.length + 1).padStart(2, "0")}`,
        chapter: name,
        step: this.stepCount || null,
        route,
        what: (error instanceof Error ? error.message : String(error)).split("\n").slice(0, 12).join("\n"),
        evidence,
        status: "Not fixed",
      });
      return false;
    }
  }

  /// Recon only: after a failed chapter the page may be anywhere, so the person types the site address again (a second counted page load, named in the findings). Strict runs never get here.
  async recoverAt(url: string): Promise<void> {
    if (this.mode === "strict") throw new Error("recoverAt is for recon runs: a strict run stops at the first failure.");
    this.gotoCount = 0;
    await this.goto(url);
  }

  /// The findings so far, as JSON for the report and as the markdown that findings.md is made of.
  saveFindings(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "findings.json"), JSON.stringify(this.findings, null, 2), "utf-8");
    const lines = ["# Findings of this run", "", `${this.findings.length} chapter(s) stopped before their end.`, ""];
    for (const f of this.findings) {
      lines.push(
        `## ${f.id} ${f.chapter}`,
        "",
        `- Step: ${f.step ?? "before the first"}`,
        `- Route: ${f.route}`,
        `- Status: ${f.status}`,
        `- Evidence: ${f.evidence}`,
        "",
        "```",
        f.what,
        "```",
        "",
      );
    }
    fs.writeFileSync(path.join(dir, "findings.md"), lines.join("\n"), "utf-8");
  }

  getFindings(): Finding[] {
    return this.findings;
  }

  getTimeline(): TimelineEntry[] {
    return this.timeline;
  }
}
