import "../support/env";
import { test, expect } from "@playwright/test";
import { SURAHS, SURAH_COUNT, TOTAL_AYAT, surahAyat, surahOf } from "@/lib/programs/progress-reference";
import { PRESETS, PRESET_KEYS, QURAN_BOOKLET, SIMPLE_LOG, isPresetKey, readSchema, trackOf } from "@/lib/programs/progress-templates";
import {
  addDays,
  canWrite,
  dayDiff,
  entryDayProblem,
  familyDetail,
  lockActive,
  lockExpiry,
  mayVerify,
  nextFrom,
  parseProfile,
  parseValues,
  periodSummaries,
  rangeAyat,
  rangeProblem,
  statusAfterSave,
  summarise,
  weekDates,
  weekStartOf,
  writerRoles,
  type RangeValue,
} from "@/lib/programs/progress-rules";
import {
  blankDraft,
  draftOf,
  rangeText,
  ratingText,
  rowParts,
  sameValues,
  valueText,
  valuesOf,
} from "@/components/programs/progress-model";

// Progress records (task 0027): the pure rules, the reference list, the presets, and the screen model. No database, no clock.

const range = (fromSurah: number, fromAyah: number, toSurah: number, toAyah: number): RangeValue => ({
  fromSurah,
  fromAyah,
  toSurah,
  toAyah,
});
const newTrack = trackOf(QURAN_BOOKLET, "new")!;

