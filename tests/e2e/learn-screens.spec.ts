import crypto from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { approvedItem, guardianOf, member, pupil, resetPractice, setBank, type Person } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The pupil's "My work", a guardian's "My children" and the public questionnaire page in a real browser (task 0025, slices O3, O4, O5 and O8). A pupil starts, answers and sees the result of
// a practice set, answers a questionnaire, asks for paper work to be marked, practises on their own and carries on a session left open; a guardian sees how practice is going as far as the
// school lets them; anyone with a public link answers once from a browser. The APIs are tested in tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes,
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
  tag = `L${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
const panel = (page: Page) => page.getByRole("tabpanel").last();
const item = (page: Page, text: string): Locator => page.getByRole("listitem").filter({ hasText: text });
const LEARN = () => `/schools/${school.code}/learn`;
const CHILDREN = () => `/schools/${school.code}/children`;
const top = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/// A school with a campus, a teacher, an administrator and a pupil (Ada) in a class; a second pupil (Bola) in the same class.
async function world() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const teacher = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Teacher`);
  const ada = await pupil(school, north.id, `${tag} JSS 1`, "Ada");
  const bola = await pupil(school, north.id, `${tag} JSS 1`, "Bola");
  return { north, admin, teacher, ada, bola };
}
type World = Awaited<ReturnType<typeof world>>;

async function openLearn(page: Page, who: Person) {
  await signInThroughUi(page, who.user);
  await page.goto(LEARN());
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
}

/// A published practice set of the campus with a single choice (key "a", 1 point) and a hand-marked short answer (4 points).
async function practiceSet(w: World, title: string, over: { maxDurationMinutes?: number } = {}) {
  const form = await db.form.create({
    data: {
      tenantId: school.id,
      campusId: w.north.id,
      kind: "PRACTICE_SET",
      title,
      instructions: "Answer both.",
      status: "PUBLISHED",
      maxDurationMinutes: over.maxDurationMinutes ?? null,
      createdById: w.teacher.user.id,
    },
  });
  await db.formQuestion.create({
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
      explanation: "Three and four make seven.",
      points: 1,
      sortOrder: 0,
    },
  });
  await db.formQuestion.create({
    data: {
      tenantId: school.id,
      formId: form.id,
      prompt: "Name the process by which plants make food.",
      questionType: "SHORT",
      correctAnswer: "photosynthesis",
      explanation: "It is called photosynthesis.",
      markingMethod: "MANUAL",
      points: 4,
      sortOrder: 1,
    },
  });
  return form;
}

test.describe("who has the page", () => {
  test("a pupil has My work with Forms and Practice; a guardian has My children; a teacher has neither", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    const w = await world();
    const mum = await guardianOf(school, [w.ada.student.id], "APPROVED", "Mum");
    await openLearn(page, w.ada);
    await expect(top(page, "Forms")).toBeVisible();
    await expect(top(page, "Practice")).toBeVisible();
    if (!isMobile) await expect(page.getByRole("navigation").getByRole("link", { name: "My work" }).first()).toBeVisible();
    await checkBothThemes(page, "My work");

    const other = await browser.newContext({ baseURL: baseURL! });
    const mumPage = await other.newPage();
    await signInThroughUi(mumPage, mum.user);
    await mumPage.goto(CHILDREN());
    await expect(mumPage.getByRole("heading", { level: 1, name: "My children" })).toBeVisible();
    await mumPage.goto(LEARN());
    await expect(mumPage.getByRole("heading", { level: 1, name: "My work" })).toHaveCount(0);

    // a second person in the same browser would meet the first one's session, so each signs in in a context of their own
    const apart = await browser.newContext({ baseURL: baseURL! });
    const teacherPage = await apart.newPage();
    await signInThroughUi(teacherPage, w.teacher.user);
    for (const url of [LEARN(), CHILDREN()]) {
      await teacherPage.goto(url);
      await expect(teacherPage.getByRole("heading", { level: 1, name: /My work|My children/ })).toHaveCount(0);
    }
    await apart.close();
    await other.close();
  });
});

