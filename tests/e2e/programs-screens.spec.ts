import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { signInThroughUi } from "./helpers";

// The Programs screens (task 0027, slice P1) in a real browser: the school's administrator makes a program, builds its level names and groups, names a program admin and reads the history;
// a program admin changes it; a campus administrator only reads it; the school switches programs off. The APIs are tested in tests/api; this is the screen: what is offered to whom, what is
// said when the person gets it wrong, and the API's refusal shown as a sentence. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes, on desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(
    results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
    `accessibility violations on ${what}`,
  ).toEqual([]);
}
async function expectNoHorizontalScroll(page: Page, what: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `horizontal overflow on ${what}`).toBeLessThanOrEqual(innerWidth);
}
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await page.evaluate(() => document.documentElement.dataset.theme ?? "dark");
  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => void (document.documentElement.dataset.theme = t), theme);
    await page.waitForLoadState("networkidle");
    // the theme fades for 150 ms: a scan taken inside it measures a colour between the two themes
    await page.waitForTimeout(250);
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
  }
  await page.evaluate((t) => void (document.documentElement.dataset.theme = t), initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
const PROGRAMS = () => `/schools/${school.code}/programs`;

/// One school with a campus: its administrator, the campus's administrator and a teacher of that campus.
async function world() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const campusAdmin = await member(school, Role.CAMPUS_ADMIN, north.id, `${tag} Campus`);
  const teacher = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Teacher`);
  return { north, admin, campusAdmin, teacher };
}
type World = Awaited<ReturnType<typeof world>>;

async function signInTo(page: Page, who: Person, path: string) {
  await signInThroughUi(page, who.user);
  await page.goto(path);
}

/// The administrator makes "Quran memorisation" through the dialog and lands on its page.
async function makeProgram(page: Page, w: World, name: string) {
  await signInTo(page, w.admin, PROGRAMS());
  await expect(page.getByRole("heading", { level: 1, name: "Programs" })).toBeVisible();
  await expect(page.getByText("No program has been made yet.")).toBeVisible();
  await page.getByRole("button", { name: "New program" }).click();
  await dialog(page).getByRole("button", { name: "Make the program" }).click();
  await expect(dialog(page).getByText("Give the program a name.")).toBeVisible();
  await dialog(page).getByLabel("Name", { exact: true }).fill(name);
  await dialog(page).getByLabel("Level 1").fill("Section");
  await dialog(page).getByLabel("Level 2 (optional)").fill("Class");
  await dialog(page).getByLabel("North").check();
  await dialog(page).getByRole("button", { name: "Make the program" }).click();
  await expect(page).toHaveURL(new RegExp(`${PROGRAMS()}/[a-z0-9]+$`));
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

test.describe("Programs", () => {
  test("the administrator makes a program, builds its structure, names a program admin and reads the history; both themes", async ({
    page,
  }) => {
    const w = await world();
    const name = `${tag} Quran memorisation`;
    await makeProgram(page, w, name);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("North");
    await checkBothThemes(page, "a new program (overview)");

    // structure: level names, then groups, one inside another
    await page.getByRole("tab", { name: "Structure" }).click();
    await page.getByRole("button", { name: "Add a section" }).click();
    await dialog(page).getByLabel("Name").fill("Juz Amma");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Juz Amma was added.")).toBeVisible();
    await page.getByRole("button", { name: "Add a group inside Juz Amma" }).click();
    await dialog(page).getByLabel("Name").fill("Group 1");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("list").getByText("Group 1")).toBeVisible();
    // the same name again is refused in words
    await page.getByRole("button", { name: "Add a section" }).click();
    await dialog(page).getByLabel("Name").fill("  juz   amma ");
    await dialog(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog(page).getByText("There is already a group with this name here.")).toBeVisible();
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Rename Juz Amma", exact: true }).click();
    await dialog(page).getByLabel("Name").fill("Juz 30");
    await dialog(page).getByRole("button", { name: "Rename", exact: true }).click();
    await expect(page.getByText("The group is renamed.")).toBeVisible();
    // a level cannot be taken away while a group sits at it
    // the page reloads after the rename and can reset the form under the typing: try again until the refusal is shown
    await expect(async () => {
      await page.getByLabel("Level 2 (optional)").fill("");
      await page.getByRole("button", { name: "Save the level names" }).click();
      await expect(page.getByText(/Groups already exist at level 2/)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
    await checkBothThemes(page, "the structure of a program");
    await page.getByRole("button", { name: "Archive Juz 30–Group 1" }).click();
    await expect(page.getByText("Group 1 is archived.")).toBeVisible();
    await page.getByText("Archived groups (1)").click();
    await expect(page.getByRole("button", { name: "Restore Juz 30–Group 1" })).toBeVisible();

    // a program admin
    await page.getByRole("tab", { name: "Admins" }).click();
    await expect(page.getByText("Nobody has been named")).toBeVisible();
    await page.getByLabel("Name a program admin").selectOption({ label: `${tag} Teacher (North)` });
    await page.getByRole("button", { name: "Name", exact: true }).click();
    await expect(page.getByText("The program admin is named.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Program admins" })).toContainText(`${tag} Teacher`);
    await checkBothThemes(page, "the admins of a program");

    await page.getByRole("tab", { name: "History" }).click();
    const history = page.getByRole("list", { name: /History/ });
    for (const text of ["Program made", "Group added", "Group renamed", "Group archived", "Program admin named"])
      await expect(history).toContainText(text);
    await checkBothThemes(page, "the history of a program");

    // activate, then the list shows it
    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("button", { name: "Activate" }).click();
    await expect(page.getByText("The program is active.")).toBeVisible();
    await page.goto(PROGRAMS());
    await expect(page.getByRole("list", { name: "Programs" })).toContainText(name);
    await expect(page.getByRole("list", { name: "Programs" })).toContainText("Active");
    await checkBothThemes(page, "the list of programs");
  });

  test("a program admin changes the program, a campus administrator only reads it, and a teacher with no place sees nothing", async ({
    page,
    browser,
  }) => {
    const w = await world();
    const name = `${tag} Tajweed`;
    await makeProgram(page, w, name);
    const url = page.url();
    await page.getByRole("tab", { name: "Admins" }).click();
    await page.getByLabel("Name a program admin").selectOption({ label: `${tag} Teacher (North)` });
    await page.getByRole("button", { name: "Name", exact: true }).click();
    await expect(page.getByText("The program admin is named.")).toBeVisible();

    const teacherPage = await (await browser.newContext({ baseURL: SAAS_URL })).newPage();
    await signInTo(teacherPage, w.teacher, url.replace(SAAS_URL, ""));
    await expect(teacherPage.getByRole("heading", { level: 2, name })).toBeVisible();
    await teacherPage.getByRole("button", { name: "Edit details" }).click();
    await dialog(teacherPage).getByLabel("Description").fill("Changed by the program admin");
    await dialog(teacherPage).getByRole("button", { name: "Save" }).click();
    await expect(teacherPage.getByText("The details are saved.")).toBeVisible();
    await expect(teacherPage.getByRole("button", { name: "Archive" })).toBeVisible();
    await teacherPage.getByRole("tab", { name: "Admins" }).click();
    await expect(teacherPage.getByLabel("Name a program admin")).toHaveCount(0); // the school's administrator names
    await teacherPage.context().close();

    const campusPage = await (await browser.newContext({ baseURL: SAAS_URL })).newPage();
    await signInTo(campusPage, w.campusAdmin, url.replace(SAAS_URL, ""));
    await expect(campusPage.getByRole("heading", { level: 2, name })).toBeVisible();
    await expect(campusPage.getByRole("button", { name: "Edit details" })).toHaveCount(0);
    await expect(campusPage.getByRole("button", { name: "Activate" })).toHaveCount(0);
    await campusPage.getByRole("tab", { name: "History" }).click();
    await expect(campusPage.getByText("The history is shown to the people who manage the program.")).toBeVisible();
    await campusPage.context().close();
  });

  test("a staff member with no place in a program is told so; with programs switched off, nothing can be made", async ({
    page,
    browser,
  }) => {
    const w = await world();
    const teacherPage = await (await browser.newContext({ baseURL: SAAS_URL })).newPage();
    await signInTo(teacherPage, w.teacher, PROGRAMS());
    await expect(teacherPage.getByText("You have no place in a program.")).toBeVisible();
    await expect(teacherPage.getByRole("button", { name: "New program" })).toHaveCount(0);
    await teacherPage.context().close();

    await signInTo(page, w.admin, `/schools/${school.code}/settings`);
    await expect(page.getByRole("heading", { level: 2, name: "Programs", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Turn programs off for the school" }).click();
    await dialog(page).getByLabel("Account Password").fill(w.admin.user.password);
    await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
    await expect(page.getByText("The school's setting is saved.")).toBeVisible();
    await page.goto(PROGRAMS());
    await expect(page.getByText(/Programs are switched off for the school/)).toBeVisible();
    await expect(page.getByRole("button", { name: "New program" })).toHaveCount(0);
    await checkBothThemes(page, "programs switched off");
  });
});
