import "../support/env";
import { test, expect } from "@playwright/test";
import type { RollRow } from "@/lib/programs/attendance-service";
import {
  STATUSES,
  STATUS_TEXT,
  allPresent,
  changesExisting,
  offText,
  pendingMarks,
  percentText,
  reasonNeeded,
  remarksShown,
  rollNote,
  shiftDay,
  statusOf,
  unmarkedCount,
  type Draft,
} from "@/components/programs/attendance-model";

// Programs, slice P3: the small decisions of the Attendance tab, without a browser.

const row = (id: string, over: Partial<RollRow> = {}): RollRow => ({
  participantId: id,
  name: id,
  kind: "STUDENT",
  campusId: "A",
  groupPath: "Juz A",
  flag: null,
  listed: true,
  campusOff: false,
  canEdit: true,
  mark: null,
  ...over,
});
const marked = (status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED", over: Record<string, unknown> = {}): RollRow["mark"] => ({
  id: "m",
  status,
  remarks: null,
  version: 1,
  markedBy: "Teacher",
  markedAt: "2026-11-10T08:00:00.000Z",
  updatedAt: "2026-11-10T08:00:00.000Z",
  corrected: false,
  ...over,
});

test.describe("what the screen would save", () => {
  test("only rows the person may edit and has chosen something for; an unchanged choice is not sent", () => {
    const rows = [
      row("new"),
      row("kept", { mark: marked("PRESENT", { version: 3 }) }),
      row("changed", { mark: marked("PRESENT", { version: 2 }) }),
      row("locked", { canEdit: false }),
      row("untouched"),
    ];
    const drafts: Draft = {
      new: { status: "ABSENT", remarks: "  sick  " },
      kept: { status: "PRESENT", remarks: "" },
      changed: { status: "LATE", remarks: "" },
      locked: { status: "PRESENT", remarks: "" },
    };
    expect(pendingMarks(rows, drafts)).toEqual([
      { participantId: "new", status: "ABSENT", remarks: "sick" },
      { participantId: "changed", status: "LATE", remarks: null, version: 2 },
    ]);
  });

  test("a changed note alone is a change, and an empty note equals no note", () => {
    const rows = [
      row("a", { mark: marked("PRESENT", { remarks: "late bus", version: 4 }) }),
      row("b", { mark: marked("ABSENT", { remarks: null }) }),
    ];
    const drafts: Draft = { a: { status: "PRESENT", remarks: "" }, b: { status: "ABSENT", remarks: "   " } };
    expect(pendingMarks(rows, drafts)).toEqual([{ participantId: "a", status: "PRESENT", remarks: null, version: 4 }]);
  });

  test("the status and the note shown are the draft, else the stored mark, else nothing", () => {
    const r = row("a", { mark: marked("LATE", { remarks: "bus" }) });
    expect(statusOf(r, {})).toBe("LATE");
    expect(remarksShown(r, {})).toBe("bus");
    expect(statusOf(r, { a: { status: "ABSENT", remarks: "" } })).toBe("ABSENT");
    expect(remarksShown(r, { a: { status: "ABSENT", remarks: "" } })).toBe("");
    expect(statusOf(row("b"), {})).toBeNull();
    expect(remarksShown(row("b"), {})).toBe("");
  });

  test("a reason is asked only when the server says changes need one AND a mark that exists is being changed", () => {
    const rows = [row("old", { mark: marked("PRESENT") }), row("fresh")];
    const onlyFresh = pendingMarks(rows, { fresh: { status: "PRESENT", remarks: "" } });
    const withOld = pendingMarks(rows, { fresh: { status: "PRESENT", remarks: "" }, old: { status: "ABSENT", remarks: "" } });
    expect(changesExisting(rows, onlyFresh)).toBe(false);
    expect(changesExisting(rows, withOld)).toBe(true);
    const needs = { rights: { create: true, change: true, reasonOnChange: true } };
    const no = { rights: { create: true, change: true, reasonOnChange: false } };
    expect(reasonNeeded(needs, rows, onlyFresh)).toBe(false);
    expect(reasonNeeded(needs, rows, withOld)).toBe(true);
    expect(reasonNeeded(no, rows, withOld)).toBe(false);
  });
});

