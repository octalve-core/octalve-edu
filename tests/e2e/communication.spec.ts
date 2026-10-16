import "../support/env";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant, type TestUser } from "../support/db";
import { signInThroughUi, waitForHydration } from "./helpers";

test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}\n      ` +
      v.nodes
        .slice(0, 4)
        .map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1] ?? ""}`)
        .join("\n      "),
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

let school: TestTenant;
let admin: TestUser;

test.beforeAll(async () => {
  await seedInstance();
});

test.beforeEach(async () => {
  school = await createTenant({ name: "Apex Communication Academy", campuses: ["Alpha Campus"] });
  admin = await createUser();
  await addMembership(admin.id, school.id, Role.ADMIN);
});

test.afterEach(async () => {
  await removeCreatedTenants();
});

test.describe("Communication UI Console & Accessibility", () => {
  test("admin navigates to Communication, switches tabs, previews templates, and passes Axe accessibility", async ({ page }) => {
    // 1. Sign in as school admin
    await signInThroughUi(page, admin);
    await waitForHydration(page);

    // 2. Navigate to communication page
    await page.goto(`/schools/${school.code}/communication`);
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();

    // 3. Accessibility check on initial Broadcast Composer tab
    await expectAccessible(page, "Communication - Broadcast Composer");

    // 4. Verify channel buttons interact correctly
    const smsButton = page.getByRole("button", { name: "SMS" });
    await expect(smsButton).toBeVisible();
    await smsButton.click();

    // 5. Fill broadcast message
    const messageInput = page.getByPlaceholder("Write your broadcast message here. Use tokens below for dynamic personalization...");
    await expect(messageInput).toBeVisible();
    await messageInput.fill("Dear Guardian, school will close at 1:00 PM today.");

    // Verify token insertion button works
    const tokenButton = page.getByRole("button", { name: "+ {{student_name}}" });
    await expect(tokenButton).toBeVisible();
    await tokenButton.click({ force: true });

    // Verify live preview renders with sample interpolated token "Tariq Nasir"
    await expect(page.getByText("Dear Guardian, school will close at 1:00 PM today. Tariq Nasir")).toBeVisible();

    // 6. Switch to Notification Templates tab
    const templatesTab = page.getByRole("tab", { name: "Notification Templates" });
    await expect(templatesTab).toBeVisible();
    await templatesTab.click();

    // Verify templates load
    await expect(page.getByPlaceholder("Search templates...")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Attendance Absence Notice/i }).first()).toBeVisible();

    // Run accessibility check on Templates tab
    await expectAccessible(page, "Communication - Notification Templates");

    // 7. Switch to Delivery Logs & Diagnostics tab
    const logsTab = page.getByRole("tab", { name: "Delivery Logs & Diagnostics" });
    await expect(logsTab).toBeVisible();
    await logsTab.click();

    // Verify logs table headers
    const logsTable = page.getByRole("table");
    await expect(logsTable).toBeVisible();
    await expect(logsTable.getByText("Status")).toBeVisible();
    await expect(logsTable.getByText("Channel")).toBeVisible();
    await expect(logsTable.getByText("Recipient")).toBeVisible();

    // Run accessibility check on Logs tab
    await expectAccessible(page, "Communication - Delivery Logs");
  });
});
