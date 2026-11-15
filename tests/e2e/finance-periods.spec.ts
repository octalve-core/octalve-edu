import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { activeSession, member, pupil } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Task 0067: after a school copies its year it has two terms with the same name, this year's (current) and next year's (planned). The Finance page names the session of every term it offers
// ("Term 1 · 2046"), and the fee schedules and the invoice generator open on the CURRENT term, so a fee added and invoices generated without choosing anything are this term's (found by the
// walkthrough, where both fees landed on next year's term and the generator made no invoice at all). Every term is read in the tabs, the generator, the filter and the table; what is written is
// read back from the database; axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes, on a desktop and on a phone.

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
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school whose year was copied: this year's session (2046, active) with "Term 1" current, next year's (2047, planned) with a "Term 1" of its own, a class with a pupil enrolled this year, and an administrator.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const thisYear = await activeSession(school); // the session labelled "2046"
  const nextYear = await db.academicSession.create({
    data: { tenantId: school.id, label: "2047", startDate: new Date("2047-09-01"), endDate: new Date("2048-07-01") },
  });
  const current = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: thisYear,
      kind: "TERM",
      ordinal: 1,
      label: "Term 1",
      startDate: new Date("2046-09-02"),
      endDate: new Date("2046-12-20"),
      isCurrent: true,
    },
  });
  const later = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: nextYear.id,
      kind: "TERM",
      ordinal: 1,
      label: "Term 1",
      startDate: new Date("2047-09-02"),
      endDate: new Date("2047-12-20"),
    },
  });
  const ada = await pupil(school, null, `${tag} JSS 1`, `${tag}Ada`);
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  return { admin, current, later, ada };
}

test("every term the finance page offers says its session: the fee tabs, the generator, the filter and the table", async ({ page }) => {
  const { admin, current, ada } = await arrange();
  await db.invoice.create({
    data: {
      tenantId: school.id,
      studentId: ada.student.id,
      periodId: current.id,
      invoiceNo: `INV-${tag}`,
      totalAmount: 90_000,
      lineItems: [],
    },
  });
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/finance`);
  await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();

  // The invoice list: the filter offers both terms by session, and the table's Period column says which session an invoice is for.
  await expect(page.getByLabel("Filter by academic period").getByRole("option", { name: "Term 1 · 2046" })).toHaveCount(1);
  await expect(page.getByLabel("Filter by academic period").getByRole("option", { name: "Term 1 · 2047" })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: `INV-${tag}` })).toContainText("Term 1 · 2046");
  await checkBothThemes(page, "the invoice list of a school with two terms of the same name");

  // The generator.
  await page.getByRole("button", { name: "Generate Term Invoices" }).click();
  await expect(page.getByRole("dialog").getByLabel("Academic Period").getByRole("option", { name: "Term 1 · 2046" })).toHaveCount(1);
  await expect(page.getByRole("dialog").getByLabel("Academic Period").getByRole("option", { name: "Term 1 · 2047" })).toHaveCount(1);
  await checkBothThemes(page, "the invoice generator of a school with two terms of the same name");
  await page.keyboard.press("Escape"); // the dialog has two buttons named "Close" (the header's and the footer's): Escape closes it
  await expect(page.getByRole("dialog")).toBeHidden();

  // The fee schedules.
  await page.getByRole("tab", { name: "Fee structures" }).click();
  await expect(page.getByRole("button", { name: "Term 1 · 2046" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Term 1 · 2047" })).toHaveCount(1);
  await checkBothThemes(page, "the fee schedules of a school with two terms of the same name");
});

test("a fee added and the term's invoices generated without choosing a term are this year's, not next year's", async ({ page }) => {
  const { admin, current, later } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/finance`);
  await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();

  // A fee added without choosing a term lands on the CURRENT one (it used to land on the latest: next year's).
  await page.getByRole("tab", { name: "Fee structures" }).click();
  await page.getByRole("button", { name: "+ Add Fee Schedule" }).click();
  await page.getByRole("dialog").getByLabel("Fee Item Name").fill("Tuition");
  await page.getByRole("dialog").getByLabel("Amount (Naira)").fill("75000");
  await page.getByRole("dialog").getByRole("button", { name: "Create Fee" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: "Tuition" })).toBeVisible();
  const fee = await db.feeStructure.findFirstOrThrow({ where: { tenantId: school.id, name: "Tuition" } });
  expect(fee.periodId, "the fee is on the current term, not on next year's").toBe(current.id);
  expect(fee.periodId).not.toBe(later.id);

  // The generator opens on the current term and bills this year's pupil (it used to open on next year's, which has nobody enrolled, and make no invoice).
  await page.getByRole("tab", { name: "Invoices" }).click();
  await page.getByRole("button", { name: "Generate Term Invoices" }).click();
  const generate = page.getByRole("dialog");
  await expect(generate.getByLabel("Academic Period")).toHaveValue(current.id);
  await generate.getByRole("button", { name: "Generate Invoices" }).click();
  await expect(generate.getByText(/Generated 1 new invoices/)).toBeVisible();
  const invoices = await db.invoice.findMany({ where: { tenantId: school.id } });
  expect(invoices).toHaveLength(1);
  expect(invoices[0].periodId).toBe(current.id);
});
