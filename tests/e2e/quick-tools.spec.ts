import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { SAAS_URL } from "../support/env";
import { Role, addMembership, createTenant, createUser, removeCreatedTenants, type TestTenant } from "../support/db";
import { signInThroughUi } from "./helpers";

test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}\n      ` +
      v.nodes.map((n) => `${n.target.join(" ")} ::   ${n.failureSummary ?? ""}`).join("\n      "),
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

let school: TestTenant;

test.describe("Global Quick Tools Floating Dock & PWA Shortcuts", () => {
  test.beforeEach(async () => {
    school = await createTenant({ name: "Apex Quick Tools Academy" });
  });

  test.afterEach(async () => {
    await removeCreatedTenants();
  });

  test("admin opens floating Quick Tools, uses calculator, tests scratchpad, and verifies Axe accessibility", async ({ page }) => {
    const adminUser = await createUser({ name: "Farooq Bello" });
    await addMembership(adminUser.id, school.id, Role.ADMIN);

    // 1. Sign in as Admin and land on school overview
    await signInThroughUi(page, adminUser);
    await page.goto(`/schools/${school.code}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 2. Verify Floating Quick Tools Button is visible on screen
    const floatingBtn = page.getByRole("button", { name: /Open Quick Tools/i });
    await expect(floatingBtn).toBeVisible();

    // 3. Click to open Quick Tools Drawer
    await floatingBtn.click();

    // Verify Drawer Header & Tabs
    const drawer = page.getByRole("dialog", { name: "Quick Tools" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Calculator" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Record Payment" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Pay Link & QR" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Quick Alert" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Scratchpad" })).toBeVisible();

    // 4. Test Calculator Tool Interactions
    // Click 2, 5, 0, ×, 4, =
    await drawer.getByRole("button", { name: "2", exact: true }).click();
    await drawer.getByRole("button", { name: "5", exact: true }).click();
    await drawer.getByRole("button", { name: "0", exact: true }).click();
    await drawer.getByRole("button", { name: "×", exact: true }).click();
    await drawer.getByRole("button", { name: "4", exact: true }).click();
    await drawer.getByRole("button", { name: "=", exact: true }).click();

    // Check evaluated result
    const calcResult = drawer.getByTestId("calculator-result");
    await expect(calcResult).toContainText("1,000");

    // Test school fee discount preset
    await drawer.getByRole("button", { name: "−5% Sibling" }).click();
    await expect(calcResult).toContainText("950");

    // 5. Test Tab Switching to Scratchpad
    await drawer.getByRole("button", { name: "Scratchpad" }).click();
    const scratchpad = drawer.getByPlaceholder("Jot down quick parent phone numbers, memos, admission inquiries, or reminders here...");
    await expect(scratchpad).toBeVisible();
    await scratchpad.fill("Parent called regarding admission for Year 7 entrance exam.");
    await expect(drawer.getByText("Saved", { exact: true })).toBeVisible();

    // 6. Test Tab Switching to Record Payment
    await drawer.getByRole("button", { name: "Record Payment" }).click();
    await expect(drawer.getByPlaceholder("Search student by name or admission #...")).toBeVisible();

    // 7. Verify Axe Accessibility on the Open Drawer
    await expectAccessible(page, "Quick Tools Drawer");

    // 8. Close drawer with Close button
    await drawer.getByRole("button", { name: "Close Quick Tools" }).click();
    await expect(drawer).not.toBeVisible();

    // 9. Re-open via Keyboard Shortcut (Alt+T)
    await page.keyboard.press("Alt+t");
    await expect(drawer).toBeVisible();

    // Close via Escape key
    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();
  });
});
