// What the staff Forms screens share (Task 0025, slices O1 and O2): the three kinds of form, the draft of a question as the builder holds it, how a draft becomes the body the API takes,
// and the sentences for what is wrong with one. Pure, so the rules are unit-tested; the server checks everything again and says what is wrong, in words.

export type FormKindKey = "PRACTICE_SET" | "QUESTIONNAIRE" | "PAPER_WORK";
export type FormStatusKey = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
export type QuestionType = "SINGLE" | "MULTI" | "TRUE_FALSE" | "SHORT" | "RATING" | "TEXT";

export const KIND_NOUN: Record<FormKindKey, string> = {
  PRACTICE_SET: "practice set",
  QUESTIONNAIRE: "questionnaire",
  PAPER_WORK: "paper work",
};

/// A practice set is marked by the machine, so it only has the kinds of question that have a right answer to compare with.
export const PRACTICE_TYPES: QuestionType[] = ["SINGLE", "MULTI", "TRUE_FALSE", "SHORT"];
/// A questionnaire asks; it has no right answer.
export const QUESTIONNAIRE_TYPES: QuestionType[] = ["SINGLE", "MULTI", "SHORT", "TEXT", "RATING"];

export const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: "Single choice",
  MULTI: "Multiple choice",
  TRUE_FALSE: "True or false",
  SHORT: "Short answer",
  RATING: "Rating (1 to 5)",
  TEXT: "Long answer",
};

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_POINTS = 100;

/// "A", "B", ...: the id of the option at `index`, and what a pupil's answer to a single-choice question is compared with.
export const optionId = (index: number) => String.fromCharCode(65 + index);

export type DraftQuestion = {
  type: QuestionType;
  prompt: string;
  options: string[];
  /// The index of the correct option of a single-choice question.
  single: number;
  /// The indexes of the correct options of a multiple-choice question.
  multi: number[];
  /// The answer of a true/false question.
  truth: boolean;
  /// The text a short answer must match (marked automatically), or the model answer shown to whoever marks it by hand.
  accepted: string;
  /// A practice set's short answer: marked by a teacher (the API's default) or by the machine against `accepted`.
  byHand: boolean;
  points: string;
  explanation: string;
};

export const blankQuestion = (type: QuestionType = "SINGLE"): DraftQuestion => ({
  type,
  prompt: "",
  options: ["", ""],
  single: 0,
  multi: [],
  truth: true,
  accepted: "",
  byHand: true,
  points: "1",
  explanation: "",
});

const hasOptions = (type: QuestionType) => type === "SINGLE" || type === "MULTI";

/// The first thing wrong with a question as written, in a sentence a teacher can act on, or null. `n` is the question's number on screen.
export function questionProblem(q: DraftQuestion, n: number, kind: FormKindKey): string | null {
  if (q.prompt.trim().length === 0) return `Write the question for question ${n}.`;
  if (hasOptions(q.type)) {
    const filled = q.options.filter((o) => o.trim().length > 0);
    if (filled.length < MIN_OPTIONS) return `Question ${n} needs at least ${MIN_OPTIONS} options with text.`;
    if (q.options.some((o) => o.trim().length === 0)) return `Question ${n} has an empty option. Fill it in or remove it.`;
    if (kind === "PRACTICE_SET") {
      if (q.type === "SINGLE" && (q.single < 0 || q.single >= q.options.length)) return `Choose the correct option of question ${n}.`;
      if (q.type === "MULTI" && q.multi.length === 0) return `Tick every correct option of question ${n}.`;
    }
  }
  if (kind === "PRACTICE_SET") {
    if (q.type === "SHORT" && q.accepted.trim().length === 0) return `Write the model answer for question ${n}, to mark against.`;
    const points = Number(q.points);
    if (!Number.isInteger(points) || points < 0 || points > MAX_POINTS)
      return `Points for question ${n} must be a whole number from 0 to ${MAX_POINTS}.`;
  }
  return null;
}

/// The question as the API takes it. A practice set carries its key and points; a questionnaire only asks.
export function questionPayload(q: DraftQuestion, index: number, kind: FormKindKey) {
  const options = hasOptions(q.type) ? q.options.map((text, i) => ({ id: optionId(i), text: text.trim() })) : [];
  const body: Record<string, unknown> = { prompt: q.prompt.trim(), questionType: q.type, sortOrder: index };
  if (options.length > 0) body.options = options;
  if (kind === "PRACTICE_SET") {
    body.points = Number(q.points);
    if (q.explanation.trim()) body.explanation = q.explanation.trim();
    body.correctAnswer =
      q.type === "SINGLE"
        ? optionId(q.single)
        : q.type === "MULTI"
          ? JSON.stringify([...q.multi].sort((a, b) => a - b).map(optionId))
          : q.type === "TRUE_FALSE"
            ? String(q.truth)
            : q.accepted.trim();
  }
  return body;
}

