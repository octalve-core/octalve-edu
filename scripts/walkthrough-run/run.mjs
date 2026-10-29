#!/usr/bin/env node

/**
 * Continuous Walkthrough Suite Runner
 *
 * Automates:
 * 1. Dedicated walkthrough database reset and migration (wip_<repo>_walkthrough).
 * 2. Dedicated web server startup with in-app dev tools / mail inbox enabled.
 * 3. Execution of the unbroken Playwright walkthrough recording (1366x768).
 * 4. Invocation of report.mjs to generate video, VTT, chapters, and captioned PDF.
 */

import { spawn } from "child_process";
import http from "http";
import path from "path";
import fs from "fs";

const PORT = process.env.WALKTHROUGH_PORT || "3310";
const DB_NAME = process.env.WALKTHROUGH_DB_NAME || "wip_octalve_edu_walkthrough";
const DB_PORT = process.env.WALKTHROUGH_DB_PORT || "5433";
const DB_USER = process.env.WALKTHROUGH_DB_USER || "postgres";
const DB_PASS = process.env.WALKTHROUGH_DB_PASSWORD || "postgres";
const DATABASE_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}`;

async function runCmd(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    console.log(`> ${cmd} ${args.join(" ")}`);
    const proc = spawn(cmd, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.setTimeout(2000, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms.`);
}

async function main() {
  console.log("=== OCTALVE EDU: PRODUCT WALKTHROUGH RUNNER ===");
  console.log(`Port: ${PORT}`);
  console.log(`Database: ${DB_NAME} on :${DB_PORT}`);

  // 1. Prepare Dedicated Walkthrough Database
  console.log("\n[1/4] Preparing dedicated database from scratch...");
  try {
    await runCmd("dropdb", ["-h", "localhost", "-p", DB_PORT, "-U", DB_USER, "--if-exists", DB_NAME]);
  } catch {
    // fine if didn't exist
  }
  await runCmd("createdb", ["-h", "localhost", "-p", DB_PORT, "-U", DB_USER, DB_NAME]);

  console.log("Deploying migrations to walkthrough database...");
  await runCmd("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    DATABASE_URL,
  });

  // 2. Start Web Server
  console.log(`\n[2/4] Starting server on port ${PORT}...`);
  const serverEnv = {
    ...process.env,
    PORT,
    DATABASE_URL,
    APP_URL: `http://localhost:${PORT}`,
    DEPLOYMENT_MODE: "solo",
    DEV_TOOLS_ENABLED: "true",
    NODE_ENV: "production",
  };

  // Launch Next.js server (runs 'next start' if build exists, else 'next dev')
  const hasBuild = fs.existsSync(path.resolve(process.cwd(), ".next"));
  const serverCmd = hasBuild ? "start" : "dev";
  console.log(`Starting Next.js using 'next ${serverCmd}'...`);

  const serverProc = spawn("pnpm", ["exec", "next", serverCmd, "-p", PORT], {
    env: serverEnv,
    stdio: "pipe",
  });

  serverProc.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on("data", (d) => process.stderr.write(`[server-err] ${d}`));

  const cleanup = () => {
    try {
      serverProc.kill("SIGTERM");
    } catch {
      // ignore
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(1);
  });

  console.log("Waiting for web server to be ready...");
  await waitForServer(`http://localhost:${PORT}`);
  console.log("Web server is healthy and responding!");

  // 3. Execute Continuous Walkthrough Suite
  console.log("\n[3/4] Launching Playwright Continuous Walkthrough recording...");
  try {
    await runCmd("pnpm", ["exec", "playwright", "test", "--config=playwright.walkthrough.config.ts"], {
      WALKTHROUGH_PORT: PORT,
      WALKTHROUGH_BASE_URL: `http://localhost:${PORT}`,
    });
  } finally {
    cleanup();
  }

  // 4. Generate Artifacts & Publish to Web
  console.log("\n[4/4] Generating deliverables & publishing to /video-guide...");
  await runCmd("node", ["scripts/walkthrough-run/report.mjs"]);

  console.log("\n=== WALKTHROUGH RUN COMPLETED SUCCESSFULLY ===");
}

main().catch((err) => {
  console.error("Walkthrough execution failed:", err);
  process.exit(1);
});
