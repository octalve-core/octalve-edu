import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import {
  DEFAULT_PASSWORD,
  Role,
  addMembership,
  codeFor,
  createTenant,
  createUser,
  db,
  enableMfa,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi, signInWithSecondFactor } from "./helpers";

// Audited support access in a real browser (task 0011 slice D, ADR 0017): the school's administrator allows it, sees it, withdraws it; a platform
// administrator opens a read-only view of exactly what was allowed, sees the banner on every page, is refused the rest, and leaves; the school then sees what
// was looked at. Axe (WCAG 2.2 A/AA) runs on each new screen in BOTH themes (the app is dark by default; the light theme is the `theme=light` cookie).
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
let admin: TestUser;
const actors: string[] = [];
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Support E2E School", campuses: ["North"] });
  admin = await createUser({ name: "Ada Administrator" });
  await addMembership(admin.id, school.id, Role.ADMIN);
});
test.afterEach(async () => {
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: actors } } });
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
const setTheme = (page: Page, theme: "dark" | "light") =>
  theme === "light" ? page.context().addCookies([{ name: "theme", value: "light", url: SAAS_URL }]) : Promise.resolve();

for (const theme of ["dark", "light"] as const) {
  test.describe(`the school's page - ${theme} theme`, () => {
    test("the administrator allows access (areas, hours, reason, password), sees it listed, and withdraws it", async ({ page }) => {
      await setTheme(page, theme);
      await signInThroughUi(page, admin);
      await page.goto(`/schools/${school.code}/support`);
      await expect(page.getByRole("heading", { level: 1, name: "Support access" })).toBeVisible();
      await expect(page.getByText("No one has been given support access.")).toBeVisible();
      await expect(page.getByText("Nobody from the platform has looked at your school.")).toBeVisible();
      await expectAccessible(page, `support access page (${theme})`);

      await page.getByRole("button", { name: "Allow support access" }).click();
      await expect(dialog(page).getByLabel("Finance")).toHaveCount(0); // never offered
      await expectAccessible(page, `allow dialog (${theme})`);
      await dialog(page).getByRole("button", { name: "Allow access" }).click();
      await expect(dialog(page).getByText("Choose at least one area.")).toBeVisible(); // asked of the server, shown at the field
      await dialog(page).getByLabel("People, staff and students").check();
      await dialog(page).getByLabel("Why").fill("Ticket 4821: the student list looks wrong");
      await dialog(page).getByLabel("Your password").fill("not-the-password");
      await dialog(page).getByRole("button", { name: "Allow access" }).click();
      await expect(dialog(page).getByText("That password isn't right.")).toBeVisible();
      await dialog(page).getByLabel("Your password").fill(DEFAULT_PASSWORD);
      await dialog(page).getByRole("button", { name: "Allow access" }).click();

      const grant = page.getByRole("listitem").filter({ hasText: "Ticket 4821" });
      await expect(grant).toContainText("People, staff and students");
      await expect(grant).toContainText("Open until");
      expect(await db.supportGrant.count({ where: { tenantId: school.id, revokedAt: null } })).toBe(1);

      await grant.getByRole("button", { name: /^Withdraw/ }).click();
      await expect(page.getByText(/Support access was withdrawn/)).toBeVisible();
      await expect(grant).toContainText("Withdrawn");
      await expect(grant.getByRole("button", { name: /^Withdraw/ })).toHaveCount(0);
      expect(await db.supportGrant.count({ where: { tenantId: school.id, revokedAt: null } })).toBe(0);
    });
  });
}

test.describe("the platform administrator's view", () => {
  test("opens the school with their password, reads only the allowed area with a banner on every page, is refused the rest, leaves - and the school sees it", async ({
    page,
    browser,
  }) => {
    const platform = await createUser({ name: "Support Person", platformAdmin: true });
    actors.push(platform.id);
    const factor = await enableMfa(platform.id);
    await db.supportGrant.create({
      data: {
        tenantId: school.id,
        areas: ["people"],
        reason: "Ticket 77",
        expiresAt: new Date(Date.now() + 2 * 3600_000),
        createdById: admin.id,
      },
    });

    await signInWithSecondFactor(page, platform, { code: codeFor(factor.secret) });
    await page.goto("/platform");
    const row = page.locator('section[aria-labelledby="schools-heading"]').getByRole("listitem").filter({ hasText: "Support E2E School" });
    await row.getByRole("button", { name: "Open a support view of Support E2E School" }).click();
    await expect(dialog(page)).toContainText("People, staff and students");
    await expectAccessible(page, "open support view dialog");
    await dialog(page).getByLabel("Your password").fill("not-the-password");
    await dialog(page).getByRole("button", { name: "Open the school" }).click();
    await expect(
      dialog(page)
        .getByText(/password/i)
        .first(),
    ).toBeVisible();
    await dialog(page).getByLabel("Your password").fill(DEFAULT_PASSWORD);
    await dialog(page).getByRole("button", { name: "Open the school" }).click();

    await page.waitForURL(`**/schools/${school.code}`);
    const banner = page.getByRole("region", { name: "Support view" });
    await expect(banner).toContainText("Support view of Support E2E School");
    await expect(banner).toContainText("read-only");
    await expect(banner).toContainText("People, staff and students");
    await expectAccessible(page, "school overview in a support view");

    await page.goto(`/schools/${school.code}/people`);
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
    await expect(banner).toBeVisible();
    await expect(page.getByRole("button", { name: /^(New|Add|Create|Import)/ })).toHaveCount(0); // read-only: no controls that write

    for (const path of ["settings", "academics", "support"]) {
      await page.goto(`/schools/${school.code}/${path}`);
      await expect(page.getByRole("heading", { level: 1, name: /Settings|Academic setup|Support access/ })).toHaveCount(0); // the 403 view
    }

    await page.goto(`/schools/${school.code}`);
    await banner.getByRole("button", { name: "Leave support view" }).click();
    await page.waitForURL("**/platform");
    await expect(page.getByRole("region", { name: "Support view" })).toHaveCount(0);

    // after leaving, the same address is closed again
    await page.goto(`/schools/${school.code}/people`);
    await expect(page.getByRole("heading", { level: 1, name: "People" })).toHaveCount(0);

    // the school sees what was looked at
    const adminContext = await browser.newContext({ baseURL: SAAS_URL });
    const adminPage = await adminContext.newPage();
    await signInThroughUi(adminPage, admin);
    await adminPage.goto(`/schools/${school.code}/support`);
    await expect(adminPage.getByText("Support Person · Opened a support view")).toBeVisible();
    await expect(adminPage.getByText(/Support Person · Read/).first()).toBeVisible();
    await expect(adminPage.getByText("Support Person · Closed the support view")).toBeVisible();
    await expectAccessible(adminPage, "support access page with activity");
    await adminContext.close();
  });
});
