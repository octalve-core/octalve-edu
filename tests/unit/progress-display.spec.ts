import "../support/env";
import { test, expect } from "@playwright/test";
import {
  DEFAULT_DISPLAY,
  HIJRI_MONTHS_AR,
  HIJRI_MONTHS_EN,
  GREGORIAN_MONTHS_AR,
  MESSAGES,
  PLACE_BI,
  STATUS_BI,
  arabicText,
  bi,
  dateBi,
  hijriOf,
  langsOf,
  parseDisplay,
  rangeBi,
  toArabicDigits,
  weekdayIndex,
} from "@/lib/programs/progress-display";
import { rangeBiOf, ratingBi, rowPartsBi, surahBi, valueBi } from "@/components/programs/progress-model";
import { QURAN_BOOKLET } from "@/lib/programs/progress-templates";
import { SURAHS } from "@/lib/programs/progress-reference";
import { dayText } from "@/components/programs/model";

// Slice R4 (task 0027, section 10): the choices, the digits, the Hijri date, the bilingual words. Pure: nothing here needs a database or a browser.

test.describe("the viewer's choice", () => {
  test("nothing, junk or a half-filled choice becomes a valid one, and a good one is kept", () => {
    expect(parseDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("not json")).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("[1,2]")).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay("42")).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay({ lang: "fr", calendar: "x", digits: 5 })).toEqual(DEFAULT_DISPLAY);
    expect(parseDisplay({ lang: "ar" })).toEqual({ lang: "ar", calendar: "gregorian", digits: "western" });
    const chosen = { lang: "both", calendar: "both", digits: "arabic" } as const;
    expect(parseDisplay(chosen)).toEqual(chosen);
    expect(parseDisplay(JSON.stringify(chosen))).toEqual(chosen);
  });

  test("English is the default, Gregorian and 0-9", () => {
    expect(DEFAULT_DISPLAY).toEqual({ lang: "en", calendar: "gregorian", digits: "western" });
  });

  test("which languages are shown, English first when both", () => {
    expect(langsOf({ ...DEFAULT_DISPLAY, lang: "en" })).toEqual(["en"]);
    expect(langsOf({ ...DEFAULT_DISPLAY, lang: "ar" })).toEqual(["ar"]);
    expect(langsOf({ ...DEFAULT_DISPLAY, lang: "both" })).toEqual(["en", "ar"]);
  });
});

test.describe("digits", () => {
  test("only the digits change: every 0 to 9, nothing else", () => {
    expect(toArabicDigits("0123456789")).toBe("٠١٢٣٤٥٦٧٨٩");
    expect(toArabicDigits("6 Nov 2026")).toBe("٦ Nov ٢٠٢٦");
    expect(toArabicDigits("البقرة 1 إلى 5")).toBe("البقرة ١ إلى ٥");
    expect(toArabicDigits("")).toBe("");
    expect(arabicText("12", "western")).toBe("12");
    expect(arabicText("12", "arabic")).toBe("١٢");
  });
});

test.describe("the Hijri date", () => {
  test("known days of the Umm al-Qura calendar", () => {
    expect(hijriOf("2026-02-18")).toEqual({ year: 1447, month: 9, day: 1 }); // 1 Ramadan 1447
    expect(hijriOf("2026-02-17")).toEqual({ year: 1447, month: 8, day: 29 });
    expect(hijriOf("2026-06-16")).toEqual({ year: 1448, month: 1, day: 1 }); // 1 Muharram 1448
    expect(hijriOf("2026-11-08")).toEqual({ year: 1448, month: 5, day: 28 });
    expect(hijriOf("2025-03-01")).toEqual({ year: 1446, month: 9, day: 1 });
  });

  test("the adjustment moves it by whole days, either way, and a fraction is cut", () => {
    expect(hijriOf("2026-02-18", -1)).toEqual({ year: 1447, month: 8, day: 29 });
    expect(hijriOf("2026-02-17", 1)).toEqual({ year: 1447, month: 9, day: 1 });
    expect(hijriOf("2026-02-18", 2)).toEqual(hijriOf("2026-02-20"));
    expect(hijriOf("2026-02-18", 1.9)).toEqual(hijriOf("2026-02-19"));
  });

  test("an impossible or malformed day has no Hijri date", () => {
    expect(hijriOf("2026-13-40")).toBeNull();
    expect(hijriOf("not a day")).toBeNull();
    expect(hijriOf("")).toBeNull();
  });

  test("twelve month names in each language", () => {
    expect(HIJRI_MONTHS_EN).toHaveLength(12);
    expect(HIJRI_MONTHS_AR).toHaveLength(12);
    expect(GREGORIAN_MONTHS_AR).toHaveLength(12);
    expect(new Set(HIJRI_MONTHS_AR).size).toBe(12);
  });
});

