import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

// The question bank's administration screen in a real browser, desktop and phone (task 0024 slice B): choosing reviewers and the switches. Every change goes through the step-up
// dialog. The server rules (who is refused what, the audit rows, the narrowing) are the API spec's; this file is about what a person sees and can do, with axe (WCAG 2.2 A/AA) and
// a horizontal-overflow check on every state in BOTH themes, and on a phone every control at least 44 x 44 CSS px.
//
// School: two campuses, North and South. People: its administrator, a campus administrator for North, a teacher on North (Tola), a teacher for the whole school (Wale), a pupil.
test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

let school: TestTenant;
let admin: TestUser;
let campusAdmin: TestUser;
let tola: TestUser;
let wale: TestUser;
let pupil: TestUser;

test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Bank School", campuses: ["North", "South"] });
  const [north] = school.campuses;
  admin = await createUser({ name: "Amina Yusuf" });
  campusAdmin = await createUser({ name: "Chidi Campus" });
  tola = await createUser({ name: "Tola Teacher" });
  wale = await createUser({ name: "Wale Walker" });
  pupil = await createUser({ name: "Pat Pupil" });
  await addMembership(admin.id, school.id, Role.ADMIN);
  await addMembership(campusAdmin.id, school.id, Role.CAMPUS_ADMIN, north.id);
  await addMembership(tola.id, school.id, Role.TEACHING_STAFF, north.id);
  await addMembership(wale.id, school.id, Role.TEACHING_STAFF);
  await addMembership(pupil.id, school.id, Role.STUDENT, north.id);
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

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
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}
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
const optionFor = (p: { name: string; email: string }) => `${p.name} (${p.email})`;

async function open(page: Page, who: TestUser) {
  await signInThroughUi(page, who);
  await page.goto(`/schools/${school.code}/question-bank`);
  await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
  await page.getByRole("tab", { name: "Reviewers" }).click(); // Browse comes first
}
/// Types the password in the step-up dialog and confirms; the dialog is gone when this returns.
async function confirm(page: Page, who: TestUser) {
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByLabel("Account Password", { exact: true }).fill(who.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page)).toBeHidden();
}

test("who sees the page: the school's administrator and a campus administrator find it in the navigation; a teacher finds it with the staff tabs only; a pupil is told no", async ({
  page,
  browser,
  isMobile,
}) => {
  await signInThroughUi(page, admin);
  if (isMobile) {
    const more = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "More" });
    const sheet = page.getByRole("dialog");
    // the first tap can land before the page has hydrated: tap again until the sheet is open
    await expect(async () => {
      await more.click();
      await expect(sheet).toBeVisible({ timeout: 2000 });
    }).toPass();
    await sheet.getByRole("link", { name: "Question bank" }).click();
  } else {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Question bank" }).click();
  }
  await expect(page).toHaveURL(new RegExp(`/schools/${school.code}/question-bank$`));
  await expect(page.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();

  // a teacher finds the page too, with the staff tabs and none of the administrators'; a pupil is told no
  const teacherContext = await browser.newContext({ baseURL: SAAS_URL });
  const teacherPage = await teacherContext.newPage();
  await signInThroughUi(teacherPage, tola);
  await teacherPage.goto(`/schools/${school.code}/question-bank`);
  await expect(teacherPage.getByRole("heading", { level: 1, name: "Question bank" })).toBeVisible();
  await expect(teacherPage.getByRole("tab", { name: "Browse" })).toBeVisible();
  await expect(teacherPage.getByRole("tab", { name: "My questions" })).toBeVisible();
  for (const name of ["Review queue", "Reviewers", "Settings"]) await expect(teacherPage.getByRole("tab", { name })).toHaveCount(0);
  await teacherContext.close();

  const pupilContext = await browser.newContext({ baseURL: SAAS_URL });
  const pupilPage = await pupilContext.newPage();
  await signInThroughUi(pupilPage, pupil);
  await pupilPage.goto(`/schools/${school.code}/question-bank`);
  await expect(pupilPage.getByRole("heading", { level: 1, name: "Question bank" }), "a pupil").toHaveCount(0);
  await expect(pupilPage.getByRole("tab"), "a pupil").toHaveCount(0);
  await pupilContext.close();
});

