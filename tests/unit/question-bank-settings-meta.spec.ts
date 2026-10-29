import "../support/env";
import { test, expect } from "@playwright/test";
import { BANK_DEFAULTS, BANK_SETTING_KEYS, BANK_SETTING_META, completeBankSettings, parseBankSetting } from "@/lib/question-bank/settings";

// What the Question bank settings screen shows must agree with what the server accepts: the labels, help, bounds and kinds are display data repeated from the
// validators, so a change to one without the other must fail here, not on a screen.

test.describe("the screen's metadata agrees with the validators", () => {
  test("every key has metadata, and nothing else does", () => {
    expect(Object.keys(BANK_SETTING_META).sort()).toEqual([...BANK_SETTING_KEYS].sort());
    for (const key of BANK_SETTING_KEYS) {
      const meta = BANK_SETTING_META[key];
      expect(meta.label.trim().length, key).toBeGreaterThan(3);
      expect(meta.help.trim().length, key).toBeGreaterThan(3);
      expect(meta.stricter.trim().length, key).toBeGreaterThan(3);
    }
  });

  test("the bounds shown are exactly the bounds enforced", () => {
    for (const key of BANK_SETTING_KEYS) {
      const meta = BANK_SETTING_META[key];
      if (meta.kind === "flag") {
        expect(parseBankSetting(key, true).ok && parseBankSetting(key, false).ok, key).toBe(true);
        expect(typeof BANK_DEFAULTS[key], key).toBe("boolean");
      } else if (meta.kind === "choice") {
        // every offered choice is accepted and in order (least first); anything else is not
        expect(meta.choices!.length, key).toBeGreaterThan(1);
        for (const choice of meta.choices!) expect(parseBankSetting(key, choice.value).ok, `${key} ${choice.value}`).toBe(true);
        expect(parseBankSetting(key, "EVERYTHING").ok, key).toBe(false);
        expect(parseBankSetting(key, 1).ok, key).toBe(false);
        expect(
          meta.choices!.map((c) => c.value),
          key,
        ).toContain(BANK_DEFAULTS[key]);
      } else if (meta.kind === "whole" || meta.kind === "images") {
        expect(parseBankSetting(key, meta.min!).ok, `${key} at min`).toBe(true);
        expect(parseBankSetting(key, meta.max!).ok, `${key} at max`).toBe(true);
        expect(parseBankSetting(key, meta.min! - 1).ok, `${key} below min`).toBe(false);
        expect(parseBankSetting(key, meta.max! + 1).ok, `${key} above max`).toBe(false);
      } else {
        expect(parseBankSetting(key, [meta.min!]).ok, `${key} at min`).toBe(true);
        expect(parseBankSetting(key, [meta.max!]).ok, `${key} at max`).toBe(true);
        expect(parseBankSetting(key, [meta.min! - 1]).ok, `${key} below min`).toBe(false);
        expect(parseBankSetting(key, [meta.max! + 1]).ok, `${key} above max`).toBe(false);
      }
    }
  });
});

test.describe("completeBankSettings", () => {
  test("nothing stored is the defaults, as a fresh copy (changing the answer never changes the defaults)", () => {
    const a = completeBankSettings({});
    expect(a).toEqual(BANK_DEFAULTS);
    a["bank.practice.presets"].push(999);
    expect(completeBankSettings({})["bank.practice.presets"]).toEqual([10, 20, 30, 50, 100]);
    expect(BANK_DEFAULTS["bank.practice.presets"]).toEqual([10, 20, 30, 50, 100]);
  });

  test("valid stored values are kept as they are, with no narrowing and no clamping; invalid ones are the default", () => {
    const s = completeBankSettings({
      "bank.practice.maxQuestions": 40,
      "bank.practice.defaultQuestions": 60, // above the maximum: kept, because this is what the administrator chose and settingProblems reports it
      "bank.access.pupils": "no",
      "bank.nope": 1,
    });
    expect(s["bank.practice.maxQuestions"]).toBe(40);
    expect(s["bank.practice.defaultQuestions"]).toBe(60);
    expect(s["bank.access.pupils"]).toBe(true);
    expect(Object.keys(s).sort()).toEqual([...BANK_SETTING_KEYS].sort());
  });

  test("prototype names and inherited properties are not read", () => {
    const rows = Object.create({ "bank.practice.maxQuestions": 1 }) as Record<string, unknown>;
    expect(completeBankSettings(rows)["bank.practice.maxQuestions"]).toBe(100);
  });
});
