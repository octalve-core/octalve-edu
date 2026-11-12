import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";

// The Promotion section of Academic setup (task 0031) in a real browser: choosing the sessions and the class, reading what the rule advises, changing a pupil's decision (with the reason it needs),
// confirming the roll, and the history with a roll's details. Every rule is tested in tests/api; this is the screen: that it says the right things, sends what the server reads, refuses what it
// can before asking, is closed to staff, and passes Axe (WCAG 2.2 A/AA) with no horizontal overflow in BOTH themes, on desktop and on a phone.

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
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250); // the theme fades for 150 ms: a scan inside it measures a colour between the two
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
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
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with two sessions, Year 1 and Year 2 (arms A and B), and three pupils of Year 1 A with published marks: one strong, one weak, one with none.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const s1 = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2051`, startDate: day("2051-09-01"), endDate: day("2052-07-20"), status: "ACTIVE" },
  });
  await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2052`, startDate: day("2052-09-01"), endDate: day("2053-07-20"), status: "PLANNED" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: s1.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2051-09-01"),
      endDate: day("2051-12-15"),
      isCurrent: true,
    },
  });
  const y1 = await db.classGroup.create({ data: { tenantId: school.id, name: "Year 1", sortOrder: 1 } });
  const y2 = await db.classGroup.create({ data: { tenantId: school.id, name: "Year 2", sortOrder: 2 } });
  const a1 = await db.classArm.create({ data: { tenantId: school.id, classGroupId: y1.id, name: "A" } });
  await db.classArm.create({ data: { tenantId: school.id, classGroupId: y2.id, name: "A" } });
  await db.classArm.create({ data: { tenantId: school.id, classGroupId: y2.id, name: "B" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Maths" } });
  const made: Record<string, { studentId: string; enrolmentId: string }> = {};
  for (const [key, score] of [
    ["strong", 85],
    ["weak", 25],
    ["none", null],
  ] as const) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Roll",
        dateOfBirth: day("2014-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    const enrolment = await db.studentEnrollment.create({
      data: { tenantId: school.id, studentId: student.id, sessionId: s1.id, classArmId: a1.id },
    });
    if (score !== null)
      await db.result.create({
        data: {
          tenantId: school.id,
          studentId: student.id,
          subjectId: maths.id,
          periodId: term.id,
          score,
          maxScore: 100,
          status: "PUBLISHED",
          verificationToken: `${tag}${key}`,
        },
      });
    made[key] = { studentId: student.id, enrolmentId: enrolment.id };
  }
  return { y1, y2, made, s1 };
}

const url = () => `/schools/${school.code}/academics?section=promotion`;
const show = async (page: Page) => {
  await page.goto(url());
  await expect(page.getByRole("heading", { level: 2, name: "Roll a class into the next session" })).toBeVisible();
  await page.getByRole("button", { name: "Show the class", exact: true }).click();
  await expect(page.getByRole("region", { name: /^Pupils of Year 1/ })).toBeVisible();
};

test("the administrator picks a class and reads what the rule advises, in both themes", async ({ page }) => {
  const { made } = await arrange();
  await signInThroughUi(page, admin.user);
  await show(page);
  const table = page.getByRole("region", { name: "Pupils of Year 1" });
  // The sessions started on the active one and the one after it; the class is the first.
  await expect(page.getByLabel("Session being finished")).toHaveValue(/\S/);
  await expect(page.getByLabel("Session they move into")).toHaveValue(/\S/);
  await expect(page.getByRole("status").filter({ hasText: "Year 1 → Year 2" })).toContainText("3 pupils");
  const row = (key: string) => table.getByRole("row").filter({ hasText: `${tag}${key}` });
  await expect(row("strong")).toContainText("85.0%");
  await expect(row("strong")).toContainText("Promoted");
  await expect(row("weak")).toContainText("25.0%");
  await expect(row("weak")).toContainText("Repeated");
  await expect(row("none")).toContainText("No published term scores");
  await expect(row("none")).toContainText("Repeated");
  expect(Object.keys(made)).toHaveLength(3);
  await checkBothThemes(page, "the promotion preview");
});

