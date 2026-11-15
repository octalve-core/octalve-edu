import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { activeSession, member, pupil } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Task 0066: the Finance page's fee schedule form and invoice generator name every field. Each visible label is tied to its control, so a screen reader announces the field, the words can be clicked
// to focus it, and a test (or a person with voice control) can ask for "Academic Period". The two dialogs are opened by the school's administrator, every field is found by its label, a fee is made
// and invoices are generated through them, and axe (WCAG 2.2 A/AA) runs with each dialog open in BOTH themes, on a desktop and on a phone.

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

/// A school with an active session and one term, a class with a pupil enrolled in it, and an administrator.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const sessionId = await activeSession(school);
  await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId,
      kind: "TERM",
      ordinal: 1,
      label: "First term",
      startDate: new Date("2046-09-02"),
      endDate: new Date("2046-12-20"),
      isCurrent: true,
    },
  });
  const className = `${tag} JSS 1`;
  await pupil(school, null, className, `${tag}Ada`);
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  return { admin, className };
}

test("the invoice generator and the fee schedule form name every field; their labels focus the fields; a fee is made and invoices are generated through them", async ({
  page,
}) => {
  const { admin, className } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/finance`);
  await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();

  // The fee schedule form first: the invoices need a fee to bill.
  await page.getByRole("tab", { name: "Fee structures" }).click();
  await page.getByRole("button", { name: "+ Add Fee Schedule" }).click();
  const create = page.getByRole("dialog");
  await expect(create.getByLabel("Target Class (Optional)")).toBeVisible(); // a field named by its label
  await expect(create.getByLabel("Target Class (Optional)").getByRole("option", { name: className })).toHaveCount(1);
  // The words are the field's name: clicking them focuses it.
  await create.getByText("Target Class (Optional)", { exact: true }).click();
  await expect(create.getByLabel("Target Class (Optional)")).toBeFocused();
  await checkBothThemes(page, "the fee schedule form");
  await create.getByLabel("Fee Item Name").fill("Tuition");
  await create.getByLabel("Amount (Naira)").fill("75000");
  await create.getByLabel("Target Class (Optional)").selectOption({ label: className });
  await create.getByRole("button", { name: "Create Fee" }).click();
  await expect(create).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Tuition" })).toContainText(`${className} only`);

  // The invoice generator: the term and the due date are found by their labels and the invoices are made.
  await page.getByRole("tab", { name: "Invoices" }).click();
  await page.getByRole("button", { name: "Generate Term Invoices" }).click();
  const generate = page.getByRole("dialog");
  await expect(generate.getByLabel("Academic Period")).toBeVisible();
  await expect(generate.getByLabel("Academic Period").getByRole("option", { name: "First term" })).toHaveCount(1);
  await generate.getByText("Academic Period", { exact: true }).click();
  await expect(generate.getByLabel("Academic Period")).toBeFocused();
  await generate.getByText("Due Date (Optional)", { exact: true }).click();
  await expect(generate.getByLabel("Due Date (Optional)")).toBeFocused();
  await generate.getByLabel("Due Date (Optional)").fill("2046-10-15");
  await expect(generate.getByLabel("Due Date (Optional)")).toHaveValue("2046-10-15");
  await checkBothThemes(page, "the invoice generator");
  await generate.getByRole("button", { name: "Generate Invoices" }).click();
  await expect(generate.getByText(/Generated 1 new invoices/)).toBeVisible();
  expect(await db.invoice.count({ where: { tenantId: school.id } })).toBe(1);
});
