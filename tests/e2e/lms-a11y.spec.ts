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

test.describe("LMS & Assignments UI — Accessibility (WCAG 2.2)", () => {
  test.beforeEach(async () => {
    school = await createTenant({ name: "Crestview LMS Academy" });
  });

  test.afterEach(async () => {
    await removeCreatedTenants();
  });

  test("admin navigates to LMS hub, switches tabs, opens creator dialog, and verifies WCAG 2.2 compliance", async ({ page }) => {
    const adminUser = await createUser({ name: "Halima Sani" });
    await addMembership(adminUser.id, school.id, Role.ADMIN);

    // 1. Sign in as Admin and navigate directly to LMS hub
    await signInThroughUi(page, adminUser);
    await page.goto(`/schools/${school.code}/lms`);

    // 2. Verify page header
    const heading = page.getByRole("heading", { level: 1, name: /Learning Management System/i });
    await expect(heading).toBeVisible();

    // 3. Check WCAG 2.2 accessibility on initial page load
    await expectAccessible(page, "LMS Hub (Assignments Tab)");

    // 4. Switch to Course Materials Tab
    const materialsTab = page.getByRole("button", { name: /Course Materials/i });
    await materialsTab.click();
    await expect(page.getByText(/Study Guides & Curriculum Notes/i)).toBeVisible();
    await expectAccessible(page, "LMS Hub (Materials Tab)");

    // 5. Switch to Quizzes Tab
    const quizzesTab = page.getByRole("button", { name: /Online Quizzes/i });
    await quizzesTab.click();
    await expect(page.getByText(/Interactive Online Quizzes/i)).toBeVisible();
    await expectAccessible(page, "LMS Hub (Quizzes Tab)");

    // 6. Switch back to Assignments and open Creator Dialog
    const assignmentsTab = page.getByRole("button", { name: /Assignments & Homework/i });
    await assignmentsTab.click();

    const createBtn = page.getByRole("button", { name: /\+ Create Assignment/i });
    await createBtn.click();

    const modalTitle = page.getByRole("heading", { level: 3, name: /Create Assignment/i });
    await expect(modalTitle).toBeVisible();

    // 7. Verify accessibility of the creator modal dialog
    await expectAccessible(page, "LMS Create Assignment Modal Dialog");
  });
});
