import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Streams (task 0035) in a real browser: a class takes a stream in its dialog and shows it; the roll screen offers a class for each pupil who is moving up when the next rung has several, holds the
// roll until each has one, and says so in plain words; a class that is itself a stream goes to its own stream without asking. Every rule is tested in tests/api; this is the screen. Axe
// (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, on desktop and on a phone.

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
  tag = `T${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with two sessions and a ladder: Common 3 (no stream), then Senior 1 Science and Senior 1 Arts (a rung with two streams), then Senior 2 Science and Senior 2 Arts. Two pupils of
/// Common 3 A and two of Senior 1 Science A, all with published marks that pass.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const s1 = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2061`, startDate: day("2061-09-01"), endDate: day("2062-07-20"), status: "ACTIVE" },
  });
  await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2062`, startDate: day("2062-09-01"), endDate: day("2063-07-20"), status: "PLANNED" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: s1.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2061-09-01"),
      endDate: day("2061-12-15"),
      isCurrent: true,
    },
  });
  const group = (name: string, sortOrder: number, streamName: string | null) =>
    db.classGroup.create({ data: { tenantId: school.id, name: `${tag} ${name}`, sortOrder, streamName } });
  const common = await group("Common 3", 3, null);
  const sci1 = await group("Senior 1 Science", 4, "Science");
  const arts1 = await group("Senior 1 Arts", 4, "Arts");
  const sci2 = await group("Senior 2 Science", 5, "Science");
  const arts2 = await group("Senior 2 Arts", 5, "Arts");
  const arm = async (classGroupId: string, name = "A") =>
    (await db.classArm.create({ data: { tenantId: school.id, classGroupId, name } })).id;
  const commonA = await arm(common.id);
  const sci1A = await arm(sci1.id);
  for (const g of [arts1, sci2, arts2]) await arm(g.id);
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Maths" } });
  const pupils: Record<string, string> = {};
  for (const [key, armId] of [
    ["c1", commonA],
    ["c2", commonA],
    ["s1", sci1A],
    ["s2", sci1A],
  ] as const) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Roll",
        dateOfBirth: day("2010-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    await db.studentEnrollment.create({ data: { tenantId: school.id, studentId: student.id, sessionId: s1.id, classArmId: armId } });
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
    pupils[key] = student.id;
  }
  return { common, sci1, arts1, sci2, arts2, pupils, s1 };
}

const dialog = (page: Page) => page.getByRole("dialog");
const roll = (page: Page, className: string) => async () => {
  await page.goto(`/schools/${school.code}/academics?section=promotion`);
  await expect(page.getByRole("heading", { level: 2, name: "Roll a class into the next session" })).toBeVisible();
  await page.getByLabel("Class", { exact: true }).selectOption({ label: `${tag} ${className} (Whole school)` });
  await page.getByRole("button", { name: "Show the class", exact: true }).click();
  await expect(page.getByRole("region", { name: new RegExp(`^Pupils of ${tag} ${className}`) })).toBeVisible();
};

test("a class takes a stream in its dialog, shows it, and the stream can be cleared again", async ({ page }) => {
  await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/academics?section=classes`);
  await page.getByRole("button", { name: "New class" }).click();
  await dialog(page).getByLabel("Name").fill(`${tag} Senior 3 Commerce`);
  await dialog(page).getByLabel("Order (optional)").fill("6");
  await dialog(page).getByLabel("Stream (optional)").fill("Commerce");
  await checkBothThemes(page, "the new class dialog with a stream");
  await dialog(page).getByRole("button", { name: "Create class" }).click();
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: `${tag} Senior 3 Commerce` }) });
  await expect(card).toContainText("Commerce stream");
  expect((await db.classGroup.findFirstOrThrow({ where: { tenantId: school.id, name: `${tag} Senior 3 Commerce` } })).streamName).toBe(
    "Commerce",
  );

  await card.getByRole("button", { name: `Edit ${tag} Senior 3 Commerce` }).click();
  await expect(dialog(page).getByLabel("Stream (optional)")).toHaveValue("Commerce");
  await dialog(page).getByLabel("Stream (optional)").fill("");
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await expect(card).not.toContainText("stream");
  expect(
    (await db.classGroup.findFirstOrThrow({ where: { tenantId: school.id, name: `${tag} Senior 3 Commerce` } })).streamName,
  ).toBeNull();
  await checkBothThemes(page, "the classes list with streams");
});

