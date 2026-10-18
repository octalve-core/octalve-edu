import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// Academic setup for a CAMPUS ADMINISTRATOR in a real browser (task 0010 F5, ADR 0016): they can build their campus's calendar and classes - the campus
// is fixed (no picker) - but a row the whole school owns (no campus) is shown read-only with a note, and subjects, grading and assessment stay with the
// school administrator. The API already enforced all of this (tests/api/campus-admin-academics.spec.ts); this is the screen catching up. Axe (WCAG 2.2 A/AA)
// runs on each section in BOTH themes (the app is dark by default; the light theme is the `theme=light` cookie).
test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Campus Setup School", campuses: ["North", "South"] });
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
async function signIn(page: Page, theme: "dark" | "light" = "dark") {
  if (theme === "light") await page.context().addCookies([{ name: "theme", value: "light", url: SAAS_URL }]);
  const user = await createUser({ name: "Cam Campusadmin" });
  await addMembership(user.id, school.id, Role.CAMPUS_ADMIN, school.campuses[0].id);
  await signInThroughUi(page, user);
}
const section = (page: Page, key: string) => page.goto(`/schools/${school.code}/academics?section=${key}`);
const session = (tenantId: string, label: string, campusId: string | null, year: number) =>
  db.academicSession.create({
    data: { tenantId, campusId, label, startDate: new Date(`${year}-09-01`), endDate: new Date(`${year + 1}-07-01`) },
  });

for (const theme of ["dark", "light"] as const) {
  test.describe(`sessions - ${theme} theme`, () => {
    test("a campus administrator creates a session for their campus (no campus picker), edits it, and sees the school's own session read-only", async ({
      page,
    }) => {
      await session(school.id, "Whole School Year", null, 2051);
      await session(school.id, "South Only Year", school.campuses[1].id, 2052);
      await signIn(page, theme);
      await section(page, "sessions");
      await expect(page.getByRole("heading", { level: 2, name: "Sessions" })).toBeVisible();
      await expect(page.getByLabel("Campus", { exact: true })).toHaveCount(0); // only their own campus: nothing to filter by

      const wide = page.getByRole("listitem").filter({ hasText: "Whole School Year" });
      await expect(wide).toBeVisible();
      await expect(wide).toContainText("Set by the school");
      await expect(wide.getByRole("button", { name: /^(Edit|Open|Archive|Close)/ })).toHaveCount(0);
      await expect(page.getByText("South Only Year")).toHaveCount(0); // another campus's session is not theirs to see
      await expectAccessible(page, `sessions (${theme})`);

      await page.getByRole("button", { name: "New session" }).click();
      await expect(dialog(page).getByLabel("Applies to")).toHaveCount(0);
      await expectAccessible(page, `new session dialog (${theme})`);
      await dialog(page).getByLabel("Name").fill("North Year");
      await dialog(page).getByLabel("First day").fill("2053-09-01");
      await dialog(page).getByLabel("Last day").fill("2054-07-01");
      await dialog(page).getByRole("button", { name: "Create session" }).click();
      const mine = page.getByRole("listitem").filter({ hasText: "North Year" });
      await expect(mine).toContainText("North");
      await expect(mine).not.toContainText("Set by the school");
      await expect(mine.getByRole("button", { name: "Edit North Year" })).toBeVisible();
      expect(await db.academicSession.count({ where: { tenantId: school.id, label: "North Year", campusId: school.campuses[0].id } })).toBe(
        1,
      );
    });
  });

  test.describe(`classes - ${theme} theme`, () => {
    test("a campus administrator creates a class for their campus (no 'Belongs to'), manages its arms, and the school's own class and the subjects are read-only", async ({
      page,
    }) => {
      await db.classGroup.create({ data: { tenantId: school.id, campusId: null, name: "Whole School Class", sortOrder: 1 } });
      await db.subject.create({ data: { tenantId: school.id, name: "Mathematics", code: "MTHSET" } });
      await signIn(page, theme);
      await section(page, "classes");
      await expect(page.getByRole("heading", { level: 2, name: "Classes and arms" })).toBeVisible();

      const wide = page.getByRole("listitem").filter({ hasText: "Whole School Class" }).first();
      await expect(wide).toContainText("Set by the school");
      for (const name of ["Subjects of", "Add an arm to", "Edit", "Archive"]) {
        await expect(wide.getByRole("button", { name: new RegExp(`^${name}`) })).toHaveCount(0);
      }
      // subjects are the school's: visible, never editable
      await expect(page.getByText("Mathematics")).toBeVisible();
      await expect(page.getByRole("button", { name: "New subject" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Edit Mathematics" })).toHaveCount(0);
      await expectAccessible(page, `classes (${theme})`);

      await page.getByRole("button", { name: "New class" }).click();
      await expect(dialog(page).getByLabel("Belongs to")).toHaveCount(0);
      await expectAccessible(page, `new class dialog (${theme})`);
      await dialog(page).getByLabel("Name").fill("North Class");
      await dialog(page).getByLabel("Order (optional)").fill("5");
      await dialog(page).getByRole("button", { name: "Create class" }).click();
      const mine = page.getByRole("listitem").filter({ hasText: "North Class" }).first();
      await expect(mine).toContainText("North");
      await expect(mine.getByRole("button", { name: "Add an arm to North Class" })).toBeVisible();
      await expect(mine.getByRole("button", { name: "Subjects of North Class" })).toBeVisible();
      expect(await db.classGroup.count({ where: { tenantId: school.id, name: "North Class", campusId: school.campuses[0].id } })).toBe(1);
    });
  });
}

test.describe("the other sections", () => {
  test("grading and assessment stay read-only for a campus administrator", async ({ page }) => {
    await signIn(page);
    await section(page, "grading");
    await expect(page.getByRole("button", { name: /^(New|Add|Create)/ })).toHaveCount(0);
    await section(page, "assessment");
    await expect(page.getByRole("button", { name: /^(New|Add|Create)/ })).toHaveCount(0);
  });
});