test.describe("practice sets", () => {
  test("a pupil starts a set, answers, sends it, sees the result with the key only for what is marked, and cannot start it again", async ({
    page,
  }) => {
    const w = await world();
    const title = `${tag} Plants`;
    const form = await practiceSet(w, title, { maxDurationMinutes: 20 });
    await openLearn(page, w.ada);

    const row = item(page, title);
    await expect(row).toContainText("Not started");
    await expect(row).toContainText("2 questions");
    await expect(row).toContainText("20 minutes");
    await checkBothThemes(page, "the practice sets");
    await row.getByRole("button", { name: /^Start/ }).click();

    const attempt = page.getByRole("region", { name: "Your attempt" });
    await expect(attempt.getByRole("timer")).toContainText("Time left: 19:");
    await expect(attempt).toContainText("What is 3 + 4?");
    await expect(attempt).not.toContainText("Three and four make seven.");
    await checkBothThemes(page, "an attempt");

    // nothing answered: a sentence, nothing sent
    await attempt.getByRole("button", { name: "Submit" }).click();
    await expect(attempt.getByRole("alert")).toContainText("Answer at least one question.");
    expect(await db.formResponse.count({ where: { formId: form.id, status: "COMPLETED" } })).toBe(0);

    await attempt.getByRole("radio", { name: "Eight" }).check();
    await attempt.getByLabel("Name the process by which plants make food.").fill("Respiration");
    await attempt.getByRole("button", { name: "Submit" }).click();

    const result = page.getByRole("region", { name: "Your result" });
    await expect(result).toContainText("Score so far: 0 of 5");
    await expect(result).toContainText("Your teacher still has to mark 1 answer");
    const machine = result.getByRole("listitem").filter({ hasText: "What is 3 + 4?" });
    await expect(machine).toContainText("Not quite");
    await expect(machine).toContainText("Correct answer: Seven");
    await expect(machine).toContainText("Three and four make seven.");
    const waiting = result.getByRole("listitem").filter({ hasText: "Name the process" });
    await expect(waiting).toContainText("Waiting for your teacher to mark this answer.");
    await expect(waiting).not.toContainText("photosynthesis");
    await expect(waiting).not.toContainText("It is called photosynthesis.");
    await checkBothThemes(page, "the result with an answer waiting");

    const download = page.waitForEvent("download");
    await result.getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    await result.getByRole("button", { name: "Back to practice sets" }).click();
    const done = item(page, title);
    await expect(done).toContainText("Finished");
    await expect(done.getByRole("button", { name: /^Start|^Continue/ })).toHaveCount(0);
    await done.getByRole("button", { name: /^See result/ }).click();
    await expect(page.getByRole("region", { name: "Your result" })).toContainText("Score so far: 0 of 5");

    const stored = await db.formResponse.findFirstOrThrow({
      where: { formId: form.id, studentId: w.ada.student.id },
      include: { answers: true },
    });
    expect(stored).toMatchObject({ status: "COMPLETED", markingStatus: "PENDING" });
    expect(stored.answers).toHaveLength(2);
  });

  test("a set another pupil has not started is still offered to them, and a set of another campus is not offered at all", async ({
    page,
  }) => {
    const w = await world();
    const mine = await practiceSet(w, `${tag} Mine`);
    const south = await db.campus.create({ data: { tenantId: school.id, name: "South" } });
    await db.form.create({
      data: {
        tenantId: school.id,
        campusId: south.id,
        kind: "PRACTICE_SET",
        title: `${tag} Elsewhere`,
        status: "PUBLISHED",
        createdById: w.teacher.user.id,
      },
    });
    await db.formResponse.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        formId: mine.id,
        studentId: w.ada.student.id,
        respondentId: w.ada.student.id,
        status: "COMPLETED",
        score: 1,
        maxScore: 5,
        submittedAt: new Date(),
      },
    });
    await openLearn(page, w.bola);
    await expect(item(page, `${tag} Mine`)).toContainText("Not started");
    await expect(page.getByText(`${tag} Elsewhere`)).toHaveCount(0);
  });
});