test.describe("marking everyone present", () => {
  test("fills only the rows that can be written and have no mark and no choice; touches nothing chosen", () => {
    const rows = [row("a"), row("b", { mark: marked("ABSENT") }), row("c"), row("d", { canEdit: false })];
    const next = allPresent(rows, { c: { status: "LATE", remarks: "bus" } });
    expect(next).toEqual({ a: { status: "PRESENT", remarks: "" }, c: { status: "LATE", remarks: "bus" } });
    expect(unmarkedCount(rows, {})).toBe(2);
    expect(unmarkedCount(rows, next)).toBe(0);
  });
});

test.describe("the words", () => {
  const base = {
    attendance: { on: true, offBy: null, campusesOff: [] },
    programStatus: "ACTIVE" as const,
    date: "2026-11-10",
    today: "2026-11-10",
    earliest: "2026-11-04",
  };

  test("every status has a word", () => {
    expect(STATUSES.map((s) => STATUS_TEXT[s])).toEqual(["Present", "Late", "Absent", "Excused"]);
  });

  test("who decided that attendance is off, and what stays on", () => {
    expect(offText({ on: false, offBy: "SCHOOL", campusesOff: [] })).toMatch(/for the school/);
    expect(offText({ on: false, offBy: "PROGRAM", campusesOff: [] })).toMatch(/for this program/);
    expect(offText({ on: false, offBy: "CAMPUS", campusesOff: [{ id: "A", name: "A" }] })).toMatch(/every campus/);
    expect(offText({ on: true, offBy: null, campusesOff: [] })).toBe("On.");
    expect(offText({ on: true, offBy: null, campusesOff: [{ id: "B", name: "Primary" }] })).toMatch(/except in Primary/);
  });

  test("a roll says why it is read only, or what limits the person, and nothing when nothing does", () => {
    expect(rollNote({ ...base, rights: { create: true, change: true, reasonOnChange: false } })).toBeNull();
    expect(
      rollNote({
        ...base,
        attendance: { on: false, offBy: "SCHOOL", campusesOff: [] },
        rights: { create: false, change: false, reasonOnChange: false },
      }),
    ).toMatch(/school/);
    expect(rollNote({ ...base, programStatus: "ARCHIVED", rights: { create: false, change: false, reasonOnChange: false } })).toMatch(
      /isn't active/,
    );
    expect(rollNote({ ...base, date: "2026-11-11", rights: { create: false, change: false, reasonOnChange: false } })).toMatch(
      /hasn't come/,
    );
    expect(rollNote({ ...base, date: "2026-11-01", rights: { create: false, change: false, reasonOnChange: false } })).toMatch(
      /from 4 Nov 2026 onward/,
    );
    expect(rollNote({ ...base, rights: { create: false, change: false, reasonOnChange: false } })).toMatch(/read this roll/);
    expect(rollNote({ ...base, rights: { create: false, change: true, reasonOnChange: true } })).toMatch(/correct a mark that exists/);
    expect(rollNote({ ...base, earliest: null, date: "2026-10-01", rights: { create: true, change: true, reasonOnChange: true } })).toMatch(
      /needs a reason/,
    );
  });

  test("a percentage, and days moved across a month and a year", () => {
    expect(percentText(67)).toBe("67%");
    expect(percentText(0)).toBe("0%");
    expect(percentText(null)).toBe("No marks");
    expect(shiftDay("2026-11-04", -29)).toBe("2026-10-06");
    expect(shiftDay("2027-01-02", -6)).toBe("2026-12-27");
    expect(shiftDay("2028-03-01", -1)).toBe("2028-02-29");
  });
});
