import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// The payment gate on report cards (task 0037) in a real browser: the school turns the setting on in Settings with its password, and staff are told on a card that the school holds it. Every rule is
// tested in tests/api. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
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
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `G${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with a term, a class, a pupil (Ada) with a published mark and an invoice that is owed, and an administrator.
async function arrange(owing = true) {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2081`, startDate: day("2081-09-01"), endDate: day("2082-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2081-09-01"),
      endDate: day("2081-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Form 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  const ada = await db.studentRecord.create({
    data: { tenantId: school.id, firstName: `${tag}Ada`, lastName: "Fees", dateOfBirth: day("2014-01-01"), admissionNo: `${tag}/Ada` },
  });
  await db.studentEnrollment.create({ data: { tenantId: school.id, studentId: ada.id, sessionId: session.id, classArmId: arm.id } });
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: ada.id,
      subjectId: maths.id,
      periodId: term.id,
      score: 88,
      maxScore: 100,
      status: "PUBLISHED",
      verificationToken: `${tag}tok`,
    },
  });
  if (owing)
    await db.invoice.create({
      data: {
        tenantId: school.id,
        studentId: ada.id,
        periodId: term.id,
        invoiceNo: `${tag}-INV`,
        totalAmount: 45000,
        amountPaid: 15000,
        status: "PARTIALLY_PAID",
        dueDate: day("2020-09-30"),
      },
    });
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  return { admin, ada, term };
}

const dialog = (page: Page) => page.getByRole("dialog");

test("the school turns the hold on with its password, and the setting reads back in words", async ({ page }) => {
  const { admin } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(page.getByRole("heading", { level: 2, name: "Report cards" })).toBeVisible();
  await expect(page.getByText("Report cards are released whatever is owed for the school")).toBeVisible();
  await checkBothThemes(page, "the report cards setting");
  await page.getByRole("button", { name: "Hold report cards while fees are owed" }).click();
  await expect(dialog(page)).toContainText("released whatever is owed");
  await expect(dialog(page)).toContainText("held while fees are owed");
  await dialog(page).getByLabel("Account Password").fill(admin.user.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(page.getByText("The school's setting is saved.")).toBeVisible();
  await expect(page.getByText("Report cards are held while fees are owed for the school")).toBeVisible();
  expect(
    await db.tenantSetting.findFirst({ where: { tenantId: school.id, key: "results.reportCardsOpen", campusId: null } }),
  ).toMatchObject({ value: false });
  await checkBothThemes(page, "the report cards setting once held");
  // And back: the switch can always be turned on again.
  await page.getByRole("button", { name: "Release report cards whatever is owed" }).click();
  await dialog(page).getByLabel("Account Password").fill(admin.user.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(page.getByText("Report cards are released whatever is owed for the school")).toBeVisible();
});

test("when the school holds cards and the pupil owes, staff are told so on the card; otherwise nothing", async ({ page }) => {
  const { admin } = await arrange();
  await db.tenantSetting.create({
    data: { tenantId: school.id, campusId: null, key: "results.reportCardsOpen", value: false, updatedById: admin.user.id },
  });
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Fees` }).click();
  await expect(page.getByRole("article", { name: `Report card of ${tag}Ada Fees` })).toBeVisible();
  const note = page.getByText(/This card is held from .* and their parents until .*30,000.* in school fees is paid\./);
  await expect(note).toBeVisible();
  await expect(note).toContainText("Staff can still read and print it.");
  await checkBothThemes(page, "a card the school holds");
  // Printing: the notice is for the screen only.
  await page.emulateMedia({ media: "print" });
  await expect(note).toBeHidden();
  await page.emulateMedia({ media: "screen" });
});

test("no notice when the pupil owes nothing, or when the school does not hold cards", async ({ page }) => {
  const { admin } = await arrange(false);
  await db.tenantSetting.create({
    data: { tenantId: school.id, campusId: null, key: "results.reportCardsOpen", value: false, updatedById: admin.user.id },
  });
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Fees` }).click();
  await expect(page.getByRole("article", { name: `Report card of ${tag}Ada Fees` })).toBeVisible();
  await expect(page.getByText(/This card is held from/)).toHaveCount(0);
});
