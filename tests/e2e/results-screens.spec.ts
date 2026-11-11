import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The Results page (task 0031) in a real browser: a teacher entering marks built from a scheme's parts, the refusals the screen makes before it asks, sending the marks for review, an approver
// approving, publishing and returning them, the report cards, and who is let in. The rules are tested in tests/api; this is the screen: what it offers, sends and says, in BOTH themes with Axe
// (WCAG 2.2 A/AA) and no horizontal overflow, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page, what: string) {
  // Against the VISUAL viewport: a phone widens its layout viewport to fit an overflowing page, so `innerWidth` would grow with the overflow and the check could never fail.
  const { scrollWidth, width } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(width);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250); // the theme fades for 150 ms: a scan inside it measures a colour between the two
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
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
  tag = `R${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with an active session and a current term, Form 1 A with two pupils, Mathematics (offered to Form 1) built from CA /40 and an exam /60 (a scheme with one component, CA 40, and examMax 60), and a teacher assigned to it.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2061`, startDate: day("2061-09-01"), endDate: day("2062-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2061-09-01"),
      endDate: day("2061-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Form 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  await db.subjectOffering.create({ data: { tenantId: school.id, classGroupId: group.id, subjectId: maths.id } });
  await db.assessmentScheme.create({
    data: {
      tenantId: school.id,
      classGroupId: group.id,
      name: `${tag} scheme`,
      totalMax: 100,
      examMax: 60,
      // The scheme rule is components + exam = total: CA /40 and the exam /60 (examMax) make 100. The screen asks for the exam as a part of its own (task 0032).
      components: { create: [{ name: "CA", maxScore: 40, sortOrder: 1 }] },
    },
  });
  const pupils: Record<string, string> = {};
  for (const key of ["Ada", "Bayo"]) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Marks",
        dateOfBirth: day("2014-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    await db.studentEnrollment.create({ data: { tenantId: school.id, studentId: student.id, sessionId: session.id, classArmId: arm.id } });
    pupils[key] = student.id;
  }
  const teacher = await member(school, Role.TEACHING_STAFF, null, `${tag} Teacher`);
  const staff = await db.staffRecord.create({
    data: { tenantId: school.id, userId: teacher.user.id, category: "TEACHING", firstName: "Tess", lastName: tag },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: school.id, staffRecordId: staff.id, subjectId: maths.id, classArmId: arm.id },
  });
  return { session, term, group, arm, maths, pupils, teacher };
}

const results = (tab: string) => `/schools/${school.code}/results?tab=${tab}`;
const marks = (page: Page) => page.getByRole("region", { name: "Marks for Mathematics" });

test("a teacher enters marks from the scheme's parts; a bad or half-filled row stops the save; the marks are saved and sent for review", async ({
  page,
}) => {
  const { pupils, teacher } = await arrange();
  await signInThroughUi(page, teacher.user);
  await page.goto(results("marks"));
  await expect(page.getByRole("heading", { level: 2, name: "Enter marks" })).toBeVisible();
  // The current term, the one class and the one subject are chosen; the sheet opens at once with the scheme's parts.
  await expect(page.getByLabel("Subject")).toHaveValue(/\S/);
  await expect(marks(page)).toBeVisible();
  await expect(marks(page).getByRole("columnheader", { name: "CA /40" })).toBeVisible();
  await expect(marks(page).getByRole("columnheader", { name: "Exam /60" })).toBeVisible();
  await expect(marks(page).getByText("Not entered")).toHaveCount(2);
  await checkBothThemes(page, "the marks sheet");

  const ada = marks(page)
    .getByRole("row")
    .filter({ hasText: `${tag}Ada` });
  const save = page.getByRole("button", { name: "Save marks", exact: true });
  await expect(save).toBeDisabled(); // nothing typed yet

  // Half a row, then a mark above its part's maximum: each says why and stops the save.
  await ada.getByLabel(`CA for ${tag}Ada Marks`).fill("30");
  await expect(ada).toContainText("Fill every part, or leave this pupil blank.");
  await expect(save).toBeDisabled();
  await ada.getByLabel(`Exam for ${tag}Ada Marks`).fill("75");
  await expect(ada).toContainText("At most 60.");
  await expect(save).toBeDisabled();
  await ada.getByLabel(`Exam for ${tag}Ada Marks`).fill("45.5");
  await expect(ada).not.toContainText("At most");
  await expect(ada.getByRole("cell").nth(2)).toHaveText("75.5"); // the running total

  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "Saved the marks of 1 pupil." })).toBeVisible();
  // What was saved comes back from the server, as a draft, with its grade where the school has a scale.
  await expect(
    marks(page)
      .getByRole("row")
      .filter({ hasText: `${tag}Ada` }),
  ).toContainText("Draft");
  await expect(
    marks(page)
      .getByRole("row")
      .filter({ hasText: `${tag}Bayo` }),
  ).toContainText("Not entered");
  const saved = await db.result.findFirst({ where: { tenantId: school.id, studentId: pupils.Ada } });
  expect(Number(saved!.score)).toBe(75.5);
  expect(saved!.status).toBe("DRAFT");
  // The exam is saved as a part of its own (task 0032; before it, a real scheme's exam mark could not be entered at all), out of the scheme's total, and the first save locked the scheme.
  expect(saved!.componentScores).toEqual([
    { name: "CA", score: 30, maxScore: 40 },
    { name: "Exam", score: 45.5, maxScore: 60 },
  ]);
  expect(Number(saved!.maxScore)).toBe(100);
  expect((await db.assessmentScheme.findFirstOrThrow({ where: { tenantId: school.id } })).lockedAt).not.toBeNull();

  // Send it for review: the status moves, and the row can no longer be typed into.
  await page.getByRole("button", { name: "Send 1 saved for review", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Sent 1 saved mark for review." })).toBeVisible();
  const after = marks(page)
    .getByRole("row")
    .filter({ hasText: `${tag}Ada` });
  await expect(after).toContainText("Submitted");
  await expect(after.getByLabel(`CA for ${tag}Ada Marks`)).toBeDisabled();
  expect((await db.result.findFirst({ where: { tenantId: school.id, studentId: pupils.Ada } }))!.status).toBe("SUBMITTED");
  await checkBothThemes(page, "the marks sheet after review");
});

