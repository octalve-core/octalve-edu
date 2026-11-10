import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { approvedItem, member, pupil } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// Printing and offering a quiz question back, in a real browser (task 0025, slice O6): a teacher prints a question with the answer key and a reason, a reviewer reads the print log, the log is
// filtered by what was printed, and a teacher who manages a quiz reads its questions, offers one to the question bank and prints the quiz. The APIs are tested in
// tests/api/question-bank-printing.spec.ts; this is the screen: what is offered to whom, and the API's refusal shown as the sentence it sends. Axe (WCAG 2.2 A/AA) and horizontal overflow
// run in BOTH themes, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, `${what} [${theme} theme]`);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `horizontal overflow on ${what} [${theme} theme]`).toBeLessThanOrEqual(innerWidth);
  }
  await setTheme(page, initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

let tag = "";
let school: TestTenant;
test.beforeEach(async () => {
  tag = `P${Date.now().toString(36).toUpperCase()}`;
  await seedInstance();
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialogNamed = (page: Page, name: string): Locator => page.getByRole("dialog", { name, exact: true });
const BANK = () => `/schools/${school.code}/question-bank`;
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/// A school with one campus and the people printing involves: the teacher who prints, a reviewer who reads the log, the school's administrator, and a pupil for a handout.
async function world() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const teacher = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Teacher`);
  const reviewer = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Reviewer`);
  await db.questionBankReviewer.create({
    data: { tenantId: school.id, userId: reviewer.user.id, assignedById: admin.user.id, scope: "GENERAL", campusId: north.id } as never,
  });
  const ada = await pupil(school, north.id, null, `${tag}Zainab`);
  return { north, admin, teacher, reviewer, ada };
}
type World = Awaited<ReturnType<typeof world>>;

/// A published quiz of the campus with one question, as someone who manages quizzes sees it on the Coursework page.
async function quizOf(w: World) {
  const subject = await db.subject.create({ data: { tenantId: school.id, name: "Civics", code: `CIV${tag}`.slice(0, 12) } });
  const quiz = await db.quiz.create({
    data: {
      tenantId: school.id,
      campusId: w.north.id,
      subjectId: subject.id,
      title: `${tag} Civics Check`,
      instructions: "Answer every question.",
      status: "PUBLISHED",
    } as never,
  });
  await db.quizQuestion.create({
    data: {
      tenantId: school.id,
      quizId: quiz.id,
      prompt: `${tag} What is the capital of Nigeria?`,
      questionType: "MULTIPLE_CHOICE",
      options: [
        { id: "a", text: "Lagos" },
        { id: "b", text: "Abuja" },
      ],
      correctAnswer: "b",
      points: 3,
      sortOrder: 0,
    } as never,
  });
  return quiz;
}

async function openBank(page: Page, user: { email: string; password: string }) {
  await signInThroughUi(page, user);
  await page.goto(BANK());
  await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
}
const logRows = (page: Page): Locator => page.getByRole("list", { name: "Print log", exact: true }).locator(":scope > li");

test.describe("printing a question", () => {
  test("a teacher prints it with the key and a reason; a reviewer finds the line in the print log; a teacher who does not review has no Print log", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    const item = await approvedItem(school.id, w.north.id, w.reviewer.user.id, { prompt: `${tag} Which planet is nearest to the Sun?` });
    await openBank(page, w.teacher.user);
    // not a reviewer, not an administrator: no Print log tab
    await expect(tab(page, "Print log")).toHaveCount(0);

    await page.getByRole("button", { name: new RegExp(`${tag} Which planet`) }).click();
    const detail = dialogNamed(page, "Question");
    await detail.getByRole("button", { name: "Print", exact: true }).click();
    const ask = dialogNamed(page, "Print this question");
    await expect(ask).toBeVisible();
    await checkBothThemes(page, "print a question");

    await ask.getByLabel("Include the answer key").check();
    await ask.getByLabel("Reason (optional)").fill("Handout for the Monday revision class");
    const download = page.waitForEvent("download");
    await ask.getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(ask).toBeHidden();
    await expect(detail.getByText("The PDF was downloaded and the print is in the print log.")).toBeVisible();

    const log = await db.questionBankPrintLog.findFirstOrThrow({ where: { tenantId: school.id } });
    expect(log).toMatchObject({
      targetKind: "QUESTION_BANK_ITEM",
      targetId: item.id,
      printedById: w.teacher.user.id,
      reason: "Handout for the Monday revision class",
    });

    // the reviewer reads it
    const other = await browser.newContext({ baseURL: baseURL! });
    const reviewerPage = await other.newPage();
    await openBank(reviewerPage, w.reviewer.user);
    await tab(reviewerPage, "Print log").click();
    await expect(logRows(reviewerPage)).toHaveCount(1);
    await expect(logRows(reviewerPage).first()).toContainText("A question");
    await expect(logRows(reviewerPage).first()).toContainText(`printed by ${tag} Teacher`);
    await expect(logRows(reviewerPage).first()).toContainText("Reason: Handout for the Monday revision class");
    await checkBothThemes(reviewerPage, "the print log");
    await other.close();
  });

  test("a print the API refuses is shown as the sentence it sends, and nothing is downloaded", async ({ page }) => {
    const w = await world();
    await approvedItem(school.id, w.north.id, w.reviewer.user.id, { prompt: `${tag} Which planet is nearest to the Sun?` });
    await openBank(page, w.teacher.user);
    await page.getByRole("button", { name: new RegExp(`${tag} Which planet`) }).click();
    const detail = dialogNamed(page, "Question");
    await page.route("**/api/v1/schools/*/question-bank/print", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "This exam is restricted to exam approvers and administrators." } }),
      }),
    );
    await detail.getByRole("button", { name: "Print", exact: true }).click();
    const ask = dialogNamed(page, "Print this question");
    await ask.getByRole("button", { name: "Download PDF" }).click();
    await expect(ask.getByRole("alert")).toContainText("This exam is restricted to exam approvers and administrators.");
    await expect(detail.getByText("The PDF was downloaded and the print is in the print log.")).toHaveCount(0);
    expect(await db.questionBankPrintLog.count({ where: { tenantId: school.id } })).toBe(0);
  });
});

