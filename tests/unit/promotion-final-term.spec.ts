import "../support/env";
import { test, expect } from "@playwright/test";
import { finalTermGap, finalTermGapText } from "@/lib/promotion/choices";
import { finalTermGap as reExported } from "@/lib/promotion/rules";

// The advice at the confirm step of a promotion (task 0047, decision D8 of task 0031): how many pupils on the roll have no published marks for the session's final period. Advice, never a refusal.

const periods = [
  { ordinal: 1, label: "First Term" },
  { ordinal: 2, label: "Second Term" },
  { ordinal: 3, label: "Third Term" },
];
const row = (third: number | null, placed = false) => ({ alreadyEnrolledInTarget: placed, termAverages: { 1: 50, 2: 50, 3: third } });

test.describe("who is missing the final term", () => {
  test("counts the pupils with nothing published for the LAST period, however many earlier ones they have", () => {
    expect(finalTermGap(periods, [row(70), row(null), row(null), row(0)])).toEqual({ ordinal: 3, label: "Third Term", pupils: 2 });
  });

  test("a pupil who already has a place in the next session is left alone by a roll, so is not counted", () => {
    expect(finalTermGap(periods, [row(null, true), row(70)])).toBeNull();
    expect(finalTermGap(periods, [row(null, true), row(null)])).toMatchObject({ pupils: 1 });
  });

  test("a mark of zero is a mark; nobody missing, no periods or no pupils is null", () => {
    expect(finalTermGap(periods, [row(0)])).toBeNull();
    expect(finalTermGap(periods, [])).toBeNull();
    expect(finalTermGap([], [row(null)])).toBeNull();
  });

  test("the last period is the highest ordinal, whatever the order of the list", () => {
    const shuffled = [periods[2], periods[0], periods[1]];
    expect(finalTermGap(shuffled, [row(null)])).toMatchObject({ ordinal: 3, label: "Third Term" });
  });

  test("the rules module re-exports the same function for the server", () => {
    expect(reExported).toBe(finalTermGap);
  });
});

test.describe("the sentence", () => {
  test("one pupil and several are each grammatical, and it names the term", () => {
    expect(finalTermGapText({ label: "Third Term", pupils: 1 })).toBe(
      "1 pupil has no published marks for Third Term, so their average leaves it out.",
    );
    expect(finalTermGapText({ label: "Third Term", pupils: 12 })).toBe(
      "12 pupils have no published marks for Third Term, so their averages leave it out.",
    );
  });
});