test("reviewers: add one through the step-up dialog, see them listed, remove them; a wrong password is told in the dialog and nothing is added", async ({
  page,
  isMobile,
}) => {
  test.slow();
  await open(page, admin);
  await expect(page.getByText("No reviewers yet.")).toBeVisible();
  await checkScreen(page, "reviewers, none yet", isMobile);

  // a pupil is never offered; a teacher is
  const person = page.getByLabel("Person");
  await expect(person.locator("option", { hasText: pupil.name })).toHaveCount(0);
  await expect(person.locator("option", { hasText: tola.name })).toHaveCount(1);

  // nothing chosen: told what is missing, and the dialog does not open
  await page.getByRole("button", { name: "Add reviewer" }).click();
  await expect(page.getByText("Choose a person.")).toBeVisible();
  await expect(dialog(page)).toBeHidden();

  await person.selectOption({ label: optionFor(tola) });
  await page.getByLabel("Covers").selectOption("SUBJECT");
  await page.getByRole("button", { name: "Add reviewer" }).click();
  await expect(page.getByText("Type the subject they review.")).toBeVisible();
  await page.getByLabel("Subject", { exact: true }).fill("Mathematics");
  await page.getByLabel(/Exam approver/).check();
  await page.getByRole("button", { name: "Add reviewer" }).click();
  await expect(dialog(page)).toContainText("Question bank reviewer");
  await expect(dialog(page)).toContainText("Mathematics");
  await checkScreen(page, "the step-up dialog for a new reviewer", isMobile);

  // a wrong password is refused in the dialog and nothing is written
  await dialog(page).getByLabel("Account Password", { exact: true }).fill("not-the-password-1");
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page)).toContainText("Incorrect password");
  expect(await db.questionBankReviewer.count({ where: { tenantId: school.id } })).toBe(0);

  await dialog(page).getByLabel("Account Password", { exact: true }).fill(admin.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page)).toBeHidden();
  await expect(page.getByText(`${tola.name} can now review Mathematics.`)).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: tola.name });
  await expect(row).toContainText("Reviews Mathematics · Exam approver · Every campus");
  await checkScreen(page, "reviewers, one reviewer", isMobile);
  expect(await db.questionBankAudit.count({ where: { tenantId: school.id, entity: "REVIEWER", action: "ASSIGNED" } })).toBe(1);

  // the same person and subject again: the server says so, in the dialog
  await person.selectOption({ label: optionFor(tola) });
  await page.getByLabel("Covers").selectOption("SUBJECT");
  await page.getByLabel("Subject", { exact: true }).fill("mathematics");
  await page.getByRole("button", { name: "Add reviewer" }).click();
  await dialog(page).getByLabel("Account Password", { exact: true }).fill(admin.password);
  await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
  await expect(dialog(page)).toContainText("already a reviewer");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: tola.name })).toHaveCount(1);

  // remove
  await page.getByRole("button", { name: `Remove ${tola.name}` }).click();
  await expect(dialog(page)).toContainText("removed");
  await confirm(page, admin);
  await expect(page.getByText(`${tola.name} is no longer a reviewer here.`)).toBeVisible();
  await expect(page.getByText("No reviewers yet.")).toBeVisible();
  expect(await db.questionBankAudit.count({ where: { tenantId: school.id, entity: "REVIEWER" } })).toBe(2);
});

test("a campus administrator sees their own campus's reviewers and the school-wide ones, and can remove only their own campus's", async ({
  page,
}) => {
  const [north] = school.campuses;
  const adminId = admin.id;
  await db.questionBankReviewer.createMany({
    data: [
      { tenantId: school.id, userId: wale.id, campusId: null, scope: "GENERAL", assignedById: adminId },
      { tenantId: school.id, userId: tola.id, campusId: north.id, scope: "GENERAL", assignedById: adminId },
    ],
  });
  await open(page, campusAdmin);
  await expect(page.getByLabel("Reviewers for")).toHaveCount(0); // nothing to choose: one campus
  const walesRow = page.getByRole("listitem").filter({ hasText: wale.name });
  const tolasRow = page.getByRole("listitem").filter({ hasText: tola.name });
  await expect(walesRow).toContainText("Every campus");
  await expect(walesRow).toContainText("Set for every campus");
  await expect(page.getByRole("button", { name: `Remove ${wale.name}` })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Remove ${tola.name}` })).toBeVisible();
  await expect(tolasRow).toContainText("This campus");
});

test("settings: the school's administrator changes two values together through the step-up dialog; a campus narrows one and then goes back to the school's value", async ({
  page,
  isMobile,
}) => {
  test.slow();
  await open(page, admin);
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByText("The school's values apply to every campus.")).toBeVisible();
  await expect(page.getByRole("button", { name: "No changes to save" })).toBeDisabled();
  await checkScreen(page, "settings, the school's values", isMobile);

  await page.getByLabel("What a parent can see of the question bank").selectOption("SUMMARY");
  await page.getByLabel("Images per question").selectOption("4");
  await page.getByLabel("Reason (optional)").fill("Pupils learn from diagrams");
  await page.getByRole("button", { name: /^Review \d+ changes?$/ }).click();
  await expect(dialog(page)).toContainText("What a parent can see of the question bank");
  await expect(dialog(page)).toContainText("Security Controls Modification Warning"); // showing a parent more is a widening
  await checkScreen(page, "the step-up dialog for settings", isMobile);
  await confirm(page, admin);
  await expect(page.getByText(/^Saved \d+ settings?\.$/)).toBeVisible();
  const row = await db.questionBankSetting.findFirstOrThrow({ where: { tenantId: school.id, key: "bank.parents.view" } });
  expect(row.value).toBe("SUMMARY");
  expect(
    (await db.questionBankAudit.findMany({ where: { tenantId: school.id, entity: "SETTING", ref: "bank.parents.view" } }))[0].reason,
  ).toBe("Pupils learn from diagrams");

  // the campus: narrow it to NONE, then go back to the school's value
  await page.getByLabel("Settings for").selectOption({ label: "North" });
  await expect(page.getByText("Values for North.")).toBeVisible();
  await page.getByLabel("What a parent can see of the question bank").selectOption("NONE");
  await page.getByRole("button", { name: /^Review \d+ changes?$/ }).click();
  await confirm(page, admin);
  await expect(page.getByText(/^Saved 1 setting\.$/)).toBeVisible();
  await expect(page.getByText("North: Nothing").first()).toBeVisible();
  await checkScreen(page, "settings, a campus's own value", isMobile);
  await page.getByRole("button", { name: "Use the school's value for What a parent can see of the question bank" }).click();
  await page.getByRole("button", { name: /^Review \d+ changes?$/ }).click();
  await confirm(page, admin);
  await expect(page.getByText("North: not set").first()).toBeVisible();
  expect(await db.questionBankSetting.count({ where: { tenantId: school.id, campusId: { not: null } } })).toBe(0);
});
