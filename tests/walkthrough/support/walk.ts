import type { Page, Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { pace } from "./pace";
import { getOverlayInitScript } from "./overlay";

export type WalkRole = "Platform Superadmin" | "School Admin" | "Campus Admin" | "Teacher" | "Pupil" | "Parent" | "Visitor";

export interface StepMeta {
  id: number;
  title: string;
  role: WalkRole;
  caption: string;
  chapter?: string;
  covers?: string[];
}

export interface TimelineEntry extends StepMeta {
  startMs: number;
  endMs: number;
  screenshotPath: string;
}

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

  constructor(page: Page, screenshotsDir: string = "out/walkthrough/screenshots") {
    this.page = page;
    this.screenshotsDir = screenshotsDir;
  }

  /**
   * Initializes overlay, cursor simulation, and sets recording start time.
   */
  async init(): Promise<void> {
    this.recordingStartMs = Date.now();
    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }

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
   * Human-paced typing: glides cursor, clicks input, and enters characters sequentially.
   */
  async type(locator: Locator, text: string): Promise<void> {
    await this.click(locator);
    await locator.fill(""); // Clear cleanly before typing
    await locator.pressSequentially(text, { delay: pace.typeDelay });
    await new Promise((r) => setTimeout(r, pace.afterClick));
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
   * Executes a formal walkthrough step: updates the in-page overlay, records timestamps,
   * runs the action, settles DOM, captures screenshot, and dwells.
   */
  async step(meta: StepMeta, action: () => Promise<void>): Promise<void> {
    this.stepCount = meta.id;
    this.currentRole = meta.role;
    const startMs = Date.now() - this.recordingStartMs;

    // Format role class
    const roleSlug = meta.role.toLowerCase().replace(/\s+/g, "-");
    const stepLabel = `Step ${String(meta.id).padStart(2, "0")}`;

    // Update overlay in DOM
    await this.injectOverlayNow();
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
        step: stepLabel,
        role: meta.role,
        title: meta.title,
        caption: meta.caption,
        slug: roleSlug,
      },
    );

    // Execute user action
    await action();

    // Settle pause
    await new Promise((r) => setTimeout(r, pace.settle));

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

  getTimeline(): TimelineEntry[] {
    return this.timeline;
  }
}
