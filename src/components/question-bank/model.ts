// What the question bank screens know about a question, in plain code (no zod: a client component must not import it, the browser's policy reports an `eval` for it).
// The shapes mirror what `/api/v1/schools/[code]/question-bank/items` answers; the server decides everything, so nothing here is an authority.

export type ItemType = "SINGLE" | "MULTI" | "TRUE_FALSE" | "SHORT";
export type ItemStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "RETIRED";
export type ItemVisibility = "TEACHERS_ONLY" | "PRACTICE" | "TEACHERS_ONLY_UNTIL";

export type ItemImage = { id: string; alt: string; decorative: boolean; width: number; height: number; contentType: string; sortOrder: number };
export type ItemOverlap = { id: string; score: number; similarTo: { kind: "BANK_ITEM" | "ASSESSMENT_QUESTION"; id: string } };

export type ApiItem = {
  id: string;
  campusId: string | null;
  type: ItemType;
  prompt: string;
  explanation: string | null;
  points: number;
  difficulty: number | null;
  topic: string | null;
  options: { id: string; text: string }[] | null;
  correctAnswer: string | string[] | null;
  subject: string | null;
  classTags: string[];
  visibility: ItemVisibility;
  visibleFrom: string | null;
  status: ItemStatus;
  version: number;
  submittedBy: string | null;
  mine: boolean;
  approvedAt: string | null;
  reason: string | null;
  images: ItemImage[];
  createdAt: string;
  updatedAt: string;
  can: { edit: boolean; submit: boolean; approve: boolean; reject: boolean; retire: boolean; setVisibility: boolean; makeGeneral: boolean };
  /// Present ONLY for an exam approver in scope or a superadmin; for everyone else the key does not exist.
  overlap?: ItemOverlap[];
};

export type HistoryEntry = { id: string; version: number; outcome: string; reason: string | null; at: string; by: string | null };

export const STATUS_LABEL: Record<ItemStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  REJECTED: "Sent back",
  RETIRED: "Retired",
};
export const TYPE_LABEL: Record<ItemType, string> = {
  SINGLE: "One correct answer",
  MULTI: "Several correct answers",
  TRUE_FALSE: "True or false",
  SHORT: "Short answer",
};
export const OUTCOME_LABEL: Record<string, string> = { APPROVED: "Approved", REJECTED: "Sent back", RETIRED: "Retired", EDITED: "Corrected by a reviewer" };

const dateText = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export const whenText = dateText;

export function visibilityText(item: Pick<ApiItem, "visibility" | "visibleFrom">): string {
  if (item.visibility === "PRACTICE") return "Pupils can practise with it";
  if (item.visibility === "TEACHERS_ONLY_UNTIL" && item.visibleFrom) return `Teachers only until ${dateText(item.visibleFrom)}`;
  return "Teachers only";
}

/// The correct answer(s) as words, for the answer key.
export function answerKey(item: Pick<ApiItem, "type" | "options" | "correctAnswer">): string[] {
  const answer = item.correctAnswer;
  if (item.type === "TRUE_FALSE") return [answer === "true" || answer === "True" ? "True" : "False"];
  if (item.type === "SHORT") return Array.isArray(answer) ? answer : answer ? [answer] : [];
  const ids = new Set(Array.isArray(answer) ? answer : answer ? [answer] : []);
  return (item.options ?? []).filter((option) => ids.has(option.id)).map((option) => option.text);
}

export const imageUrl = (api: string, itemId: string, imageId: string) => `${api}/items/${encodeURIComponent(itemId)}/images/${encodeURIComponent(imageId)}`;

/// A short line of the prompt for a list: the first line, cut at a word.
export function snippet(prompt: string, max = 140): string {
  const first = prompt.split("\n")[0].trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20))}…`;
}

export const percent = (score: number) => `${Math.round(score * 100)}%`;

// ---- the question form --------------------------------------------------------------------------------------------------

export type FormState = {
  type: ItemType;
  prompt: string;
  options: string[];
  single: number;
  multi: number[];
  truth: boolean;
  accepted: string[];
  explanation: string;
  points: string;
  difficulty: string;
  topic: string;
  subject: string;
  classTags: string[];
};

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;

export const blankForm = (): FormState => ({
  type: "SINGLE",
  prompt: "",
  options: ["", ""],
  single: 0,
  multi: [],
  truth: true,
  accepted: [""],
  explanation: "",
  points: "1",
  difficulty: "",
  topic: "",
  subject: "",
  classTags: [],
});

/// The form as it stands for a question that already exists.
export function formOf(item: ApiItem): FormState {
  const options = (item.options ?? []).map((option) => option.text);
  const ids = new Set(Array.isArray(item.correctAnswer) ? item.correctAnswer : item.correctAnswer ? [item.correctAnswer] : []);
  const marked = (item.options ?? []).flatMap((option, index) => (ids.has(option.id) ? [index] : []));
  return {
    type: item.type,
    prompt: item.prompt,
    options: options.length >= MIN_OPTIONS ? options : ["", ""],
    single: marked[0] ?? 0,
    multi: item.type === "MULTI" ? marked : [],
    truth: item.type === "TRUE_FALSE" ? item.correctAnswer === "true" || item.correctAnswer === "True" : true,
    accepted: item.type === "SHORT" && Array.isArray(item.correctAnswer) && item.correctAnswer.length > 0 ? item.correctAnswer : [""],
    explanation: item.explanation ?? "",
    points: String(item.points),
    difficulty: item.difficulty === null ? "" : String(item.difficulty),
    topic: item.topic ?? "",
    subject: item.subject ?? "",
    classTags: item.classTags,
  };
}

/// The request body for the form. Blank option and answer rows are dropped and the marked ones follow their text, so a stray empty row never shifts the answer.
export function bodyOf(form: FormState): Record<string, unknown> {
  const common = {
    prompt: form.prompt,
    explanation: form.explanation.trim() === "" ? null : form.explanation,
    points: Number(form.points),
    difficulty: form.difficulty === "" ? null : Number(form.difficulty),
    topic: form.topic.trim() === "" ? null : form.topic,
    subject: form.subject.trim() === "" ? null : form.subject,
    classTags: form.classTags,
  };
  if (form.type === "TRUE_FALSE") return { type: "TRUE_FALSE", ...common, correct: form.truth };
  if (form.type === "SHORT") return { type: "SHORT", ...common, correct: form.accepted.map((a) => a.trim()).filter((a) => a !== "") };
  const kept = form.options.map((text, index) => ({ text, index })).filter((option) => option.text.trim() !== "");
  const position = (index: number) => kept.findIndex((option) => option.index === index);
  const options = kept.map((option) => option.text);
  if (form.type === "SINGLE") return { type: "SINGLE", ...common, options, correct: Math.max(position(form.single), 0) };
  return { type: "MULTI", ...common, options, correct: form.multi.map(position).filter((i) => i >= 0) };
}