test.describe("the print log", () => {
  test("lists the lines newest first, filters by what was printed, and shows a handout's recipient and reason", async ({ page }) => {
    const w = await world();
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000);
    await db.questionBankPrintLog.createMany({
      data: [
        {
          tenantId: school.id,
          campusId: w.north.id,
          printedById: w.teacher.user.id,
          targetKind: "QUIZ",
          targetId: "quiz-1",
          title: `${tag} Term One Civics Check`,
          watermark: "w1",
          pageCount: 2,
          printedAt: at(5),
        },
        {
          tenantId: school.id,
          campusId: w.north.id,
          printedById: w.teacher.user.id,
          targetKind: "FORM",
          targetId: "form-1",
          title: `${tag} Fractions practice`,
          watermark: "w2",
          pageCount: 1,
          reason: "Take-home copy",
          recipientStudentId: w.ada.student.id,
          printedAt: at(1),
        },
      ] as never,
    });
    await openBank(page, w.admin.user);
    await tab(page, "Print log").click();
    await expect(logRows(page)).toHaveCount(2);
    await expect(logRows(page).nth(0)).toContainText(`${tag} Fractions practice`);
    await expect(logRows(page).nth(0)).toContainText(`Handout for ${tag}Zainab`);
    await expect(logRows(page).nth(0)).toContainText("Reason: Take-home copy");
    await expect(logRows(page).nth(1)).toContainText(`${tag} Term One Civics Check`);
    await expect(logRows(page).nth(1)).toContainText("2 pages");

    await page.getByLabel("What was printed").selectOption({ label: "A quiz" });
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText(`${tag} Term One Civics Check`);
    await page.getByLabel("What was printed").selectOption({ label: "A question" });
    await expect(page.getByText("Nothing of that kind has been printed.")).toBeVisible();
    await checkBothThemes(page, "the print log, filtered");
  });
});

test.describe("a quiz's questions", () => {
  async function openQuestions(page: Page, w: World) {
    await signInThroughUi(page, w.admin.user);
    await page.goto(`/schools/${school.code}/lms`);
    await page.getByRole("button", { name: /Online Quizzes/i }).click();
    await page.getByRole("button", { name: `Questions of ${tag} Civics Check` }).click();
    const list = dialogNamed(page, "Quiz questions");
    await expect(list).toBeVisible();
    return list;
  }

  test("the Questions button lists them; one is offered to the question bank and appears in My questions; the quiz can be printed from the dialog", async ({
    page,
  }) => {
    const w = await world();
    await quizOf(w);
    const list = await openQuestions(page, w);
    await expect(list.getByRole("list", { name: "Questions of the quiz" }).locator(":scope > li")).toHaveCount(1);
    await expect(list).toContainText(`${tag} What is the capital of Nigeria?`);
    await expect(list).toContainText("3 points");
    await checkBothThemes(page, "a quiz's questions");

    await list.getByRole("button", { name: "Offer to the question bank" }).click();
    const offer = dialogNamed(page, "Offer to the question bank");
    await expect(offer.getByLabel("Subject")).toHaveValue("Civics");
    await offer.getByLabel("Topic (optional)").fill("Government");
    await offer.getByLabel("Difficulty (optional)").selectOption({ index: 3 });
    await offer.getByRole("button", { name: "Offer it" }).click();
    await expect(offer).toBeHidden();
    await expect(list.getByText("Offered to the question bank.")).toBeVisible();
    await expect(list.getByText(/Offered\. A reviewer will look at it/)).toBeVisible();
    const offered = await db.questionBankItem.findFirstOrThrow({
      where: { tenantId: school.id, prompt: `${tag} What is the capital of Nigeria?` },
    });
    expect(offered).toMatchObject({ status: "PENDING", topic: "Government", subjectLabel: "Civics" });

    const download = page.waitForEvent("download");
    await list.getByRole("button", { name: "Print this quiz" }).click();
    await dialogNamed(page, "Print this quiz").getByRole("button", { name: "Download PDF" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    await expect(list.getByText("The PDF was downloaded and the print is in the print log.")).toBeVisible();
    expect(await db.questionBankPrintLog.count({ where: { tenantId: school.id, targetKind: "QUIZ" } })).toBe(1);
  });

  test("an offer the API refuses is shown as the sentence it sends", async ({ page }) => {
    const w = await world();
    await quizOf(w);
    const list = await openQuestions(page, w);
    await page.route("**/api/v1/schools/*/question-bank/items/offer-back", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "FORBIDDEN", message: "You may only offer questions from quizzes you manage." } }),
      }),
    );
    await list.getByRole("button", { name: "Offer to the question bank" }).click();
    const offer = dialogNamed(page, "Offer to the question bank");
    await offer.getByRole("button", { name: "Offer it" }).click();
    await expect(offer.getByRole("alert")).toContainText("You may only offer questions from quizzes you manage.");
    expect(await db.questionBankItem.count({ where: { tenantId: school.id, prompt: { contains: "capital of Nigeria" } } })).toBe(0);
  });
});
