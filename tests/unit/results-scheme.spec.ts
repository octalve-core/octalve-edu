import { test, expect } from "@playwright/test";
import { entryParts, entryProblem, partsProblem, type SchemeWithParts } from "@/lib/results/scheme";

// The pure rules behind "a saved result is tied to the class's assessment scheme" (task 0032): which parts a result is entered under (the scheme's components, then the exam), and the sentence for each
// way an entry can fail to match.

const scheme = (
  components: { name: string; maxScore: number }[],
  examMax: number,
  over: Partial<SchemeWithParts> = {},
): SchemeWithParts => {
  const total = components.reduce((n, c) => n + c.maxScore, examMax);
  return { id: "s1", name: "Standard", totalMax: total, examMax, components, parts: entryParts(components, examMax), ...over };
};
const CA = [
  { name: "CA 1", maxScore: 20 },
  { name: "CA 2", maxScore: 20 },
];

test.describe("the parts a result is entered under", () => {
  test("the components in their order, then the exam out of examMax", () => {
    expect(entryParts(CA, 60)).toEqual([...CA, { name: "Exam", maxScore: 60 }]);
  });

  test("an examMax of 0 means there is no exam, so there is no exam part", () => {
    expect(entryParts(CA, 0)).toEqual(CA);
  });

  test("the input is not changed, and the result is a copy", () => {
    const input = [{ name: "Test", maxScore: 40 }];
    const parts = entryParts(input, 60);
    parts[0].maxScore = 1;
    expect(input).toEqual([{ name: "Test", maxScore: 40 }]);
  });

  test("a component already called Exam (in any case) gives the exam part another name, so the names stay unique", () => {
    expect(entryParts([{ name: "Exam", maxScore: 40 }], 60).map((p) => p.name)).toEqual(["Exam", "Final exam"]);
    expect(entryParts([{ name: "exam", maxScore: 40 }], 60).map((p) => p.name)).toEqual(["exam", "Final exam"]);
    expect(
      entryParts(
        [
          { name: "Exam", maxScore: 10 },
          { name: "Final exam", maxScore: 10 },
        ],
        80,
      ).map((p) => p.name),
    ).toEqual(["Exam", "Final exam", "Examination"]);
    expect(
      entryParts(
        [
          { name: "Exam", maxScore: 10 },
          { name: "Final exam", maxScore: 10 },
          { name: "Examination", maxScore: 10 },
        ],
        70,
      ).map((p) => p.name),
    ).toEqual(["Exam", "Final exam", "Examination", "Exam 2"]);
  });
});

test.describe("parts that are not the scheme's parts", () => {
  const s = scheme(CA, 60);
  const exact = [
    { name: "Exam", maxScore: 60 },
    { name: "CA 2", maxScore: 20 },
    { name: "CA 1", maxScore: 20 },
  ];

  test("the scheme's own parts, in any order, are no problem", () => {
    expect(partsProblem(s, exact)).toBeNull();
    expect(partsProblem(s, [...exact].reverse())).toBeNull();
  });

  test("a part the scheme does not have is named, with what the scheme has", () => {
    const sentence = partsProblem(s, [...exact, { name: "Quiz", maxScore: 5 }]);
    expect(sentence).toBe(`"Quiz" is not a part of the scheme "Standard". It has: CA 1 (out of 20), CA 2 (out of 20), Exam (out of 60).`);
  });

  test("a part out of a different maximum says both maxima", () => {
    expect(partsProblem(s, [{ name: "CA 1", maxScore: 25 }, exact[1], exact[0]])).toBe(
      `"CA 1" is out of 25 here but out of 20 in the scheme "Standard".`,
    );
  });

  test("a part left out is named", () => {
    expect(partsProblem(s, [exact[1], exact[2]])).toContain(`also needs "Exam"`);
    expect(partsProblem(s, [exact[0]])).toContain(`"CA 1", "CA 2"`);
  });

  test("a part sent twice is refused, even if it adds up", () => {
    expect(partsProblem(s, [...exact, exact[2]])).toContain(`"CA 1" is sent twice`);
  });

  test("names are compared exactly: a different case is a different part", () => {
    expect(partsProblem(s, [{ name: "ca 1", maxScore: 20 }, exact[1], exact[0]])).toContain(`"ca 1" is not a part`);
  });
});

test.describe("one pupil's entry under a scheme", () => {
  const s = scheme(CA, 60);
  const parts = [...CA, { name: "Exam", maxScore: 60 }];

  test("the scheme's parts, with the total left out or equal to the scheme's, are no problem", () => {
    expect(entryProblem(s, { components: parts })).toBeNull();
    expect(entryProblem(s, { components: parts, maxScore: 100 })).toBeNull();
  });

  test("a total out of something else is refused, naming both", () => {
    expect(entryProblem(s, { components: parts, maxScore: 50 })).toBe(`The scheme "Standard" is out of 100, not 50.`);
  });

  test("a bare score, or an empty list of parts, where the scheme has parts is refused and lists them", () => {
    for (const entry of [{}, { components: [] }]) {
      expect(entryProblem(s, entry)).toBe(
        `The scheme "Standard" has parts: CA 1 (out of 20), CA 2 (out of 20), Exam (out of 60). Send a score for each.`,
      );
    }
  });

  test("the total is checked before the parts", () => {
    expect(entryProblem(s, { components: [], maxScore: 7 })).toContain("is out of 100, not 7");
  });

  test("a scheme with no parts takes a bare score and refuses parts", () => {
    const bare = scheme([], 0, { totalMax: 100 });
    expect(entryProblem(bare, {})).toBeNull();
    expect(entryProblem(bare, { components: [{ name: "X", maxScore: 100 }] })).toContain("has no parts");
  });

  test("a scheme with no exam is entered under its components alone", () => {
    const noExam = scheme(CA, 0);
    expect(noExam.totalMax).toBe(40);
    expect(entryProblem(noExam, { components: CA })).toBeNull();
    expect(entryProblem(noExam, { components: [...CA, { name: "Exam", maxScore: 60 }] })).toContain(`"Exam" is not a part`);
  });
});
