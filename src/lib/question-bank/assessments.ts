import { BankQuestionType, BankVisibility, QuestionType, Prisma, Role } from "@prisma/client";

/**
 * Maps bank-specific question types to assessment/quiz question types.
 */
export function mapBankTypeToQuizType(bankType: BankQuestionType): QuestionType {
  switch (bankType) {
    case BankQuestionType.SINGLE:
    case BankQuestionType.MULTI:
      return QuestionType.MULTIPLE_CHOICE;
    case BankQuestionType.TRUE_FALSE:
      return QuestionType.TRUE_FALSE;
    case BankQuestionType.SHORT:
      return QuestionType.SHORT_ANSWER;
    default:
      return QuestionType.SHORT_ANSWER;
  }
}

/**
 * Maps assessment/quiz question types back to bank question types.
 */
export function mapQuizTypeToBankType(quizType: QuestionType): BankQuestionType {
  switch (quizType) {
    case QuestionType.MULTIPLE_CHOICE:
      return BankQuestionType.SINGLE;
    case QuestionType.TRUE_FALSE:
      return BankQuestionType.TRUE_FALSE;
    case QuestionType.SHORT_ANSWER:
      return BankQuestionType.SHORT;
    default:
      return BankQuestionType.SHORT;
  }
}

/**
 * Determines whether a bank item is in (or has reached) the practice pool for pupils.
 * (Design Rule 7.3: a practice-pool question chosen for an exam records exposedToPractice = true).
 */
export function isExposedToPractice(
  item: {
    visibility: BankVisibility;
    visibleFrom?: Date | string | null;
  },
  now = new Date(),
): boolean {
  if (item.visibility === BankVisibility.PRACTICE) {
    return true;
  }
  if (item.visibility === BankVisibility.TEACHERS_ONLY_UNTIL && item.visibleFrom) {
    return new Date(item.visibleFrom) <= now;
  }
  return false;
}

export interface BankItemToCopy {
  id: string;
  version: number;
  type: BankQuestionType;
  prompt: string;
  options: Prisma.JsonValue | unknown;
  correctAnswer: Prisma.JsonValue | string | null;
  points: number;
  visibility: BankVisibility;
  visibleFrom?: Date | string | null;
}

export interface CopiedQuizQuestion {
  prompt: string;
  questionType: QuestionType;
  options: Prisma.InputJsonValue;
  correctAnswer: string;
  points: number;
  sortOrder: number;
  sourceItemId: string;
  sourceVersion: number;
  exposedToPractice: boolean;
}

/**
 * Deep-copies an item from the Question Bank into an assessment question.
 * (Design Rule 4: Copy on use. Past papers and active attempts are immutable).
 */
export function copyFromBankItem(
  bankItem: BankItemToCopy,
  overrides?: { points?: number; sortOrder?: number },
  now = new Date(),
): CopiedQuizQuestion {
  let answerStr = "";
  if (typeof bankItem.correctAnswer === "string") {
    answerStr = bankItem.correctAnswer;
  } else if (Array.isArray(bankItem.correctAnswer)) {
    answerStr = bankItem.correctAnswer.join(", ");
  } else if (bankItem.correctAnswer !== null && bankItem.correctAnswer !== undefined) {
    answerStr = String(bankItem.correctAnswer);
  }

  const optionsJson = (Array.isArray(bankItem.options) ? bankItem.options : []) as Prisma.InputJsonValue;

  return {
    prompt: bankItem.prompt,
    questionType: mapBankTypeToQuizType(bankItem.type),
    options: optionsJson,
    correctAnswer: answerStr,
    points: overrides?.points !== undefined ? overrides.points : bankItem.points,
    sortOrder: overrides?.sortOrder !== undefined ? overrides.sortOrder : 0,
    sourceItemId: bankItem.id,
    sourceVersion: bankItem.version,
    exposedToPractice: isExposedToPractice(bankItem, now),
  };
}

export interface TemplateHidingFacts {
  isExamTemplate: boolean;
  examWindowStart?: Date | string | null;
  examWindowEnd?: Date | string | null;
  createdById?: string | null;
}

/**
 * Checks whether an exam template is hidden from a staff member.
 * (Design Section 7.6: A teacher's personal template used by a scheduled exam
 * is hidden from sharing, copying and browsing until the exam closes; the owner still sees it).
 */