/// A value from a datetime-local input ("2026-12-01T09:00", the browser's own time zone) as the ISO instant the API takes, or null when blank.
export function instantOf(local: string): string | null {
  if (!local.trim()) return null;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export type ListedForm = {
  id: string;
  title: string;
  instructions: string | null;
  status: FormStatusKey;
  opensAt: string | null;
  closesAt: string | null;
  maxDurationMinutes?: number | null;
  questionCount?: number;
  responseCount?: number;
  participationCount?: number;
  isAnonymous?: boolean;
  shareToken?: string | null;
  audience?: { kind: "MEMBERS" | "PUBLIC"; roles?: unknown; classGroupIds?: unknown } | null;
  classGroupIds?: unknown;
  audiences?: { classGroupIds?: unknown }[];
  summary?: {
    totalStudents: number;
    handedInCount: number;
    lateCount: number;
    pendingCount: number;
    requestedMarkingCount: number;
    completionRate: number;
  } | null;
};

export const STATUS_LABEL: Record<FormStatusKey, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => dayFormat.format(new Date(iso));

/// "Opens 1 Dec 2026, 09:00 · Closes 8 Dec 2026, 09:00", or "No dates set".
export function windowText(opensAt: string | null, closesAt: string | null): string {
  const parts = [opensAt ? `Opens ${when(opensAt)}` : null, closesAt ? `Closes ${when(closesAt)}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "No dates set";
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ROLE_CHOICES: { value: string; label: string }[] = [
  { value: "STUDENT", label: "Pupils" },
  { value: "PARENT", label: "Guardians" },
  { value: "TEACHING_STAFF", label: "Teachers" },
  { value: "NON_TEACHING_STAFF", label: "Non-teaching staff" },
  { value: "ADMIN", label: "Administrators" },
];

export const classGroupIdsOf = (form: ListedForm): string[] => {
  const raw = form.classGroupIds ?? form.audience?.classGroupIds ?? form.audiences?.[0]?.classGroupIds;
  return Array.isArray(raw) ? (raw as string[]) : [];
};

/// A stored instant as the value of a datetime-local input (the browser's own time zone, to the minute), or "" when there is none.
export function localInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/// A form as `GET /api/v1/forms/{id}` answers it for staff. `correctAnswer` and `explanation` are there only when the API sent them: for whoever manages the form.
export type DetailQuestion = {
  id: string;
  prompt: string;
  questionType: QuestionType;
  options: unknown;
  correctAnswer?: string | null;
  explanation?: string | null;
  points: number;
  markingMethod: "AUTO" | "MANUAL";
  sortOrder: number;
};
export type FormDetail = {
  id: string;
  title: string;
  instructions: string | null;
  status: FormStatusKey;
  opensAt: string | null;
  closesAt: string | null;
  maxDurationMinutes: number | null;
  questions: DetailQuestion[];
  responseCount: number;
  createdBy: { id: string; name: string | null; email: string } | null;
};

export const optionsOf = (value: unknown): { id: string; text: string }[] =>
  Array.isArray(value)
    ? value.filter(
        (o): o is { id: string; text: string } => !!o && typeof o === "object" && typeof o.id === "string" && typeof o.text === "string",
      )
    : [];

/// The ids of the right option(s) of a choice question, from the stored answer: one id, a JSON array of ids, or "true" / "false".
export function correctIdsOf(q: DetailQuestion): string[] {
  const raw = q.correctAnswer;
  if (raw === undefined || raw === null || raw === "") return [];
  if (q.questionType === "MULTI") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [raw];
}

/// "3 of 5" for a finished attempt; a dash while there is no score to show, never a zero that was never earned.
export function scoreText(status: string, score: number | null, maxScore: number | null): string {
  if (status !== "COMPLETED" || score === null || maxScore === null) return "—";
  return `${score} of ${maxScore}`;
}

/// What a stored answer says, in words: the option's text for a choice question, True or False, "4 out of 5" for a rating, the text itself otherwise.
export function valueText(type: QuestionType, options: unknown, value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "No answer";
  const named = (id: unknown) => optionsOf(options).find((o) => o.id === id)?.text ?? String(id);
  if (type === "SINGLE") return named(value);
  if (type === "MULTI") return (Array.isArray(value) ? value : [value]).map(named).join(", ");
  if (type === "TRUE_FALSE") return value === true || value === "true" ? "True" : "False";
  if (type === "RATING") return `${String(value)} out of 5`;
  // A short-answer key can list several accepted answers.
  if (type === "SHORT" && Array.isArray(value)) return value.map(String).join(" or ");
  return typeof value === "string" ? value : JSON.stringify(value);
}

/// A stored answer key as the value an answer would have: a multiple-choice key is kept as a JSON array of option ids.
export function keyValue(type: QuestionType, key: string): unknown {
  if (type !== "MULTI") return key;
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) ? parsed : key;
  } catch {
    return key;
  }
}

/// What a panel tells the person after something they did: success or the API's refusal as a sentence.
export type Notice = { variant: "success" | "error"; text: string } | null;
