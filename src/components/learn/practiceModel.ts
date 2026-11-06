import type { QuestionType } from "@/components/forms/model";

// What the pupil's practice routes send, and the addresses of those routes. Shared by the Practice tab's sections. Presentation only: the routes decide everything.

/// One answered question, as the finished session and the history send it: the question's words, the pupil's answer, whether it was right, and (the pupil's own finished practice) the
/// key and the explanation. `options` and `type` let an answer be shown in the option's words rather than its id.
export type PracticedAnswer = {
  id: string;
  bankItemId: string;
  prompt: string;
  type: QuestionType;
  options: unknown;
  answer: unknown;
  correct: boolean;
  correctAnswer: unknown;
  explanation: string | null;
};

/// A finished session: what `finish` sends.
export type FinishedSession = {
  id: string;
  size: number;
  startedAt: string;
  finishedAt: string;
  totalAttempted: number;
  totalCorrect: number;
  overallAccuracy: number;
  attempts: PracticedAnswer[];
};

/// Where the pupil's practice routes live, from the school's API base (`/api/v1/schools/<code>`).
export const practiceBase = (api: string) => `${api}/portal/practice`;
export const printAddress = (api: string, sessionId: string) => `${practiceBase(api)}/sessions/${encodeURIComponent(sessionId)}/print`;

export const when = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const REPORT_SENT = "Thank you. Your report was sent to the people who look after the questions.";