test.describe("questionnaires and paper work", () => {
  test("a pupil answers a questionnaire once and is told when it is anonymous; a questionnaire of another campus is not there", async ({
    page,
  }) => {
    const w = await world();
    const southCampus = await db.campus.create({ data: { tenantId: school.id, name: "South" } });
    const mk = async (title: string, campusId: string, anonymous: boolean) => {
      const f = await db.form.create({
        data: {
          tenantId: school.id,
          campusId,
          kind: "QUESTIONNAIRE",
          title,
          instructions: "Tell us.",
          status: "PUBLISHED",
          isAnonymous: anonymous,
          createdById: w.admin.user.id,
        },
      });
      await db.formAudience.create({ data: { tenantId: school.id, formId: f.id, kind: "MEMBERS", roles: ["STUDENT"] } });
      await db.formQuestion.create({
        data: { tenantId: school.id, formId: f.id, prompt: "How was lunch?", questionType: "TEXT", points: 0, sortOrder: 0 },
      });
      return f;
    };
    const mine = await mk(`${tag} Lunch`, w.north.id, true);
    await mk(`${tag} Southern`, southCampus.id, false);
    await openLearn(page, w.ada);
    await page.getByRole("tab", { name: "Questionnaires" }).click();
    await expect(page.getByText(`${tag} Southern`)).toHaveCount(0);
    const row = item(page, `${tag} Lunch`);
    await checkBothThemes(page, "the questionnaires");
    await row.getByRole("button", { name: /^Answer/ }).click();
    await expect(dialog(page)).toContainText("This questionnaire is anonymous");
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(dialog(page)).toContainText("Answer at least one question.");
    await dialog(page).getByLabel("How was lunch?").fill("Good.");
    await dialog(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(page.getByText("Thank you. Your answers were sent.")).toBeVisible();
    await expect(item(page, `${tag} Lunch`)).toContainText("Answered");
    const stored = await db.formResponse.findFirstOrThrow({ where: { formId: mine.id } });
    expect(stored).toMatchObject({ studentId: null, respondentId: null });
  });

  test("a pupil asks for paper work to be marked, once", async ({ page }) => {
    const w = await world();
    const form = await db.form.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        kind: "PAPER_WORK",
        title: `${tag} Project`,
        status: "PUBLISHED",
        createdById: w.teacher.user.id,
      },
    });
    await db.formTurnIn.create({ data: { tenantId: school.id, formId: form.id, studentId: w.ada.student.id, status: "PENDING" } });
    await openLearn(page, w.ada);
    await page.getByRole("tab", { name: "Paper work" }).click();
    const row = item(page, `${tag} Project`);
    await expect(row).toContainText("Not handed in yet");
    await checkBothThemes(page, "the paper work");
    await row.getByRole("button", { name: /^Request marking/ }).click();
    await expect(page.getByText("Your request was sent.")).toBeVisible();
    await expect(item(page, `${tag} Project`)).toContainText("You asked your teacher to mark it.");
    await expect(item(page, `${tag} Project`).getByRole("button", { name: /^Request marking/ })).toHaveCount(0);
    expect((await db.formTurnIn.findFirstOrThrow({ where: { formId: form.id, studentId: w.ada.student.id } })).requestedAt).not.toBeNull();
  });
});

