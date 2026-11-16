import { test, expect } from "@playwright/test";
import { BankQuestionType, FormAudienceKind, FormStatus } from "@prisma/client";
import {
  validateQuestionnaireInput,
  isQuestionnaireOpen,
  isMemberEligibleForQuestionnaire,
  validateAndNormalizeAnswers,
  aggregateQuestionnaireAnalytics,
} from "../../src/lib/forms/questionnaires";

test.describe("Questionnaires Pure Domain Rules (Task 0032 Slice 7)", () => {
  test("validateQuestionnaireInput enforces title and question options constraints", () => {
    // Missing title
    expect(
      validateQuestionnaireInput({
        title: "   ",
        questions: [{ prompt: "Test Q?" }],
      }).ok,
    ).toBe(false);

    // Title too long
    expect(
      validateQuestionnaireInput({
        title: "A".repeat(201),
        questions: [{ prompt: "Test Q?" }],
      }).ok,
    ).toBe(false);

    // Inverted schedule window
    expect(
      validateQuestionnaireInput({
        title: "Parent Survey",
        opensAt: "2026-11-10T10:00:00Z",
        closesAt: "2026-11-05T10:00:00Z",
        questions: [{ prompt: "Test Q?" }],
      }).ok,
    ).toBe(false);

    // Single choice without enough options
    expect(
      validateQuestionnaireInput({
        title: "Parent Survey",
        questions: [
          {
            prompt: "How satisfied are you?",
            questionType: BankQuestionType.SINGLE,
            options: [{ id: "A", text: "Satisfied" }],
          },
        ],
      }).ok,
    ).toBe(false);

    // Valid questionnaire input
    const valid = validateQuestionnaireInput({
      title: "Parent Satisfaction Survey 2026",
      instructions: "Please give us your honest feedback.",
      isAnonymous: true,
      audienceKind: FormAudienceKind.MEMBERS,
      roles: ["PARENT", "STUDENT"],
      questions: [
        {
          prompt: "How satisfied are you with school communication?",
          questionType: BankQuestionType.SINGLE,
          options: [
            { id: "1", text: "Very Satisfied" },
            { id: "2", text: "Satisfied" },
            { id: "3", text: "Dissatisfied" },
          ],
        },
        {
          prompt: "Any additional suggestions?",
          questionType: BankQuestionType.SHORT,
        },
      ],
    });
    expect(valid.ok).toBe(true);
  });

  test("isQuestionnaireOpen checks status and active time window", () => {
    const now = new Date("2026-11-01T12:00:00Z");

    // DRAFT
    expect(isQuestionnaireOpen({ status: FormStatus.DRAFT }, now)).toEqual({
      isOpen: false,
      reason: "NOT_PUBLISHED",
    });

    // CLOSED
    expect(isQuestionnaireOpen({ status: FormStatus.CLOSED }, now)).toEqual({
      isOpen: false,
      reason: "NOT_PUBLISHED",
    });

    // Future opensAt
    expect(
      isQuestionnaireOpen(
        {
          status: FormStatus.PUBLISHED,
          opensAt: new Date("2026-11-05T00:00:00Z"),
        },
        now,
      ),
    ).toEqual({
      isOpen: false,
      reason: "NOT_YET_OPEN",
    });

    // Past closesAt
    expect(
      isQuestionnaireOpen(
        {
          status: FormStatus.PUBLISHED,
          closesAt: new Date("2026-10-31T23:59:59Z"),
        },
        now,
      ),
    ).toEqual({
      isOpen: false,
      reason: "CLOSED",
    });

    // Open within window
    expect(
      isQuestionnaireOpen(
        {
          status: FormStatus.PUBLISHED,
          opensAt: new Date("2026-10-25T00:00:00Z"),
          closesAt: new Date("2026-11-15T00:00:00Z"),
        },
        now,
      ),
    ).toEqual({ isOpen: true });
  });

  test("isMemberEligibleForQuestionnaire evaluates public, role, and class scoping", () => {
    // Public audience is universally eligible
    expect(isMemberEligibleForQuestionnaire({ kind: FormAudienceKind.PUBLIC }, null, null)).toBe(true);

    // Targeted to TEACHING_STAFF only
    const staffAudience = {
      kind: FormAudienceKind.MEMBERS,
      roles: ["TEACHING_STAFF"],
    };
    expect(isMemberEligibleForQuestionnaire(staffAudience, "TEACHING_STAFF", null)).toBe(true);
    expect(isMemberEligibleForQuestionnaire(staffAudience, "STUDENT", null)).toBe(false);

    // Targeted to students of classGroup "group-jss1"
    const studentAudience = {
      kind: FormAudienceKind.MEMBERS,
      roles: ["STUDENT"],
      classGroupIds: ["group-jss1"],
    };
    expect(isMemberEligibleForQuestionnaire(studentAudience, "STUDENT", "group-jss1")).toBe(true);
    expect(isMemberEligibleForQuestionnaire(studentAudience, "STUDENT", "group-jss2")).toBe(false);
  });

  test("validateAndNormalizeAnswers normalizes question responses by type", () => {
    const questions = [
      {
        id: "q1",
        prompt: "Choose one",
        questionType: BankQuestionType.SINGLE,
        options: [],
        sortOrder: 0,
      },
      {
        id: "q2",
        prompt: "Choose multiple",
        questionType: BankQuestionType.MULTI,
        options: [],
        sortOrder: 1,
      },
      {
        id: "q3",
        prompt: "Is this helpful?",
        questionType: BankQuestionType.TRUE_FALSE,
        options: [],
        sortOrder: 2,
      },
      {
        id: "q4",
        prompt: "Comments",
        questionType: BankQuestionType.SHORT,
        options: [],
        sortOrder: 3,
      },
    ];

    const result = validateAndNormalizeAnswers(questions, [
      { formQuestionId: "q1", value: "  option-a  " },
      { formQuestionId: "q2", value: [" opt-1 ", "opt-2 "] },
      { formQuestionId: "q3", value: "yes" },
      { formQuestionId: "q4", value: " Great school!  " },
    ]);

    expect(result.ok).toBe(true);
    const answers = result.normalizedAnswers!;
    expect(answers).toHaveLength(4);
    expect(answers[0].value).toBe("option-a");
    expect(answers[1].value).toEqual(["opt-1", "opt-2"]);
    expect(answers[2].value).toBe("true");
    expect(answers[3].value).toBe("Great school!");
  });

  test("aggregateQuestionnaireAnalytics computes counts, percentages, and lists text entries", () => {
    const questions = [
      {
        id: "q1",
        prompt: "Overall satisfaction",
        questionType: BankQuestionType.SINGLE,
        options: [
          { id: "A", text: "Satisfied" },
          { id: "B", text: "Neutral" },
          { id: "C", text: "Dissatisfied" },
        ],
        sortOrder: 0,
      },
      {
        id: "q2",
        prompt: "Feedback remarks",
        questionType: BankQuestionType.SHORT,
        options: [],
        sortOrder: 1,
      },
    ];

    const answers = [
      { formQuestionId: "q1", value: "A" },
      { formQuestionId: "q1", value: "A" },
      { formQuestionId: "q1", value: "A" },
      { formQuestionId: "q1", value: "B" },
      { formQuestionId: "q2", value: "More library books please" },
      { formQuestionId: "q2", value: "Great teachers" },
    ];

    const analytics = aggregateQuestionnaireAnalytics({
      formId: "form-123",
      title: "Parent Survey",
      isAnonymous: true,
      status: FormStatus.PUBLISHED,
      questions,
      answers,
    });

    expect(analytics.formId).toBe("form-123");
    expect(analytics.totalResponses).toBe(4);
    expect(analytics.isAnonymous).toBe(true);

    // Q1 breakdown: 3 for A (75%), 1 for B (25%), 0 for C (0%)
    const q1Stats = analytics.questions[0];
    expect(q1Stats.totalAnswers).toBe(4);
    expect(q1Stats.optionCounts).toEqual([
      { optionId: "A", label: "Satisfied", count: 3, percentage: 75 },
      { optionId: "B", label: "Neutral", count: 1, percentage: 25 },
      { optionId: "C", label: "Dissatisfied", count: 0, percentage: 0 },
    ]);

    // Q2 text entries
    const q2Stats = analytics.questions[1];
    expect(q2Stats.totalAnswers).toBe(2);
    expect(q2Stats.textResponses).toEqual(["More library books please", "Great teachers"]);
  });

  // Task 0074: a rating has five fixed values, so its results are counts (as a choice's are), not a list of the numbers people gave.
  test("aggregateQuestionnaireAnalytics counts a rating over its five values and lists no text for it", () => {
    const analytics = aggregateQuestionnaireAnalytics({
      formId: "form-456",
      title: "Staff survey",
      isAnonymous: false,
      status: FormStatus.PUBLISHED,
      questions: [{ id: "r1", prompt: "How was the term?", questionType: BankQuestionType.RATING, options: [], sortOrder: 0 }],
      answers: [
        { formQuestionId: "r1", value: 4 },
        { formQuestionId: "r1", value: 4 },
        { formQuestionId: "r1", value: 5 },
      ],
    });
    const rating = analytics.questions[0];
    expect(rating.totalAnswers).toBe(3);
    expect(rating.textResponses).toBeUndefined();
    expect(rating.optionCounts).toEqual([
      { optionId: "1", label: "1", count: 0, percentage: 0 },
      { optionId: "2", label: "2", count: 0, percentage: 0 },
      { optionId: "3", label: "3", count: 0, percentage: 0 },
      { optionId: "4", label: "4", count: 2, percentage: 66.7 },
      { optionId: "5", label: "5", count: 1, percentage: 33.3 },
    ]);
  });
});