test("a teacher whose sheet went stale because the class's scheme was replaced meanwhile is told what the scheme has now, and nothing is saved", async ({
  page,
}) => {
  const { teacher, group } = await arrange();
  await signInThroughUi(page, teacher.user);
  await page.goto(results("marks"));
  await expect(marks(page).getByRole("columnheader", { name: "Exam /60" })).toBeVisible();
  const ada = marks(page)
    .getByRole("row")
    .filter({ hasText: `${tag}Ada` });
  await ada.getByLabel(`CA for ${tag}Ada Marks`).fill("30");
  await ada.getByLabel(`Exam for ${tag}Ada Marks`).fill("45");

  // Meanwhile an administrator replaces the class's scheme (nothing is saved under the old one, so it is not locked and may simply be archived): Test /50 and an exam /50.
  await db.assessmentScheme.updateMany({ where: { tenantId: school.id, classGroupId: group.id }, data: { archivedAt: new Date() } });
  await db.assessmentScheme.create({
    data: {
      tenantId: school.id,
      classGroupId: group.id,
      name: `${tag} second scheme`,
      totalMax: 100,
      examMax: 50,
      components: { create: [{ name: "Test", maxScore: 50, sortOrder: 1 }] },
    },
  });
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  const refusal = page.getByRole("alert").filter({ hasText: "is not a part of the scheme" });
  await expect(refusal).toContainText(`"CA" is not a part of the scheme "${tag} second scheme"`);
  await expect(refusal).toContainText("Test (out of 50), Exam (out of 50)");
  expect(await db.result.count({ where: { tenantId: school.id } })).toBe(0);
});

test("an administrator approves, publishes and returns marks on the Review tab; a reason is required to return", async ({ page }) => {
  const { pupils, term, maths } = await arrange();
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  for (const key of ["Ada", "Bayo"])
    await db.result.create({
      data: {
        tenantId: school.id,
        studentId: pupils[key],
        subjectId: maths.id,
        periodId: term.id,
        score: 70,
        maxScore: 100,
        status: "SUBMITTED",
        enteredByStaffId: admin.user.id,
      },
    });
  await signInThroughUi(page, admin.user);
  await page.goto(results("review"));
  const table = page.getByRole("region", { name: "Marks to review" });
  await expect(table).toContainText(`${tag}Ada`);
  await expect(table).toContainText(`${tag}Bayo`);
  await checkBothThemes(page, "the review list");

  const approve = page.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeDisabled(); // nothing selected
  await table.getByLabel(`Select Mathematics for ${tag}Ada Marks`).check();
  await expect(page.getByRole("status").filter({ hasText: "1 of 2 selected" })).toBeVisible();
  await approve.click();
  await expect(page.getByRole("status").filter({ hasText: "1 mark moved to approved." })).toBeVisible();
  expect((await db.result.findFirst({ where: { studentId: pupils.Ada } }))!.status).toBe("APPROVED");
  await expect(table).not.toContainText(`${tag}Ada`); // it left the "waiting" filter

  // Return the other one: a dialog asks for the reason and will not send an empty one.
  await table.getByLabel(`Select Mathematics for ${tag}Bayo Marks`).check();
  await page.getByRole("button", { name: "Return to author", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Return to the teacher" });
  const send = dialog.getByRole("button", { name: "Return", exact: true });
  await expect(send).toBeDisabled();
  await checkBothThemes(page, "the return dialog");
  await dialog.getByLabel("Reason").fill("The exam mark looks wrong");
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "1 mark moved to draft." })).toBeVisible();
  expect((await db.result.findFirst({ where: { studentId: pupils.Bayo } }))!.status).toBe("DRAFT");

  // Publish the approved one from its own filter.
  await page.getByLabel("Status").selectOption("APPROVED");
  await table.getByLabel(`Select Mathematics for ${tag}Ada Marks`).check();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 mark moved to published." })).toBeVisible();
  expect((await db.result.findFirst({ where: { studentId: pupils.Ada } }))!.status).toBe("PUBLISHED");
});