test.describe("practising", () => {
  async function bank(w: World, count = 5) {
    const items = [];
    for (let i = 1; i <= count; i++)
      items.push(
        await approvedItem(school.id, null, w.admin.user.id, {
          prompt: `${tag} cell part ${i}?`,
          topic: "Cells",
          subjectLabel: "Biology",
          subjectKey: "biology",
        }),
      );
    await setBank(school.id, w.admin.user.id, "bank.practice.minPoolSize", 3);
    await setBank(school.id, w.admin.user.id, "bank.practice.maxQuestions", 2);
    return items;
  }
  const practiceTab = async (page: Page, section: string) => {
    await top(page, "Practice").click();
    await page.getByRole("tab", { name: section, exact: true }).click();
  };
  const sessions = (page: Page): Locator => page.getByRole("list", { name: "Practice sessions" }).locator(":scope > li");

  test.beforeEach(async () => {
    await resetPractice();
  });

  test("a pupil sets up a session, answers with the answer shown after each, sees the result, and finds it in the history", async ({
    page,
  }) => {
    const w = await world();
    await bank(w);
    await openLearn(page, w.ada);
    await practiceTab(page, "Practise now");
    const setup = page.getByRole("region", { name: "Practice setup" });
    await checkBothThemes(page, "the practice setup");
    await setup.getByLabel("Subject").selectOption("Biology");
    await setup.getByRole("radio", { name: "After each answer" }).check();
    await setup.getByRole("button", { name: "Start practice" }).click();

    const session = page.getByRole("region", { name: "Your practice" });
    await expect(session).toContainText("Question 1 of 2");
    await session.getByRole("radio", { name: "First" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    await expect(session.getByRole("status")).toContainText("Correct");
    await session.getByRole("button", { name: "Next question" }).click();
    await expect(session).toContainText("Question 2 of 2");
    await session.getByRole("radio", { name: "Second" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    await expect(session.getByRole("status")).toContainText("Not quite");
    await expect(session.getByRole("status")).toContainText("Correct answer: First");
    await session.getByRole("button", { name: "See my result" }).click();

    const result = page.getByRole("region", { name: "Your practice result" });
    await expect(result).toContainText("You got 1 of 2 right (50%).");
    await expect(result.getByRole("listitem").filter({ hasText: "Your answer: Second" })).toContainText("Correct answer: First");
    await checkBothThemes(page, "the practice result");
    const download = page.waitForEvent("download");
    await result.getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

    await page.getByRole("tab", { name: "History", exact: true }).click();
    await expect(sessions(page)).toHaveCount(1);
    await expect(sessions(page).first()).toContainText("1 of 2 right");
  });

  test("a session left open is carried on from the history, from the question the pupil stopped at", async ({ page }) => {
    const w = await world();
    const items = await bank(w);
    const left = await db.practiceSession.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        studentId: w.ada.student.id,
        subjectLabel: "Biology",
        subjectKey: "biology",
        size: 2,
        itemIds: [items[0]!.id, items[1]!.id],
        feedbackMode: "EACH",
      },
    });
    await db.practiceAttempt.create({
      data: {
        tenantId: school.id,
        sessionId: left.id,
        studentId: w.ada.student.id,
        bankItemId: items[0]!.id,
        version: 1,
        answer: "a",
        correct: true,
      },
    });
    await openLearn(page, w.ada);
    await practiceTab(page, "History");
    const open = sessions(page).filter({ hasText: "Not finished" });
    await expect(open).toContainText("1 answered so far");
    await open.getByRole("button", { name: /^Continue/ }).click();
    const session = page.getByRole("region", { name: "Your practice" });
    await expect(session).toContainText("Question 2 of 2");
    await expect(session).toContainText(`${tag} cell part 2?`);
    await expect(session).not.toContainText(`${tag} cell part 1?`);
    await checkBothThemes(page, "a session carried on");
    await session.getByRole("radio", { name: "First" }).check();
    await session.getByRole("button", { name: "Check answer" }).click();
    await session.getByRole("button", { name: "See my result" }).click();
    await expect(page.getByRole("region", { name: "Your practice result" })).toContainText("You got 2 of 2 right (100%).");
    expect((await db.practiceSession.findUniqueOrThrow({ where: { id: left.id } })).finishedAt).not.toBeNull();
  });

  test("with practice closed, Continue says so in the school's words and the session stays open", async ({ page }) => {
    const w = await world();
    const items = await bank(w);
    const left = await db.practiceSession.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        studentId: w.ada.student.id,
        subjectLabel: "Biology",
        subjectKey: "biology",
        size: 2,
        itemIds: [items[0]!.id, items[1]!.id],
        feedbackMode: "EACH",
      },
    });
    await setBank(school.id, w.admin.user.id, "bank.access.pupils", false);
    await openLearn(page, w.ada);
    await practiceTab(page, "History");
    await sessions(page)
      .filter({ hasText: "Not finished" })
      .getByRole("button", { name: /^Continue/ })
      .click();
    await expect(panel(page).getByRole("alert")).toContainText("Practice is currently closed.");
    await expect(page.getByRole("region", { name: "Your practice" })).toHaveCount(0);
    expect((await db.practiceSession.findUniqueOrThrow({ where: { id: left.id } })).finishedAt).toBeNull();
  });

  test("a pupil reports a problem with a question and later reads the reviewer's answer", async ({ page }) => {
    const w = await world();
    const items = await bank(w);
    const done = await db.practiceSession.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        studentId: w.ada.student.id,
        subjectLabel: "Biology",
        subjectKey: "biology",
        size: 2,
        itemIds: [items[0]!.id],
        feedbackMode: "EACH",
        finishedAt: new Date(),
      },
    });
    await db.practiceAttempt.create({
      data: {
        tenantId: school.id,
        sessionId: done.id,
        studentId: w.ada.student.id,
        bankItemId: items[0]!.id,
        version: 1,
        answer: "b",
        correct: false,
      },
    });
    await openLearn(page, w.ada);
    await practiceTab(page, "History");
    await sessions(page).first().getByText("Show answers").click();
    await sessions(page)
      .first()
      .getByRole("button", { name: /^Report a problem/ })
      .click();
    await dialog(page).getByLabel("What is wrong with it?").fill("abc");
    await dialog(page).getByRole("button", { name: "Send report" }).click();
    await expect(dialog(page)).toContainText("at least 5 characters");
    await dialog(page).getByLabel("What is wrong with it?").fill("Both answers look right to me.");
    await dialog(page).getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText(/Your report was sent/)).toBeVisible();

    const report = await db.questionReport.findFirstOrThrow({ where: { tenantId: school.id } });
    await db.questionReport.update({
      where: { id: report.id },
      data: { status: "RESOLVED", outcome: "NOT_AN_ERROR", explanation: "Only the first is right.", resolvedAt: new Date() },
    });
    await page.getByRole("tab", { name: "My reports", exact: true }).click();
    const mine = page.getByRole("list", { name: "Your reports" }).locator(":scope > li");
    await expect(mine).toHaveCount(1);
    await expect(mine.first()).toContainText("Resolved");
    await expect(mine.first()).toContainText("The question was not wrong");
    await expect(mine.first()).toContainText("Only the first is right.");
    await checkBothThemes(page, "my reports");
  });
});

