import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance } from "../support/db";
import { SAAS_URL } from "../support/env";
import { classArm, member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0076: paper work that is not given an opening time opens when it is made, and nothing compared that with its closing time, so a closing time that had already passed was saved: the list read
// "Opens 16 Nov 2026 · Closes 10 Sept 2026". The builder now says so in words and saves nothing; a closing time that has passed WITH an earlier opening time is still accepted (a teacher may record paper
// work whose time has gone). A control: axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes with the refusal showing, on a desktop and on a phone.

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

const PASSED = "The closing time has already passed. Choose a later one, or give an earlier opening time.";

/// A teacher signed in on Paper work with the form open, a title and the school's one class chosen and a closing time that has passed typed in.
async function formWithPastClosing(page: Page) {
  const school = await createTenant({ name: `P${Date.now().toString(36).toUpperCase()} School`, campuses: ["North"] });
  const campus = school.campuses[0].id;
  await classArm(school, campus, "JSS 1");
  const writer = await member(school, Role.TEACHING_STAFF, campus, "Closing Writer");
  await signInThroughUi(page, writer.user);
  await page.goto(`/schools/${school.code}/forms`);
  await waitForHydration(page);
  await page.getByRole("tab", { name: "Paper work" }).click();
  await page.getByRole("button", { name: "New paper work" }).click();
  const form = page.getByRole("dialog", { name: "New paper work" });
  await form.getByLabel("Title", { exact: true }).fill("Holiday assignment");
  await form.getByLabel("JSS 1", { exact: true }).check();
  await form.getByLabel("Closes", { exact: true }).fill("2020-01-10T09:00");
  return form;
}

test("a closing time that has already passed is refused in words, and nothing is saved", async ({ page }) => {
  const form = await formWithPastClosing(page);
  await form.getByRole("button", { name: "Create paper work" }).click();
  await expect(form.getByRole("alert")).toContainText(PASSED);
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("tabpanel")).toContainText("No paper work yet.");
});

test("a closing time that has passed with an earlier opening time is accepted", async ({ page }) => {
  const form = await formWithPastClosing(page);
  await form.getByLabel("Opens", { exact: true }).fill("2020-01-01T09:00");
  await form.getByRole("button", { name: "Create paper work" }).click();
  await expect(page.getByText("Paper work created.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Holiday assignment" })).toContainText("Closes 10 Jan 2020");
});

test("the refusal passes axe and does not overflow, in both themes", async ({ page }) => {
  const form = await formWithPastClosing(page);
  await form.getByRole("button", { name: "Create paper work" }).click();
  await expect(form.getByRole("alert")).toContainText(PASSED);
  await checkBothThemes(page, "the paper work form after a refused closing time");
});
