import { defineConfig } from "@playwright/test";

/**
 * Dedicated Playwright Configuration for Continuous End-to-End Walkthrough
 *
 * Runs as a single continuous session with video recording enabled at 1366x768.
 * Completely isolated from standard test suites (unit, integration, e2e).
 */

const port = process.env.WALKTHROUGH_PORT ?? "3310";
const baseURL = process.env.WALKTHROUGH_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/walkthrough",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: "./out/walkthrough/raw-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    viewport: { width: 1366, height: 768 },
    video: {
      mode: "on",
      size: { width: 1366, height: 768 },
    },
    trace: "on-first-retry",
  },
});
