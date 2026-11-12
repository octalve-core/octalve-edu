import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { INFO_TIPS } from "@/components/ui/info-tips";

// The words of every info icon (task 0055) live in one registry, and this holds every sentence to the same rules, so a tip cannot be a paragraph, a slogan, a repeat of another tip or a
// leftover nobody shows. What a tip SAYS being true of the screen is checked by reading the screen's source when it is written (the pull request lists each one); a test cannot do that.

const entries = Object.entries(INFO_TIPS) as [string, string][];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(tsx|ts)$/.test(entry.name) ? [full] : [];
  });
}

test.describe("the info-tip registry", () => {
  test("has tips, and every key is a dotted lowercase name", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [key] of entries) expect(key, key).toMatch(/^[a-z]+(\.[a-z]+)+$/);
  });

  test("every tip is one or two short sentences of 20 to 200 characters that end in a full stop", () => {
    for (const [key, text] of entries) {
      expect(text.length, `${key} is too short`).toBeGreaterThanOrEqual(20);
      expect(text.length, `${key} is too long`).toBeLessThanOrEqual(200);
      expect(text, `${key} must end in a full stop`).toMatch(/\.$/);
      expect(text, `${key} must start with a capital letter`).toMatch(/^[A-Z]/);
      expect(text, `${key} has stray spaces`).toBe(text.trim().replace(/\s{2,}/g, " "));
      const sentences = text.split(/(?<=\.)\s+(?=[A-Z])/);
      expect(sentences.length, `${key} is more than two sentences`).toBeLessThanOrEqual(2);
    }
  });

  test("no two keys say the same thing", () => {
    const seen = new Map<string, string>();
    for (const [key, text] of entries) {
      const normal = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      expect(seen.get(normal), `${key} repeats ${seen.get(normal)}`).toBeUndefined();
      seen.set(normal, key);
    }
  });

  test("no tip is made of jargon the school does not use, an instruction, or a promise", () => {
    for (const [key, text] of entries) {
      expect(text, `${key} gives an instruction the button already gives`).not.toMatch(/^(click|press|tap|select|please)\b/i);
      expect(text, `${key} makes a promise`).not.toMatch(/\b(always|guarantee|guaranteed|never fails)\b/i);
      expect(text, `${key} uses jargon`).not.toMatch(/\b(api|endpoint|payload|dto|enum|uuid|json)\b/i);
    }
  });

  test("every key is used by a screen, and every key a screen uses exists", () => {
    const sources = walk(path.resolve(__dirname, "../../src"))
      .filter((file) => !file.endsWith(path.join("components", "ui", "info-tips.ts")))
      .map((file) => fs.readFileSync(file, "utf-8"))
      .join("\n");
    for (const [key] of entries) expect(sources, `${key} is in the registry but no screen shows it`).toContain(`"${key}"`);
    // a `tip="..."` or `info="..."` on a screen must name a key that exists
    const used = [...sources.matchAll(/\b(?:tip|info)=["']([^"']+)["']/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) expect(Object.keys(INFO_TIPS), `a screen shows an unknown tip "${key}"`).toContain(key);
  });
});
