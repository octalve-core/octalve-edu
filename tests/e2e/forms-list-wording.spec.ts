import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0075: "paper work" is not a thing that has a plural, but the Forms list built its words by adding an "s" to the kind's name: its heading read "Paper works" and its empty list "No paper works
// yet." The first test reads the words of all three kinds of list; the second is a control: axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes on the paper work list, on a desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    // the theme fades for 150 ms: a scan taken inside it measures a colour between the two themes
    await page.waitForTimeout(250);
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

test.beforeAll(async () => {
  await seedInstance();
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A teacher signed in on Forms, in a school that has written no forms.
async function emptyForms(page: Page) {
  const school = await createTenant({ name: `W${Date.now().toString(36).toUpperCase()} School`, campuses: ["North"] });
  const writer = await member(school, Role.TEACHING_STAFF, school.campuses[0].id, "Wording Writer");
  await signInThroughUi(page, writer.user);
  await page.goto(`/schools/${school.code}/forms`);
  await waitForHydration(page);
}

for (const [tab, heading, empty] of [
  ["Practice sets", "Practice sets", "No practice sets yet."],
  ["Questionnaires", "Questionnaires", "No questionnaires yet."],
  ["Paper work", "Paper work", "No paper work yet."],
] as const) {
  test(`the ${tab.toLowerCase()} list names itself and its empty state in words that are true`, async ({ page }) => {
    await emptyForms(page);
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("heading", { level: 2, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText(empty);
  });
}

test("the empty paper work list passes axe and does not overflow, in both themes", async ({ page }) => {
  await emptyForms(page);
  await page.getByRole("tab", { name: "Paper work" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No paper work yet.");
  await checkBothThemes(page, "the empty paper work list");
});