test.describe("the reference list", () => {
  test("has 114 surahs and 6,236 ayat, each with an Arabic and an English name", () => {
    expect(SURAHS).toHaveLength(SURAH_COUNT);
    expect(SURAHS.reduce((total, s) => total + s.ayat, 0)).toBe(TOTAL_AYAT);
    for (const surah of SURAHS) {
      expect(surah.ar.length).toBeGreaterThan(0);
      expect(surah.en.length).toBeGreaterThan(0);
      expect(surah.ayat).toBeGreaterThanOrEqual(3);
    }
    expect(SURAHS.map((s) => s.n)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
  });
  test("spot checks of the counts people know", () => {
    expect(surahAyat(1)).toBe(7);
    expect(surahAyat(2)).toBe(286);
    expect(surahAyat(36)).toBe(83);
    expect(surahAyat(114)).toBe(6);
    expect(surahOf(0)).toBeNull();
    expect(surahOf(115)).toBeNull();
    expect(surahOf(1.5)).toBeNull();
    expect(surahOf(55)?.en).toBe("Ar-Rahman");
  });
});

test.describe("the presets", () => {
  test("each is a template that reads back, with unique track and column keys and a rating scale", () => {
    for (const key of PRESET_KEYS) {
      const schema = PRESETS[key];
      expect(readSchema(JSON.parse(JSON.stringify(schema)))).not.toBeNull();
      expect(new Set(schema.tracks.map((t) => t.key)).size).toBe(schema.tracks.length);
      for (const track of schema.tracks) expect(new Set(track.columns.map((c) => c.key)).size).toBe(track.columns.length);
      expect(schema.ratings.map((r) => r.value)).toEqual([5, 4, 3, 2, 1]);
      expect(schema.weekDays.every((d) => d >= 0 && d <= 6)).toBe(true);
    }
    expect(isPresetKey("QURAN_BOOKLET")).toBe(true);
    expect(isPresetKey("nope")).toBe(false);
    expect(readSchema({ tracks: [] })).toBeNull();
    expect(readSchema(null)).toBeNull();
    expect(readSchema([])).toBeNull();
  });
  test("the booklet follows the paper one: new text, daily revision, follow-up and a private notes track", () => {
    expect(QURAN_BOOKLET.tracks.map((t) => t.key)).toEqual(["new", "revision", "followup", "mistakes"]);
    expect(trackOf(QURAN_BOOKLET, "mistakes")?.summary).toBe("none");
    expect(trackOf(QURAN_BOOKLET, "new")?.oneRowPerDay).toBe(true);
    expect(trackOf(QURAN_BOOKLET, "followup")?.oneRowPerDay).toBe(false);
    expect(QURAN_BOOKLET.weekDays).toEqual([6, 0, 1, 2, 3]);
    expect(SIMPLE_LOG.profile).toEqual([]);
  });
});

test.describe("ranges", () => {
  test("a range inside one surah, across surahs, and the ways one is wrong", () => {
    expect(rangeProblem(range(2, 1, 2, 5))).toBeNull();
    expect(rangeProblem(range(1, 7, 2, 1))).toBeNull();
    expect(rangeProblem(range(2, 287, 2, 287))).toMatch(/has ayat 1 to 286/);
    expect(rangeProblem(range(2, 0, 2, 1))).toMatch(/has ayat 1 to 286/);
    expect(rangeProblem(range(115, 1, 115, 1))).toMatch(/1 to 114/);
    expect(rangeProblem(range(2, 10, 2, 9))).toBe("The end can't be before the start.");
    expect(rangeProblem(range(3, 1, 2, 5))).toBe("The end can't be before the start.");
    expect(rangeProblem({ fromSurah: 1, fromAyah: 1, toSurah: 1 })).toMatch(/Give the surah and ayah/);
    expect(rangeProblem({ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 2, extra: 1 })).toMatch(/Give the surah and ayah/);
    expect(rangeProblem({ fromSurah: "1", fromAyah: 1, toSurah: 1, toAyah: 2 })).toMatch(/whole numbers/);
    expect(rangeProblem({ fromSurah: 1.5, fromAyah: 1, toSurah: 2, toAyah: 2 })).toMatch(/whole numbers/);
    expect(rangeProblem(null)).toMatch(/Give the surah and ayah/);
    expect(rangeProblem([])).toMatch(/Give the surah and ayah/);
  });
  test("counts the ayat, both ends included", () => {
    expect(rangeAyat(range(1, 1, 1, 7))).toBe(7);
    expect(rangeAyat(range(2, 5, 2, 5))).toBe(1);
    expect(rangeAyat(range(1, 6, 2, 3))).toBe(2 + 3);
    expect(rangeAyat(range(112, 1, 114, 6))).toBe(4 + 5 + 6);
    expect(rangeAyat(range(1, 1, 114, 6))).toBe(TOTAL_AYAT);
  });
  test("the next range starts after the last ayah, or at the next surah, and ends after the last surah", () => {
    expect(nextFrom(range(2, 1, 2, 5))).toEqual({ surah: 2, ayah: 6 });
    expect(nextFrom(range(1, 1, 1, 7))).toEqual({ surah: 2, ayah: 1 });
    expect(nextFrom(range(113, 1, 114, 5))).toEqual({ surah: 114, ayah: 6 });
    expect(nextFrom(range(114, 1, 114, 6))).toBeNull();
  });
});

test.describe("checking a row", () => {
  const ok = (values: unknown) => parseValues(newTrack, QURAN_BOOKLET, values);
  test("a good row comes back tidied, in the order of the columns", () => {
    const parsed = ok({ rating: 4, notes: "  Good\r\n  pace  ", range: { toAyah: 5, toSurah: 2, fromAyah: 1, fromSurah: 2 } });
    expect(parsed).toEqual({ ok: true, values: { range: range(2, 1, 2, 5), notes: "Good\n  pace", rating: 4 } });
    expect(Object.keys((parsed as { values: object }).values)).toEqual(["range", "notes", "rating"]);
  });
  test("each way a row can be wrong is said against its own field", () => {
    const problems = (values: unknown) => (ok(values) as { problems: { path: string; message: string }[] }).problems;
    expect(problems({ notes: "x" })).toEqual([{ path: "values.range", message: "Surah and ayah is required." }]);
    expect(problems({})).toEqual([{ path: "values.range", message: "Surah and ayah is required." }]);
    expect(problems({ range: range(2, 1, 2, 5), rating: 9 })[0]).toEqual({
      path: "values.rating",
      message: "Rating must be one of the levels.",
    });
    expect(problems({ range: range(2, 1, 2, 5), rating: "4" })[0]!.path).toBe("values.rating");
    expect(problems({ range: range(2, 1, 2, 500) })[0]!.path).toBe("values.range");
    expect(problems({ range: range(2, 1, 2, 5), colour: "red" })[0]).toEqual({
      path: "values.colour",
      message: "colour is not part of New text.",
    });
    expect(problems({ range: range(2, 1, 2, 5), notes: "x".repeat(501) })[0]!.message).toMatch(/at most 500/);
    expect(problems({ range: range(2, 1, 2, 5), notes: "bad\u0000note" })[0]!.message).toMatch(/not allowed/);
    expect(problems("text")[0]!.path).toBe("values");
    expect(problems(null)[0]!.path).toBe("values");
    expect(problems([])[0]!.path).toBe("values");
  });
  test("empty optional fields are left out, and a row with nothing in it is refused", () => {
    expect(ok({ range: range(1, 1, 1, 2), notes: "   ", rating: "" })).toEqual({ ok: true, values: { range: range(1, 1, 1, 2) } });
    const log = trackOf(SIMPLE_LOG, "log")!;
    expect(parseValues(log, SIMPLE_LOG, { notes: "only a note" })).toMatchObject({ ok: false, problems: [{ path: "values.topic" }] });
    expect(parseValues(trackOf(QURAN_BOOKLET, "followup")!, QURAN_BOOKLET, {})).toMatchObject({
      ok: false,
      problems: [{ path: "values", message: "Fill in at least one thing." }],
    });
  });
  test("the profile accepts its own fields, a choice from the list, and nothing else", () => {
    expect(parseProfile(QURAN_BOOKLET, { age: " 12 ", riwayah: "HAFS", circle: "" })).toEqual({
      ok: true,
      profile: { age: "12", riwayah: "HAFS" },
    });
    expect(parseProfile(QURAN_BOOKLET, { riwayah: "OTHER" })).toMatchObject({ ok: false });
    expect(parseProfile(QURAN_BOOKLET, { shoeSize: "9" })).toMatchObject({ ok: false });
    expect(parseProfile(QURAN_BOOKLET, { age: 12 })).toMatchObject({ ok: false });
    expect(parseProfile(QURAN_BOOKLET, { age: "x".repeat(21) })).toMatchObject({ ok: false });
    expect(parseProfile(QURAN_BOOKLET, [])).toMatchObject({ ok: false });
  });
});

test.describe("days and weeks", () => {
  test("adding days, the difference, and the start of a week that starts on Saturday or Monday", () => {
    expect(addDays("2026-11-01", 3)).toBe("2026-11-04");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayDiff("2026-11-10", "2026-11-03")).toBe(7);
    expect(weekStartOf("2026-11-06", 6)).toBe("2026-10-31"); // a Friday: the week began on Saturday 31 October
    expect(weekStartOf("2026-10-31", 6)).toBe("2026-10-31");
    expect(weekStartOf("2026-11-06", 1)).toBe("2026-11-02");
    expect(weekStartOf("2026-11-01", 1)).toBe("2026-10-26"); // a Sunday
  });
  test("the booklet's week shows Saturday to Wednesday; the simple log's Monday to Friday", () => {
    expect(weekDates("2026-11-04", QURAN_BOOKLET)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(weekDates("2026-11-04", SIMPLE_LOG)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
  test("an entry's date: real, not in the future, not before the place began", () => {
    expect(entryDayProblem("2026-11-05", "2026-11-05", "2026-10-01")).toBeNull();
    expect(entryDayProblem("2026-11-06", "2026-11-05", "2026-10-01")).toBe("An entry can't be dated in the future.");
    expect(entryDayProblem("2026-09-30", "2026-11-05", "2026-10-01")).toBe("That is before this person's place began.");
    expect(entryDayProblem("2026-13-01", "2026-11-05", null)).toBe("That isn't a real date.");
    expect(entryDayProblem("2026-02-30", "2026-11-05", null)).toBe("That isn't a real date.");
    expect(entryDayProblem("nonsense", "2026-11-05", null)).toBe("That isn't a real date.");
  });
});

test.describe("statuses and rights", () => {
  test("a save with verification off is published at once; with it on, a new entry is a draft and a verified one goes back to handed in", () => {
    for (const previous of [null, "DRAFT", "SUBMITTED", "VERIFIED"] as const)
      for (const submit of [false, true]) expect(statusAfterSave(previous, { requireVerification: false, submit })).toBe("VERIFIED");
    expect(statusAfterSave(null, { requireVerification: true, submit: false })).toBe("DRAFT");
    expect(statusAfterSave(null, { requireVerification: true, submit: true })).toBe("SUBMITTED");
    expect(statusAfterSave("DRAFT", { requireVerification: true, submit: false })).toBe("DRAFT");
    expect(statusAfterSave("DRAFT", { requireVerification: true, submit: true })).toBe("SUBMITTED");
    expect(statusAfterSave("SUBMITTED", { requireVerification: true, submit: false })).toBe("SUBMITTED");
    expect(statusAfterSave("VERIFIED", { requireVerification: true, submit: false })).toBe("SUBMITTED");
    expect(statusAfterSave("VERIFIED", { requireVerification: true, submit: true })).toBe("SUBMITTED");
  });
  test("who may verify: an administrator or a supervisor, and not the person who last edited it while four-eyes is on", () => {
    const entry = { lastEditedByUserId: "u1" };
    expect(mayVerify({ admin: true, supervisor: true, userId: "u2" }, entry, true)).toBe(true);
    expect(mayVerify({ admin: false, supervisor: true, userId: "u2" }, entry, true)).toBe(true);
    expect(mayVerify({ admin: false, supervisor: false, userId: "u2" }, entry, true)).toBe(false);
    expect(mayVerify({ admin: true, supervisor: true, userId: "u1" }, entry, true)).toBe(false);
    expect(mayVerify({ admin: true, supervisor: true, userId: "u1" }, entry, false)).toBe(true);
  });
  test("the writers setting names the roles, and a place must be taking part to be written to", () => {
    expect(writerRoles("TEACHERS")).toEqual(["TEACHER"]);
    expect(writerRoles("ASSIGNED")).toEqual(["RECORDER"]);
    expect(writerRoles("BOTH")).toEqual(["TEACHER", "RECORDER"]);
    const mine = { writeAll: false, writeGroups: new Set(["g1"]) };
    expect(canWrite(mine, "g1", "ACTIVE")).toBe(true);
    expect(canWrite(mine, "g2", "ACTIVE")).toBe(false);
    for (const state of ["SUSPENDED", "EXPELLED", "TERMINATED", "ENDED_BY_SCHOOL", "WITHDRAWN", "COMPLETED"])
      expect(canWrite(mine, "g1", state)).toBe(false);
    expect(canWrite({ writeAll: true, writeGroups: new Set() }, "any", "ACTIVE")).toBe(true);
    expect(canWrite({ writeAll: true, writeGroups: new Set() }, "any", "SUSPENDED")).toBe(false);
  });
});

test.describe("the lock", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const lock = (over: Partial<{ expiresAt: Date; releaseAt: Date | null }> = {}) => ({
    holderUserId: "u1",
    heartbeatAt: now,
    expiresAt: new Date(now.getTime() + 300_000),
    releaseAt: null,
    ...over,
  });
  test("holds until it expires or its release time passes", () => {
    expect(lockActive(null, now)).toBe(false);
    expect(lockActive(lock(), now)).toBe(true);
    expect(lockActive(lock({ expiresAt: new Date(now.getTime() - 1) }), now)).toBe(false);
    expect(lockActive(lock({ expiresAt: now }), now)).toBe(false);
    expect(lockActive(lock({ releaseAt: new Date(now.getTime() + 30_000) }), now)).toBe(true);
    expect(lockActive(lock({ releaseAt: now }), now)).toBe(false);
    expect(lockExpiry(now, 300).toISOString()).toBe("2026-11-05T10:05:00.000Z");
  });
});

test.describe("the family summary", () => {
  const rows = [
    { trackKey: "new", entryDate: "2026-11-02", values: { range: range(2, 1, 2, 5), rating: 5 } },
    { trackKey: "new", entryDate: "2026-11-03", values: { range: range(2, 6, 2, 10), rating: 3 } },
    { trackKey: "revision", entryDate: "2026-11-03", values: { range: range(1, 1, 1, 7), rating: 4 } },
    { trackKey: "followup", entryDate: "2026-11-04", values: { surah: 2, notes: "Steady", grade: 4 } },
    { trackKey: "followup", entryDate: "2026-10-01", values: { surah: 1, notes: "Old", grade: 2 } },
    { trackKey: "mistakes", entryDate: "2026-11-03", values: { note: "confuses the endings of ayah" } },
    { trackKey: "new", entryDate: "2026-09-01", values: { range: range(1, 1, 1, 7) } },
  ];
  test("counts days, ayat and the spread of ratings; the latest follow-up; never the private notes", () => {
    const summary = summarise(rows, QURAN_BOOKLET, "2026-11-02", "2026-11-08");
    const track = (key: string) => summary.tracks.find((t) => t.trackKey === key)!;
    expect(summary.daysRecorded).toBe(2);
    expect(track("new")).toMatchObject({
      days: 2,
      ayat: 10,
      from: { surah: 2, ayah: 1 },
      to: { surah: 2, ayah: 10 },
      ratings: { "3": 1, "5": 1 },
      average: 4,
    });
    expect(track("revision")).toMatchObject({ days: 1, ayat: 7 });
    expect(summary.latest).toEqual([
      { trackKey: "followup", label: QURAN_BOOKLET.tracks[2]!.label, date: "2026-11-04", grade: 4, note: "Steady" },
    ]);
    expect(summary.tracks.find((t) => t.trackKey === "mistakes")).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain("confuses");
  });
  test("an empty period is empty, and the weeks run newest first", () => {
    expect(summarise([], QURAN_BOOKLET, "2026-11-02", "2026-11-08")).toMatchObject({ daysRecorded: 0, latest: [] });
    const { weeks, month } = periodSummaries(rows, QURAN_BOOKLET, "2026-11-05", 3);
    expect(weeks.map((w) => w.from)).toEqual(["2026-10-31", "2026-10-24", "2026-10-17"]);
    expect(weeks[0]!.daysRecorded).toBe(2);
    expect(month.from).toBe("2026-11-01");
  });
  test("a guardian sees what the program allows and a pupil always sees their own verified entries", () => {
    expect(familyDetail("PUPIL", "SUMMARY")).toBe("FULL");
    expect(familyDetail("GUARDIAN", "SUMMARY")).toBe("SUMMARY");
    expect(familyDetail("GUARDIAN", "FULL")).toBe("FULL");
  });
});

test.describe("the screen model", () => {
  test("a form's text becomes the values to send, and back", () => {
    const draft = blankDraft(newTrack, { surah: 2, ayah: 6 });
    expect(draft["range.fromSurah"]).toBe("2");
    expect(draft["range.fromAyah"]).toBe("6");
    expect(draft["range.toSurah"]).toBe("2");
    expect(valuesOf(newTrack, draft)).toEqual({ range: { fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 0 } });
    const filled = { ...draft, "range.toAyah": "12", notes: "  fine  ", rating: "4" };
    expect(valuesOf(newTrack, filled)).toEqual({ range: range(2, 6, 2, 12), notes: "fine", rating: 4 });
    expect(draftOf(newTrack, { range: range(1, 1, 1, 7), rating: 5 })).toMatchObject({ "range.toAyah": "7", rating: "5", notes: "" });
    expect(valuesOf(newTrack, blankDraft(newTrack))).toEqual({});
    expect(sameValues({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameValues({ a: 1 }, { a: 2 })).toBe(false);
  });
  test("values read as words", () => {
    expect(rangeText(range(2, 1, 2, 5))).toBe("Al-Baqarah 1 to 5");
    expect(rangeText(range(2, 286, 3, 20))).toBe("Al-Baqarah 286 to Ali 'Imran 20");
    expect(ratingText(QURAN_BOOKLET, 5)).toBe("Excellent");
    const column = newTrack.columns.find((c) => c.key === "rating")!;
    expect(valueText(column, 4, QURAN_BOOKLET)).toBe("Very good");
    expect(rowParts(newTrack, { range: range(1, 1, 1, 7), rating: 3 }, QURAN_BOOKLET)).toEqual([
      { label: "Surah and ayah", text: "Al-Fatihah 1 to 7" },
      { label: "Rating", text: "Good" },
    ]);
  });
});
