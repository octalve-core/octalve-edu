import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0074, two things the questionnaire screens said wrongly: (1) the Results tab listed the answers to a "Rating (1 to 5)" question as raw numbers, the way written answers are listed, instead of
// counting how many people gave each rating; (2) the link box of a public questionnaire that has been CLOSED said "The link works once the questionnaire is published." The questionnaires are made
// in the database (the builder is tested in forms-screens); this is what the two screens say. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes, on a desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    // the theme fades for 150 ms: a scan taken inside it measures a colour between the two themes
    await page.waitForTimeout(250);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} [${theme} theme]`,
    ).toEqual([]);
    // Against the VISUAL viewport: a phone widens its layout viewport to fit an overflowing page, so `innerWidth` would grow with the overflow and the check could never fail.
    const { scrollWidth, width } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
    }));
    expect(scrollWidth, `horizontal overflow on ${what} [${theme} theme]`).toBeLessThanOrEqual(width);
  }
  await setTheme(page, initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

test.beforeAll(async () => {
  await seedInstance();
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school, its administrator signed in, and a questionnaire of the administrator's: `made` fills in what differs.
async function world(
  page: Page,
  title: string,
  made: { status: "PUBLISHED" | "CLOSED"; audience: "PUBLIC" | "MEMBERS"; shareToken?: string },
) {
  const school = await createTenant({ name: `Q${Date.now().toString(36).toUpperCase()} School`, campuses: ["North"] });
  const admin = await member(school, Role.ADMIN, null, "Results Admin");
  const form = await db.form.create({
    data: {
      tenantId: school.id,
      kind: "QUESTIONNAIRE",
      title,
      status: made.status,
      isAnonymous: false,
      shareToken: made.shareToken ?? null,
      createdById: admin.user.id,
    },
  });
  await db.formAudience.create({ data: { tenantId: school.id, formId: form.id, kind: made.audience } });
  const rating = await db.formQuestion.create({
    data: { tenantId: school.id, formId: form.id, prompt: "How was the term for you?", questionType: "RATING", points: 0, sortOrder: 0 },
  });
  await signInThroughUi(page, admin.user);
  return { school, form, rating };
}

test("the results of a rating question count how many people gave each rating", async ({ page }) => {
  const { school, form, rating } = await world(page, "Term survey", { status: "PUBLISHED", audience: "MEMBERS" });
  for (const value of [4, 4, 5]) {
    const response = await db.formResponse.create({
      data: { tenantId: school.id, formId: form.id, status: "COMPLETED", startedAt: new Date(), submittedAt: new Date() },
    });
    await db.formAnswer.create({ data: { tenantId: school.id, responseId: response.id, formQuestionId: rating.id, value } });
  }
  await page.goto(`/schools/${school.code}/forms/${form.id}`);
  await waitForHydration(page);
  await page.getByRole("tab", { name: "Results" }).click();
  const summary = page.getByRole("list", { name: "Summary by question" });
  await expect(summary).toContainText("How was the term for you?");
  const counts = summary.getByRole("listitem").filter({ hasText: "How was the term for you?" }).getByRole("listitem");
  await expect(counts).toHaveText(["10 (0%)", "20 (0%)", "30 (0%)", "42 (67%)", "51 (33%)"]);
  await checkBothThemes(page, "the results of a rating question");
});

test("a closed public questionnaire's link box says it is closed, in the list and on its page", async ({ page }) => {
  const { school, form } = await world(page, "Open day feedback", { status: "CLOSED", audience: "PUBLIC", shareToken: "c".repeat(32) });
  await page.goto(`/schools/${school.code}/forms`);
  await waitForHydration(page);
  await page.getByRole("tab", { name: "Questionnaires" }).click();
  const row = page.getByRole("listitem").filter({ hasText: "Open day feedback" });
  await expect(row).toContainText("This questionnaire is closed. Its link no longer opens.");
  await expect(row).not.toContainText("The link works once the questionnaire is published.");
  await page.goto(`/schools/${school.code}/forms/${form.id}`);
  await waitForHydration(page);
  await expect(page.getByRole("tabpanel")).toContainText("This questionnaire is closed. Its link no longer opens.");
  await expect(page.getByRole("tabpanel")).not.toContainText("The link works once the questionnaire is published.");
  await checkBothThemes(page, "a closed public questionnaire's page");
});
