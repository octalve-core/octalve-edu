import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { RULES, findViolations, stripComments } from "./guard-rules";

// What the guard scans. The journey files are everything outside support/. The observer library is the helpers the journey is built on: it draws the caption bar and listens, so
// it is exempt from the journey tier (it needs evaluate and try), but not from the actor tier (it may never reach a database, an API or a cookie). The guard's own files and the
// specs that test the harness hold the forbidden words on purpose and are not scanned.
const WALKTHROUGH_DIR = path.resolve(__dirname, "..");
const OBSERVER_FILES = new Set(["walk.ts", "overlay.ts", "pace.ts", "observers.ts", "paths.ts"]);
const NOT_SCANNED = new Set(["guard-rules.ts"]);

function scanFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...scanFiles(full));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const isSupportSpec = (file: string) => file.includes(`${path.sep}support${path.sep}`) && file.endsWith(".spec.ts");

test.describe("Walkthrough guardrails", () => {
  test("no journey file or helper reaches the app by a backdoor", () => {
    const violations: string[] = [];
    for (const file of scanFiles(WALKTHROUGH_DIR)) {
      const name = path.basename(file);
      if (NOT_SCANNED.has(name) || isSupportSpec(file)) continue;
      const observer = OBSERVER_FILES.has(name) && file.includes(`${path.sep}support${path.sep}`);
      for (const v of findViolations(fs.readFileSync(file, "utf-8"), { file: name, observer })) {
        violations.push(`${path.relative(WALKTHROUGH_DIR, file)}:${v.line} uses '${v.rule}' - ${v.reason}`);
      }
    }
    expect(violations, `Walkthrough guard violations detected:\n${violations.join("\n")}`).toEqual([]);
  });

  test("every rule fires on its own tamper line, in the file kind it governs", () => {
    for (const rule of RULES) {
      const asJourney = findViolations(rule.tamper, { file: "journey.spec.ts", observer: false }).map((v) => v.rule);
      expect(asJourney, `rule '${rule.name}' did not fire on: ${rule.tamper}`).toContain(rule.name);
      const asObserver = findViolations(rule.tamper, { file: "helper.ts", observer: true }).map((v) => v.rule);
      if (rule.tier === "actor") expect(asObserver, `actor rule '${rule.name}' must also bind the observer library`).toContain(rule.name);
      else expect(asObserver, `journey rule '${rule.name}' must not bind the observer library`).not.toContain(rule.name);
    }
  });

  test("the rules the maintainer named are all present", () => {
    const names = RULES.map((r) => r.name);
    for (const required of [
      "page.request",
      "fetch",
      "prisma",
      "pg",
      "skip",
      "fixme",
      "retries",
      "isVisible",
      "try-catch",
      "conditional",
      "localStorage",
      "sessionStorage",
      "cookies",
      "goto",
      "force-click",
      "fill",
      "set-input-files",
      "evaluate",
      "shell-out",
    ]) {
      expect(names, `no rule named '${required}'`).toContain(required);
    }
  });

  test("honest steps are not flagged", () => {
    const honest = `
      await walk.goto("/");
      await mailWalk.goto("http://localhost:3999/inbox");
      await walk.type(page.getByLabel("Email address"), "head@school.example");
      await walk.click(page.getByRole("button", { name: "Sign in" }));
      await expect(page.getByText("Setup complete")).toBeVisible({ timeout: 15_000 });
      for (const name of ["Students", "Attendance"]) {
        await walk.click(page.getByRole("link", { name }));
      }
      const [chooser] = await Promise.all([page.waitForEvent("filechooser"), walk.click(page.getByText("Choose file"))]);
      await chooser.setFiles("students.csv");
      // if (await x.isVisible()) is only a comment here
    `;
    expect(findViolations(honest, { file: "journey.spec.ts", observer: false })).toEqual([]);
  });

  test("a forbidden word inside a comment is ignored, inside a string it is not", () => {
    expect(findViolations("// fetch('/api')\n/* prisma.user\n.find() */\nconst a = 1;", { file: "j.ts", observer: false })).toEqual([]);
    const hidden = findViolations('const url = "http://x.example"; fetch(url);', { file: "j.ts", observer: false }).map((v) => v.rule);
    expect(hidden).toContain("fetch");
    expect(stripComments("a // b\nc /* d\ne */ f").split("\n")).toHaveLength(3);
  });
});
