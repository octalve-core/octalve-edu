import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, FormStatus, FormAudienceKind } from "@prisma/client";
import {
  isFormOpen,
  scrubFormQuestionForPupil,
  scrubFormQuestionsForPupil,
  evaluateFormAnswer,
  evaluateFormSubmission,
  isPupilAudienceEligible,
  validatePracticeSetInput,
} from "../../src/lib/forms/practice-sets";

test.describe("Practice Sets & Forms Domain Logic (Task 0032 Slice 6)", () => {
  test.describe("isFormOpen", () => {
    test("returns NOT_PUBLISHED when form is in DRAFT, CLOSED, or ARCHIVED status", () => {
      expect(isFormOpen({ status: FormStatus.DRAFT }).isOpen).toBe(false);
      expect(isFormOpen({ status: FormStatus.DRAFT }).reason).toBe("NOT_PUBLISHED");

      expect(isFormOpen({ status: FormStatus.CLOSED }).isOpen).toBe(false);
      expect(isFormOpen({ status: FormStatus.CLOSED }).reason).toBe("NOT_PUBLISHED");

      expect(isFormOpen({ status: FormStatus.ARCHIVED }).isOpen).toBe(false);
      expect(isFormOpen({ status: FormStatus.ARCHIVED }).reason).toBe("NOT_PUBLISHED");
    });

    test("returns NOT_YET_OPEN when current time is earlier than opensAt", () => {
      const future = new Date("2026-11-01T10:00:00Z");
      const now = new Date("2026-10-28T10:00:00Z");
      const res = isFormOpen({ status: FormStatus.PUBLISHED, opensAt: future }, now);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toBe("NOT_YET_OPEN");
    });

    test("returns CLOSED when current time is past closesAt", () => {
      const past = new Date("2026-10-25T10:00:00Z");
      const now = new Date("2026-10-28T10:00:00Z");
      const res = isFormOpen({ status: FormStatus.PUBLISHED, closesAt: past }, now);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toBe("CLOSED");
    });

    test("returns isOpen: true when form is PUBLISHED and within date range", () => {
      const opens = new Date("2026-10-20T10:00:00Z");
      const closes = new Date("2026-11-05T10:00:00Z");
      const now = new Date("2026-10-28T10:00:00Z");
      const res = isFormOpen({ status: FormStatus.PUBLISHED, opensAt: opens, closesAt: closes }, now);
      expect(res.isOpen).toBe(true);
      expect(res.reason).toBeUndefined();
    });
  });

  test.describe("scrubFormQuestionForPupil", () => {
    test("removes correctAnswer and explanation completely from pupil payload", () => {
      const question = {
        id: "q1",
        prompt: "What is 2 + 2?",
        questionType: BankQuestionType.SINGLE,
        options: [
          { id: "A", text: "3" },
          { id: "B", text: "4" },
        ],
        points: 2,
        sortOrder: 1,
        correctAnswer: "B",
        explanation: "Simple arithmetic.",
      };

      const scrubbed = scrubFormQuestionForPupil(question);
      expect(scrubbed).toEqual({
        id: "q1",
        prompt: "What is 2 + 2?",
        questionType: BankQuestionType.SINGLE,
        options: [
          { id: "A", text: "3" },
          { id: "B", text: "4" },
        ],
        points: 2,
        sortOrder: 1,
      });

      expect("correctAnswer" in scrubbed).toBe(false);
      expect("explanation" in scrubbed).toBe(false);
    });

    test("sorts questions by sortOrder ascending", () => {
      const questions = [
        { id: "q3", prompt: "Q3", questionType: BankQuestionType.SINGLE, options: [], points: 1, sortOrder: 3 },
        { id: "q1", prompt: "Q1", questionType: BankQuestionType.SINGLE, options: [], points: 1, sortOrder: 1 },
        { id: "q2", prompt: "Q2", questionType: BankQuestionType.SINGLE, options: [], points: 1, sortOrder: 2 },
      ];

      const scrubbed = scrubFormQuestionsForPupil(questions);
      expect(scrubbed.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    });
  });

  test.describe("evaluateFormAnswer", () => {
    test("evaluates SINGLE choice with case-insensitive matching", () => {
      const q = { questionType: BankQuestionType.SINGLE, correctAnswer: "B", points: 3 };
      expect(evaluateFormAnswer(q, "B")).toEqual({ isCorrect: true, score: 3 });
      expect(evaluateFormAnswer(q, "b")).toEqual({ isCorrect: true, score: 3 });
      expect(evaluateFormAnswer(q, "A")).toEqual({ isCorrect: false, score: 0 });
      expect(evaluateFormAnswer(q, null)).toEqual({ isCorrect: false, score: 0 });
    });

    test("evaluates TRUE_FALSE with various boolean expressions", () => {
      const q = { questionType: BankQuestionType.TRUE_FALSE, correctAnswer: "TRUE", points: 2 };
      expect(evaluateFormAnswer(q, "true")).toEqual({ isCorrect: true, score: 2 });
      expect(evaluateFormAnswer(q, "True")).toEqual({ isCorrect: true, score: 2 });
      expect(evaluateFormAnswer(q, "T")).toEqual({ isCorrect: true, score: 2 });
      expect(evaluateFormAnswer(q, "false")).toEqual({ isCorrect: false, score: 0 });
    });

    test("evaluates MULTI choice comparing sets of selected options", () => {
      const q = { questionType: BankQuestionType.MULTI, correctAnswer: '["A", "C"]', points: 4 };
      expect(evaluateFormAnswer(q, ["A", "C"])).toEqual({ isCorrect: true, score: 4 });
      expect(evaluateFormAnswer(q, ["c", "a"])).toEqual({ isCorrect: true, score: 4 });
      expect(evaluateFormAnswer(q, "A, C")).toEqual({ isCorrect: true, score: 4 });
      expect(evaluateFormAnswer(q, ["A"])).toEqual({ isCorrect: false, score: 0 });
      expect(evaluateFormAnswer(q, ["A", "B", "C"])).toEqual({ isCorrect: false, score: 0 });
    });

    test("evaluates SHORT answer with whitespace and case normalization", () => {
      const q = { questionType: BankQuestionType.SHORT, correctAnswer: "Photosynthesis", points: 5 };
      expect(evaluateFormAnswer(q, "photosynthesis")).toEqual({ isCorrect: true, score: 5 });
      expect(evaluateFormAnswer(q, "  Photosynthesis  ")).toEqual({ isCorrect: true, score: 5 });
      expect(evaluateFormAnswer(q, "photo synthesis")).toEqual({ isCorrect: false, score: 0 });
      expect(evaluateFormAnswer(q, "respiration")).toEqual({ isCorrect: false, score: 0 });
    });
  });

  test.describe("evaluateFormSubmission", () => {
    test("calculates total scores, accuracy percentage and attaches explanations", () => {
      const questions = [
        { id: "q1", questionType: BankQuestionType.SINGLE, correctAnswer: "B", explanation: "Exp 1", points: 2 },
        { id: "q2", questionType: BankQuestionType.TRUE_FALSE, correctAnswer: "FALSE", explanation: "Exp 2", points: 3 },
      ];

      const answers = [
        { formQuestionId: "q1", value: "B" }, // correct: +2
        { formQuestionId: "q2", value: "TRUE" }, // incorrect: 0
      ];

      const result = evaluateFormSubmission(questions, answers);
      expect(result.totalScore).toBe(2);
      expect(result.maxScore).toBe(5);
      expect(result.accuracyPercentage).toBe(40.0);
      expect(result.evaluatedAnswers.length).toBe(2);
      expect(result.evaluatedAnswers[0].isCorrect).toBe(true);
      expect(result.evaluatedAnswers[0].correctAnswer).toBe("B");
      expect(result.evaluatedAnswers[0].explanation).toBe("Exp 1");
      expect(result.evaluatedAnswers[1].isCorrect).toBe(false);
      expect(result.evaluatedAnswers[1].explanation).toBe("Exp 2");
    });
  });

  test.describe("isPupilAudienceEligible", () => {
    test("allows public audience unconditionally", () => {
      const aud = { kind: FormAudienceKind.PUBLIC, roles: [], classGroupIds: [] };
      expect(isPupilAudienceEligible(aud, null)).toBe(true);
      expect(isPupilAudienceEligible(aud, "grp1")).toBe(true);
    });

    test("verifies member role and classGroup eligibility", () => {
      const aud1 = { kind: FormAudienceKind.MEMBERS, roles: ["STUDENT"], classGroupIds: ["grp1", "grp2"] };
      expect(isPupilAudienceEligible(aud1, "grp1")).toBe(true);
      expect(isPupilAudienceEligible(aud1, "grp3")).toBe(false);
      expect(isPupilAudienceEligible(aud1, null)).toBe(false);

      const staffOnlyAud = { kind: FormAudienceKind.MEMBERS, roles: ["TEACHING_STAFF"], classGroupIds: [] };
      expect(isPupilAudienceEligible(staffOnlyAud, "grp1")).toBe(false);
    });
  });

  test.describe("validatePracticeSetInput", () => {
    test("validates required title and duration constraints", () => {
      expect(validatePracticeSetInput({ title: "" })).toEqual({ ok: false, message: "Title is required." });
      expect(validatePracticeSetInput({ title: "Valid Title" })).toEqual({ ok: true });

      expect(
        validatePracticeSetInput({
          title: "Test",
          opensAt: "2026-10-30T10:00:00Z",
          closesAt: "2026-10-25T10:00:00Z",
        }),
      ).toEqual({ ok: false, message: "opensAt must be earlier than closesAt." });

      expect(
        validatePracticeSetInput({
          title: "Test",
          maxDurationMinutes: 0,
        }),
      ).toEqual({ ok: false, message: "maxDurationMinutes must be between 1 and 1440." });
    });
  });
});
