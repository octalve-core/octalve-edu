import { defineConfig, devices } from "@playwright/test";
import {
  HTTP_PORT,
  HTTP_URL,
  HTTPS_APP_PORT,
  HTTPS_URL,
  TLS_PORT,
  serverEnv,
} from "./tests/support/env";

// What runs where (see tests/README.md):
//   setup        creates/migrates/empties the *_test database (everything else needs it)
//   unit         pure logic, no database, no server
//   integration  application modules called in-process against the test database
//   api          real HTTP against a production build (`next start`) — login/logout/me
//   e2e-*        real Chromium against that same server, desktop and phone viewports
//   https        real Chromium over real TLS, so the `__Host-` cookie rules are enforced
//
// The servers are `next start` (a production build), not `next dev`: it is what
// ships, and dev mode changes cache headers and error behaviour. `pnpm test`
// builds first; `pnpm test:fast` reuses the existing build.
//
// One worker, no file-level parallelism: the suites share a database and the
// setup spec deliberately starts from an empty one. Each test creates its own
// users and its own client IP, so tests never depend on each other's data.
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0, // a flaky test is a bug to fix, not to retry away
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },

  webServer: [
    {
      command: `pnpm exec next start -p ${HTTP_PORT}`,
      url: `${HTTP_URL}/favicon.ico`,
      env: serverEnv(HTTP_URL),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // The same build, told it is served over HTTPS (=> `__Host-` + Secure cookie)…
      command: `pnpm exec next start -p ${HTTPS_APP_PORT}`,
      url: `http://localhost:${HTTPS_APP_PORT}/favicon.ico`,
      env: serverEnv(HTTPS_URL),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      // …and the TLS proxy that actually serves it as HTTPS.
      command: `node tests/support/tls-proxy.mjs ${TLS_PORT} ${HTTPS_APP_PORT}`,
      url: `${HTTPS_URL}/favicon.ico`,
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],

  projects: [
    { name: "setup", testDir: "./tests/setup", testMatch: /.*\.setup\.ts/ },
    { name: "unit", testDir: "./tests/unit" },
    { name: "integration", testDir: "./tests/integration", dependencies: ["setup"] },
    { name: "api", testDir: "./tests/api", dependencies: ["setup"] },
    {
      name: "e2e-desktop",
      testDir: "./tests/e2e",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: HTTP_URL },
    },
    {
      name: "e2e-mobile",
      testDir: "./tests/e2e",
      dependencies: ["setup"],
      use: { ...devices["Pixel 7"], baseURL: HTTP_URL },
    },
    {
      name: "https",
      testDir: "./tests/https",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], baseURL: HTTPS_URL, ignoreHTTPSErrors: true },
    },
  ],
});
