import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp; reason: string }> = [
  { name: "page.request", pattern: /\bpage\.request\b/, reason: "Direct API calls forbidden; real user UI only." },
  { name: "fetch", pattern: /\bfetch\s*\(/, reason: "Direct HTTP calls forbidden; real user UI only." },
  { name: "prisma", pattern: /\bprisma\./, reason: "Direct DB access forbidden; UI actions only." },
  { name: "skip", pattern: /\btest\.skip\b/, reason: "Test skips forbidden; every step must be executed." },
  { name: "fixme", pattern: /\btest\.fixme\b/, reason: "Test fixme forbidden; every step must pass." },
  { name: "isVisible", pattern: /\.isVisible\s*\(/, reason: "Conditional checks forbidden; use hard assertions." },
  { name: "try-catch", pattern: /\btry\s*\{/, reason: "Swallowing step failures forbidden; audit must fail on error." },
  { name: "localStorage", pattern: /\blocalStorage\b/, reason: "Manual storage tampering forbidden." },
  { name: "sessionStorage", pattern: /\bsessionStorage\b/, reason: "Manual storage tampering forbidden." },
];

const ALLOWLIST_FILES = new Set(["guard.spec.ts", "pace.ts", "overlay.ts", "walk.ts"]);

function scanFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...scanFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }
  return files;
}

test.describe("Walkthrough Guardrails Static Analysis", () => {
  test("journey specs contain no backdoor calls, conditional skips, or database tampering", () => {
    const walkthroughDir = path.resolve(__dirname, "..");
    const files = scanFiles(walkthroughDir);
    const violations: string[] = [];

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      if (ALLOWLIST_FILES.has(fileName)) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().startsWith("//") || line.trim().startsWith("/*") || line.trim().startsWith("*")) {
          continue;
        }

        for (const { name, pattern, reason } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${path.relative(walkthroughDir, filePath)}:${i + 1} uses '${name}' - ${reason}`);
          }
        }
      }
    }

    expect(violations, `Walkthrough guard violations detected:\n${violations.join("\n")}`).toEqual([]);
  });

  test("guardrail tamper test: correctly detects and reports forbidden patterns", () => {
    const dirtySnippet = `
      // Some comment
      const data = await prisma.user.findFirst();
      if (await page.locator("#btn").isVisible()) {
        try {
          await page.request.post("/api/backdoor");
        } catch (e) {}
      }
    `;

    const detected = FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(dirtySnippet)).map((p) => p.name);
    expect(detected).toContain("prisma");
    expect(detected).toContain("isVisible");
    expect(detected).toContain("try-catch");
    expect(detected).toContain("page.request");
  });
});
