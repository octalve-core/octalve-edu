// The rules the walkthrough guard enforces, as data, so that every rule is tamper-tested: guard.spec.ts feeds each rule its own `tamper` snippet and fails if the rule does not fire.
//
// Two tiers:
//   actor   - things that change what the app does without a person doing it (a database, an API call, a cookie, a forced click). Applies to EVERY file of the walkthrough,
//             the observer library included, with the few named exceptions below.
//   journey - guesses and swallowed failures (if visible, try/catch, evaluate). Applies to the journey files; the observer library (support/walk.ts, overlay.ts, observers.ts, ...)
//             needs some of these to draw the caption bar and listen, and is exempt from this tier only.

export type Tier = "actor" | "journey";

export interface Rule {
  name: string;
  tier: Tier;
  pattern: RegExp;
  reason: string;
  /// A line the rule MUST flag. The guard's own tamper test runs it.
  tamper: string;
  /// Files (by name) where the rule does not apply.
  exceptIn?: string[];
}

export const RULES: Rule[] = [
  // ---- actor tier: nothing may change what the app does except a person's click, key press, file choice, link, back or forward ----------------------------------------------
  {
    name: "page.request",
    tier: "actor",
    pattern: /\b(?:page|context)\.request\b|\bAPIRequestContext\b|\brequest\.newContext\b/,
    reason: "Direct API calls forbidden; real user UI only.",
    tamper: 'await page.request.post("/api/backdoor");',
  },
  {
    name: "fetch",
    tier: "actor",
    pattern: /\bfetch\s*\(/,
    reason: "Direct HTTP calls forbidden; real user UI only.",
    tamper: 'const r = await fetch("/api/v1/members");',
  },
  {
    name: "prisma",
    tier: "actor",
    pattern: /\bprisma\b|\bPrismaClient\b|@prisma\/client/,
    reason: "Direct DB access forbidden; UI actions only.",
    tamper: "const u = await prisma.user.findFirst();",
  },
  {
    name: "pg",
    tier: "actor",
    pattern: /from\s+["']pg["']|require\(\s*["']pg["']\s*\)|\bnew\s+(?:Pool|Client)\s*\(/,
    reason: "Direct DB access forbidden; UI actions only.",
    tamper: 'import { Pool } from "pg";',
  },
  {
    name: "shell-out",
    tier: "actor",
    pattern: /\bchild_process\b|\b(?:execSync|spawnSync|execFile|execFileSync)\b/,
    reason: "No shell commands (psql, curl) during a journey.",
    tamper: 'execSync("psql -c \\"select 1\\"");',
  },
  {
    name: "localStorage",
    tier: "actor",
    pattern: /\blocalStorage\b/,
    reason: "Manual storage tampering forbidden.",
    tamper: 'localStorage.setItem("a", "b");',
  },
  {
    name: "sessionStorage",
    tier: "actor",
    pattern: /\bsessionStorage\b/,
    reason: "Manual storage tampering forbidden.",
    tamper: "sessionStorage.clear();",
  },
  {
    name: "cookies",
    tier: "actor",
    pattern: /\b(?:addCookies|clearCookies|storageState)\b|\bdocument\.cookie\b|\.cookies\s*\(|\bindexedDB\b/,
    reason: "Cookie and browser-storage edits forbidden.",
    tamper: 'await context.addCookies([{ name: "s", value: "1", url: "http://localhost" }]);',
  },
  {
    name: "skip",
    tier: "actor",
    pattern: /\b(?:test|it|describe)\.skip\b/,
    reason: "Test skips forbidden; every step must be executed.",
    tamper: 'test.skip(true, "later");',
  },
  {
    name: "fixme",
    tier: "actor",
    pattern: /\b(?:test|it|describe)\.fixme\b/,
    reason: "Test fixme forbidden; every step must pass.",
    tamper: "test.fixme();",
  },
  {
    name: "retries",
    tier: "actor",
    pattern: /\bretries\b/,
    reason: "Retries forbidden inside the journey; a failure is a finding.",
    tamper: "test.describe.configure({ retries: 2 });",
  },
  // A page is loaded once per tab, by Walk.goto, which counts. Any other `.goto(` whose receiver is not a Walk (a name ending in walk) is a jump. Walk itself is the one exception.
  {
    name: "goto",
    tier: "actor",
    pattern: /(?<!walk)\.goto\s*\(/i,
    reason: "page.goto is allowed once per tab and only through Walk.goto.",
    tamper: 'await page.goto("/finance");',
    exceptIn: ["walk.ts"],
  },
  {
    name: "force-click",
    tier: "actor",
    pattern: /\bforce\s*:\s*true\b/,
    reason: "A forced click does what a person could not; fix the screen instead.",
    tamper: "await locator.click({ force: true });",
  },
  {
    name: "fill",
    tier: "actor",
    pattern: /\.fill\s*\(/,
    reason: "Type with key presses (walk.type), never fill.",
    tamper: 'await page.getByLabel("Name").fill("Amina");',
  },
  {
    name: "insert-text",
    tier: "actor",
    pattern: /\binsertText\b/,
    reason: "Type with key presses, not pasted text.",
    tamper: 'await page.keyboard.insertText("Amina");',
  },
  {
    name: "set-input-files",
    tier: "actor",
    pattern: /\.setInputFiles\s*\(/,
    reason: "Choose a file through the native file dialog (filechooser event).",
    tamper: 'await input.setInputFiles("students.csv");',
  },
  {
    name: "dispatch-event",
    tier: "actor",
    pattern: /\.dispatchEvent\s*\(/,
    reason: "Synthetic events are not a person's action.",
    tamper: 'await locator.dispatchEvent("click");',
  },
  // The network is not a person's click. The one exception is the offline page (OFF-01), where a person switches the network off (airplane mode) and on again: walk.goOffline() and
  // walk.goOnline() do that, put a caption on the screen saying so, and tell the observers that the "network is down" lines are expected. Nothing else may call setOffline.
  {
    name: "network-switch",
    tier: "actor",
    pattern: /\.setOffline\s*\(/,
    reason:
      "Switching the network is not a person's click; use walk.goOffline() and walk.goOnline(), the one named exception, which say on screen what is being done.",
    tamper: "await context.setOffline(true);",
    exceptIn: ["walk.ts"],
  },
  {
    name: "fulfill",
    tier: "actor",
    pattern: /\.fulfill\s*\(/,
    reason: "Faking a server reply is forbidden.",
    tamper: 'await route.fulfill({ status: 200, body: "{}" });',
  },
  // ---- journey tier: no guesses, no swallowed failures -------------------------------------------------------------------------------------------------------------------------
  {
    name: "isVisible",
    tier: "journey",
    pattern: /\.(?:isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable)\s*\(/,
    reason: "Conditional checks forbidden; use hard assertions.",
    tamper: 'if (await page.locator("#btn").isVisible()) {}',
  },
  {
    name: "try-catch",
    tier: "journey",
    pattern: /\btry\s*\{|\bcatch\s*[({]|\.catch\s*\(/,
    reason: "Swallowing step failures forbidden; audit must fail on error.",
    tamper: "await walk.click(x).catch(() => {});",
  },
  {
    name: "conditional",
    tier: "journey",
    pattern: /\bif\s*\(|\belse\b|\bswitch\s*\(|\bwhile\s*\(/,
    reason: "A journey does not branch on what it sees; every step is a hard assertion.",
    tamper: 'if (page.url().includes("/setup")) { await walk.click(x); }',
  },
  {
    name: "evaluate",
    tier: "journey",
    pattern: /\.evaluate(?:Handle|All)?\s*\(/,
    reason: "evaluate runs anything in the page; the journey acts only through the walk helpers.",
    tamper: 'await page.evaluate(() => document.querySelector("button")?.click());',
  },
  {
    name: "race",
    tier: "journey",
    pattern: /\bPromise\.(?:race|any)\s*\(/,
    reason: "Racing two outcomes is a conditional in disguise.",
    tamper: "await Promise.race([a, b]);",
  },
  {
    name: "soft-assertion",
    tier: "journey",
    pattern: /\bexpect\.soft\b/,
    reason: "A soft assertion does not fail the step.",
    tamper: "expect.soft(x).toBe(1);",
  },
  {
    name: "route-mock",
    tier: "journey",
    pattern: /\.route\s*\(/,
    reason: "Routing or mocking network calls belongs to the observers only.",
    tamper: 'await page.route("**/api/**", (r) => r.abort());',
  },
];

export interface Violation {
  line: number;
  rule: string;
  reason: string;
}

/// Blanks comments but keeps every line break, so a reported line number is the file's line number. A comment marker inside a string is not a comment.
export function stripComments(source: string): string {
  let out = "";
  let state: "code" | "line" | "block" | "'" | '"' | "`" = "code";
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    const next = source[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        out += "  ";
        i++;
      } else if (c === "/" && next === "*") {
        state = "block";
        out += "  ";
        i++;
      } else {
        if (c === "'" || c === '"' || c === "`") state = c;
        out += c;
      }
    } else if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      } else out += " ";
    } else if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        out += "  ";
        i++;
      } else out += c === "\n" ? c : " ";
    } else {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i++;
      } else if (c === state) state = "code";
    }
  }
  return out;
}

export function findViolations(source: string, options: { file: string; observer: boolean }): Violation[] {
  const found: Violation[] = [];
  const lines = stripComments(source).split("\n");
  lines.forEach((text, index) => {
    for (const rule of RULES) {
      if (rule.tier === "journey" && options.observer) continue;
      if (rule.exceptIn?.includes(options.file)) continue;
      if (rule.pattern.test(text)) found.push({ line: index + 1, rule: rule.name, reason: rule.reason });
    }
  });
  return found;
}