test.describe("a day in both languages", () => {
  test("Gregorian: the English is the very text the rest of the program shows", () => {
    for (const iso of ["2026-11-06", "2026-09-01", "2026-01-31", "2026-12-25"]) {
      expect(dateBi(iso, { calendar: "gregorian" }).en).toBe(dayText(iso));
    }
    expect(dateBi("2026-11-06", { calendar: "gregorian" }).ar).toBe("6 نوفمبر 2026");
  });

  test("Hijri alone, and both together (Gregorian first)", () => {
    expect(dateBi("2026-02-18", { calendar: "hijri" })).toEqual({ en: "1 Ramadan 1447 AH", ar: "1 رمضان 1447 هـ" });
    expect(dateBi("2026-02-18", { calendar: "both" })).toEqual({
      en: `${dayText("2026-02-18")} · 1 Ramadan 1447 AH`,
      ar: "18 فبراير 2026 · 1 رمضان 1447 هـ",
    });
  });

  test("the adjustment reaches the date shown", () => {
    expect(dateBi("2026-02-18", { calendar: "hijri", adjust: -1 }).en).toBe("29 Sha'ban 1447 AH");
    expect(dateBi("2026-02-18", { calendar: "hijri", adjust: 1 }).en).toBe("2 Ramadan 1447 AH");
  });

  test("the day of the week is added when asked, in each language", () => {
    expect(weekdayIndex("2026-11-06")).toBe(5);
    expect(dateBi("2026-11-06", { calendar: "gregorian", weekday: true })).toEqual({ en: "Fri 6 Nov 2026", ar: "الجمعة 6 نوفمبر 2026" });
    expect(dateBi("2026-02-18", { calendar: "hijri", weekday: true }).ar).toBe("الأربعاء 1 رمضان 1447 هـ");
  });

  test("an unreadable day is returned as it came, never thrown", () => {
    expect(dateBi("soon", { calendar: "both" })).toEqual({ en: "soon", ar: "soon" });
  });

  test("a range of days", () => {
    const from = dateBi("2026-11-02", { calendar: "gregorian" });
    const to = dateBi("2026-11-06", { calendar: "gregorian" });
    expect(rangeBi(from, to)).toEqual({ en: "2 Nov 2026 to 6 Nov 2026", ar: "2 نوفمبر 2026 إلى 6 نوفمبر 2026" });
    expect(rangeBi(bi("a"), bi("b"))).toEqual({ en: "a to b", ar: null });
  });
});

