import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Report remarks (task 0036) in a real browser: the administrator writes both remarks on a card, a teacher of the pupil's arm only the teacher's, a registrar neither; a blank clears a remark;
// the remarks print with the card; once the term's results are published the card says they are final. The rules are tested in tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and
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
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `M${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with a term, a class with one arm, a pupil (Ada) with one DRAFT result, an administrator, and a teacher assigned to the arm.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2071`, startDate: day("2071-09-01"), endDate: day("2072-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2071-09-01"),
      endDate: day("2071-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Form 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  const ada = await db.studentRecord.create({
    data: { tenantId: school.id, firstName: `${tag}Ada`, lastName: "Marks", dateOfBirth: day("2014-01-01"), admissionNo: `${tag}/Ada` },
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
      status: "DRAFT",
      gradeLetter: "A",
      gradeRemark: "Excellent",
    },
  });
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const teacher = await member(school, Role.TEACHING_STAFF, null, `${tag} Teacher`);
  const staff = await db.staffRecord.create({
    data: { tenantId: school.id, userId: teacher.user.id, category: "TEACHING", firstName: "Tess", lastName: tag },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: school.id, staffRecordId: staff.id, subjectId: maths.id, classArmId: arm.id },
  });
  return { admin, teacher, ada, term };
}

const openCard = async (page: Page) => {
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Marks` }).click();
  await expect(page.getByRole("article", { name: `Report card of ${tag}Ada Marks` })).toBeVisible();
};
const remarkRow = (adaId: string, periodId: string) =>
  db.reportRemark.findUnique({ where: { tenantId_studentId_periodId: { tenantId: school.id, studentId: adaId, periodId } } });

test("the administrator writes both remarks, they appear on the card, and a blank clears one", async ({ page }) => {
  const { admin, ada, term } = await arrange();
  await signInThroughUi(page, admin.user);
  await openCard(page);
  const card = page.getByRole("article", { name: `Report card of ${tag}Ada Marks` });
  await expect(card.getByRole("region", { name: "Remarks" })).toHaveCount(0); // nothing written yet
  await expect(page.getByRole("heading", { name: `Remarks for ${tag}Ada Marks` })).toBeVisible();
  await checkBothThemes(page, "a card with the remarks editor");

  await page.getByLabel("Teacher's remark").fill("  Works hard and helps others.  ");
  await page.getByLabel("Principal's remark").fill("A pleasure to have in the school.");
  await page.getByRole("button", { name: "Save remarks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved the remarks for ${tag}Ada Marks.` })).toBeVisible();
  const remarks = card.getByRole("region", { name: "Remarks" });
  await expect(remarks).toContainText("Teacher's remark");
  await expect(remarks).toContainText("Works hard and helps others.");
  await expect(remarks).toContainText("Principal's remark");
  await expect(remarks).toContainText("A pleasure to have in the school.");
  expect(await remarkRow(ada.id, term.id)).toMatchObject({
    teacherRemark: "Works hard and helps others.",
    principalRemark: "A pleasure to have in the school.",
  });
  await checkBothThemes(page, "a card with both remarks");

  // Saving again with nothing changed says so; emptying a field clears that remark.
  await page.getByRole("button", { name: "Save remarks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nothing changed." })).toBeVisible();
  await page.getByLabel("Teacher's remark").fill("   ");
  await page.getByRole("button", { name: "Save remarks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `Saved the remarks for ${tag}Ada Marks.` })).toBeVisible();
  await expect(remarks).not.toContainText("Works hard and helps others.");
  await expect(remarks).toContainText("A pleasure to have in the school.");
  expect(await remarkRow(ada.id, term.id)).toMatchObject({ teacherRemark: null, principalRemark: "A pleasure to have in the school." });
});

test("a teacher of the arm sees only the teacher's field and saves it; the editor is not printed", async ({ page }) => {
  const { teacher, ada, term } = await arrange();
  await signInThroughUi(page, teacher.user);
  await openCard(page);
  await expect(page.getByLabel("Teacher's remark")).toBeVisible();
  await expect(page.getByLabel("Principal's remark")).toHaveCount(0);
  await page.getByLabel("Teacher's remark").fill("Improving steadily.");
  await page.getByRole("button", { name: "Save remarks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved the remarks" })).toBeVisible();
  expect(await remarkRow(ada.id, term.id)).toMatchObject({ teacherRemark: "Improving steadily.", principalRemark: null });
  // Printing hides everything around the card: the editor carries print:hidden, the remarks are part of the card.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: `Remarks for ${tag}Ada Marks` })).toBeHidden();
  await expect(
    page.getByRole("article", { name: `Report card of ${tag}Ada Marks` }).getByRole("region", { name: "Remarks" }),
  ).toContainText("Improving steadily.");
  await page.emulateMedia({ media: "screen" });
});

test("a remark of more than 500 characters is refused on the screen before it is sent", async ({ page }) => {
  const { admin, ada, term } = await arrange();
  await signInThroughUi(page, admin.user);
  await openCard(page);
  await page.getByLabel("Teacher's remark").fill("x".repeat(501));
  await expect(page.getByText("At most 500 characters.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save remarks", exact: true })).toBeDisabled();
  await page.getByLabel("Teacher's remark").fill("x".repeat(500));
  await expect(page.getByRole("button", { name: "Save remarks", exact: true })).toBeEnabled();
  expect(await remarkRow(ada.id, term.id)).toBeNull();
});

test("once the term's results are published the card shows the remarks as final and offers no editor", async ({ page }) => {
  const { admin, ada, term } = await arrange();
  await db.reportRemark.create({
    data: {
      tenantId: school.id,
      studentId: ada.id,
      periodId: term.id,
      teacherRemark: "Final words.",
      teacherRemarkByUserId: admin.user.id,
    },
  });
  await db.result.updateMany({
    where: { tenantId: school.id, studentId: ada.id },
    data: { status: "PUBLISHED", verificationToken: `${tag}tok` },
  });
  await signInThroughUi(page, admin.user);
  await openCard(page);
  await expect(page.getByText("The results for this term are published, so the remarks are final.")).toBeVisible();
  await expect(page.getByLabel("Teacher's remark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save remarks", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("article", { name: `Report card of ${tag}Ada Marks` }).getByRole("region", { name: "Remarks" }),
  ).toContainText("Final words.");
  await checkBothThemes(page, "a card with final remarks");
});

test("a registrar reads the remarks and is offered no editor", async ({ page }) => {
  const { admin, ada, term } = await arrange();
  await db.reportRemark.create({
    data: {
      tenantId: school.id,
      studentId: ada.id,
      periodId: term.id,
      principalRemark: "Read-only for staff.",
      principalRemarkByUserId: admin.user.id,
    },
  });
  const registrar = await member(school, Role.NON_TEACHING_STAFF, null, `${tag} Registrar`);
  await signInThroughUi(page, registrar.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Marks` }).click();
  await expect(
    page.getByRole("article", { name: `Report card of ${tag}Ada Marks` }).getByRole("region", { name: "Remarks" }),
  ).toContainText("Read-only for staff.");
  await expect(page.getByRole("heading", { name: `Remarks for ${tag}Ada Marks` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save remarks", exact: true })).toHaveCount(0);
});