export function isTemplateHidden(
  facts: TemplateHidingFacts,
  viewer: { userId: string; role: Role; staffRecordId?: string | null },
  now = new Date(),
): boolean {
  if (!facts.isExamTemplate) {
    return false;
  }
  if (viewer.role === Role.ADMIN) {
    return false;
  }
  if (facts.createdById && viewer.staffRecordId && facts.createdById === viewer.staffRecordId) {
    return false;
  }
  if (facts.createdById && facts.createdById === viewer.userId) {
    return false;
  }

  // If the scheduled exam window has ended, it is no longer hidden
  if (facts.examWindowEnd && new Date(facts.examWindowEnd) < now) {
    return false;
  }

  // Before or during the exam window, or if examWindowEnd is open-ended, hide it from other teachers
  return true;
}

export interface OfferBackMetadata {
  subjectLabel?: string;
  topic?: string;
  difficulty?: number;
}

export type OfferedBackPayload = Record<string, unknown>;

/**
 * Prepares an assessment question to be offered back to the Question Bank as a new item.
 * (Design Section 8.3: A copy that differs from its source can be offered as a new bank item,
 * never an overwrite).
 * Formats the question into a valid itemBody payload ready for parseItem.
 */
export function prepareOfferBackPayload(
  question: {
    prompt: string;
    questionType: QuestionType;
    options: Prisma.JsonValue | unknown;
    correctAnswer: string;
    points: number;
  },
  metadata: OfferBackMetadata = {},
): OfferedBackPayload {
  const type = mapQuizTypeToBankType(question.questionType);
  const base: Record<string, unknown> = {
    prompt: question.prompt,
    points: question.points,
    subject: metadata.subjectLabel,
    topic: metadata.topic,
    difficulty: metadata.difficulty,
  };

  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const optionTexts: string[] = rawOptions.map((opt: unknown) => {
    if (typeof opt === "string") return opt;
    if (typeof opt === "object" && opt !== null && "text" in opt) {
      return String((opt as { text: unknown }).text);
    }
    return String(opt);
  });

  switch (type) {
    case BankQuestionType.SINGLE: {
      let correctIdx = 0;
      if (Array.isArray(question.options)) {
        const found = question.options.findIndex((opt: unknown) => {
          if (typeof opt === "object" && opt !== null && "id" in opt) {
            return (opt as { id: unknown }).id === question.correctAnswer;
          }
          if (typeof opt === "string") {
            return opt === question.correctAnswer;
          }
          return false;
        });
        if (found >= 0) correctIdx = found;
        else {
          const num = parseInt(question.correctAnswer, 10);
          if (!isNaN(num) && num >= 0 && num < optionTexts.length) correctIdx = num;
        }
      }
      return {
        ...base,
        type: "SINGLE",
        options: optionTexts.length >= 2 ? optionTexts : ["Option A", "Option B"],
        correct: correctIdx,
      };
    }
    case BankQuestionType.MULTI: {
      const correctArr = question.correctAnswer.split(",").map((s) => s.trim());
      const correctIndices: number[] = [];
      if (Array.isArray(question.options)) {
        question.options.forEach((opt: unknown, idx: number) => {
          if (typeof opt === "object" && opt !== null && "id" in opt) {
            if (correctArr.includes(String((opt as { id: unknown }).id))) correctIndices.push(idx);
          } else if (typeof opt === "string" && correctArr.includes(opt)) {
            correctIndices.push(idx);
          }
        });
      }
      return {
        ...base,
        type: "MULTI",
        options: optionTexts.length >= 2 ? optionTexts : ["Option A", "Option B"],
        correct: correctIndices.length > 0 ? correctIndices : [0],
      };
    }
    case BankQuestionType.TRUE_FALSE: {
      const isTrue = question.correctAnswer.toLowerCase() === "true";
      return {
        ...base,
        type: "TRUE_FALSE",
        correct: isTrue,
      };
    }
    case BankQuestionType.SHORT:
    default: {
      const accepted = question.correctAnswer?.trim() ? [question.correctAnswer.trim()] : ["Correct answer"];
      return {
        ...base,
        type: "SHORT",
        correct: accepted,
      };
    }
  }
}