test.describe("the module's words", () => {
  test("every status and place has both languages, and the English is what the screens always said", () => {
    expect(STATUS_BI.DRAFT.en).toBe("Draft");
    expect(STATUS_BI.SUBMITTED.en).toBe("Handed in");
    expect(STATUS_BI.VERIFIED.en).toBe("Verified");
    for (const value of Object.values(STATUS_BI)) expect(value.ar).toBeTruthy();
    for (const state of ["ACTIVE", "SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL", "WITHDRAWN", "COMPLETED"]) {
      expect(PLACE_BI[state]?.en).toBeTruthy();
      expect(PLACE_BI[state]?.ar).toBeTruthy();
    }
    expect(PLACE_BI.ACTIVE.en).toBe("Taking part");
  });

  test("the summary lines read as before in English", () => {
    expect(MESSAGES.daysRecorded(1).en).toBe("1 day recorded");
    expect(MESSAGES.daysRecorded(3).en).toBe("3 days recorded");
    expect(MESSAGES.weekOf(bi("3 Nov 2026", "3 نوفمبر 2026"))).toEqual({ en: "Week of 3 Nov 2026", ar: "أسبوع 3 نوفمبر 2026" });
    expect(MESSAGES.weekOf(bi("typed")).ar).toBeNull();
    const line = MESSAGES.trackLine(bi("New text", "الحفظ الجديد"), {
      days: 2,
      ayat: 12,
      from: bi("2. Al-Baqarah 1", "2. البقرة 1"),
      to: bi("2. Al-Baqarah 12", "2. البقرة 12"),
      average: 4.5,
    });
    expect(line.en).toBe("New text: 2 days, 12 ayat, from 2. Al-Baqarah 1 to 2. Al-Baqarah 12, average rating 4.5 of 5");
    expect(line.ar).toBe("الحفظ الجديد: عدد الأيام 2، عدد الآيات 12، من 2. البقرة 1 إلى 2. البقرة 12، متوسط التقدير 4.5 من 5");
    expect(MESSAGES.trackLine(bi("Follow-up", "المتابعة"), { days: 1, ayat: null, from: null, to: null, average: null }).en).toBe(
      "Follow-up: 1 day",
    );
  });
});

test.describe("a value in both languages", () => {
  test("surahs and ranges, the same surah or across two", () => {
    expect(surahBi(2)).toEqual({ en: "2. Al-Baqarah", ar: "2. البقرة" });
    expect(surahBi(999)).toEqual({ en: "999", ar: "999" });
    expect(rangeBiOf({ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 })).toEqual({ en: "Al-Baqarah 1 to 5", ar: "البقرة 1 إلى 5" });
    expect(rangeBiOf({ fromSurah: 2, fromAyah: 286, toSurah: 3, toAyah: 20 })).toEqual({
      en: "Al-Baqarah 286 to Ali 'Imran 20",
      ar: "البقرة 286 إلى آل عمران 20",
    });
  });

  test("every surah of the reference list has an Arabic name to show", () => {
    for (const surah of SURAHS) expect(surahBi(surah.n).ar).toContain(surah.ar);
  });

  test("ratings carry both languages; an unknown one is shown as it is", () => {
    expect(ratingBi(QURAN_BOOKLET, 4)).toEqual({ en: "Very good", ar: "جيد جداً" });
    expect(ratingBi(QURAN_BOOKLET, 9)).toEqual({ en: "9", ar: null });
  });

  test("words somebody typed have no Arabic side, so they are never changed", () => {
    const track = QURAN_BOOKLET.tracks[0];
    const notes = track.columns.find((c) => c.type === "note")!;
    expect(valueBi(notes, "Smooth, no prompting 123", QURAN_BOOKLET)).toEqual({ en: "Smooth, no prompting 123", ar: null });
  });

  test("a row's parts keep the column order, leave out the empty, and carry the Arabic label", () => {
    const track = QURAN_BOOKLET.tracks[0];
    const parts = rowPartsBi(track, { range: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 }, rating: 5, notes: "" }, QURAN_BOOKLET);
    expect(parts.map((p) => p.key)).toEqual(["range", "rating"]);
    expect(parts[0].label.ar).toBeTruthy();
    expect(parts[1].text).toEqual({ en: "Excellent", ar: "ممتاز" });
  });
});

test.describe("days that do not exist", () => {
  test("the 31st of April, the 30th of February and month 13 are refused, a leap day is kept", () => {
    expect(hijriOf("2026-04-31")).toBeNull();
    expect(hijriOf("2026-02-30")).toBeNull();
    expect(hijriOf("2026-13-01")).toBeNull();
    expect(hijriOf("2028-02-29")).not.toBeNull();
    expect(hijriOf("2027-02-29")).toBeNull();
    expect(dateBi("2026-04-31", { calendar: "both" })).toEqual({ en: "2026-04-31", ar: "2026-04-31" });
  });
});
