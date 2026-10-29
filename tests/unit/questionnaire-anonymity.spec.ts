import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormStatus } from "@prisma/client";
import { MfaUnavailableError } from "@/lib/auth/mfa/secret-box";
import { dayOnly, participationCode, recordedAt } from "@/lib/forms/participation";
import { withholdSmallSample, type QuestionnaireAnalytics } from "@/lib/forms/questionnaires";

// What an anonymous questionnaire keeps of who answered it (participation.ts), and when its results may be shown (withholdSmallSample). Pure: no database, no server. The same
// rules over HTTP are in tests/api/questionnaire-anonymity.spec.ts.

const FORM = { id: "form-1", isAnonymous: true };

test.describe("the participation code", () => {
  test("a questionnaire that is not anonymous keeps the member's own id", () => {
    expect(participationCode({ id: "form-1", isAnonymous: false }, "student-1")).toBe("student-1");
  });

  test("an anonymous one keeps a code: the same for the same pupil and survey, different for another pupil, another survey", () => {
    const code = participationCode(FORM, "student-1");
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    expect(code).not.toContain("student-1");
    expect(participationCode(FORM, "student-1")).toBe(code);
    expect(participationCode(FORM, "student-2")).not.toBe(code);
    expect(participationCode({ id: "form-2", isAnonymous: true }, "student-1")).not.toBe(code);
  });

  test("the code is keyed: another key gives another code, and without a key there is none (an identity is never stored in its place)", () => {
    const key = process.env.MFA_ENCRYPTION_KEY;
    const code = participationCode(FORM, "student-1");
    try {
      process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
      expect(participationCode(FORM, "student-1")).not.toBe(code);
      delete process.env.MFA_ENCRYPTION_KEY;
      expect(() => participationCode(FORM, "student-1")).toThrow(MfaUnavailableError);
      // a questionnaire that is not anonymous needs no key
      expect(participationCode({ id: "form-1", isAnonymous: false }, "student-1")).toBe("student-1");
    } finally {
      process.env.MFA_ENCRYPTION_KEY = key;
    }
  });

  test("the id and the form cannot be run together into a clash: a pupil id ending where a form id begins gives another code", () => {
    expect(participationCode({ id: "ab", isAnonymous: true }, "c")).not.toBe(participationCode({ id: "a", isAnonymous: true }, "bc"));
  });
});

test.describe("the time an answer records", () => {
  const moment = new Date("2026-10-28T13:45:12.345Z");

  test("dayOnly is midnight UTC of the same day", () => {
    expect(dayOnly(moment).toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(dayOnly(new Date("2026-10-28T23:59:59.999Z")).toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(dayOnly(new Date("2026-10-29T00:00:00.000Z")).toISOString()).toBe("2026-10-29T00:00:00.000Z");
  });

  test("an anonymous questionnaire records the day, any other the moment", () => {
    expect(recordedAt({ isAnonymous: true }, moment).toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(recordedAt({ isAnonymous: false }, moment)).toEqual(moment);
  });
});

test.describe("withholding the results of a small sample", () => {
  const analytics = (over: Partial<QuestionnaireAnalytics> = {}): QuestionnaireAnalytics => ({
    formId: "form-1",
    title: "Survey",
    isAnonymous: true,
    status: FormStatus.PUBLISHED,
    totalResponses: 2,
    questions: [
      {
        formQuestionId: "q1",
        prompt: "Do you feel safe?",
        questionType: BankQuestionType.SINGLE,
        totalAnswers: 2,
        optionCounts: [{ optionId: "yes", label: "Yes", count: 1, percentage: 50 }],
      },
      { formQuestionId: "q2", prompt: "Anything else?", questionType: BankQuestionType.SHORT, totalAnswers: 2, textResponses: ["a", "b"] },
    ],
    ...over,
  });

  test("below the minimum an anonymous survey keeps its questions and nothing else", () => {
    const held = withholdSmallSample(analytics(), 5);
    expect(held).toMatchObject({ suppressed: true, minimumResponses: 5, totalResponses: 2, isAnonymous: true });
    expect(held.questions).toEqual([
      { formQuestionId: "q1", prompt: "Do you feel safe?", questionType: BankQuestionType.SINGLE, totalAnswers: 0 },
      { formQuestionId: "q2", prompt: "Anything else?", questionType: BankQuestionType.SHORT, totalAnswers: 0 },
    ]);
  });

  test("at the minimum and above it the results are shown as they are", () => {
    const shown = analytics({ totalResponses: 5 });
    expect(withholdSmallSample(shown, 5)).toBe(shown);
    const more = analytics({ totalResponses: 40 });
    expect(withholdSmallSample(more, 5)).toBe(more);
  });

  test("a questionnaire that is not anonymous is never withheld", () => {
    const named = analytics({ isAnonymous: false, totalResponses: 1 });
    expect(withholdSmallSample(named, 5)).toBe(named);
  });

  test("the input is not changed", () => {
    const original = analytics();
    const copy = JSON.stringify(original);
    withholdSmallSample(original, 5);
    expect(JSON.stringify(original)).toBe(copy);
  });
});
