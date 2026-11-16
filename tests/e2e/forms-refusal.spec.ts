import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0073: when the "New practice set" or "New questionnaire" form refuses a save, the list of what is wrong is brought into view (the same defect and fix as task 0071's question form). The form is
// taller than the window on a desktop (720 px) and on a phone, the Create button is at its foot and the list of reasons is at its head, so a person who pressed it saw nothing happen. The first
// test asserts the list is in the viewport for both kinds; the second is a control: axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes with the refusal showing.

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

/// A teacher signed in on Forms with the empty "New <noun>" form open and its save button pressed: the form is refused. Pressing the button scrolls the dialog to the foot, where it is.
async function refusedEmptyForm(page: Page, tab: string, noun: string, save: string) {
  const school = await createTenant({ name: `R${Date.now().toString(36).toUpperCase()} School`, campuses: ["North"] });
  const writer = await member(school, Role.TEACHING_STAFF, school.campuses[0].id, "Refusal Writer");
  await signInThroughUi(page, writer.user);
  await page.goto(`/schools/${school.code}/forms`);
  await waitForHydration(page);
  await page.getByRole("tab", { name: tab }).click();
  await page.getByRole("button", { name: `New ${noun}` }).click();
  const form = page.getByRole("dialog", { name: `New ${noun}` });
  await form.getByRole("button", { name: save }).click();
  return form;
}

for (const [tab, noun, save] of [
  ["Practice sets", "practice set", "Create practice set"],
  ["Questionnaires", "questionnaire", "Save as draft"],
] as const) {
  test(`an empty ${noun} is refused with its reasons in the part of the dialog the person is looking at`, async ({ page }) => {
    const form = await refusedEmptyForm(page, tab, noun, save);
    const alert = form.getByRole("alert");
    await expect(alert).toContainText("Give it a title.");
    await expect(alert).toBeInViewport({ ratio: 0.99 });
  });
}

test("the refused form passes axe and does not overflow, in both themes", async ({ page }) => {
  const form = await refusedEmptyForm(page, "Practice sets", "practice set", "Create practice set");
  await expect(form.getByRole("alert")).toContainText("Write the question for question 1.");
  await checkBothThemes(page, "the practice set form after a refused save");
});