/// Picks a child in the guardian's list by the start of their name (the option reads "Name (admission number)"). The list arrives after the page, so it is waited for.
async function chooseChild(page: Page, first: string) {
  const pupils = page.getByLabel("Pupil");
  await expect(pupils.locator("option", { hasText: new RegExp(`^${first}`) })).toHaveCount(1);
  const options = await pupils.locator("option").allTextContents();
  await pupils.selectOption({ label: options.find((o) => o.startsWith(first))! });
}

test.describe("a guardian's page", () => {
  test("the guardian chooses a child and sees as much as the school allows: how it is going, nothing, or all; and no approved link, no child", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    const mum = await guardianOf(school, [w.ada.student.id, w.bola.student.id], "APPROVED", "Mum");
    const items = [];
    for (let i = 1; i <= 3; i++)
      items.push(await approvedItem(school.id, null, w.admin.user.id, { subjectLabel: "Biology", subjectKey: "biology", topic: "Cells" }));
    const s = await db.practiceSession.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        studentId: w.ada.student.id,
        subjectLabel: "Biology",
        subjectKey: "biology",
        size: 2,
        itemIds: [items[0]!.id, items[1]!.id],
        feedbackMode: "EACH",
        finishedAt: new Date(),
      },
    });
    await db.practiceAttempt.create({
      data: {
        tenantId: school.id,
        sessionId: s.id,
        studentId: w.ada.student.id,
        bankItemId: items[0]!.id,
        version: 1,
        answer: "a",
        correct: true,
      },
    });
    await db.practiceAttempt.create({
      data: {
        tenantId: school.id,
        sessionId: s.id,
        studentId: w.ada.student.id,
        bankItemId: items[1]!.id,
        version: 1,
        answer: "b",
        correct: false,
      },
    });

    await signInThroughUi(page, mum.user);
    await page.goto(CHILDREN());
    await expect(page.getByRole("heading", { level: 1, name: "My children" })).toBeVisible();
    await chooseChild(page, "Ada");

    // the school's default for a guardian: how it is going, never a question
    await setBank(school.id, w.admin.user.id, "bank.parents.view", "SUMMARY");
    await page.reload();
    await chooseChild(page, "Ada");
    await expect(page.getByRole("region", { name: "How practice is going" })).toContainText("Right: 1 of 2");
    await expect(page.getByText("cell part")).toHaveCount(0);
    await checkBothThemes(page, "the guardian's summary");

    // nothing at all
    await db.questionBankSetting.deleteMany({ where: { tenantId: school.id, key: "bank.parents.view" } });
    await setBank(school.id, w.admin.user.id, "bank.parents.view", "NONE");
    await page.reload();
    await expect(page.getByRole("tabpanel", { name: "Practice" }).getByRole("alert")).toContainText(
      "Practice view is disabled for guardians.",
    );

    // the whole history, read only
    await db.questionBankSetting.deleteMany({ where: { tenantId: school.id, key: "bank.parents.view" } });
    await setBank(school.id, w.admin.user.id, "bank.parents.view", "FULL");
    await page.reload();
    await chooseChild(page, "Ada");
    await expect(page.getByRole("list", { name: "Practice sessions" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Archive|Continue|Finish it|Report a problem|Download PDF/ })).toHaveCount(0);

    // a guardian whose link is not approved has no child
    // a link that is only pending names nobody (a second person signs in in a context of their own)
    const pending = await guardianOf(school, [w.ada.student.id], "PENDING", "Pending");
    const apart = await browser.newContext({ baseURL: baseURL! });
    const pendingPage = await apart.newPage();
    await signInThroughUi(pendingPage, pending.user);
    await pendingPage.goto(CHILDREN());
    await expect(pendingPage.getByText("No pupil is linked to your account yet.")).toBeVisible();
    await apart.close();
  });
});

