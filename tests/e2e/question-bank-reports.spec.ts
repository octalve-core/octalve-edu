import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { approvedItem, member, pupil, setBank, type Person, type Pupil } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The question bank's reports in a real browser (task 0025, slice O6): a teacher reports a problem on a question, a reviewer reads the reports and answers them, and a reporter reads
// their own. The APIs are tested in tests/api/question-report-guards.spec.ts and question-report-regrade.spec.ts; this is the screen: what is offered to whom, what is said when the person
// gets it wrong, and the API's refusal shown as a sentence. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes, on desktop and on a phone.

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
  tag = `R${Date.now().toString(36).toUpperCase()}`;
  await seedInstance();
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialogNamed = (page: Page, name: string): Locator => page.getByRole("dialog", { name, exact: true });
const PAGE_URL = () => `/schools/${school.code}/question-bank`;
const SHORT_REASON_SENTENCE = "Say what is wrong in at least 5 characters.";
const NO_REASON_SENTENCE = "Give a reason, at least 3 characters.";
const REASON = "The key says Second but the picture shows First.";

/// A school with one campus and the people a report involves: the teacher who wrote the question, another who reports it, a reviewer (named by the school), the school's administrator and a
/// pupil whose name must never be shown to a reviewer.
async function world() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const writer = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Writer`);
  const reporter = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Reporter`);
  const reviewer = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Reviewer`);
  await db.questionBankReviewer.create({
    data: { tenantId: school.id, userId: reviewer.user.id, assignedById: admin.user.id, scope: "GENERAL", campusId: north.id } as never,
  });
  const ada = await pupil(school, north.id, null, `${tag}Zainab`);
  const item = await approvedItem(school.id, north.id, writer.user.id, { prompt: `${tag} Which planet is nearest to the Sun?` });
  return { north, admin, writer, reporter, reviewer, ada, item };
}
type World = Awaited<ReturnType<typeof world>>;

const teacherReport = (w: World, reason = REASON) =>
  db.questionReport.create({
    data: {
      tenantId: school.id,
      campusId: w.north.id,
      bankItemId: w.item.id,
      reporterUserId: w.reporter.user.id,
      reporterRole: "TEACHER",
      reason,
    } as never,
  });
const pupilReport = (w: World, who: Pupil = w.ada, reason = "I think two of the answers are right.") =>
  db.questionReport.create({
    data: {
      tenantId: school.id,
      campusId: w.north.id,
      bankItemId: w.item.id,
      reporterUserId: who.user.id,
      reporterRole: "PUPIL",
      reporterStudentId: who.student.id,
      reason,
    } as never,
  });

async function openBank(page: Page, who: Person) {
  await signInThroughUi(page, who.user);
  await page.goto(PAGE_URL());
  await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
}
async function openQuestion(page: Page) {
  await page.getByRole("button", { name: new RegExp(`${tag} Which planet`) }).click();
  const detail = dialogNamed(page, "Question");
  await expect(detail).toBeVisible();
  return detail;
}
const reportRows = (page: Page): Locator => page.getByRole("list", { name: "Reports", exact: true }).locator(":scope > li");
const reportsTab = (page: Page) => page.getByRole("tab", { name: "Reports", exact: true });

test.describe("a teacher reports a problem", () => {
  test("it is offered on an approved question someone else wrote; a short reason is refused on the screen; a second report is refused in the API's words", async ({
    page,
  }) => {
    const w = await world();
    await openBank(page, w.reporter);
    const detail = await openQuestion(page);
    await expect(detail.getByRole("button", { name: "Report a problem" })).toBeVisible();

    await detail.getByRole("button", { name: "Report a problem" }).click();
    const ask = dialogNamed(page, "Report a problem with this question");
    await expect(ask).toBeVisible();
    await checkBothThemes(page, "report a problem");

    // nothing typed, then too little: told in words, and nothing is sent
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByText(SHORT_REASON_SENTENCE)).toBeVisible();
    await ask.getByLabel("What is wrong with it?").fill("abc");
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByText(SHORT_REASON_SENTENCE)).toBeVisible();
    expect(await db.questionReport.count({ where: { tenantId: school.id } })).toBe(0);

    await ask.getByLabel("What is wrong with it?").fill(REASON);
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask).toBeHidden();
    await expect(detail.getByText("Your report went to the reviewers.")).toBeVisible();
    const filed = await db.questionReport.findFirstOrThrow({ where: { tenantId: school.id } });
    expect(filed).toMatchObject({
      bankItemId: w.item.id,
      reporterRole: "TEACHER",
      reporterUserId: w.reporter.user.id,
      status: "OPEN",
      reason: REASON,
      campusId: w.north.id,
    });

    // a person has one waiting report on a question: the API says so, the screen shows its sentence and the first report stays the only one
    await detail.getByRole("button", { name: "Report a problem" }).click();
    const again = dialogNamed(page, "Report a problem with this question");
    await again.getByLabel("What is wrong with it?").fill("The picture is also blurred.");
    await again.getByRole("button", { name: "Send report" }).click();
    await expect(again.getByRole("alert")).toContainText("You have already reported this question; your report is waiting for a reviewer.");
    expect(await db.questionReport.count({ where: { tenantId: school.id } })).toBe(1);
  });

  test("it is not offered on a question the person wrote, and the switch for teachers' reports is respected in the API's words", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    await openBank(page, w.writer);
    const own = await openQuestion(page);
    await expect(own).toContainText("Written by: You");
    await expect(own.getByRole("button", { name: "Report a problem" })).toHaveCount(0);

    // reporting by teachers switched off for the school: the button is still offered (the screen does not read settings), the API refuses, and the sentence is shown
    await setBank(school.id, w.admin.user.id, "bank.reports.teachers", false);
    const other = await browser.newContext({ baseURL: baseURL! });
    const reporterPage = await other.newPage();
    await openBank(reporterPage, w.reporter);
    const detail = await openQuestion(reporterPage);
    await detail.getByRole("button", { name: "Report a problem" }).click();
    const ask = dialogNamed(reporterPage, "Report a problem with this question");
    await ask.getByLabel("What is wrong with it?").fill(REASON);
    await ask.getByRole("button", { name: "Send report" }).click();
    await expect(ask.getByRole("alert")).toContainText("Question reporting by teachers is currently disabled.");
    expect(await db.questionReport.count({ where: { tenantId: school.id } })).toBe(0);
    await other.close();
  });
});

test.describe("a reviewer reads and answers the reports", () => {
  test("the Reports section is for reviewers; reporters are shown by role and campus, never by name; the filter finds answered reports", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    await teacherReport(w);
    await pupilReport(w);

    // a teacher who is not a reviewer has no such section
    const other = await browser.newContext({ baseURL: baseURL! });
    const reporterPage = await other.newPage();
    await openBank(reporterPage, w.reporter);
    await expect(reporterPage.getByRole("tab", { name: "Review queue" })).toHaveCount(0);
    await expect(reportsTab(reporterPage)).toHaveCount(0);
    await other.close();

    await openBank(page, w.reviewer);
    await reportsTab(page).click();
    await expect(reportsTab(page)).toHaveAttribute("aria-selected", "true");
    await expect(reportRows(page)).toHaveCount(2);
    const teacherRow = reportRows(page).filter({ hasText: "The key says Second" });
    await expect(teacherRow).toContainText("Teacher in North");
    await expect(teacherRow).toContainText("Waiting");
    const pupilRow = reportRows(page).filter({ hasText: "I think two of the answers are right." });
    await expect(pupilRow.getByText(/^Pupil( |$)/)).toBeVisible();
    // no name, no admission number: the API masks them and the screen does not go and fetch them
    for (const secret of [`${tag}Zainab`, w.ada.user.email, `${tag} Reporter`])
      await expect(page.getByRole("tabpanel")).not.toContainText(secret);
    await checkBothThemes(page, "reports (waiting)");

    // nothing answered yet: the other states are empty, in words
    await page.getByLabel("Show", { exact: true }).selectOption({ label: "Resolved" });
    await expect(page.getByText("No reports to show.")).toBeVisible();
    await page.getByLabel("Show", { exact: true }).selectOption({ label: "All" });
    await expect(reportRows(page)).toHaveCount(2);
    await page.getByLabel("Show", { exact: true }).selectOption({ label: "Waiting" });

    // the question opens from its report
    await teacherRow.getByRole("button", { name: new RegExp(`${tag} Which planet`) }).click();
    await expect(dialogNamed(page, "Question").getByText(new RegExp(`${tag} Which planet`))).toBeVisible();
  });

  test("answering: a choice and a reason are asked for; the answer is kept; the report leaves Waiting and shows its outcome and reason; no correction is offered when nothing copied the question", async ({
    page,
  }) => {
    const w = await world();
    const report = await teacherReport(w);
    await openBank(page, w.reviewer);
    await reportsTab(page).click();
    await reportRows(page).first().getByRole("button", { name: "Answer this report" }).click();
    const ask = dialogNamed(page, "Answer this report");
    await expect(ask).toContainText("A pupil who reported it sees the outcome and your reason.");
    await checkBothThemes(page, "answer a report");

    // nothing chosen, then no reason: told in words, and the report is untouched
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText("Choose what you decided.")).toBeVisible();
    await ask.getByLabel("Outcome").selectOption("NOT_AN_ERROR");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText(NO_REASON_SENTENCE)).toBeVisible();
    await ask.getByLabel("Your reason").fill("ab");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask.getByText(NO_REASON_SENTENCE)).toBeVisible();
    expect((await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).status).toBe("OPEN");

    await ask.getByLabel("Your reason").fill("The picture is of Mercury; the key is right.");
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByText("Report answered.")).toBeVisible();
    await expect(page.getByText("No report is waiting for you.")).toBeVisible();
    expect(await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      status: "DISMISSED",
      outcome: "NOT_AN_ERROR",
      explanation: "The picture is of Mercury; the key is right.",
      resolvedById: w.reviewer.user.id,
    });

    await page.getByLabel("Show", { exact: true }).selectOption({ label: "Dismissed" });
    const row = reportRows(page).first();
    await expect(row).toContainText("Not an error");
    await expect(row).toContainText("The picture is of Mercury; the key is right.");
    await expect(row.getByRole("button", { name: "Answer this report" })).toHaveCount(0);
    await checkBothThemes(page, "reports (answered)");
  });

  test("a report someone else has just answered is refused in the API's words and the list is brought up to date", async ({ page }) => {
    const w = await world();
    const report = await teacherReport(w);
    await openBank(page, w.reviewer);
    await reportsTab(page).click();
    await reportRows(page).first().getByRole("button", { name: "Answer this report" }).click();
    const ask = dialogNamed(page, "Answer this report");
    await ask.getByLabel("Outcome").selectOption("NEEDS_DISCUSSION");
    await ask.getByLabel("Your reason").fill("We will talk about it on Monday.");

    // another reviewer answers it first
    await db.questionReport.update({
      where: { id: report.id },
      data: {
        status: "DISMISSED",
        outcome: "NOT_AN_ERROR",
        explanation: "Already checked.",
        resolvedById: w.admin.user.id,
        resolvedAt: new Date(),
      },
    });
    await ask.getByRole("button", { name: "Answer report" }).click();
    await expect(
      page
        .getByRole("main")
        .getByRole("alert")
        .filter({ hasText: /already been (resolved|answered)|already resolved/i }),
    ).toBeVisible();
    await expect(ask).toBeHidden();
    await expect(page.getByText("No report is waiting for you.")).toBeVisible();
    expect(await db.questionReport.findUniqueOrThrow({ where: { id: report.id } })).toMatchObject({
      outcome: "NOT_AN_ERROR",
      explanation: "Already checked.",
    });
  });
});

test.describe("who is asked", () => {
  test("the school's administrator, who is not a reviewer by name, still sees the Reports section; a pupil reaches nothing", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    await pupilReport(w);
    await openBank(page, w.admin);
    await reportsTab(page).click();
    await expect(reportRows(page)).toHaveCount(1);

    const context = await browser.newContext({ baseURL: baseURL! });
    const pupilPage = await context.newPage();
    await signInThroughUi(pupilPage, w.ada.user);
    await pupilPage.goto(PAGE_URL());
    await expect(pupilPage.getByRole("heading", { level: 1, name: "Question bank" })).toHaveCount(0);
    await expect(pupilPage.getByRole("tab", { name: "Reports", exact: true })).toHaveCount(0);
    await context.close();
  });
});

test.describe("a reporter reads their own reports", () => {
  test("every member of staff has My reports: waiting, then the reviewer's outcome and reason; another teacher sees only their own", async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = await world();
    const report = await teacherReport(w);
    await openBank(page, w.reporter);
    await page.getByRole("tab", { name: "My reports", exact: true }).click();
    const mine = page.getByRole("list", { name: "Your reports" }).locator(":scope > li");
    await expect(mine).toHaveCount(1);
    await expect(mine.first()).toContainText(`${tag} Which planet`);
    await expect(mine.first()).toContainText("Waiting");
    await expect(mine.first()).toContainText(`What you wrote: ${REASON}`);
    // not a reviewer: the reviewers' Reports tab is still not theirs
    await expect(reportsTab(page)).toHaveCount(0);
    await checkBothThemes(page, "my reports (waiting)");

    await db.questionReport.update({
      where: { id: report.id },
      data: {
        status: "RESOLVED",
        outcome: "FIXED",
        explanation: "The key now says First.",
        resolvedAt: new Date(),
        resolvedById: w.reviewer.user.id,
      },
    });
    await page.reload();
    await page.getByRole("tab", { name: "My reports", exact: true }).click();
    await expect(mine.first()).toContainText("Resolved");
    await expect(mine.first()).toContainText("Fixed");
    await expect(mine.first()).toContainText("Reason: The key now says First.");
    await checkBothThemes(page, "my reports (answered)");

    // another teacher filed nothing, and sees nothing of this one's
    const other = await browser.newContext({ baseURL: baseURL! });
    const writerPage = await other.newPage();
    await openBank(writerPage, w.writer);
    await writerPage.getByRole("tab", { name: "My reports", exact: true }).click();
    await expect(writerPage.getByText("You have not reported a question.")).toBeVisible();
    await expect(writerPage.getByRole("tabpanel")).not.toContainText(REASON);
    await other.close();
  });
});
