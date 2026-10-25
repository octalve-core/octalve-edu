import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { Permission } from "@prisma/client";
import { test, expect } from "../support/fixtures";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  grantApprovalScope,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// The Results approval tab of the school's settings in a real browser, desktop and phone (ADR 0018, task 0020 slice 3): the sections of the school and which class is in which,
// where each approver approves, and the setting for a class with no section. Every change asks for the fresh proof, so every journey here goes through the step-up dialog.
// The server rules (who is refused what, the audit rows, the effect on the results list) are the 13 API tests of slice 2b; this file is about what a person sees and can do.
//
// School: two campuses, North and South. Classes: JSS 1 and JSS 2 (North), SSS 1 (South). Approvers: Tola (tied to North, may approve, approves nothing yet) and Wale (all campuses, General).
test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let school: TestTenant;
let admin: TestUser;
let tola: TestUser;
let wale: TestUser;
let classes: Record<"jss1" | "jss2" | "sss1", { id: string }>;

test.beforeAll(async () => {
  await seedInstance();
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Alpha School", campuses: ["North", "South"] });
  const [north, south] = school.campuses;
  admin = await createUser({ name: "Amina Yusuf" });
  await addMembership(admin.id, school.id, Role.ADMIN);
  tola = await createUser({ name: "Tola Teacher" });
  wale = await createUser({ name: "Wale Walker" });
  for (const [person, campusId] of [
    [tola, north.id],
    [wale, null],
  ] as const) {
    await db.tenantMembership.create({
      data: { userId: person.id, tenantId: school.id, role: Role.TEACHING_STAFF, campusId, permissions: [Permission.CAN_APPROVE_RESULTS] },
    });
  }
  await grantApprovalScope(wale.id, school.id);
  const group = (name: string, sortOrder: number, campusId: string) =>
    db.classGroup.create({ data: { tenantId: school.id, name, sortOrder, campusId } });
  classes = { jss1: await group("JSS 1", 1, north.id), jss2: await group("JSS 2", 2, north.id), sss1: await group("SSS 1", 3, south.id) };
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

// --- helpers ------------------------------------------------------------------------------------------------------------------------------------------------

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}\n      ${v.nodes
        .slice(0, 4)
        .map((n) => `${n.target.join(" ")} :: ${(n.failureSummary ?? "").split("\n")[1] ?? ""}`)
        .join("\n      ")}`,
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

/// Colours transition when the theme flips, and axe would sample the in-between values: wait for the running transitions first.
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/// The state on screen, in both themes, with no horizontal scroll, and on a phone every control at least 44 x 44 CSS px.
async function checkScreen(page: Page, what: string, isMobile: boolean) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await settled(page);
    await expectAccessible(page, `${what} [${theme} theme]`);
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, `horizontal overflow on ${what} [${theme} theme]`).toBeLessThanOrEqual(innerWidth);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
  await settled(page);
  if (!isMobile) return;
  const tooSmall = await page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only");
    };
    // With a dialog open, the page behind it is inert: only the dialog's own controls can be tapped.
    const scope = document.querySelector("dialog[open]") ?? document.querySelector("main") ?? document.body;
    return Array.from(scope.querySelectorAll("button, a[href]:not(p a), input:not([type=hidden]), select"))
      .filter(visible)
      .map((el) => ({
        el: `${el.tagName.toLowerCase()}[${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 24)}]`,
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      }))
      .filter((t) => t.w < 44 || t.h < 44);
  });
  expect(tooSmall, `controls smaller than 44x44 CSS px on ${what}`).toEqual([]);
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Step-up Authentication Required" });
const status = (page: Page, text: string | RegExp) => page.getByRole("status").filter({ hasText: text });
const card = (page: Page, heading: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name: heading }) });

async function openApprovalTab(page: Page) {
  await signInThroughUi(page, admin);
  await page.goto(`/schools/${school.code}/settings`);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Results approval" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Sections" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Approvers" })).toBeVisible();
}

/// Types the password in the step-up dialog and confirms; the dialog is gone when this returns.
async function confirm(page: Page, password = admin.password) {
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Account Password", { exact: true }).fill(password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page)).toBeHidden();
}

// --- tests --------------------------------------------------------------------------------------------------------------------------------------------------

test("a new school: nothing is set up, and the screen says what each part is for", async ({ page, isMobile }) => {
  test.slow();
  await openApprovalTab(page);
  await expect(page.getByText("0 sections, 3 classes in no section, 2 people who may approve results.")).toBeVisible();
  await expect(page.getByText("There are no sections yet. Add the first one above, then put classes in it.")).toBeVisible();
  const list = page.getByRole("heading", { level: 3, name: "Classes in no section" });
  await expect(list).toBeVisible();
  await expect(card(page, "Tola Teacher")).toContainText("Approves nothing yet");
  await expect(card(page, "Tola Teacher")).toContainText("North"); // tied to a campus
  await expect(card(page, "Wale Walker")).toContainText("Everything");
  await expect(card(page, "Wale Walker")).toContainText("All campuses");
  // a class on South has no section to go in yet, and says so
  await expect(page.getByText("No section on this campus to put it in.").first()).toBeVisible();
  await checkScreen(page, "Results approval, a new school", isMobile);
});

test("the journey: add a section, put classes in it, give an approver the section, then one class, then take it back; leaving and coming back shows the same", async ({
  page,
  isMobile,
}) => {
  test.slow();
  await openApprovalTab(page);
  const [north] = school.campuses;

  // add a section on North
  await page.getByLabel("New section").fill("Junior");
  await page.getByLabel("Campus", { exact: true }).selectOption({ label: "North" });
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(dialog(page)).toContainText("New section");
  await expect(dialog(page)).toContainText("Junior (North)");
  await checkScreen(page, "the step-up dialog for a new section", isMobile);
  await confirm(page);
  await expect(status(page, "Added the section Junior.")).toBeVisible();
  await expect(page.getByText("1 section, 3 classes in no section")).toBeVisible();
  const junior = await db.section.findFirstOrThrow({ where: { tenantId: school.id, name: "Junior" } });
  expect(junior.campusId).toBe(north.id);
  await expect(page.getByLabel("New section")).toHaveValue(""); // the form starts empty again after a success

  // put JSS 1 and JSS 2 in it (the choice alone sends nothing: the button does)
  await page.getByLabel("Section for JSS 1").selectOption({ label: "Junior" });
  await expect(dialog(page)).toBeHidden();
  await page.getByRole("button", { name: "Place JSS 1" }).click();
  await confirm(page);
  await expect(status(page, "Put JSS 1 in Junior.")).toBeVisible();
  await page.getByLabel("Section for JSS 2").selectOption({ label: "Junior" });
  await page.getByRole("button", { name: "Place JSS 2" }).click();
  await confirm(page);
  await expect(status(page, "Put JSS 2 in Junior.")).toBeVisible();
  await expect(card(page, "Junior")).toContainText("JSS 1");
  await expect(card(page, "Junior")).toContainText("JSS 2");
  await expect(page.getByText("1 section, 1 class in no section")).toBeVisible(); // SSS 1 on South is still in none
  expect(await db.classGroup.count({ where: { tenantId: school.id, sectionId: junior.id } })).toBe(2);
  await checkScreen(page, "Results approval with a section and its classes", isMobile);

  // Tola is tied to North: the editor offers North's section and classes and not South's
  const tolaCard = card(page, "Tola Teacher");
  await tolaCard.getByRole("button", { name: "Change where Tola Teacher approves" }).click();
  const editor = tolaCard.getByRole("checkbox");
  await expect(tolaCard.getByRole("checkbox", { name: "Junior" })).toBeVisible();
  await expect(tolaCard.getByRole("checkbox", { name: "JSS 1" })).toBeVisible();
  await expect(tolaCard.getByRole("checkbox", { name: "SSS 1" })).toHaveCount(0);
  await expect(tolaCard.getByRole("button", { name: "Review & save" })).toBeDisabled(); // nothing changed yet
  // Everything takes the other boxes away; taking it off leaves them empty
  await tolaCard.getByRole("checkbox", { name: "Everything (General)" }).check();
  await expect(tolaCard.getByRole("checkbox", { name: "Junior" })).toBeDisabled();
  await expect(tolaCard.getByRole("checkbox", { name: "JSS 1" })).toBeDisabled();
  await tolaCard.getByRole("checkbox", { name: "Everything (General)" }).uncheck();
  await expect(tolaCard.getByRole("checkbox", { name: "Junior" })).toBeEnabled();
  await expect(tolaCard.getByRole("checkbox", { name: "Junior" })).not.toBeChecked();
  expect(await editor.count()).toBeGreaterThan(3);
  await checkScreen(page, "the scope editor, open", isMobile);
  await tolaCard.getByRole("checkbox", { name: "Junior" }).check();
  await tolaCard.getByRole("button", { name: "Review & save" }).click();
  await expect(dialog(page)).toContainText("Where Tola Teacher approves");
  await expect(dialog(page)).toContainText("Nothing");
  await expect(dialog(page)).toContainText("Section: Junior");
  await confirm(page);
  await expect(status(page, "Saved where Tola Teacher approves: Section: Junior.")).toBeVisible();
  await expect(tolaCard).toContainText("Section: Junior");
  await expect(tolaCard).not.toContainText("Approves nothing yet");
  expect(
    (await db.resultApprovalScope.findMany({ where: { tenantId: school.id, userId: tola.id } })).map(
      (row) => `${row.kind}:${row.sectionId ?? row.classGroupId}`,
    ),
  ).toEqual([`SECTION:${junior.id}`]);

  // from the whole section to one class
  await tolaCard.getByRole("button", { name: "Change where Tola Teacher approves" }).click();
  await tolaCard.getByRole("checkbox", { name: "Junior" }).uncheck();
  await tolaCard.getByRole("checkbox", { name: "JSS 2" }).check();
  await tolaCard.getByRole("button", { name: "Review & save" }).click();
  await confirm(page);
  await expect(tolaCard).toContainText("Class: JSS 2");
  await expect(tolaCard).not.toContainText("Section: Junior");

  // archive the section: it stays, marked, with Restore only; the person's class scope is not touched
  await page.getByRole("button", { name: "Archive Junior" }).click();
  await expect(dialog(page)).toContainText("Archive section");
  await confirm(page);
  await expect(status(page, "Archived the section Junior.")).toBeVisible();
  const archivedCard = card(page, "Junior");
  await expect(archivedCard).toContainText("Archived");
  await expect(archivedCard.getByRole("button", { name: "Restore Junior" })).toBeVisible();
  await expect(archivedCard.getByRole("button", { name: "Rename Junior" })).toHaveCount(0);
  await expect(tolaCard).toContainText("Class: JSS 2");
  await checkScreen(page, "Results approval with an archived section", isMobile);
  await archivedCard.getByRole("button", { name: "Restore Junior" }).click();
  await confirm(page);
  await expect(status(page, "Restored the section Junior.")).toBeVisible();

  // leaving proves it persisted: the settings page again, by a fresh load
  await page.goto(`/schools/${school.code}/settings`);
  await page.getByRole("button", { name: "Results approval" }).click();
  await expect(card(page, "Junior")).toContainText("JSS 1");
  await expect(card(page, "Tola Teacher")).toContainText("Class: JSS 2");
});

test("a refusal is shown in the dialog in the server's words, and nothing is half done", async ({ page, isMobile }) => {
  test.slow();
  const [north] = school.campuses;
  await db.section.create({ data: { tenantId: school.id, name: "Junior", campusId: north.id } });
  await openApprovalTab(page);
  await expect(page.getByText("1 section, 3 classes in no section")).toBeVisible();

  // a name that is taken on that campus (the comparison ignores case)
  await page.getByLabel("New section").fill("JUNIOR");
  await page.getByLabel("Campus", { exact: true }).selectOption({ label: "North" });
  await page.getByRole("button", { name: "Add section" }).click();
  await dialog(page).getByLabel("Account Password", { exact: true }).fill(admin.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page).getByRole("alert")).toContainText("Another section on that campus already has that name.");
  await expect(dialog(page)).toBeVisible();
  await checkScreen(page, "the step-up dialog showing a refusal", isMobile);

  // a wrong password is refused too, and the dialog stays for another try
  await dialog(page).getByLabel("Account Password", { exact: true }).fill("not-the-password-1");
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page).getByRole("alert")).toBeVisible();
  await expect(dialog(page)).toBeVisible();

  // cancelling leaves the form as it was, so the name can be corrected
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByLabel("New section")).toHaveValue("JUNIOR");
  expect(await db.section.count({ where: { tenantId: school.id } })).toBe(1);

  // the password typed for the refused attempt is not kept: the dialog opens empty the next time
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel("Account Password", { exact: true })).toHaveValue("");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(dialog(page)).toBeHidden();

  // an empty name is stopped on the screen, before any proof is asked for
  await page.getByLabel("New section").fill("   ");
  await page.getByRole("button", { name: "Add section" }).click();
  await expect(page.getByText("Give the section a name.")).toBeVisible();
  await expect(dialog(page)).toBeHidden();
});

test("a section can be renamed and a class taken out of it, each with its own proof", async ({ page }) => {
  test.slow();
  const [north] = school.campuses;
  const junior = await db.section.create({ data: { tenantId: school.id, name: "Junior", campusId: north.id } });
  await db.classGroup.update({ where: { id: classes.jss1.id }, data: { sectionId: junior.id } });
  await openApprovalTab(page);

  await page.getByRole("button", { name: "Rename Junior" }).click();
  await page.getByLabel("New name for Junior").fill("Junior Secondary");
  await page.getByRole("button", { name: "Save name" }).click();
  await confirm(page);
  await expect(status(page, "Renamed the section Junior to Junior Secondary.")).toBeVisible();
  await expect(card(page, "Junior Secondary")).toContainText("JSS 1");

  // out of the section: the "No section" choice, then the button
  await page.getByLabel("Section for JSS 1").selectOption({ label: "No section" });
  await page.getByRole("button", { name: "Move JSS 1" }).click();
  await confirm(page);
  await expect(status(page, "Took JSS 1 out of Junior Secondary.")).toBeVisible();
  await expect(card(page, "Junior Secondary")).toContainText("No classes in this section yet.");
  expect((await db.classGroup.findUniqueOrThrow({ where: { id: classes.jss1.id } })).sectionId).toBeNull();
  expect((await db.section.findUniqueOrThrow({ where: { id: junior.id } })).name).toBe("Junior Secondary");
});

test("a school with no approvers points to where the permission is given; a failed load can be tried again", async ({ page, isMobile }) => {
  test.slow();
  await db.tenantMembership.updateMany({ where: { tenantId: school.id, userId: { in: [tola.id, wale.id] } }, data: { permissions: [] } });
  await signInThroughUi(page, admin);

  // the sections cannot be read: a sentence and a way to try again, then it works
  await page.route(`**/api/v1/schools/${school.code}/settings/sections`, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "INTERNAL", message: "Something went wrong on our side." } }),
    }),
  );
  await page.goto(`/schools/${school.code}/settings`);
  await page.getByRole("button", { name: "Results approval" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Something went wrong on our side." })).toBeVisible();
  await checkScreen(page, "Results approval, the sections could not be read", isMobile);
  await page.unroute(`**/api/v1/schools/${school.code}/settings/sections`);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Approvers" })).toBeVisible();

  await expect(page.getByText("Nobody may approve results yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Users page" })).toHaveAttribute("href", `/schools/${school.code}/users`);
  await checkScreen(page, "Results approval, nobody may approve", isMobile);
});

test("the setting for a class with no section: chosen in Configuration, carries the security warning, and is saved with the proof", async ({
  page,
  isMobile,
}) => {
  test.slow();
  await signInThroughUi(page, admin);
  await page.goto(`/schools/${school.code}/settings`);
  const select = page.getByLabel("Results of a class with no section");
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("GENERAL_OR_CLASS_ONLY"); // the safe default
  await select.selectOption("ANY_SECTION_APPROVER");
  await expect(page.getByText("1 unsaved change")).toBeVisible();
  await checkScreen(page, "Configuration with the new setting staged", isMobile); // the five on/off switches included (ISS-0033)
  await page.getByRole("button", { name: "Review & Save Changes" }).click();
  await expect(dialog(page)).toContainText("unsectionedClassApproval");
  await expect(dialog(page)).toContainText("Security Controls Modification Warning"); // it lets more people approve
  await checkScreen(page, "the step-up dialog with the security warning", isMobile);
  await confirm(page);
  await expect(page.getByText("School configuration updated successfully")).toBeVisible();
  const settings = await db.schoolSettings.findUniqueOrThrow({ where: { tenantId: school.id } });
  expect(settings.unsectionedClassApproval).toBe("ANY_SECTION_APPROVER");
  await page.reload();
  await expect(page.getByLabel("Results of a class with no section")).toHaveValue("ANY_SECTION_APPROVER");
});