test.describe("the public questionnaire page", () => {
  async function survey(w: World, over: { status?: "PUBLISHED" | "CLOSED"; closesAt?: Date } = {}) {
    const shareToken = crypto.randomBytes(16).toString("hex");
    const form = await db.form.create({
      data: {
        tenantId: school.id,
        campusId: w.north.id,
        kind: "QUESTIONNAIRE",
        title: `${tag} Lunch survey`,
        instructions: "Tell us how lunch was.",
        status: over.status ?? "PUBLISHED",
        closesAt: over.closesAt ?? null,
        isAnonymous: true,
        shareToken,
        createdById: w.admin.user.id,
      },
    });
    await db.formAudience.create({ data: { tenantId: school.id, formId: form.id, kind: "PUBLIC" } });
    await db.formQuestion.create({
      data: {
        tenantId: school.id,
        formId: form.id,
        prompt: "Which meal do you like best?",
        questionType: "SINGLE",
        options: [
          { id: "a", text: "Rice" },
          { id: "b", text: "Beans" },
        ],
        points: 0,
        sortOrder: 0,
      },
    });
    return { form, token: shareToken, url: `/q/${school.code}/${shareToken}` };
  }
  const main = (page: Page) => page.getByRole("main");

  test("anyone with the link answers signed out; the school is not named; this browser is then told it has answered, and another may still answer", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    const s = await survey(w);
    await page.goto(s.url);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Lunch survey` })).toBeVisible();
    await expect(main(page)).toContainText("Your answers are sent without your name.");
    await expect(page.locator("body")).not.toContainText(school.name);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await checkBothThemes(page, "the public questionnaire");

    await main(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(main(page)).toContainText("Answer at least one question.");
    await main(page).getByRole("radio", { name: "Beans" }).check();
    await main(page).getByRole("button", { name: "Send my answers" }).click();
    await expect(main(page)).toContainText("Thank you. Your answers were sent.");
    expect(await db.formResponse.count({ where: { formId: s.form.id } })).toBe(1);

    await page.reload();
    await expect(main(page)).toContainText("You have already answered this questionnaire from this browser. Thank you.");
    await expect(main(page).getByRole("button", { name: "Send my answers" })).toHaveCount(0);
    await checkBothThemes(page, "the already-answered page");

    const other = await browser.newContext({ baseURL: baseURL! });
    const second = await other.newPage();
    await second.goto(s.url);
    await second.getByRole("main").getByRole("radio", { name: "Rice" }).check();
    await second.getByRole("main").getByRole("button", { name: "Send my answers" }).click();
    await expect(second.getByRole("main")).toContainText("Thank you. Your answers were sent.");
    expect(await db.formResponse.count({ where: { formId: s.form.id } })).toBe(2);
    await other.close();
  });

  test("a link that cannot be answered says why in a sentence, and the school's code in the address must be the school's own", async ({
    page,
  }) => {
    const w = await world();
    // a questionnaire whose window has ended says so; one the school closed by hand is not offered at all (the link no longer names anything)
    const ended = await survey(w, { closesAt: new Date(Date.now() - 60_000) });
    await page.goto(ended.url);
    await expect(main(page)).toContainText("This questionnaire is closed.");
    const closed = await survey(w, { status: "CLOSED" });
    await page.goto(closed.url);
    await expect(main(page)).toContainText("This link doesn't match a questionnaire.");
    await page.goto(`/q/${school.code}/${"0".repeat(32)}`);
    await expect(main(page)).toContainText("This link doesn't match a questionnaire.");
    const open = await survey(w);
    await page.goto(`/q/someone-elses-school/${open.token}`);
    await expect(main(page)).toContainText("This link doesn't match a questionnaire.");
    await expect(page.locator("body")).not.toContainText(`${tag} Lunch survey`);
  });
});
