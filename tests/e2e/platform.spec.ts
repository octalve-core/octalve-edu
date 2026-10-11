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
  type TestUser,
} from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi, signInWithSecondFactor } from "./helpers";

// The platform page in a real browser, desktop and phone (plan C5, ADR 0016, slice C): a platform administrator with two-step verification sees the
// schools (identity data only), creates one with its first administrator, suspends and reinstates it, and changes a type; everyone else is kept out.
// Axe (WCAG 2.2 A/AA) runs on the page and on each dialog, in the default theme.
test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}

const madeCodes: string[] = [];
const actors: string[] = [];
test.beforeAll(async () => {
  await seedInstance();
});
test.afterAll(async () => {
  await db.tenant.deleteMany({ where: { code: { in: madeCodes } } });
  await db.platformAuditLog.deleteMany({ where: { actorUserId: { in: actors } } });
  await removeCreatedTenants();
});

async function platformAdmin(opts: { mfa: boolean } = { mfa: true }) {
  const user = await createUser({ name: "Plat Admin", platformAdmin: true });
  actors.push(user.id);
  const factor = opts.mfa ? await enableMfa(user.id) : null;
  return { user, factor };
}
async function signIn(page: Page, who: { user: TestUser; factor: { secret: Buffer } | null }) {
  if (who.factor) await signInWithSecondFactor(page, who.user, { code: codeFor(who.factor.secret) });
  else await signInThroughUi(page, who.user);
}
const dialog = (page: Page) => page.getByRole("dialog");
// (the history below also names schools, so rows are looked for in the schools section only)
const row = (page: Page, text: string) =>
  page.locator('section[aria-labelledby="schools-heading"]').getByRole("listitem").filter({ hasText: text });

test.describe("the platform page", () => {
  test("a platform administrator sees the schools, creates one, suspends and reinstates it, and changes the type of another", async ({
    page,
  }) => {
    const existing = await createTenant({ name: "Existing E2E School" });
    const who = await platformAdmin();
    await signIn(page, who);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Platform" })).toBeVisible();
    await page.goto("/platform");
    await expect(page.getByRole("heading", { level: 1, name: "Platform" })).toBeVisible();
    await expect(row(page, "Existing E2E School")).toContainText(existing.code);
    await expect(row(page, "Existing E2E School")).toContainText("Active");
    // coarse counters, and a school nobody administers is marked
    await expect(row(page, "Existing E2E School")).toContainText("0 members · 0 students · 1 campus");
    await expect(row(page, "Existing E2E School")).toContainText("No administrator");
    await expectAccessible(page, "/platform");

    // create
    const code = `e2e-${Date.now().toString(36)}`;
    madeCodes.push(code);
    await page.getByRole("button", { name: "Create a school" }).click();
    await expectAccessible(page, "/platform (create dialog)");
    const d = dialog(page);
    await d.getByLabel("School name").fill("Brand New E2E School");
    await d.getByLabel("School code").fill(code);
    await d.getByLabel("School type").selectOption("HIGHER_ED");
    await d.getByLabel("First administrator's email").fill(`first-${code}@example.test`);
    await d.getByRole("button", { name: "Create school" }).click(); // no password yet: said in place
    await expect(d.getByText("That password isn't right.")).toBeVisible();
    await d.getByLabel("Your password").fill(DEFAULT_PASSWORD);
    await d.getByRole("button", { name: "Create school" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Brand New E2E School was created" })).toBeVisible();
    await expect(row(page, "Brand New E2E School")).toContainText("Higher education");
    await expect(row(page, "Brand New E2E School")).toContainText("No administrator"); // invited, not yet accepted

    // suspend (a reason is required), then reinstate
    await page.getByRole("button", { name: "Suspend Brand New E2E School" }).click();
    await expectAccessible(page, "/platform (suspend dialog)");
    await dialog(page).getByLabel("Your password").fill(DEFAULT_PASSWORD);
    await dialog(page).getByRole("button", { name: "Suspend school" }).click();
    await expect(dialog(page).getByText("Give a reason for suspending the school.")).toBeVisible();
    await dialog(page).getByLabel("Reason").fill("Unpaid subscription");
    await dialog(page).getByRole("button", { name: "Suspend school" }).click();
    await expect(row(page, "Brand New E2E School")).toContainText("Suspended");
    await expect(page.getByText("Unpaid subscription")).toBeVisible(); // in the history
    await page.getByRole("button", { name: "Reinstate Brand New E2E School" }).click();
    await dialog(page).getByLabel("Your password").fill(DEFAULT_PASSWORD);
    await dialog(page).getByRole("button", { name: "Reinstate school" }).click();
    await expect(row(page, "Brand New E2E School")).toContainText("Active");

    // type
    await page.getByRole("button", { name: "Change the type of Existing E2E School" }).click();
    await dialog(page).getByLabel("School type").selectOption("VOCATIONAL");
    await dialog(page).getByLabel("Your password").fill(DEFAULT_PASSWORD);
    await dialog(page).getByRole("button", { name: "Save type" }).click();
    await expect(row(page, "Existing E2E School")).toContainText("Vocational");
  });

  test("a platform administrator without two-step verification is asked to turn it on, and sees no school", async ({ page }) => {
    const existing = await createTenant({ name: "Hidden Until Two-Step School" });
    await signIn(page, await platformAdmin({ mfa: false }));
    await page.goto("/platform");
    await expect(page.getByText("Turn on two-step verification first")).toBeVisible();
    await expect(page.getByText(existing.name)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open your account" })).toBeVisible();
  });

  test("a school administrator gets the same 403 view as a stranger, and no Platform link", async ({ page }) => {
    const school = await createTenant({ name: "Ordinary School" });
    const boss = await createUser({ name: "Ordinary Admin" });
    await addMembership(boss.id, school.id, Role.ADMIN);
    await signInThroughUi(page, boss);
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Platform" })).toHaveCount(0);
    const response = await page.goto("/platform");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "You don't have access to this school" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a school" })).toHaveCount(0);
  });
});
