import "../support/env";
import { test, expect } from "@playwright/test";
import { BankQuestionType, BankVisibility, QuestionType, Role } from "@prisma/client";
import {
  isExposedToPractice,
  copyFromBankItem,
  isTemplateHidden,
  prepareOfferBackPayload,
  mapBankTypeToQuizType,
  mapQuizTypeToBankType,
} from "@/lib/question-bank/assessments";
import { parseItem } from "@/lib/question-bank/item-input";

const NOW = new Date("2026-10-27T12:00:00Z");
const PAST = new Date("2026-10-01T00:00:00Z");
const FUTURE = new Date("2026-12-01T00:00:00Z");

test.describe("Question Bank - Slice 3: isExposedToPractice", () => {
  test("an item in PRACTICE visibility is always exposed to practice", () => {
    expect(isExposedToPractice({ visibility: BankVisibility.PRACTICE }, NOW)).toBe(true);
    expect(isExposedToPractice({ visibility: BankVisibility.PRACTICE, visibleFrom: null }, NOW)).toBe(true);
  });

  test("an item in TEACHERS_ONLY is never exposed to practice", () => {
    expect(isExposedToPractice({ visibility: BankVisibility.TEACHERS_ONLY }, NOW)).toBe(false);
  });

  test("an item in TEACHERS_ONLY_UNTIL is exposed only if visibleFrom has arrived or passed", () => {
    // Past date has arrived -> pupils can see it -> exposed
    expect(isExposedToPractice({ visibility: BankVisibility.TEACHERS_ONLY_UNTIL, visibleFrom: PAST }, NOW)).toBe(true);

    // Future date -> pupils cannot see it yet -> NOT exposed
    expect(isExposedToPractice({ visibility: BankVisibility.TEACHERS_ONLY_UNTIL, visibleFrom: FUTURE }, NOW)).toBe(false);

    // No date set -> safe fallback: not exposed
    expect(isExposedToPractice({ visibility: BankVisibility.TEACHERS_ONLY_UNTIL, visibleFrom: null }, NOW)).toBe(false);
  });
});

test.describe("Question Bank - Slice 3: type mapping", () => {
  test("maps BankQuestionType to QuestionType", () => {
    expect(mapBankTypeToQuizType(BankQuestionType.SINGLE)).toBe(QuestionType.MULTIPLE_CHOICE);
    expect(mapBankTypeToQuizType(BankQuestionType.MULTI)).toBe(QuestionType.MULTIPLE_CHOICE);
    expect(mapBankTypeToQuizType(BankQuestionType.TRUE_FALSE)).toBe(QuestionType.TRUE_FALSE);
    expect(mapBankTypeToQuizType(BankQuestionType.SHORT)).toBe(QuestionType.SHORT_ANSWER);
  });

  test("maps QuestionType back to BankQuestionType", () => {
    expect(mapQuizTypeToBankType(QuestionType.MULTIPLE_CHOICE)).toBe(BankQuestionType.SINGLE);
    expect(mapQuizTypeToBankType(QuestionType.TRUE_FALSE)).toBe(BankQuestionType.TRUE_FALSE);
    expect(mapQuizTypeToBankType(QuestionType.SHORT_ANSWER)).toBe(BankQuestionType.SHORT);
  });
});

test.describe("Question Bank - Slice 3: copyFromBankItem", () => {
  const bankItem = {
    id: "item-123",
    version: 3,
    type: BankQuestionType.SINGLE,
    prompt: "What is 2 + 2?",
    options: [
      { id: "opt-1", text: "3" },
      { id: "opt-2", text: "4" },
    ],
    correctAnswer: "opt-2",
    points: 2,
    visibility: BankVisibility.PRACTICE,
    visibleFrom: null,
  };

  test("deep copies question contents and records source link and version", () => {
    const copy = copyFromBankItem(bankItem, { points: 5, sortOrder: 1 }, NOW);

    expect(copy.prompt).toBe("What is 2 + 2?");
    expect(copy.questionType).toBe(QuestionType.MULTIPLE_CHOICE);
    expect(copy.options).toEqual([
      { id: "opt-1", text: "3" },
      { id: "opt-2", text: "4" },
    ]);
    expect(copy.correctAnswer).toBe("opt-2");
    expect(copy.points).toBe(5); // override applied
    expect(copy.sortOrder).toBe(1);
    expect(copy.sourceItemId).toBe("item-123");
    expect(copy.sourceVersion).toBe(3);
    expect(copy.exposedToPractice).toBe(true);
  });

  test("uses default points from bank item if override is omitted", () => {
    const copy = copyFromBankItem(bankItem, undefined, NOW);
    expect(copy.points).toBe(2);
    expect(copy.sortOrder).toBe(0);
  });

  test("marks exposedToPractice false for TEACHERS_ONLY bank items", () => {
    const copy = copyFromBankItem({ ...bankItem, visibility: BankVisibility.TEACHERS_ONLY }, undefined, NOW);
    expect(copy.exposedToPractice).toBe(false);
  });
});

