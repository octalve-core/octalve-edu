import { defineConfig, devices } from "@playwright/test";
import { execFileSync } from "child_process";
import * as path from "path";

/**
 * Dedicated Playwright configuration for the continuous walkthrough (Octalve Edu).
 *
 * Completely apart from the normal suites (unit, integration, api, e2e, https): it is not in playwright.config.ts and not in `pnpm check`.
 *
 * Projects:
 *   support         the harness's own tests (the guard, the coverage gate, the observers, the walk helpers). No browser recording.
 *   desktop-light   one pass of the whole journey at 1280 x 720, light theme.
 *   desktop-dark    the same, dark theme (chosen by clicking the theme toggle, which is a step of the journey).
 *   phone           the same on a Pixel 7.
 * Each pass starts from its own fresh database and is one continuous recording; run them one at a time (scripts/walkthrough-run/run.mjs does).
 *
 * No retries, no parallelism, ever: a step that fails is a finding, and a rerun that passes would hide it.
 */

const port = process.env.WALKTHROUGH_PORT ?? "3320";
const baseURL = process.env.WALKTHROUGH_BASE_URL ?? `http://localhost:${port}`;

// The deliverables go to the MAIN checkout's git-ignored out/walkthrough/, never into a worktree (a worktree can be removed). `git rev-parse --git-common-dir` is the
// main checkout's .git folder from the main checkout and from any worktree alike.
const outputRoot =
  process.env.WALKTHROUGH_OUTPUT_ROOT ??
  path.join(
    path.dirname(execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf-8" }).trim()),
    "out",
    "walkthrough",
  );

const DESKTOP = { width: 1280, height: 720 };
const PHONE = devices["Pixel 7"];

const journey = (name: string, use: object, size: { width: number; height: number }) => ({
  name,
  testMatch: /^(?!.*[\\/]support[\\/]).*\.spec\.ts$/,
  outputDir: path.join(outputRoot, name, "raw-results"),
  // actionTimeout: without one, a click or a scroll on a locator that never appears waits for the WHOLE four-hour test, so a wrong label hangs the run for hours and leaves no finding (the
  // 2026-11-12 run sat on one step for 29 minutes). With it, the step fails in twenty seconds and the chapter's checkpoint and screenshot say which one.
  use: { baseURL, actionTimeout: 20_000, navigationTimeout: 45_000, ...use, video: { mode: "on" as const, size } },
});

export default defineConfig({
  testDir: "./tests/walkthrough",
  // The journey is ONE continuous test, and it grows with every chapter: four hours, not the thirty minutes it started with. The journey writes its timeline and findings after each chapter,
  // so a run that is stopped early still leaves what it had.
  timeout: 14_400_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  projects: [
    { name: "support", testMatch: /[\\/]support[\\/].*\.spec\.ts$/, timeout: 60_000, use: { baseURL, video: "off" } },
    journey("desktop-light", { viewport: DESKTOP, colorScheme: "light" }, DESKTOP),
    journey("desktop-dark", { viewport: DESKTOP, colorScheme: "dark" }, DESKTOP),
    journey("phone", { ...PHONE }, PHONE.viewport),
  ],
});
