import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, pupil, type Person, type Pupil } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The staff Forms screens in a real browser (task 0025, slices O1, O2 and O8): a teacher writes practice sets, questionnaires and paper work, publishes and closes them, opens a form's
// page, marks an attempt a question at a time and keeps the roll call of paper work; staff answer the questionnaires addressed to them. The APIs are tested in tests/api; this is the
// screen: what is offered to whom, what is said when the person gets it wrong, and the API's refusal shown as a sentence. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes,
// on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(innerWidth);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await setTheme(page, initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `F${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const question = (page: Page, n: number): Locator => dialog(page).getByRole("group", { name: `Question ${n}` });
const panel = (page: Page) => page.getByRole("tabpanel").last();
const FORMS = () => `/schools/${school.code}/forms`;

/// One school with one campus and a class: its administrator, a teacher, a member of non-teaching staff and a pupil in the class.
async function people() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const teacher = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Teacher`);
  const clerk = await member(school, Role.NON_TEACHING_STAFF, north.id, `${tag} Clerk`);
  const ada = await pupil(school, north.id, `${tag} JSS 1`, "Ada");
  const group = await db.classGroup.findFirstOrThrow({ where: { tenantId: school.id, name: `${tag} JSS 1` } });
  return { north, admin, teacher, clerk, ada, group };
}
type People = Awaited<ReturnType<typeof people>>;

async function openForms(page: Page, who: Person) {
  await signInThroughUi(page, who.user);
  await page.goto(FORMS());
  await expect(page.getByRole("heading", { level: 1, name: "Forms" })).toBeVisible();
}

/// A published practice set with a single-choice question (key "a", 1 point) and a hand-marked short answer (4 points, model answer given).
async function practiceSet(s: People, title: string) {
  const form = await db.form.create({
    data: { tenantId: school.id, campusId: s.north.id, kind: "PRACTICE_SET", title, status: "PUBLISHED", createdById: s.teacher.user.id },
  });
  const single = await db.formQuestion.create({
    data: {
      tenantId: school.id,
      formId: form.id,
      prompt: "What is 3 + 4?",
      questionType: "SINGLE",
      options: [
        { id: "a", text: "Seven" },
        { id: "b", text: "Eight" },
      ],
      correctAnswer: "a",
      points: 1,
      sortOrder: 0,
    },
  });
  const short = await db.formQuestion.create({
    data: {
      tenantId: school.id,
      formId: form.id,
      prompt: "Name the process by which plants make food.",
      questionType: "SHORT",
      correctAnswer: "photosynthesis",
      markingMethod: "MANUAL",
      points: 4,
      sortOrder: 1,
    },
  });
  return { form, single, short };
}

/// A pupil's finished attempt of that set: the single choice marked (right), the short answer waiting for the teacher.
async function attempt(s: People, set: Awaited<ReturnType<typeof practiceSet>>, who: Pupil) {
  const response = await db.formResponse.create({
    data: {
      tenantId: school.id,
      campusId: s.north.id,
      formId: set.form.id,
      studentId: who.student.id,
      respondentId: who.student.id,
      status: "COMPLETED",
      score: 1,
      maxScore: 5,
      markingStatus: "PENDING",
      startedAt: new Date(),
      submittedAt: new Date(),
    },
  });
  await db.formAnswer.createMany({
    data: [
      {
        tenantId: school.id,
        responseId: response.id,
        formQuestionId: set.single.id,
        value: "a",
        isCorrect: true,
        score: 1,
        markingStatus: "NOT_REQUIRED",
      },
      {
        tenantId: school.id,
        responseId: response.id,
        formQuestionId: set.short.id,
        value: "photosynthesis",
        score: 0,
        markingStatus: "PENDING",
      },
    ],
  });
  return response;
}

test.describe("who sees the page", () => {
  test("a teacher has the five sections; non-teaching staff have only the questionnaires addressed to them; a pupil is refused", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    const s = await people();
    await openForms(page, s.teacher);
    for (const name of ["Practice sets", "Questionnaires", "Paper work", "Marking", "For you"])
      await expect(page.getByRole("tab", { name })).toBeVisible();
    if (!isMobile) await expect(page.getByRole("navigation").getByRole("link", { name: "Forms" }).first()).toBeVisible();
    await checkBothThemes(page, "the Forms page (teacher)");

    const other = await browser.newContext({ baseURL: baseURL! });
    const clerkPage = await other.newPage();
    await openForms(clerkPage, s.clerk);
    await expect(clerkPage.getByRole("heading", { level: 2, name: "For you" })).toBeVisible();
    await expect(clerkPage.getByRole("tab", { name: "Practice sets" })).toHaveCount(0);
    await checkBothThemes(clerkPage, "the Forms page (non-teaching staff)");

    // a second person in the same browser would meet the first one's session, so each signs in in a context of their own
    const apart = await browser.newContext({ baseURL: baseURL! });
    const pupilPage = await apart.newPage();
    await signInThroughUi(pupilPage, s.ada.user);
    await pupilPage.goto(FORMS());
    await expect(pupilPage.getByRole("heading", { level: 1, name: "Forms" })).toHaveCount(0);
    await expect(pupilPage.getByRole("tab", { name: "Practice sets" })).toHaveCount(0);
    await apart.close();
    await other.close();
  });
});

test.describe("practice sets", () => {
  test("a teacher writes a practice set with a single-choice and a true/false question, saves it, and closes it; a short answer always asks for a model answer", async ({
    page,
  }) => {
    const s = await people();
    await openForms(page, s.teacher);

    const title = `${tag} Fractions drill`;
    await page.getByRole("button", { name: "New practice set" }).click();
    await expect(dialog(page).getByRole("heading", { name: "New practice set" })).toBeVisible();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Instructions").fill("Answer every question.");
    await dialog(page).getByLabel(s.group.name).check();
    await dialog(page).getByLabel("Time limit (minutes)").fill("15");

    const q1 = question(page, 1);
    await q1.getByLabel("Question", { exact: true }).fill("What is 1/2 + 1/4?");
    await q1.getByLabel("Option A", { exact: true }).fill("1/4");
    await q1.getByLabel("Option B", { exact: true }).fill("3/4");
    await q1.getByRole("radio", { name: "Option B is correct" }).check();
    await q1.getByLabel("Points").fill("2");

    await dialog(page).getByRole("button", { name: "Add a question" }).click();
    const q2 = question(page, 2);
    await q2.getByLabel("Question type").selectOption("TRUE_FALSE");
    await q2.getByLabel("Question", { exact: true }).fill("2/4 is the same as 1/2.");
    await q2.getByRole("radio", { name: "True" }).check();

    // a short answer is always marked by hand, so there is no switch for it, and a model answer is asked for
    await dialog(page).getByRole("button", { name: "Add a question" }).click();
    const q3 = question(page, 3);
    await q3.getByLabel("Question type").selectOption("SHORT");
    await expect(q3.getByLabel(/Marked by hand/i)).toHaveCount(0);
    await q3.getByLabel("Question", { exact: true }).fill("Say why.");
    await dialog(page).getByRole("button", { name: "Create practice set" }).first().click();
    await expect(dialog(page).getByRole("alert")).toContainText(/model answer/i);
    expect(await db.form.count({ where: { tenantId: school.id, title } })).toBe(0);
    await q3.getByRole("button", { name: /^Remove question|^Remove$/ }).click();

    await checkBothThemes(page, "the practice-set builder");
    await dialog(page).getByRole("button", { name: "Create practice set" }).first().click();
    await expect(dialog(page)).toHaveCount(0);

    const row = item(page, title);
    await expect(row).toContainText("2 questions");
    const form = await db.form.findFirstOrThrow({
      where: { tenantId: school.id, title },
      include: { questions: { orderBy: { sortOrder: "asc" } }, audiences: true },
    });
    expect(form.kind).toBe("PRACTICE_SET");
    expect(form.maxDurationMinutes).toBe(15);
    expect(form.campusId).toBe(s.north.id);
    expect(form.questions.map((q) => [q.questionType, q.correctAnswer, q.points, q.markingMethod])).toEqual([
      ["SINGLE", "B", 2, "AUTO"],
      ["TRUE_FALSE", "true", 1, "AUTO"],
    ]);

    if (form.status === "DRAFT") await row.getByRole("button", { name: "Publish" }).click();
    await expect(row).toContainText("Published");
    await item(page, title).getByRole("button", { name: "Close" }).click();
    await expect(dialog(page).getByRole("heading", { name: "Close this practice set?" })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close it" }).click();
    await expect(item(page, title)).toContainText("Closed");
    expect((await db.form.findFirstOrThrow({ where: { tenantId: school.id, title } })).status).toBe("CLOSED");
  });

  test("a practice set without a question is refused with a sentence, and nothing is saved", async ({ page }) => {
    const s = await people();
    await openForms(page, s.teacher);
    await page.getByRole("button", { name: "New practice set" }).click();
    await dialog(page).getByLabel("Title").fill(`${tag} Empty`);
    await dialog(page).getByRole("button", { name: "Create practice set" }).first().click();
    await expect(dialog(page).getByRole("alert")).toContainText("Write the question");
    expect(await db.form.count({ where: { tenantId: school.id, title: `${tag} Empty` } })).toBe(0);
  });
});

test.describe("questionnaires", () => {
  test("a public questionnaire is a draft until it is published, then shows its link with the school's code and what a public form cannot promise", async ({
    page,
  }) => {
    const s = await people();
    await openForms(page, s.teacher);
    await page.getByRole("tab", { name: "Questionnaires" }).click();

    const title = `${tag} Lunch survey`;
    await page.getByRole("button", { name: "New questionnaire" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Anyone with the link").check();
    await dialog(page).getByLabel("Anonymous").check();
    const q1 = question(page, 1);
    await q1.getByLabel("Question type").selectOption("RATING");
    await q1.getByLabel("Question", { exact: true }).fill("How was lunch?");
    await dialog(page).getByRole("button", { name: "Save as draft" }).first().click();
    await expect(dialog(page)).toHaveCount(0);

    const row = item(page, title);
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("Anonymous");
    await row.getByRole("button", { name: "Publish" }).click();
    await expect(row).toContainText("Published");

    const form = await db.form.findFirstOrThrow({ where: { tenantId: school.id, title }, include: { audiences: true } });
    expect(form.kind).toBe("QUESTIONNAIRE");
    expect(form.status).toBe("PUBLISHED");
    expect(form.isAnonymous).toBe(true);
    expect(form.audiences[0]!.kind).toBe("PUBLIC");
    expect(form.shareToken).toBeTruthy();
    await expect(row.getByText(`/q/${school.code}/${form.shareToken}`)).toBeVisible();
    await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible();
    await expect(row).toContainText("cannot tell who is answering");
    await expect(row).toContainText("anyone can clear that");
    await checkBothThemes(page, "the questionnaires list");
  });

  test("a questionnaire for members is limited to the roles ticked and offers no link", async ({ page }) => {
    const s = await people();
    await openForms(page, s.teacher);
    await page.getByRole("tab", { name: "Questionnaires" }).click();
    const title = `${tag} Staff pulse`;
    await page.getByRole("button", { name: "New questionnaire" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByLabel("Teachers", { exact: true }).check();
    await dialog(page).getByLabel("Non-teaching staff").check();
    const q1 = question(page, 1);
    await q1.getByLabel("Question type").selectOption("TEXT");
    await q1.getByLabel("Question", { exact: true }).fill("What would help you most?");
    await dialog(page).getByRole("button", { name: "Save as draft" }).first().click();
    await expect(item(page, title)).toContainText("Members");
    const form = await db.form.findFirstOrThrow({ where: { tenantId: school.id, title }, include: { audiences: true } });
    expect(form.audiences[0]!.kind).toBe("MEMBERS");
    expect(form.audiences[0]!.roles).toEqual(["TEACHING_STAFF", "NON_TEACHING_STAFF"]);
    await item(page, title).getByRole("button", { name: "Publish" }).click();
    await expect(item(page, title)).toContainText("Published");
    await expect(item(page, title).getByRole("button", { name: "Copy link" })).toHaveCount(0);
    await expect(item(page, title)).not.toContainText("/q/");
  });
});

test.describe("for you", () => {
  test("a member of staff answers a questionnaire addressed to them, once; another role is not offered it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const s = await people();
    const title = `${tag} Workload`;
    const form = await db.form.create({
      data: {
        tenantId: school.id,
        campusId: s.north.id,
        kind: "QUESTIONNAIRE",
        title,
        instructions: "Be honest.",
        status: "PUBLISHED",
        isAnonymous: true,
        createdById: s.admin.user.id,
      },
    });
    await db.formAudience.create({ data: { tenantId: school.id, formId: form.id, kind: "MEMBERS", roles: ["TEACHING_STAFF"] } });
    await db.formQuestion.create({
      data: {
        tenantId: school.id,
        formId: form.id,
        prompt: "How heavy is your workload?",
        questionType: "SINGLE",
        options: [
          { id: "a", text: "Light" },
          { id: "b", text: "Heavy" },
        ],
        points: 0,
        sortOrder: 0,
      },
    });
    await openForms(page, s.teacher);
    await page.getByRole("tab", { name: "For you" }).click();
    const row = item(page, title);
    await expect(row).toContainText("Anonymous");
    await checkBothThemes(page, "for you");
    await row.getByRole("button", { name: /^Answer/ }).click();
    await expect(dialog(page)).toContainText("This questionnaire is anonymous");
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(dialog(page)).toContainText("Answer at least one question.");
    await dialog(page).getByRole("radio", { name: "Heavy" }).check();
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(page.getByText("Thank you. Your answers were sent.")).toBeVisible();
    await expect(item(page, title)).toContainText("Answered");
    await expect(item(page, title).getByRole("button", { name: /^Answer/ })).toHaveCount(0);

    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: form.id } });
    expect(stored).toMatchObject({ respondentId: null, studentId: null, status: "COMPLETED" });

    // a member of non-teaching staff is not addressed by it
    const other = await browser.newContext({ baseURL: baseURL! });
    const clerkPage = await other.newPage();
    await openForms(clerkPage, s.clerk);
    await expect(clerkPage.getByText("Nothing is waiting for you.")).toBeVisible();
    await other.close();
  });
});

test.describe("a form's page", () => {
  test("an unknown or another school's form is 'not found' in the same words", async ({ page }) => {
    const s = await people();
    const other = await createTenant({ name: `${tag} Elsewhere`, campuses: ["East"] });
    const foreign = await db.form.create({
      data: {
        tenantId: other.id,
        campusId: other.campuses[0].id,
        kind: "PRACTICE_SET",
        title: "Foreign",
        status: "PUBLISHED",
        createdById: s.admin.user.id,
      },
    });
    await signInThroughUi(page, s.teacher.user);
    for (const id of ["does-not-exist", foreign.id]) {
      await page.goto(`${FORMS()}/${id}`);
      await expect(page.getByText("We could not find that form.")).toBeVisible();
    }
  });

  test("the overview, the questions with their keys, and the results of a practice set", async ({ page }) => {
    const s = await people();
    const set = await practiceSet(s, `${tag} Plants`);
    await attempt(s, set, s.ada);
    await signInThroughUi(page, s.teacher.user);
    await page.goto(`${FORMS()}/${set.form.id}`);
    await expect(page.getByRole("heading", { level: 1, name: /Plants/ })).toBeVisible();
    await expect(panel(page)).toContainText("Published");
    await checkBothThemes(page, "a form's overview");

    await page.getByRole("tab", { name: "Questions" }).click();
    await expect(panel(page)).toContainText("What is 3 + 4?");
    await expect(panel(page)).toContainText("photosynthesis");
    await page.getByRole("tab", { name: "Results" }).click();
    await expect(panel(page)).toContainText("Ada");
    await expect(panel(page)).toContainText("1 of 5");
    await checkBothThemes(page, "the results");
  });

  test("a teacher marks an attempt in two sittings: the queue follows, nothing is lost", async ({ page }) => {
    const s = await people();
    const set = await practiceSet(s, `${tag} Plants`);
    const response = await attempt(s, set, s.ada);
    await signInThroughUi(page, s.teacher.user);
    await page.goto(FORMS());
    await page.getByRole("tab", { name: "Marking" }).click();
    const waiting = item(page, "Ada");
    await expect(waiting).toContainText(`${tag} Plants`);
    await expect(waiting).toContainText("Waiting");
    await checkBothThemes(page, "the marking queue");

    await waiting.getByRole("button", { name: "Mark" }).click();
    const answers = dialog(page).getByRole("list", { name: "Answers" });
    await expect(answers.getByRole("listitem").filter({ hasText: "What is 3 + 4?" })).toContainText("Marked automatically: 1 of 1");
    await expect(answers.getByRole("listitem").filter({ hasText: "Name the process" })).toContainText("Model answer: photosynthesis");
    await expect(dialog(page)).toContainText("Score so far: 1 of 5");
    await checkBothThemes(page, "the marking dialog");

    // a score above the question's points is refused on the screen, nothing is sent
    await dialog(page).getByLabel("Score for question 2").fill("9");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page).getByRole("alert")).toContainText("The score for question 2 is from 0 to 4.");
    expect((await db.formAnswer.findFirstOrThrow({ where: { responseId: response.id, formQuestionId: set.short.id } })).markingStatus).toBe(
      "PENDING",
    );

    await dialog(page).getByLabel("Score for question 2").fill("3");
    await dialog(page).getByLabel("Feedback for question 2").fill("Spot on.");
    await dialog(page).getByRole("button", { name: "Save marks" }).click();
    await expect(dialog(page)).toHaveCount(0);
    const stored = await db.formResponse.findFirstOrThrow({ where: { id: response.id } });
    expect(stored.markingStatus).toBe("MARKED");
    expect(stored.score).toBe(4);
    expect(await db.formAnswer.findFirstOrThrow({ where: { responseId: response.id, formQuestionId: set.short.id } })).toMatchObject({
      score: 3,
      markingStatus: "MARKED",
      feedback: "Spot on.",
    });
    // the queue follows: a marked attempt leaves the waiting list and is found under "Marked"
    await expect(item(page, "Ada")).toHaveCount(0);
    await page.getByLabel("Show").selectOption({ label: "Marked" });
    await expect(item(page, "Ada")).toContainText("Marked");
    expect(await db.formMarkingAudit.count({ where: { responseId: response.id } })).toBeGreaterThan(0);
  });
});

test.describe("paper work", () => {
  test("a teacher sets paper work for a class (a class is required), opens its roll call and records who handed in", async ({ page }) => {
    const s = await people();
    await db.studentEnrollment.findFirstOrThrow({ where: { studentId: s.ada.student.id } });
    await openForms(page, s.teacher);
    await page.getByRole("tab", { name: "Paper work" }).click();

    const title = `${tag} Holiday project`;
    await page.getByRole("button", { name: "New paper work" }).click();
    await dialog(page).getByLabel("Title").fill(title);
    await dialog(page).getByRole("button", { name: "Create paper work" }).first().click();
    await expect(dialog(page).getByRole("alert")).toContainText("Choose at least one class");
    await dialog(page).getByLabel(s.group.name).check();
    await dialog(page).getByRole("button", { name: "Create paper work" }).first().click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(item(page, title)).toContainText("Published");

    const form = await db.form.findFirstOrThrow({ where: { tenantId: school.id, title } });
    expect(form.kind).toBe("PAPER_WORK");
    await page.goto(`${FORMS()}/${form.id}`);
    // paper work cannot be edited: the API has no way to change it
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Roll call" }).click();
    const list = panel(page).getByRole("list", { name: "Roll call" });
    if ((await list.getByRole("listitem").count()) === 0)
      await panel(page).getByRole("button", { name: "Add pupils who joined the class" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("Ada");
    await expect(panel(page).getByRole("button", { name: /Save changes/ })).toBeDisabled();
    await checkBothThemes(page, "the roll call");

    await panel(page).getByLabel("Status of Ada", { exact: false }).selectOption("HANDED_IN");
    await panel(page).getByLabel("Note for Ada", { exact: false }).fill("Neat work.");
    await panel(page).getByRole("button", { name: "Save changes (1)" }).click();
    await expect(panel(page)).toContainText("1 change saved.");
    await expect(panel(page)).toContainText("1 of 1 handed in");
    const stored = await db.formTurnIn.findFirstOrThrow({ where: { formId: form.id, studentId: s.ada.student.id } });
    expect(stored).toMatchObject({ status: "HANDED_IN", note: "Neat work." });
  });
});