test("a class that is not a stream moving into streams: each pupil needs a class, the roll is held until each has one, then it splits them", async ({
  page,
}) => {
  const { sci1, arts1, pupils } = await arrange();
  await signInThroughUi(page, admin.user);
  await roll(page, "Common 3")();
  await expect(page.getByRole("status").filter({ hasText: `→ ${tag} Senior 1 Arts or ${tag} Senior 1 Science` })).toBeVisible();
  await expect(page.getByText(/moves up into more than one class\. It is not a stream of any of them/)).toBeVisible();
  const table = page.getByRole("region", { name: new RegExp(`^Pupils of ${tag} Common 3`) });
  const review = page.getByRole("button", { name: "Review and roll", exact: true });
  await expect(review).toBeDisabled();
  await expect(page.getByText("Choose a class for each of the 2 pupils who are moving up.")).toBeVisible();
  await checkBothThemes(page, "the roll screen asking for a class");

  // Chosen by hand, one at a time: the roll is held until both pupils have a class.
  const c1 = table.getByRole("row").filter({ hasText: `${tag}c1` });
  const c2 = table.getByRole("row").filter({ hasText: `${tag}c2` });
  await c1.getByLabel(`Class for ${tag}c1 Roll`).selectOption({ label: `${tag} Senior 1 Science` });
  await expect(review).toBeDisabled();
  await expect(page.getByText("Choose a class for the pupil who is moving up.")).toBeVisible();
  await c2.getByLabel(`Class for ${tag}c2 Roll`).selectOption({ label: `${tag} Senior 1 Arts` });
  await expect(review).toBeEnabled();
  await review.click();
  await expect(dialog(page)).toContainText(`1 into ${tag} Senior 1 Science`);
  await expect(dialog(page)).toContainText(`1 into ${tag} Senior 1 Arts`);
  await checkBothThemes(page, "the roll confirmation with two classes");
  await dialog(page).getByRole("button", { name: "Roll the class", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: `${tag} Common 3 was rolled: 2 promoted` })).toBeVisible();

  const classOf = async (studentId: string) =>
    (
      await db.studentEnrollment.findFirstOrThrow({
        where: { studentId, status: "ACTIVE", session: { label: { endsWith: "2062" } } },
        include: { classArm: true },
      })
    ).classArm.classGroupId;
  expect(await classOf(pupils.c1)).toBe(sci1.id);
  expect(await classOf(pupils.c2)).toBe(arts1.id);
});

test('"place every pupil" fills every row, and the roll goes through', async ({ page }) => {
  const { arts1, pupils } = await arrange();
  await signInThroughUi(page, admin.user);
  await roll(page, "Common 3")();
  await page.getByLabel("Place every pupil who is moving up in").selectOption({ label: `${tag} Senior 1 Arts` });
  await expect(page.getByRole("button", { name: "Review and roll", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Review and roll", exact: true }).click();
  await expect(dialog(page)).toContainText(`2 into ${tag} Senior 1 Arts`);
  await dialog(page).getByRole("button", { name: "Roll the class", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "was rolled: 2 promoted" })).toBeVisible();
  for (const id of [pupils.c1, pupils.c2]) {
    const e = await db.studentEnrollment.findFirstOrThrow({
      where: { studentId: id, status: "ACTIVE", session: { label: { endsWith: "2062" } } },
      include: { classArm: true },
    });
    expect(e.classArm.classGroupId).toBe(arts1.id);
  }
});

test("a class that is a stream goes to its own stream's class without being asked", async ({ page }) => {
  const { sci2, pupils } = await arrange();
  await signInThroughUi(page, admin.user);
  await roll(page, "Senior 1 Science")();
  await expect(page.getByRole("status").filter({ hasText: `${tag} Senior 1 Science → ${tag} Senior 2 Science.` })).toBeVisible();
  await expect(page.getByText(/moves up into more than one class/)).toBeVisible(); // told, as information: nothing to choose
  await expect(page.getByText(/The pupils go to .* unless you choose another class for them\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and roll", exact: true })).toBeEnabled();
  await checkBothThemes(page, "the roll screen of a stream class");
  await page.getByRole("button", { name: "Review and roll", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Roll the class", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "was rolled: 2 promoted" })).toBeVisible();
  for (const id of [pupils.s1, pupils.s2]) {
    const e = await db.studentEnrollment.findFirstOrThrow({
      where: { studentId: id, status: "ACTIVE", session: { label: { endsWith: "2062" } } },
      include: { classArm: true },
    });
    expect(e.classArm.classGroupId).toBe(sci2.id);
  }
});