test("changing a decision needs a reason; the roll is confirmed, recorded, and shown in the history", async ({ page }) => {
  const { made, y2 } = await arrange();
  await signInThroughUi(page, admin.user);
  await show(page);
  const table = page.getByRole("region", { name: "Pupils of Year 1" });
  const weak = table.getByRole("row").filter({ hasText: `${tag}weak` });
  const roll = page.getByRole("button", { name: "Review and roll", exact: true });
  await expect(roll).toBeEnabled();

  // Moving the weak pupil up is a change from the advice: it needs a reason, and until there is one the roll cannot be reviewed.
  await weak.getByLabel(`Decision for ${tag}weak Roll`).selectOption("PROMOTED");
  await weak.getByLabel(`Arm for ${tag}weak Roll`).selectOption({ label: "B" });
  await expect(roll).toBeDisabled();
  await expect(page.getByText("Give a reason for each pupil you handle differently.")).toBeVisible();
  await weak.getByLabel(`Reason for ${tag}weak Roll`).fill("Moved up after a re-sit");
  await expect(roll).toBeEnabled();

  await roll.click();
  const dialog = page.getByRole("dialog", { name: "Roll Year 1?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2 to promote"); // the strong pupil and the weak one now
  await expect(dialog).toContainText("1 to repeat");
  await checkBothThemes(page, "the confirmation dialog");
  await dialog.getByRole("button", { name: "Roll the class", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Year 1 was rolled: 2 promoted, 1 repeating" })).toBeVisible();

  // What the server holds.
  const weakInto = await db.studentEnrollment.findFirst({
    where: { studentId: made.weak.studentId, status: "ACTIVE", NOT: { id: made.weak.enrolmentId } },
  });
  expect(weakInto).toBeTruthy();
  expect((await db.classArm.findUnique({ where: { id: weakInto!.classArmId } }))!.classGroupId).toBe(y2.id);
  const record = await db.promotionRecord.findFirst({ where: { studentId: made.weak.studentId } });
  expect(record).toMatchObject({ decision: "PROMOTED", decisionMode: "OVERRIDDEN", overrideReason: "Moved up after a re-sit" });

  // The history lists the roll and opens it: the decision taken beside the one the rule advised.
  await page.getByRole("button", { name: "History", exact: true }).click();
  const history = page.getByRole("region", { name: "Past promotions" });
  await expect(history).toContainText("Year 1 → Year 2");
  await expect(history).toContainText("2 promoted, 1 repeating");
  await checkBothThemes(page, "the promotion history");
  await history.getByRole("button", { name: /^Details of the Year 1 promotion/ }).click();
  const details = page.getByRole("dialog");
  const weakRow = details.getByRole("row").filter({ hasText: `${tag}weak` });
  await expect(weakRow).toContainText("Repeated"); // advised
  await expect(weakRow).toContainText("Promoted (changed)"); // decided
  await expect(weakRow).toContainText("Moved up after a re-sit");
  await checkBothThemes(page, "the promotion details");
  await details.getByRole("button", { name: "Close", exact: true }).first().click();

  // Rolling again: nobody is left on the roll.
  await page.getByRole("button", { name: "Roll a class", exact: true }).click();
  await page.getByRole("button", { name: "Show the class", exact: true }).click();
  await expect(page.getByText(/Nobody is on the roll of this class/)).toBeVisible();
});

test("staff do not see the section and are shown the 403 view if they type its address", async ({ page }) => {
  await arrange();
  const teacher = await member(school, Role.TEACHING_STAFF, null, `${tag} Teacher`);
  await signInThroughUi(page, teacher.user);
  await page.goto(`/schools/${school.code}/academics`);
  await expect(page.getByRole("navigation", { name: "Academic setup sections" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Academic setup sections" }).getByRole("link", { name: "Promotion" })).toHaveCount(0);
  await page.goto(url());
  await expect(page.getByRole("heading", { level: 1, name: "You don't have access to this school" })).toBeVisible();
});

test("a next session that does not exist yet is said plainly, and nothing can be previewed", async ({ page }) => {
  await arrange();
  await db.academicSession.updateMany({
    where: { tenantId: school.id, status: "PLANNED" },
    data: { archivedAt: new Date(), status: "CLOSED" },
  });
  await signInThroughUi(page, admin.user);
  await page.goto(url());
  await expect(page.getByText(/There is no session after .* in the same calendar yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Show the class", exact: true })).toBeDisabled();
  await checkBothThemes(page, "the promotion picker with no next session");
});
