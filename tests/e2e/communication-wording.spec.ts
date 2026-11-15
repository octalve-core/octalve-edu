import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0070: two sentences in Communication say what is wrong and how many. The Customize dialog, when the route refuses a template name, says why ("Give the template a name of at least 2
// characters.") and not only "Some of the fields are not valid."; and the line above the tabs says "The message was sent." for one message, not "All 1 messages were sent." The server's answers about
// the queue are replaced here (the real ones are tested elsewhere) so that each state is seen as the administrator sees it. axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes with the
// refusal shown, on a desktop and on a phone.

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

// the count carries no query string here, and `next` is a POST: a glob must match the whole URL
const QUEUE = "**/api/v1/schools/*/communication/queue";
const NEXT = "**/api/v1/schools/*/communication/queue/next";
const json = (data: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ data, meta: {}, error: null }) });
const bar = (page: Page) => page.getByRole("status").filter({ hasText: /Sending|The message|All \d+ messages/ });

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

let code = "";
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async ({ page }) => {
  const school = await createTenant({ name: `W${Date.now().toString(36).toUpperCase()} School` });
  code = school.code;
  const admin = await member(school, Role.ADMIN, null, "Wording Admin");
  await signInThroughUi(page, admin.user);
  await waitForHydration(page);
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

test("a template name that is too short is refused with the reason, and the dialog keeps what was typed", async ({ page }) => {
  await page.goto(`/schools/${code}/communication`);
  await waitForHydration(page);
  await page.getByRole("tab", { name: "Notification Templates" }).click();
  await page.getByRole("button", { name: "Customize" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Template Name").fill("A");
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the template a name of at least 2 characters.");
  await expect(dialog.getByLabel("Template Name")).toHaveValue("A");
  await checkBothThemes(page, "the Customize dialog after a refused name");
});

test("a broadcast to one person says the message was sent, in the singular", async ({ page }) => {
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 1 })));
  await page.route(NEXT, (route) => route.fulfill(json({ claimed: 1, sent: 1, failed: 0, retrying: 0, remaining: 0, firstError: null })));
  await page.goto(`/schools/${code}/communication`);
  await waitForHydration(page);
  await expect(bar(page)).toContainText("The message was sent.");
  await expect(bar(page)).not.toContainText("All 1 messages");
});

test("a broadcast to one person that did not go says the message was not sent, in the singular", async ({ page }) => {
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 1 })));
  await page.route(NEXT, (route) =>
    route.fulfill(json({ claimed: 1, sent: 0, failed: 1, retrying: 0, remaining: 0, firstError: "The provider refused it." })),
  );
  await page.goto(`/schools/${code}/communication`);
  await waitForHydration(page);
  await expect(bar(page)).toContainText("The message was not sent. The provider refused it.");
  await expect(bar(page)).toContainText("It is tried again by the scheduled run");
  await expect(bar(page)).not.toContainText("All 1 messages");
});
