import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The working tabs of a program (task 0027, slices P2 to P5, and task 0030) in a real browser: People, Attendance, Assessments, Progress, Fees, Completion, Staff and Settings. The APIs and
// every rule are tested in tests/api; this is the screens: that each tab opens for the school's administrator on a program with everything switched on, says something useful when it has nothing
// to show, and passes Axe (WCAG 2.2 A/AA) with no horizontal overflow in BOTH themes, on desktop and on a phone. One person is placed in one group so the lists are not all empty.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(innerWidth);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    // the theme fades for 150 ms: a scan taken inside it measures a colour between the two themes
    await page.waitForTimeout(250);
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await setTheme(page, initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 240_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `W${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

async function api(page: Page, path: string, method: "POST" | "PATCH" | "PUT", data: object) {
  const res = await page.request.fetch(`/api/v1/schools/${school.code}${path}`, {
    method,
    data,
    headers: { origin: SAAS_URL, "content-type": "application/json" },
  });
  const text = await res.text();
  expect(res.status(), `${method} ${path}: ${text}`).toBeLessThan(300);
  return JSON.parse(text).data as { id: string };
}

/// A school, its administrator, an active program that runs in North with every feature on, one group and one pupil placed in it.
async function arrange(page: Page) {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin: Person = await member(school, Role.ADMIN, null, `${tag} Admin`);
  await signInThroughUi(page, admin.user);
  const program = await api(page, "/programs", "POST", {
    name: `${tag} Quran memorisation`,
    kind: "ONGOING",
    campusIds: [north.id],
    levelLabels: ["Section"],
  });
  await api(page, `/programs/${program.id}/status`, "POST", { action: "activate" });
  const group = await api(page, `/programs/${program.id}/groups`, "POST", { name: "Juz Amma" });
  const record = await db.studentRecord.create({
    data: {
      tenantId: school.id,
      campusId: north.id,
      firstName: `${tag}Amina`,
      lastName: "Bello",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: `${tag}/1`,
    },
  });
  await api(page, `/programs/${program.id}/people`, "POST", { kind: "STUDENT", studentId: record.id, groupId: group.id });
  await db.program.update({ where: { id: program.id }, data: { assessmentsEnabled: true, feesEnabled: true, progressEnabled: true } });
  return program.id;
}

const TABS = ["People", "Attendance", "Assessments", "Progress", "Fees", "Completion", "Staff", "Settings"] as const;

test.describe("The working tabs of a program", () => {
  test("every tab opens with its heading or its words, and passes Axe and overflow in both themes", async ({ page }) => {
    const id = await arrange(page);
    await page.goto(`/schools/${school.code}/programs/${id}`);
    await expect(page.getByRole("heading", { level: 2, name: `${tag} Quran memorisation` })).toBeVisible();
    for (const name of TABS) {
      await page.getByRole("tab", { name, exact: true }).click();
      const panel = page.locator(`#progpanel-${name.toLowerCase()}`); // by id: some tabs hold a tab list of their own with the same name
      await expect(panel).toBeVisible();
      await expect(panel).toContainText(/\S/);
      await checkBothThemes(page, `the ${name} tab of a program`);
    }
  });

  test("the People tab lists the pupil placed in the group and offers to add more", async ({ page }) => {
    const id = await arrange(page);
    await page.goto(`/schools/${school.code}/programs/${id}`);
    await page.getByRole("tab", { name: "People", exact: true }).click();
    await expect(page.locator("#progpanel-people")).toContainText(`${tag}Amina`);
    await expect(page.getByRole("button", { name: /^Add/ }).first()).toBeVisible();
  });

  test("a program with fees switched off for the program has no Fees tab", async ({ page }) => {
    const id = await arrange(page);
    await db.program.update({ where: { id }, data: { feesEnabled: false } });
    await page.goto(`/schools/${school.code}/programs/${id}`);
    await expect(page.getByRole("heading", { level: 2, name: `${tag} Quran memorisation` })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Fees", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "People", exact: true })).toBeVisible();
  });
});
