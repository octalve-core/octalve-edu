import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { test, expect } from "../support/fixtures";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { SAAS_URL } from "../support/env";
import { api as rawApi, cookieHeader, loginAs as rawLogin } from "../support/http";
import { signInThroughUi } from "./helpers";

// The question bank's question screens in a real browser (task 0024 slice E): a teacher writes a question with a picture and sends it, a reviewer approves it, another is sent
// back with a reason, and an exam approver sees the overlap warning the writer never sees. Each flow is driven by clicking and typing. Axe (WCAG 2.2 A/AA) and a
// horizontal-overflow check run on every state in BOTH themes, on desktop and on a phone. Screenshots go to out/screenshots.

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
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.waitForLoadState("networkidle");
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
}
const SHOTS = path.resolve(__dirname, "../../out/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const dialogNamed = (page: Page, name: string | RegExp) => page.getByRole("dialog", { name });

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

const api: typeof rawApi = (path, opts = {}) => rawApi(path, { baseUrl: SAAS_URL, ...opts });
const loginAs: typeof rawLogin = (user, opts = {}) => rawLogin(user, { baseUrl: SAAS_URL, ...opts });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `Q${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const PAGE_URL = () => `/schools/${school.code}/question-bank`;
const ITEMS = () => `/api/v1/schools/${school.code}/question-bank/items`;

/// One school with one campus, its administrator, a teacher who writes, a non-teaching reviewer and a teacher who is an exam approver. All of them belong to the one campus.
async function people() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const sup = await createUser({ name: `${tag} Super` });
  await addMembership(sup.id, school.id, Role.ADMIN);
  const writer = await createUser({ name: `${tag} Writer` });
  await addMembership(writer.id, school.id, Role.TEACHING_STAFF, north.id);
  const reviewer = await createUser({ name: `${tag} Reviewer` });
  await addMembership(reviewer.id, school.id, Role.NON_TEACHING_STAFF, north.id);
  const exam = await createUser({ name: `${tag} Exam` });
  await addMembership(exam.id, school.id, Role.TEACHING_STAFF, north.id);
  await db.questionBankReviewer.create({
    data: { tenantId: school.id, userId: reviewer.id, assignedById: sup.id, scope: "GENERAL", campusId: north.id },
  });
  await db.questionBankReviewer.create({
    data: { tenantId: school.id, userId: exam.id, assignedById: sup.id, scope: "GENERAL", campusId: north.id, isExamApprover: true },
  });
  return { north, writer, reviewer, exam };
}

const picture = () =>
  sharp({ create: { width: 120, height: 80, channels: 3, background: "#3366aa" } })
    .png()
    .toBuffer();
const promptFor = (n: number) =>
  `${tag} number ${n}: which of these words belongs with the entry w${n}x${n * 13} in the little alphabet book?`;

/// A question made through the API (quicker than clicking for the flows that are about something else).
async function seedQuestion(who: TestUser, campusId: string, n: number, submit = true) {
  const cookie = cookieHeader((await loginAs(who)).token!);
  const created = await api(ITEMS(), {
    method: "POST",
    cookie,
    body: {
      campusId,
      type: "SINGLE",
      prompt: promptFor(n),
      options: [`alpha${n}`, `beta${n}`, `gamma${n}`],
      correct: 0,
      subject: "Mathematics",
      classTags: ["JSS 1"],
    },
  });
  expect(created.status, created.text).toBe(201);
  const id = created.json.data.item.id as string;
  if (submit) expect((await api(`${ITEMS()}/${id}/submit`, { method: "POST", cookie, body: {} })).status).toBe(200);
  return id;
}

test.describe("writing, sending and approving", () => {
  test("a teacher writes a question with a picture and sends it for review", async ({ page }, info) => {
    const { writer } = await people();
    const prompt = promptFor(1);
    await signInThroughUi(page, writer);
    await page.goto(PAGE_URL());
    await page.getByRole("tab", { name: "My questions" }).click();
    await expect(page.getByText("You have not written a question yet.")).toBeVisible();
    await checkBothThemes(page, "my questions (empty)");

    // an empty form is refused in words, and nothing is saved
    await page.getByRole("button", { name: "Write a question" }).click();
    const form = dialogNamed(page, "Write a question");
    await form.getByRole("button", { name: "Save as a draft" }).click();
    await expect(form.getByRole("alert")).toContainText("The question is required.");
    expect(await db.questionBankItem.count()).toBe(0);

    await form.getByLabel("Question", { exact: true }).fill(prompt);
    await form.getByLabel("Option 1", { exact: true }).fill("Alpha");
    await form.getByLabel("Option 2", { exact: true }).fill("Beta");
    await form.getByLabel("Option 2 is correct").check();
    await form.getByLabel("Subject", { exact: true }).fill("Mathematics");
    await form.getByLabel("Classes", { exact: true }).fill("JSS 1");
    await form.getByLabel("Classes", { exact: true }).press("Enter");
    await expect(form.getByRole("list", { name: "Classes chosen" })).toContainText("JSS 1");
    await checkBothThemes(page, "the question form");
    await page.screenshot({ path: path.join(SHOTS, `question-bank-form-${info.project.name}.png`) });
    await form.getByRole("button", { name: "Save as a draft" }).click();
    await expect(page.getByText("Saved as a draft.")).toBeVisible();
    expect(await db.questionBankItem.count({ where: { status: "DRAFT" } })).toBe(1);

    // a picture needs a description, or to be marked decoration
    await expect(form.getByRole("heading", { name: "Pictures" })).toBeVisible();
    await form.getByLabel("Add a picture").setInputFiles({ name: "diagram.png", mimeType: "image/png", buffer: await picture() });
    await form.getByRole("button", { name: "Add picture" }).click();
    await expect(form.getByRole("alert")).toContainText("Describe the picture");
    await form.getByLabel("Describe the picture").fill("A blue rectangle");
    await form.getByRole("button", { name: "Add picture" }).click();
    await expect(page.getByText("Picture added.")).toBeVisible();
    const shown = form.getByRole("img", { name: "A blue rectangle" });
    await expect(shown).toBeVisible();
    expect(await shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await checkBothThemes(page, "the question form (with a picture)");
    await form.getByRole("button", { name: "Close", exact: true }).last().click(); // the dialog's own X comes first
    await expect(form).toHaveCount(0);

    // the list, the detail with the answer key, and sending it for review
    const row = page.getByRole("button", { name: new RegExp(`${tag} number 1`) });
    await expect(row).toContainText("Draft");
    await expect(row).toContainText("1 picture");
    await row.click();
    const detail = dialogNamed(page, "Question");
    await expect(detail.getByText("Beta")).toContainText("(correct)");
    await expect(detail.getByRole("img", { name: "A blue rectangle" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Approve" })).toHaveCount(0); // the writer cannot decide
    await checkBothThemes(page, "the question (detail)");
    await detail.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Sent for review.")).toBeVisible();
    await expect(detail.getByText("Waiting for review", { exact: true })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Send for review" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Close", exact: true }).last().click();

    expect((await db.questionBankItem.findFirstOrThrow({ where: { prompt } })).status).toBe("PENDING");
    const audited = await db.questionBankAudit.findMany({ orderBy: { createdAt: "asc" }, select: { action: true } });
    expect(audited.map((a) => a.action)).toEqual(["ITEM_CREATED", "IMAGE_ADDED", "ITEM_SUBMITTED"]);
  });

  test("a reviewer sees the queue, approves a question with its subject and classes, and its writer sees it approved", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { north, writer, reviewer } = await people();
    await seedQuestion(writer, north.id, 1);

    // the reviewer: Browse, My questions and Review queue, and nothing of the administrators' tabs
    const context = await browser.newContext({ baseURL: baseURL! });
    const reviewerPage = await context.newPage();
    await signInThroughUi(reviewerPage, reviewer);
    await reviewerPage.goto(PAGE_URL());
    for (const name of ["Browse", "My questions", "Review queue"]) await expect(reviewerPage.getByRole("tab", { name })).toBeVisible();
    for (const name of ["Reviewers", "Settings"]) await expect(reviewerPage.getByRole("tab", { name })).toHaveCount(0);
    await reviewerPage.getByRole("tab", { name: "Review queue" }).click();
    const queued = reviewerPage.getByRole("button", { name: new RegExp(`${tag} number 1`) });
    await expect(queued).toContainText("Waiting for review");
    await checkBothThemes(reviewerPage, "the review queue");
    await queued.click();
    const reviewing = dialogNamed(reviewerPage, "Question");
    await expect(reviewing.getByText("very close")).toHaveCount(0); // a plain reviewer is never told about overlap
    await reviewing.getByRole("button", { name: "Approve" }).click();
    const approve = dialogNamed(reviewerPage, "Approve this question");
    await expect(approve.getByLabel("Subject", { exact: true })).toHaveValue("Mathematics");
    await expect(approve.getByRole("list", { name: "Classes chosen" })).toContainText("JSS 1");
    await expect(approve.getByText("Approved questions are visible to teachers only.")).toBeVisible();
    await expect(approve.getByText("Who may see it")).toHaveCount(0); // that is an exam approver's decision
    await expect(approve.getByLabel(/Make it general/)).toHaveCount(0);
    await checkBothThemes(reviewerPage, "approve dialog (a plain reviewer)");
    await approve.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(reviewerPage.getByText("Approved.")).toBeVisible();
    await reviewing.getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(reviewerPage.getByText("Nothing is waiting for you.")).toBeVisible();
    await context.close();

    // back with the writer
    await signInThroughUi(page, writer);
    await page.goto(PAGE_URL());
    await page.getByRole("tab", { name: "My questions" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`${tag} number 1`) })).toContainText("Approved");
    const audited = await db.questionBankAudit.findMany({ orderBy: { createdAt: "asc" }, select: { action: true } });
    expect(audited.map((a) => a.action)).toEqual(["ITEM_CREATED", "ITEM_SUBMITTED", "ITEM_APPROVED"]);
  });

  test("a question sent back shows its writer the reason, who corrects it and sends it again", async ({ page, browser, baseURL }) => {
    const { north, writer, reviewer } = await people();
    await seedQuestion(writer, north.id, 2);

    const context = await browser.newContext({ baseURL: baseURL! });
    const reviewerPage = await context.newPage();
    await signInThroughUi(reviewerPage, reviewer);
    await reviewerPage.goto(PAGE_URL());
    await reviewerPage.getByRole("tab", { name: "Review queue" }).click();
    await reviewerPage.getByRole("button", { name: new RegExp(`${tag} number 2`) }).click();
    await dialogNamed(reviewerPage, "Question").getByRole("button", { name: "Send back" }).click();
    const reason = dialogNamed(reviewerPage, "Send this question back?");
    await reason.getByRole("button", { name: "Send back" }).click();
    await expect(reason.getByText("Give a reason.")).toBeVisible();
    await checkBothThemes(reviewerPage, "send back dialog");
    await reason.getByLabel("Reason").fill("The second option is also correct.");
    await reason.getByRole("button", { name: "Send back" }).click();
    await expect(reviewerPage.getByText("Sent back to the writer.")).toBeVisible();
    await context.close();

    await signInThroughUi(page, writer);
    await page.goto(PAGE_URL());
    await page.getByRole("tab", { name: "My questions" }).click();
    const row = page.getByRole("button", { name: new RegExp(`${tag} number 2`) });
    await expect(row).toContainText("Sent back");
    await row.click();
    const detail = dialogNamed(page, "Question");
    await expect(detail.getByRole("alert").filter({ hasText: "The second option is also correct." })).toBeVisible();
    await checkBothThemes(page, "a question that was sent back");
    await detail.getByRole("button", { name: "Edit" }).click();
    const form = dialogNamed(page, "Edit the question");
    await form.getByLabel("Option 2", { exact: true }).fill("Not this one");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`${tag} number 2`) }).click();
    await dialogNamed(page, "Question").getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Sent for review.")).toBeVisible();
    expect((await db.questionBankItem.findFirstOrThrow({ where: { prompt: promptFor(2) } })).status).toBe("PENDING");
  });
});

test.describe("exam approvers", () => {
  test("an exam approver sees the overlap warning and chooses who may see the question; the writer never sees a word about it", async ({
    page,
    browser,
    baseURL,
  }) => {
    const { north, writer, exam } = await people();
    const original = await seedQuestion(writer, north.id, 3);
    // a near copy: the same question with a short sentence added
    const cookie = cookieHeader((await loginAs(writer)).token!);
    const copy = await api(ITEMS(), {
      method: "POST",
      cookie,
      body: {
        campusId: north.id,
        type: "SINGLE",
        prompt: `${promptFor(3)} Choose one.`,
        options: ["alpha3", "beta3", "gamma3"],
        correct: 0,
        subject: "Mathematics",
        classTags: ["JSS 1"],
      },
    });
    expect(copy.status, copy.text).toBe(201);
    expect((await api(`${ITEMS()}/${copy.json.data.item.id}/submit`, { method: "POST", cookie, body: {} })).status).toBe(200);

    const context = await browser.newContext({ baseURL: baseURL! });
    const examPage = await context.newPage();
    await signInThroughUi(examPage, exam);
    await examPage.goto(PAGE_URL());
    await examPage.getByRole("tab", { name: "Review queue" }).click();
    await examPage.getByRole("button", { name: /Choose one\./ }).click();
    const detail = dialogNamed(examPage, "Question");
    await expect(detail.getByRole("alert").filter({ hasText: "very close to another" })).toBeVisible();
    await expect(detail.getByText(/\d+% the same as a question in the bank/)).toBeVisible();
    await checkBothThemes(examPage, "the overlap warning");
    await detail.getByRole("button", { name: "Open it" }).click();
    await expect(dialogNamed(examPage, "Question").getByText(promptFor(3).split("\n")[0])).toBeVisible();
    expect(original).toBeTruthy();
    await dialogNamed(examPage, "Question").getByRole("button", { name: "Close", exact: true }).last().click();

    // approving: the choice of who may see it is this person's
    await examPage.getByRole("tab", { name: "Review queue" }).click();
    await examPage.getByRole("button", { name: /Choose one\./ }).click();
    await dialogNamed(examPage, "Question").getByRole("button", { name: "Approve" }).click();
    const approve = dialogNamed(examPage, "Approve this question");
    await approve.getByLabel("Pupils can practise with it now").check();
    await approve.getByLabel("Teachers only until a date").check();
    await approve.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(approve.getByRole("alert")).toContainText("Choose the date and time");
    await checkBothThemes(examPage, "approve dialog (an exam approver)");
    await approve.getByLabel("Pupils can practise with it now").check();
    await approve.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(examPage.getByText("Approved.")).toBeVisible();
    expect((await db.questionBankItem.findFirstOrThrow({ where: { prompt: `${promptFor(3)} Choose one.` } })).visibility).toBe("PRACTICE");
    await context.close();

    // the writer's own view of the same question carries no hint of it
    await signInThroughUi(page, writer);
    await page.goto(PAGE_URL());
    await page.getByRole("tab", { name: "My questions" }).click();
    await page.getByRole("button", { name: /Choose one\./ }).click();
    const own = dialogNamed(page, "Question");
    await expect(own.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(own.getByText(/very close|% the same|overlap/i)).toHaveCount(0);
  });
});
