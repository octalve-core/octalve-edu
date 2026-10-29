import { test, expect } from "@playwright/test";
import {
  answerKey,
  blankForm,
  bodyOf,
  formOf,
  percent,
  snippet,
  visibilityText,
  type ApiItem,
} from "../../src/components/question-bank/model";
import { parseItem, toEditable } from "../../src/lib/question-bank/item-input";

// The plain rules the question bank screens use (components/question-bank/model.ts): the form a person edits, the request it becomes, and the words for what the server sent. The
// form's request must be one the server's own parser accepts for every kind of question, and reading a stored question back into the form and out again must change nothing.

const item = (over: Partial<ApiItem>): ApiItem => ({
  id: "i1",
  campusId: "c1",
  type: "SINGLE",
  prompt: "Which of these is a prime number?",
  explanation: null,
  points: 2,
  difficulty: null,
  topic: null,
  options: [
    { id: "o1", text: "4" },
    { id: "o2", text: "7" },
    { id: "o3", text: "9" },
  ],
  correctAnswer: "o2",
  subject: "Mathematics",
  classTags: ["JSS 1"],
  visibility: "TEACHERS_ONLY",
  visibleFrom: null,
  status: "DRAFT",
  version: 1,
  submittedBy: "Wale",
  mine: true,
  approvedAt: null,
  reason: null,
  images: [],
  createdAt: "2026-10-26T08:00:00.000Z",
  updatedAt: "2026-10-26T08:00:00.000Z",
  can: { edit: true, submit: true, approve: false, reject: false, retire: false, setVisibility: false, makeGeneral: false },
  ...over,
});

const KINDS: ApiItem[] = [
  item({}),
  item({ type: "MULTI", correctAnswer: ["o1", "o3"] }),
  item({ type: "TRUE_FALSE", options: [], correctAnswer: "false" }),
  item({ type: "SHORT", options: [], correctAnswer: ["seven", "7"] }),
];

test("what the form sends is accepted by the server's parser, for every kind of question", () => {
  for (const kind of KINDS) {
    const parsed = parseItem(bodyOf(formOf(kind)));
    expect(parsed.ok, `${kind.type}: ${JSON.stringify(parsed)}`).toBe(true);
  }
  expect(
    parseItem(bodyOf({ ...blankForm(), prompt: "A question?", options: ["Yes", "No"], subject: "Art", classTags: ["JSS 1"] })).ok,
  ).toBe(true);
});

test("reading a question into the form and out again says the same thing as the server's own editable shape", () => {
  for (const kind of KINDS) {
    const stored = {
      ...kind,
      subjectLabel: kind.subject,
      classTags: kind.classTags.map((label) => ({ label })),
      options: kind.options ?? [],
      correctAnswer: kind.correctAnswer ?? "",
    };
    const expected = toEditable(stored as never);
    const sent = bodyOf(formOf(kind));
    expect(sent).toMatchObject({
      type: kind.type,
      prompt: kind.prompt,
      points: kind.points,
      subject: kind.subject,
      classTags: kind.classTags,
      correct: expected.correct,
    });
    if (kind.type === "SINGLE" || kind.type === "MULTI") expect(sent.options).toEqual(expected.options);
  }
});

test("blank option rows are dropped and the marked answers follow their text, so a stray empty row never shifts the answer", () => {
  const form = { ...blankForm(), prompt: "Pick", options: ["", "Red", "", "Green"], single: 3 };
  expect(bodyOf(form)).toMatchObject({ options: ["Red", "Green"], correct: 1 });
  expect(bodyOf({ ...form, type: "MULTI", multi: [1, 3] })).toMatchObject({ options: ["Red", "Green"], correct: [0, 1] });
  expect(bodyOf({ ...form, type: "MULTI", multi: [0, 2] })).toMatchObject({ correct: [] }); // only blank rows were marked: the server then asks for a correct option
  expect(bodyOf({ ...blankForm(), type: "SHORT", accepted: ["seven", "  ", "7"] })).toMatchObject({ correct: ["seven", "7"] });
});

test("empty optional fields are sent as null, the number fields as numbers", () => {
  expect(bodyOf({ ...blankForm(), points: "3", difficulty: "4", explanation: "  ", topic: "", subject: " " })).toMatchObject({
    points: 3,
    difficulty: 4,
    explanation: null,
    topic: null,
    subject: null,
  });
  expect(bodyOf({ ...blankForm(), difficulty: "" })).toMatchObject({ difficulty: null });
});

test("the answer key reads each kind as words", () => {
  expect(answerKey(KINDS[0])).toEqual(["7"]);
  expect(answerKey(KINDS[1])).toEqual(["4", "9"]);
  expect(answerKey(KINDS[2])).toEqual(["False"]);
  expect(answerKey(KINDS[3])).toEqual(["seven", "7"]);
});

test("a prompt is shortened at a word, only its first line, and the words for visibility and closeness are plain", () => {
  expect(snippet("short")).toBe("short");
  expect(snippet("first line\nsecond line")).toBe("first line");
  const long = `${"word ".repeat(60)}end`;
  const cut = snippet(long, 50);
  expect(cut.endsWith("…")).toBe(true);
  expect(cut.length).toBeLessThanOrEqual(51);
  expect(cut.slice(0, -1).endsWith(" ")).toBe(false);
  expect(visibilityText({ visibility: "TEACHERS_ONLY", visibleFrom: null })).toBe("Teachers only");
  expect(visibilityText({ visibility: "PRACTICE", visibleFrom: null })).toBe("Pupils can practise with it");
  expect(visibilityText({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: "2027-01-01T09:00:00.000Z" })).toMatch(/^Teachers only until /);
  expect(percent(0.874)).toBe("87%");
});
