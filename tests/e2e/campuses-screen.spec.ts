import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// The Campuses section of the Settings page (task 0063): until it existed a campus could be made only by calling the API, so a school that started with none could never give a campus administrator their
// campus. Every rule of the route is tested in tests/api/campuses.spec.ts; this file proves that a person can do it by typing, that the server's own words reach the screen, that the campus then appears where a
// campus is chosen, and that the page is clean (axe, WCAG 2.2 A/AA, and no horizontal overflow) in both themes on a desktop and on a phone.

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
test.describe.configure({ timeout: 120_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `K${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with the given campuses (none by default: what the wizard and the platform's onboarding make) and its administrator.
async function arrange(campuses: string[] = []) {
  school = await createTenant({ name: `${tag} School`, campuses });
  return { admin: await member(school, Role.ADMIN, null, `${tag} Admin`) };
}

const campusList = (page: Page) => page.getByRole("list", { name: "Campuses" }).getByRole("listitem");
const nameField = (page: Page) => page.getByLabel("Campus name");
const addButton = (page: Page) => page.getByRole("button", { name: "Add campus", exact: true });

test("a school with no campus says so; the administrator adds two by typing, and they are listed in order, saved and audited", async ({
  page,
}) => {
  const { admin } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(page.getByRole("heading", { level: 2, name: "Campuses" })).toBeVisible();
  await expect(page.getByText("This school has no campus yet.")).toBeVisible();
  await expect(campusList(page)).toHaveCount(0);
  await checkBothThemes(page, "the settings page, a school with no campus");

  await nameField(page).fill("South Campus");
  await addButton(page).click();
  await expect(page.getByText("“South Campus” was added.")).toBeVisible();
  await expect(campusList(page)).toHaveText(["South Campus"]);
  await expect(nameField(page)).toHaveValue("");
  await nameField(page).fill("  East   Campus ");
  await addButton(page).click();
  await expect(page.getByText("“East Campus” was added.")).toBeVisible();
  // Sorted by name, the way the route returns them; the spaces were tidied by the server.
  await expect(campusList(page)).toHaveText(["East Campus", "South Campus"]);
  await checkBothThemes(page, "the settings page with two campuses");

  const saved = await db.campus.findMany({ where: { tenantId: school.id }, select: { name: true }, orderBy: { name: "asc" } });
  expect(saved).toEqual([{ name: "East Campus" }, { name: "South Campus" }]);
  const audited = await db.auditLog.findMany({ where: { tenantId: school.id, action: "CAMPUS_CREATED" }, select: { afterValue: true } });
  expect(audited.map((row) => row.afterValue)).toHaveLength(2);

  // Leaving and coming back: the campuses were saved, not just shown.
  await page.goto(`/schools/${school.code}/people`);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(campusList(page)).toHaveText(["East Campus", "South Campus"]);
});

test("the server's own words reach the screen: the same name again, and a blank name, are refused and nothing is made", async ({
  page,
}) => {
  const { admin } = await arrange(["Main campus"]);
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(campusList(page)).toHaveText(["Main campus"]);

  await nameField(page).fill("Main campus");
  await addButton(page).click();
  await expect(page.getByText("This school already has a campus with that name.")).toBeVisible();
  await expect(nameField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(nameField(page)).toHaveValue("Main campus");
  await expect(page.getByText(/was added\./)).toHaveCount(0);

  await nameField(page).fill("   ");
  await addButton(page).click();
  await expect(page.getByText("Enter the campus name.")).toBeVisible();
  await expect(page.getByText("This school already has a campus with that name.")).toHaveCount(0);

  await expect(campusList(page)).toHaveText(["Main campus"]);
  expect(await db.campus.count({ where: { tenantId: school.id } })).toBe(1);
  expect(await db.auditLog.count({ where: { tenantId: school.id, action: "CAMPUS_CREATED" } })).toBe(0);
});

test("a campus made here is offered where a campus is chosen: the invitation of a campus administrator", async ({ page }) => {
  const { admin } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/settings`);
  await nameField(page).fill("North Campus");
  await addButton(page).click();
  await expect(campusList(page)).toHaveText(["North Campus"]);

  await page.goto(`/schools/${school.code}/users`);
  await page.getByRole("button", { name: "Invite someone" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite someone" });
  await dialog.getByLabel("Role", { exact: true }).selectOption({ label: "Campus administrator" });
  await expect(dialog.getByLabel("Campus", { exact: true }).getByRole("option", { name: "North Campus" })).toHaveCount(1);
  await expect(dialog.getByLabel("Campus", { exact: true }).getByRole("option", { name: "Choose a campus" })).toHaveCount(1);
});

test("a campus administrator who types the address is refused the page: campuses are the school administrator's (ADR 0016)", async ({
  page,
}) => {
  await arrange(["Main campus"]);
  const campusAdmin = await member(school, Role.CAMPUS_ADMIN, school.campuses[0].id, `${tag} Campus Admin`);
  await signInThroughUi(page, campusAdmin.user);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "You don't have access to this school" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Campuses" })).toHaveCount(0);
  await expect(nameField(page)).toHaveCount(0);
});
