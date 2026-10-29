import { test, expect } from "@playwright/test";
import { FormStatus, TurnInStatus } from "@prisma/client";
import {
  validatePaperWorkInput,
  isPaperWorkOpen,
  determineTurnInStatus,
  canPupilRequestMarking,
  computeRollCallSummary,
} from "../../src/lib/forms/paper-work";

test.describe("Paper Work Domain Logic (Task 0032 Slice 8)", () => {
  test("validatePaperWorkInput enforces title, classGroupIds, duration, and scheduling bounds", () => {
    // Missing title
    expect(
      validatePaperWorkInput({
        title: "",
        classGroupIds: ["class-1"],
      }).valid,
    ).toBe(false);

    // Missing classGroupIds
    expect(
      validatePaperWorkInput({
        title: "Weekly Biology Lab Sheet",
        classGroupIds: [],
      }).valid,
    ).toBe(false);

    // closesAt earlier than opensAt
    expect(
      validatePaperWorkInput({
        title: "Weekly Biology Lab Sheet",
        classGroupIds: ["class-1"],
        opensAt: "2026-11-02T10:00:00Z",
        closesAt: "2026-11-01T10:00:00Z",
      }).valid,
    ).toBe(false);

    // Invalid max duration
    expect(
      validatePaperWorkInput({
        title: "Weekly Biology Lab Sheet",
        classGroupIds: ["class-1"],
        maxDurationMinutes: 0,
      }).valid,
    ).toBe(false);

    expect(
      validatePaperWorkInput({
        title: "Weekly Biology Lab Sheet",
        classGroupIds: ["class-1"],
        maxDurationMinutes: 1500,
      }).valid,
    ).toBe(false);

    // Valid input
    const valid = validatePaperWorkInput({
      title: "Weekly Biology Lab Sheet",
      instructions: "Hand in printed worksheet to Room 12.",
      classGroupIds: ["class-1", "class-2"],
      opensAt: "2026-11-01T08:00:00Z",
      closesAt: "2026-11-05T16:00:00Z",
      maxDurationMinutes: 60,
    });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toEqual([]);
  });

  test("isPaperWorkOpen checks publication status, manual close, and time window", () => {
    const baseNow = new Date("2026-11-03T12:00:00Z");

    // Draft form
    expect(
      isPaperWorkOpen(
        {
          status: FormStatus.DRAFT,
          opensAt: "2026-11-01T00:00:00Z",
          closesAt: "2026-11-05T00:00:00Z",
        },
        baseNow,
      ),
    ).toBe(false);

    // Manually closed form
    expect(
      isPaperWorkOpen(
        {
          status: FormStatus.PUBLISHED,
          closedAt: new Date("2026-11-02T10:00:00Z"),
        },
        baseNow,
      ),
    ).toBe(false);

    // Opens in the future
    expect(
      isPaperWorkOpen(
        {
          status: FormStatus.PUBLISHED,
          opensAt: "2026-11-04T00:00:00Z",
        },
        baseNow,
      ),
    ).toBe(false);

    // Closed in the past
    expect(
      isPaperWorkOpen(
        {
          status: FormStatus.PUBLISHED,
          closesAt: "2026-11-02T00:00:00Z",
        },
        baseNow,
      ),
    ).toBe(false);

    // Currently open
    expect(
      isPaperWorkOpen(
        {
          status: FormStatus.PUBLISHED,
          opensAt: "2026-11-01T00:00:00Z",
          closesAt: "2026-11-05T00:00:00Z",
        },
        baseNow,
      ),
    ).toBe(true);
  });

  test("determineTurnInStatus marks submissions as LATE if past form closesAt", () => {
    const deadline = new Date("2026-11-03T15:00:00Z");
    const beforeDeadline = new Date("2026-11-03T14:30:00Z");
    const afterDeadline = new Date("2026-11-03T15:05:00Z");

    // Target is PENDING
    expect(determineTurnInStatus({ closesAt: deadline }, TurnInStatus.PENDING, beforeDeadline)).toBe(TurnInStatus.PENDING);

    // Target is LATE explicitly
    expect(determineTurnInStatus({ closesAt: deadline }, TurnInStatus.LATE, beforeDeadline)).toBe(TurnInStatus.LATE);

    // Handed in before deadline
    expect(determineTurnInStatus({ closesAt: deadline }, TurnInStatus.HANDED_IN, beforeDeadline)).toBe(TurnInStatus.HANDED_IN);

    // Handed in after deadline -> automatically turns into LATE
    expect(determineTurnInStatus({ closesAt: deadline }, TurnInStatus.HANDED_IN, afterDeadline)).toBe(TurnInStatus.LATE);
  });

  test("canPupilRequestMarking permits request only when open and pending", () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const openForm = {
      status: FormStatus.PUBLISHED,
      opensAt: "2026-11-01T00:00:00Z",
      closesAt: "2026-11-05T00:00:00Z",
    };

    // Already marked as HANDED_IN
    const handedIn = canPupilRequestMarking({ status: TurnInStatus.HANDED_IN }, openForm, now);
    expect(handedIn.allowed).toBe(false);
    expect(handedIn.reason).toContain("already been marked as submitted");

    // Already marked as LATE
    const late = canPupilRequestMarking({ status: TurnInStatus.LATE }, openForm, now);
    expect(late.allowed).toBe(false);

    // Closed form
    const closed = canPupilRequestMarking(
      { status: TurnInStatus.PENDING },
      { ...openForm, closedAt: new Date("2026-11-02T10:00:00Z") },
      now,
    );
    expect(closed.allowed).toBe(false);
    expect(closed.reason).toContain("closed by the teacher");

    // Valid pending pupil request
    const valid = canPupilRequestMarking({ status: TurnInStatus.PENDING }, openForm, now);
    expect(valid.allowed).toBe(true);
  });

  test("computeRollCallSummary compiles counts, requested marking, and completion rate", () => {
    const turnIns = [
      { status: TurnInStatus.HANDED_IN },
      { status: TurnInStatus.HANDED_IN },
      { status: TurnInStatus.LATE },
      { status: TurnInStatus.PENDING, requestedAt: new Date() },
      { status: TurnInStatus.PENDING, requestedAt: null },
    ];

    const summary = computeRollCallSummary(turnIns);
    expect(summary.totalStudents).toBe(5);
    expect(summary.handedInCount).toBe(2);
    expect(summary.lateCount).toBe(1);
    expect(summary.pendingCount).toBe(2);
    expect(summary.requestedMarkingCount).toBe(1);
    expect(summary.completionRate).toBe(60); // 3 out of 5 = 60%
  });
});
