import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { api } from "../support/http";
import { member, type Person } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Undoing a roll (task 0040) in a real browser: the History tab marks an undone roll and offers the undo to the school's administrator only; the undo asks why, then for the password; a roll whose
// places were used is refused in words, pupil by pupil, in the dialog; nothing moves unless it succeeds. The rules are tested in tests/unit and tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and
// horizontal overflow in BOTH themes, on desktop and on a phone.

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
let admin: Person;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `U${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with two sessions (the next one with a term of its own), a campus, two classes (Form 1 and Form 2, in the campus) and two pupils of Form 1 A with published marks that pass; the roll is
/// made through the real API and its batch id returned.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const campus = await db.campus.create({ data: { tenantId: school.id, name: `${tag} North` } });
  const campusAdmin = await member(school, Role.CAMPUS_ADMIN, campus.id, `${tag} Campus Admin`);
  const s1 = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2081`, startDate: day("2081-09-01"), endDate: day("2082-07-20"), status: "ACTIVE" },
  });
  const s2 = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2082`, startDate: day("2082-09-01"), endDate: day("2083-07-20"), status: "PLANNED" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: s1.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2081-09-01"),
      endDate: day("2081-12-15"),
      isCurrent: true,
    },
  });
  const nextTerm = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: s2.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2082-09-01"),
      endDate: day("2082-12-15"),
    },
  });
  const f1 = await db.classGroup.create({ data: { tenantId: school.id, name: `${tag} Form 1`, sortOrder: 1, campusId: campus.id } });
  const f2 = await db.classGroup.create({ data: { tenantId: school.id, name: `${tag} Form 2`, sortOrder: 2, campusId: campus.id } });
  const f1A = (await db.classArm.create({ data: { tenantId: school.id, classGroupId: f1.id, name: "A" } })).id;
  await db.classArm.create({ data: { tenantId: school.id, classGroupId: f2.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Maths" } });
  const pupils: Record<string, { id: string; enrolment: string }> = {};
  for (const key of ["Ada", "Bayo"]) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Undo",
        dateOfBirth: day("2012-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    const enrolment = await db.studentEnrollment.create({
      data: { tenantId: school.id, studentId: student.id, sessionId: s1.id, classArmId: f1A },
    });
    await db.result.create({
      data: {
        tenantId: school.id,
        studentId: student.id,
        subjectId: maths.id,
        periodId: term.id,
        score: 80,
        maxScore: 100,
        status: "PUBLISHED",
        verificationToken: `${tag}${key}`,
      },
    });
    pupils[key] = { id: student.id, enrolment: enrolment.id };
  }
  const rolled = await api(`/api/v1/schools/${school.code}/academics/promotion/execute`, {
    baseUrl: SAAS_URL,
    cookie: admin.cookie,
    method: "POST",
    body: { sourceSessionId: s1.id, targetSessionId: s2.id, sourceClassGroupId: f1.id },
  });
  expect(rolled.status, rolled.text.slice(0, 300)).toBe(201);
  return { batchId: rolled.json.data.batch.id as string, pupils, s2, nextTerm, maths, campusAdmin };
}

const dialog = (page: Page) => page.getByRole("dialog");
const history = async (page: Page, person: Person) => {
  await signInThroughUi(page, person.user);
  await page.goto(`/schools/${school.code}/academics?section=promotion`);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("region", { name: "Past promotions" })).toBeVisible();
};
const undoButton = (page: Page) => page.getByRole("button", { name: /^Undo the .* promotion of / });

test("the administrator undoes a roll with a reason and a password; the history shows it undone and the pupils are back", async ({
  page,
}) => {
  const { batchId, pupils } = await arrange();
  await history(page, admin);
  await expect(undoButton(page)).toBeVisible();
  await checkBothThemes(page, "the history with the undo offered");

  await undoButton(page).click();
  await expect(dialog(page).getByRole("heading", { name: "Undo this roll" })).toBeVisible();
  await expect(dialog(page)).toContainText("The roll stays in the history, marked as undone.");
  const next = dialog(page).getByRole("button", { name: "Continue", exact: true });
  await expect(next).toBeDisabled(); // a reason first
  await dialog(page).getByLabel("Why is this roll being undone?").fill("x".repeat(501));
  await expect(dialog(page).getByText("At most 500 characters.")).toBeVisible();
  await expect(next).toBeDisabled();
  await dialog(page).getByLabel("Why is this roll being undone?").fill("Rolled the wrong class.");
  await checkBothThemes(page, "the undo dialog");
  await next.click();

  // The proof: a wrong password is refused in words and nothing moves; the right one undoes the roll.
  await expect(page.getByRole("heading", { name: "Step-up Authentication Required" })).toBeVisible();
  await page.getByLabel("Account Password").fill("not-the-password-1A!");
  await page.getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page).getByRole("alert")).toBeVisible();
  expect(await db.promotionReversal.count({ where: { tenantId: school.id } })).toBe(0);
  expect(await db.studentEnrollment.findUniqueOrThrow({ where: { id: pupils.Ada.enrolment } })).toMatchObject({ status: "PROMOTED" });
  await page.getByLabel("Account Password").fill(admin.user.password);
  await page.getByRole("button", { name: "Confirm & Apply" }).click();

  await expect(page.getByRole("status").filter({ hasText: "2 pupils put back where they were." })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: `${tag} Form 1` });
  await expect(row.getByText("Undone", { exact: true })).toBeVisible();
  await expect(row).toContainText("Rolled the wrong class.");
  await expect(undoButton(page)).toHaveCount(0); // an undone roll is not offered again
  await checkBothThemes(page, "the history with an undone roll");

  for (const p of Object.values(pupils))
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: p.enrolment } })).status).toBe("ACTIVE");
  expect(await db.studentEnrollment.count({ where: { tenantId: school.id, status: "CANCELLED" } })).toBe(2);
  const reversal = await db.promotionReversal.findFirstOrThrow({ where: { tenantId: school.id, batchId } });
  expect(reversal).toMatchObject({ reason: "Rolled the wrong class.", restored: 2, cancelled: 2, reversedByUserId: admin.user.id });
});

test("a roll whose new places were used is refused in words in the dialog, naming the pupil; nothing moves", async ({ page }) => {
  const { batchId, pupils, nextTerm, maths } = await arrange();
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: pupils.Bayo.id,
      subjectId: maths.id,
      periodId: nextTerm.id,
      score: 40,
      maxScore: 100,
      status: "DRAFT",
      verificationToken: `${tag}next`,
    },
  });
  await history(page, admin);
  await undoButton(page).click();
  await dialog(page).getByLabel("Why is this roll being undone?").fill("Rolled the wrong class.");
  await dialog(page).getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Account Password").fill(admin.user.password);
  await page.getByRole("button", { name: "Confirm & Apply" }).click();

  // Back on the reason step, with the server's own sentences.
  const refusal = dialog(page).getByRole("alert").filter({ hasText: "This roll cannot be undone" });
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText("1 pupil's place has been changed or used since. Nothing was changed.");
  await expect(refusal.getByRole("listitem")).toHaveCount(1);
  await expect(refusal).toContainText(`${tag}Bayo Undo (${tag}/Bayo): They already have marks in ${tag} 2082.`);
  await expect(refusal).not.toContainText(`${tag}Ada`);
  await checkBothThemes(page, "an undo that was refused");
  expect(await db.promotionReversal.count({ where: { tenantId: school.id, batchId } })).toBe(0);
  for (const p of Object.values(pupils))
    expect((await db.studentEnrollment.findUniqueOrThrow({ where: { id: p.enrolment } })).status).toBe("PROMOTED");
  await dialog(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(undoButton(page)).toBeVisible(); // still not undone: it is still offered
});

test("a campus administrator reads the history but is not offered the undo", async ({ page }) => {
  const { campusAdmin } = await arrange();
  await history(page, campusAdmin);
  await expect(page.getByRole("row").filter({ hasText: `${tag} Form 1` })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Details of the / })).toBeVisible();
  await expect(undoButton(page)).toHaveCount(0);
});
