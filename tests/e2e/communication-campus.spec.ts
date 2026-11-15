import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { classArm, member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0068: a campus administrator addresses their own campus only. The Communication screen offers them their campus (selected) and no "All Campuses", offers only the classes of their campus, a broadcast
// sent through the confirm dialog reaches that campus's guardians and staff and no one else (read back from the database), and the delivery log lists the messages of their campus only. axe (WCAG 2.2 A/AA)
// and horizontal overflow run in BOTH themes, on a desktop and on a phone.

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

const addr = (who: string) => `${who}.${tag.toLowerCase()}@campus.test`;

/// Two campuses, a class on each, a guardian and a member of staff on each, and a campus administrator of North, signed in on the Communication page.
async function arrange(page: Page) {
  school = await createTenant({ name: `${tag} School`, campuses: ["North", "South"] });
  const [north, south] = school.campuses;
  const campusAdmin = await member(school, Role.CAMPUS_ADMIN, north.id, `${tag} North Admin`);
  await classArm(school, north.id, `${tag} North class`);
  await classArm(school, south.id, `${tag} South class`);
  for (const [campus, who] of [
    [north.id, "gnorth"],
    [south.id, "gsouth"],
  ] as const) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        campusId: campus,
        firstName: who,
        lastName: tag,
        dateOfBirth: new Date("2012-05-05"),
        admissionNo: `${tag}/${who}`,
      },
    });
    const guardian = await db.guardianRecord.create({
      data: { tenantId: school.id, firstName: "Parent", lastName: who, email: addr(who) },
    });
    await db.guardianLink.create({
      data: {
        tenantId: school.id,
        studentId: student.id,
        guardianId: guardian.id,
        relationship: "GUARDIAN",
        status: "APPROVED",
        isPrimary: true,
      },
    });
  }
  await db.staffRecord.create({
    data: { tenantId: school.id, campusId: north.id, category: "TEACHING", firstName: "Staff", lastName: "north", email: addr("snorth") },
  });
  await db.staffRecord.create({
    data: { tenantId: school.id, campusId: south.id, category: "TEACHING", firstName: "Staff", lastName: "south", email: addr("ssouth") },
  });
  await signInThroughUi(page, campusAdmin.user);
  await page.goto(`/schools/${school.code}/communication`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  return { north, south };
}

test('a campus administrator is offered their own campus, selected, and no "All Campuses"', async ({ page }) => {
  const { north } = await arrange(page);
  const scope = page.getByLabel("Campus Scope");
  await expect(scope.locator("option")).toHaveText(["North"]);
  await expect(scope).toHaveValue(north.id);
  await checkBothThemes(page, "the broadcast composer of a campus administrator");
});

test("a campus administrator is offered the classes of their own campus only", async ({ page }) => {
  await arrange(page);
  await expect(page.getByLabel("Class Arm").locator("option")).toHaveText(["All Classes", `${tag} North class - A`]);
});

test("a broadcast sent by a campus administrator reaches their campus's people only, and the delivery log lists their campus's messages only", async ({
  page,
}) => {
  const { south } = await arrange(page);
  await page.getByLabel("Email Subject").fill(`${tag} notice`);
  await page.getByLabel("Message Content").fill("Please read this notice.");
  await page.getByRole("button", { name: "Dispatch Broadcast" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText("Campus: North");
  await confirm.getByRole("button", { name: "Confirm & Send" }).click();
  await expect(page.getByRole("tab", { name: "Delivery Logs & Diagnostics" })).toHaveAttribute("aria-selected", "true");
  const queued = (await db.notificationDispatch.findMany({ where: { tenantId: school.id }, select: { recipientAddress: true } }))
    .map((row) => row.recipientAddress)
    .sort();
  expect(queued, "North's guardian and North's member of staff, not South's").toEqual([addr("gnorth"), addr("snorth")].sort());

  // A message of South made by the school is not shown to North's administrator.
  await db.notificationDispatch.create({
    data: {
      tenantId: school.id,
      channel: "EMAIL",
      recipientAddress: addr("gsouth"),
      body: "a message of South",
      status: "SENT",
      metadata: { campusIds: [south.id] },
    },
  });
  await page.getByRole("tab", { name: "Broadcast Composer" }).click();
  await page.getByRole("tab", { name: "Delivery Logs & Diagnostics" }).click();
  const table = page.getByRole("region", { name: "Delivery logs table" });
  await expect(table.getByText(addr("gnorth"))).toBeVisible();
  await expect(table.getByText(addr("snorth"))).toBeVisible();
  await expect(table.getByText(addr("gsouth"))).toHaveCount(0);
  await checkBothThemes(page, "the delivery log of a campus administrator");
});
