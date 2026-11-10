import "../support/env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// A browser spec flips the theme through `setTheme` (tests/support/theme.ts), never by assigning `dataset.theme` itself. The colours transition for 150 ms when the theme flips and axe
// samples whatever is painted at that instant, so a spec that scans straight after a hand-made flip fails now and then on `color-contrast`, on a different screen each run. The helper
// returns only after the transitions have finished. Nothing but a check that reads the files stops the next spec from copying the old line, so this is that check.

const E2E = path.join(process.cwd(), "tests", "e2e");
const HAND_MADE_FLIP = /dataset\.theme\s*=(?!=)/;
// The one spec that flips by hand ON PURPOSE, to show what the helper protects against, marks its line with this.
const DELIBERATE = "theme-flip: deliberate";

test("no browser spec flips the theme by hand", () => {
  const offenders: string[] = [];
  for (const file of readdirSync(E2E).filter((name) => name.endsWith(".spec.ts"))) {
    readFileSync(path.join(E2E, file), "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (!line.trimStart().startsWith("//") && !line.includes(DELIBERATE) && HAND_MADE_FLIP.test(line))
          offenders.push(`${file}:${index + 1}: ${line.trim()}`);
      });
  }
  expect(offenders, "use setTheme(page, theme) from ../support/theme, which waits for the colour transition").toEqual([]);
});

test("the guard sees a hand-made flip", () => {
  expect(HAND_MADE_FLIP.test(`await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);`)).toBe(true);
  expect(HAND_MADE_FLIP.test(`const d = document.documentElement.dataset.theme ?? "dark";`)).toBe(false);
  expect(HAND_MADE_FLIP.test(`if (document.documentElement.dataset.theme === "dark") {}`)).toBe(false);
});