test("report cards: choose a class, open a pupil's card, see the published marks, go back", async ({ page }) => {
  const { pupils, term, maths } = await arrange();
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: pupils.Ada,
      subjectId: maths.id,
      periodId: term.id,
      score: 88,
      maxScore: 100,
      status: "PUBLISHED",
      verificationToken: `${tag}tok`,
      gradeLetter: "A",
      gradeRemark: "Excellent",
    },
  });
  await signInThroughUi(page, admin.user);
  await page.goto(results("cards"));
  const list = page.getByRole("region", { name: "Pupils of the class" });
  await expect(list.getByRole("row").filter({ hasText: `${tag}Ada` })).toContainText("1 of 1");
  await expect(list.getByRole("row").filter({ hasText: `${tag}Bayo` })).toContainText("0 of 0");
  await checkBothThemes(page, "the class list");

  await list.getByRole("button", { name: `Open the report card of ${tag}Ada Marks` }).click();
  const card = page.getByRole("article", { name: `Report card of ${tag}Ada Marks` });
  await expect(card).toContainText("First Term");
  await expect(card).toContainText("Mathematics");
  await expect(card).toContainText("88 / 100");
  await expect(card).toContainText("Excellent");
  await expect(card).toContainText(`${tag}tok`); // the verification code of a published mark
  await expect(card).toContainText("Form 1 A");
  await checkBothThemes(page, "a report card");
  await page.getByRole("button", { name: "Back to the class", exact: true }).click();
  await expect(list).toBeVisible();
});

test("a registrar reads and reviews but does not enter marks and cannot approve", async ({ page }) => {
  await arrange();
  const registrar = await member(school, Role.NON_TEACHING_STAFF, null, `${tag} Registrar`);
  await signInThroughUi(page, registrar.user);
  await page.goto(`/schools/${school.code}/results`); // no tab asked: the first one they may use
  const nav = page.getByRole("navigation", { name: "Results sections" });
  await expect(nav.getByRole("link", { name: "Marks" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0); // not the approver's buttons
  await page.goto(results("marks")); // asking for the Marks tab by address lands on Review
  await expect(nav.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
  await checkBothThemes(page, "the review tab of a registrar");
});

test("a campus administrator opens Results, with the Marks, Review and Cards tabs (task 0046, decision D7 of task 0031)", async ({
  page,
}) => {
  await arrange();
  const campus = await createTenant({ name: `${tag} Campus School`, campuses: ["North"] });
  const campusAdmin = await member(campus, Role.CAMPUS_ADMIN, campus.campuses[0].id, `${tag} Campus Admin`);
  await signInThroughUi(page, campusAdmin.user);
  await page.goto(`/schools/${campus.code}/results`);
  await expect(page.getByRole("heading", { level: 1, name: "Results" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Results sections" });
  for (const tab of ["Marks", "Review", "Cards"]) await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  // Without the approval permission they enter and send marks for review but have no Approve button.
  await page.goto(`/schools/${campus.code}/results?tab=review`);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
  await checkBothThemes(page, "Results for a campus administrator");
});

test("a teacher with no assignment is told so instead of being shown an empty sheet", async ({ page }) => {
  await arrange();
  const idle = await member(school, Role.TEACHING_STAFF, null, `${tag} Idle`);
  await db.staffRecord.create({
    data: { tenantId: school.id, userId: idle.user.id, category: "TEACHING", firstName: "Idle", lastName: tag },
  });
  await signInThroughUi(page, idle.user);
  await page.goto(results("marks"));
  await expect(page.getByText(/No subject is assigned to you for any class yet/)).toBeVisible();
  await checkBothThemes(page, "the marks tab of an unassigned teacher");
});
