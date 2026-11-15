import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0069: a broadcast that reaches nobody says so and says why, keeps what the person wrote and stays on the composer. A school whose only guardian has a phone number and no email address sends an
// email to the guardians: the screen used to show a green "queued successfully for 0 recipients", clear the form and move to a log with nothing new in it. axe (WCAG 2.2 A/AA) and horizontal overflow run
// in BOTH themes with the warning showing, on a desktop and on a phone.

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
  tag = `Z${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school whose one guardian has a phone number and no email address, and its administrator, who has written an email to the guardians and pressed Confirm & Send.
async function sendEmailToGuardians(page: Page) {
  school = await createTenant({ name: `${tag} School` });
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const student = await db.studentRecord.create({
    data: { tenantId: school.id, firstName: "Pupil", lastName: tag, dateOfBirth: new Date("2012-05-05"), admissionNo: `${tag}/1` },
  });
  const guardian = await db.guardianRecord.create({
    data: { tenantId: school.id, firstName: "Parent", lastName: tag, phone: `080${Date.now().toString().slice(-8)}` },
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
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/communication`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  await page.getByLabel("Target Group").selectOption({ label: "Parents / Guardians" });
  await page.getByLabel("Email Subject").fill(`${tag} notice`);
  await page.getByLabel("Message Content").fill("Please read this notice.");
  await page.getByRole("button", { name: "Dispatch Broadcast" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm & Send" }).click();
}

test("a broadcast that reaches nobody says nothing was sent and why, and is not called a success", async ({ page }) => {
  await sendEmailToGuardians(page);
  const warning = page.getByRole("alert").filter({ hasText: "Nothing was sent" });
  await expect(warning).toContainText("Nothing was sent. 1 person in this audience has no email address on record.");
  await expect(warning).toContainText("Add it to their record, or choose another channel.");
  await expect(page.getByText(/queued successfully/)).toHaveCount(0);
  await checkBothThemes(page, "the composer after a broadcast that reached nobody");
});

test("a broadcast that reaches nobody keeps what was written and stays on the composer; nothing is queued", async ({ page }) => {
  await sendEmailToGuardians(page);
  // the confirm dialog closes when the answer has been handled: only then is "stays" and "kept" a statement about the outcome
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("tab", { name: "Broadcast Composer" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Email Subject")).toHaveValue(`${tag} notice`);
  await expect(page.getByLabel("Message Content")).toHaveValue("Please read this notice.");
  expect(await db.notificationDispatch.count({ where: { tenantId: school.id } })).toBe(0);
});