test.describe("Question Bank - Slice 3: isTemplateHidden (Exam Secrecy)", () => {
  test("an assessment that is not an exam template is never hidden", () => {
    expect(
      isTemplateHidden(
        { isExamTemplate: false, createdById: "staff-1" },
        { userId: "user-2", role: Role.TEACHING_STAFF, staffRecordId: "staff-2" },
        NOW,
      ),
    ).toBe(false);
  });

  test("a school admin is never blocked by template hiding", () => {
    expect(
      isTemplateHidden(
        { isExamTemplate: true, createdById: "staff-1", examWindowEnd: FUTURE },
        { userId: "user-admin", role: Role.ADMIN },
        NOW,
      ),
    ).toBe(false);
  });

  test("the author/creator is never blocked from their own template", () => {
    expect(
      isTemplateHidden(
        { isExamTemplate: true, createdById: "staff-1", examWindowEnd: FUTURE },
        { userId: "user-1", role: Role.TEACHING_STAFF, staffRecordId: "staff-1" },
        NOW,
      ),
    ).toBe(false);
  });

  test("other teachers cannot see the template before or during the exam window", () => {
    // Window ends in the future -> hidden from other teachers
    expect(
      isTemplateHidden(
        { isExamTemplate: true, createdById: "staff-1", examWindowEnd: FUTURE },
        { userId: "user-2", role: Role.TEACHING_STAFF, staffRecordId: "staff-2" },
        NOW,
      ),
    ).toBe(true);

    // No window end specified -> stays hidden from other teachers until explicitly unflagged
    expect(
      isTemplateHidden(
        { isExamTemplate: true, createdById: "staff-1", examWindowEnd: null },
        { userId: "user-2", role: Role.TEACHING_STAFF, staffRecordId: "staff-2" },
        NOW,
      ),
    ).toBe(true);
  });

  test("other teachers CAN see the template after the exam window has closed", () => {
    // Window ended in the past -> exam is over -> unhidden
    expect(
      isTemplateHidden(
        { isExamTemplate: true, createdById: "staff-1", examWindowEnd: PAST },
        { userId: "user-2", role: Role.TEACHING_STAFF, staffRecordId: "staff-2" },
        NOW,
      ),
    ).toBe(false);
  });
});

test.describe("Question Bank - Slice 3: prepareOfferBackPayload", () => {
  const quizQuestion = {
    id: "qq-99",
    prompt: "Solve for x: 3x = 12",
    questionType: QuestionType.SHORT_ANSWER,
    options: [],
    correctAnswer: "4",
    points: 3,
    sourceItemId: "existing-item-456",
    sourceVersion: 1,
  };

  test("prepares a valid payload for a brand-new bank item", () => {
    const payload = prepareOfferBackPayload(quizQuestion, {
      subjectLabel: "Mathematics",
      topic: "Algebra",
      difficulty: 2,
    });

    expect(payload.prompt).toBe("Solve for x: 3x = 12");
    expect(payload.type).toBe("SHORT");
    expect(payload.correct).toEqual(["4"]);
    expect(payload.points).toBe(3);
    expect(payload.subject).toBe("Mathematics");
    expect(payload.topic).toBe("Algebra");
    expect(payload.difficulty).toBe(2);
    // Crucial invariant: does NOT attach id or sourceItemId to the new bank item
    expect(payload.id).toBeUndefined();
    expect(payload.sourceItemId).toBeUndefined();

    // Verify it parses cleanly into a StoredItem via parseItem
    const parsed = parseItem(payload);
    expect(parsed.ok).toBe(true);
  });
});
