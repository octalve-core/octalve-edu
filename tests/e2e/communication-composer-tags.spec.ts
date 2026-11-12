import "../support/env";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0056 in a real browser: the Broadcast Composer offers only what can work. The tag chips follow the audience (the server fills exactly those), there is no In-App channel, and a tag the
// audience cannot have is refused on screen with the reason and the text kept. The server's side (what is filled in, who is reached) is in tests/api/communication-tags-recipients.spec.ts.

test.use({ baseURL: SAAS_URL });

let school: TestTenant;

test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Tags Composer School", campuses: ["Alpha Campus"] });
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

async function openComposer(page: Page) {
  const admin = await createUser();
  await addMembership(admin.id, school.id, Role.ADMIN);
  await signInThroughUi(page, admin);
  await waitForHydration(page);
  await page.goto(`/schools/${school.code}/communication`);
  await waitForHydration(page);
  await expect(page.getByRole("heading", { level: 1, name: "Communication" })).toBeVisible();
}

/// Scrolls the control to the middle of the window, then clicks it: on a phone Playwright's "scroll if needed" can leave it under the fixed bottom bar, which then takes the click.
async function press(control: Locator) {
  await control.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await control.click();
}

const chip = (page: Page, token: string) => page.getByRole("button", { name: `+ {{${token}}}`, exact: true });
const audience = (page: Page) => page.getByLabel("Target Group");

test("no tab of Communication is wider than the screen (on a phone the three tabs once pushed the page 15 px sideways)", async ({
  page,
}) => {
  await openComposer(page);
  for (const tab of ["Broadcast Composer", "Notification Templates", "Delivery Logs & Diagnostics"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    // Against the VISUAL viewport: a phone widens its layout viewport to fit an overflowing page, so `innerWidth` would grow with the overflow and this could never fail.
    const { scrollWidth, width } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
    }));
    expect(scrollWidth, `the ${tab} tab makes the page wider than the screen`).toBeLessThanOrEqual(width);
  }
});

test("each audience offers only the tags the server fills for it, and there is no In-App channel", async ({ page }) => {
  await openComposer(page);

  // the whole community (the default) includes staff, who have no pupil
  await expect(audience(page)).toHaveValue("ALL");
  await expect(chip(page, "school_name")).toBeVisible();
  await expect(chip(page, "date")).toBeVisible();
  await expect(chip(page, "student_name")).toHaveCount(0);
  await expect(chip(page, "class_arm")).toHaveCount(0);

  await audience(page).selectOption("GUARDIAN");
  for (const token of ["student_name", "class_arm", "school_name", "date"]) await expect(chip(page, token)).toBeVisible();
  await expect(chip(page, "due_date")).toHaveCount(0);

  await audience(page).selectOption("STAFF");
  await expect(chip(page, "student_name")).toHaveCount(0);
  await expect(chip(page, "school_name")).toBeVisible();

  // three channels, no In-App
  const channels = page.getByRole("button", { name: /^(Email|SMS|WhatsApp|In-App)$/ });
  await expect(channels).toHaveText(["Email", "SMS", "WhatsApp"]);
  await expect(page.getByRole("button", { name: "In-App", exact: true })).toHaveCount(0);
});

test("a chip puts its tag in the message, and the preview shows a sample and says so", async ({ page }) => {
  await openComposer(page);
  await audience(page).selectOption("GUARDIAN");
  await press(page.getByRole("button", { name: "SMS", exact: true }));
  const message = page.getByLabel("Message Content");
  await message.fill("Dear Guardian,");
  await press(chip(page, "class_arm"));
  await expect(message).toHaveValue(/Dear Guardian, \{\{class_arm\}\}/);
  await expect(page.getByText("Dear Guardian, Primary 4 Gold")).toBeVisible();
  await expect(page.getByText("Sample values are shown here: each recipient gets their own.")).toBeVisible();
});

test("a tag the audience cannot have is refused on screen, says which and for whom, and the text is kept", async ({ page }) => {
  await openComposer(page);
  await audience(page).selectOption("STAFF");
  await press(page.getByRole("button", { name: "SMS", exact: true }));
  const text = "A word about {{student_name}} for the staff room.";
  await page.getByLabel("Message Content").fill(text);
  await press(page.getByRole("button", { name: "Dispatch Broadcast" }));
  await page.getByRole("button", { name: "Confirm & Send" }).click();
  await expect(
    page.getByText("These tags cannot be filled for staff: {{student_name}}. Remove them or choose another audience."),
  ).toBeVisible();
  await expect(page.getByLabel("Message Content")).toHaveValue(text);
});

test("the Quick Broadcast tool offers neither In-App nor the Students audience", async ({ page }) => {
  await openComposer(page);
  await page.getByRole("button", { name: /Open Quick Tools/i }).click();
  const drawer = page.getByRole("dialog", { name: "Quick Tools" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: "Quick Alert" }).click();
  await expect(page.getByLabel("Audience")).toBeVisible();
  const channelOptions = await page.getByLabel("Channel", { exact: true }).locator("option").allTextContents();
  expect(channelOptions).toEqual(["SMS Message", "WhatsApp", "Email"]);
  const audienceOptions = await page.getByLabel("Audience").locator("option").allTextContents();
  expect(audienceOptions).toEqual(["Guardians & Parents", "Teachers & Staff", "Entire School Community"]);
});
