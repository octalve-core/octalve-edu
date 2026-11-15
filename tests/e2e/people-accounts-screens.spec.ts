import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi, signOut } from "./helpers";

// A pupil's and a guardian's sign-in account on the pupil's page (task 0065), in a real browser: the school's administrator links each by clicking and unlinks one; a member of staff sees the state
// and no button; and the point of it: a guardian and a pupil who sign in find nothing before the link and their own things after it. Every rule is tested in tests/api/people-accounts.spec.ts.
// Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, on a desktop and on a phone.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  await expect(page).toHaveTitle(/\S/);
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
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
  tag = `L${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with a pupil (Ada), her mother (Grace, the primary contact) and an uncle, an administrator, a teacher, and two people who can sign in and are nobody's yet: one as a student, one as a parent.
async function arrange() {
  school = await createTenant({ name: `${tag} School`, campuses: [] });
  const ada = await db.studentRecord.create({
    data: {
      tenantId: school.id,
      firstName: `${tag}Ada`,
      lastName: "Pupil",
      dateOfBirth: new Date("2014-03-02"),
      admissionNo: `${tag}/001`,
    },
  });
  const grace = await db.guardianRecord.create({ data: { tenantId: school.id, firstName: `${tag}Grace`, lastName: "Mother" } });
  const uncle = await db.guardianRecord.create({ data: { tenantId: school.id, firstName: `${tag}Obi`, lastName: "Uncle" } });
  await db.guardianLink.create({
    data: { tenantId: school.id, studentId: ada.id, guardianId: grace.id, relationship: "MOTHER", isPrimary: true },
  });
  await db.guardianLink.create({ data: { tenantId: school.id, studentId: ada.id, guardianId: uncle.id, relationship: "OTHER" } });
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const teacher = await member(school, Role.TEACHING_STAFF, null, `${tag} Teacher`);
  const pupilAccount = await member(school, Role.STUDENT, null, `${tag} Ada Online`);
  const parentAccount = await member(school, Role.PARENT, null, `${tag} Grace Online`);
  return {
    ada,
    grace,
    uncle,
    admin,
    teacher,
    pupilAccount,
    parentAccount,
    adaName: `${tag}Ada Pupil`,
    graceName: `${tag}Grace Mother`,
    uncleName: `${tag}Obi Uncle`,
  };
}

const signIn = (page: Page) => page.getByRole("region", { name: "Sign-in" });
const guardianRow = (page: Page, name: string) =>
  page.getByRole("region", { name: "Guardians" }).getByRole("listitem").filter({ hasText: name });

test("the administrator links the pupil's account and the guardian's by clicking, is told when nobody is left to link, and unlinks", async ({
  page,
}) => {
  const { ada, grace, admin, pupilAccount, parentAccount, adaName, graceName, uncleName } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/people/students/${ada.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Sign-in" })).toBeVisible();
  await expect(signIn(page)).toContainText(`No sign-in yet, so there is nothing for ${adaName} in the pupil's portal.`);
  await expect(guardianRow(page, graceName)).toContainText("No sign-in yet");
  await checkBothThemes(page, "the pupil's page, nobody linked");

  // The pupil.
  await page.getByRole("button", { name: `Link ${adaName} to an account` }).click();
  const linkPupil = page.getByRole("dialog", { name: `Link ${adaName} to an account` });
  await expect(linkPupil).toContainText("signs in as a student");
  // The choices are the people who sign in as a student: the parent's account is not one of them.
  await expect(linkPupil.getByLabel("Account").getByRole("option", { name: new RegExp(`${tag} Ada Online`) })).toHaveCount(1);
  await expect(linkPupil.getByLabel("Account").getByRole("option", { name: new RegExp(`${tag} Grace Online`) })).toHaveCount(0);
  await linkPupil.getByRole("button", { name: "Link account" }).click();
  await expect(linkPupil.getByText("Choose who this is.")).toBeVisible(); // nothing chosen: said beside the field, nothing sent
  await checkBothThemes(page, "the link dialog with its error");
  await linkPupil.getByLabel("Account").selectOption({ label: `${tag} Ada Online · ${pupilAccount.user.email}` });
  await linkPupil.getByRole("button", { name: "Link account" }).click();
  await expect(page.getByText("Account linked.")).toBeVisible();
  await expect(signIn(page)).toContainText(`Signs in as ${tag} Ada Online (${pupilAccount.user.email}) · Student`);
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: ada.id } })).userId).toBe(pupilAccount.user.id);

  // The guardian, on her own row.
  await page.getByRole("button", { name: `Link ${graceName} to an account` }).click();
  const linkGuardian = page.getByRole("dialog", { name: `Link ${graceName} to an account` });
  await expect(linkGuardian).toContainText("signs in as a parent");
  await linkGuardian.getByLabel("Account").selectOption({ label: `${tag} Grace Online · ${parentAccount.user.email}` });
  await linkGuardian.getByRole("button", { name: "Link account" }).click();
  await expect(page.getByText("Account linked.")).toBeVisible();
  await expect(guardianRow(page, graceName)).toContainText(`Signs in as ${tag} Grace Online (${parentAccount.user.email})`);
  expect((await db.guardianRecord.findUniqueOrThrow({ where: { id: grace.id } })).userId).toBe(parentAccount.user.id);
  await checkBothThemes(page, "the pupil's page, both linked");

  // Nobody is left who signs in as a parent: the dialog says so and says what to do, and offers nothing to send.
  await page.getByRole("button", { name: `Link ${uncleName} to an account` }).click();
  const nobody = page.getByRole("dialog", { name: `Link ${uncleName} to an account` });
  await expect(nobody.getByText("Nobody is waiting to be linked. Invite them on the Users page as a parent first.")).toBeVisible();
  await expect(nobody.getByLabel("Account")).toBeDisabled();
  await nobody.getByRole("button", { name: "Cancel" }).click();

  // Unlink the pupil: asked first, then the page says "No sign-in yet" again.
  await page.getByRole("button", { name: `Unlink ${adaName}'s account` }).click();
  const unlink = page.getByRole("dialog", { name: `Unlink ${adaName}'s account?` });
  await expect(unlink).toContainText("the pupil will find nothing in the portal until they are linked again");
  await unlink.getByRole("button", { name: "Unlink account" }).click();
  await expect(page.getByText("Account unlinked.")).toBeVisible();
  await expect(signIn(page)).toContainText("No sign-in yet");
  expect((await db.studentRecord.findUniqueOrThrow({ where: { id: ada.id } })).userId).toBeNull();
  // The account itself is untouched: unlinking is not deactivating.
  expect(await db.tenantMembership.count({ where: { userId: pupilAccount.user.id, tenantId: school.id, deactivatedAt: null } })).toBe(1);
});

test("a member of staff sees who signs in as whom, and no button that links or unlinks", async ({ page }) => {
  const { ada, grace, teacher, pupilAccount, parentAccount, adaName, graceName } = await arrange();
  await db.studentRecord.update({ where: { id: ada.id }, data: { userId: pupilAccount.user.id } });
  await db.guardianRecord.update({ where: { id: grace.id }, data: { userId: parentAccount.user.id } });
  await signInThroughUi(page, teacher.user);
  await page.goto(`/schools/${school.code}/people/students/${ada.id}`);
  await expect(signIn(page)).toContainText(`Signs in as ${tag} Ada Online`);
  await expect(guardianRow(page, graceName)).toContainText(`Signs in as ${tag} Grace Online`);
  await expect(page.getByRole("button", { name: /^(Link|Unlink) / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Edit ${adaName}` })).toHaveCount(0);
});

test("THE POINT: a guardian and a pupil who sign in find nothing of theirs before the link, and their own things after it", async ({
  page,
}) => {
  const { ada, grace, pupilAccount, parentAccount, adaName } = await arrange();
  const openFromNav = async (entry: string) => {
    // On a phone the entry is in the tab bar; on a desktop in the sidebar. Either way it is a link named by the entry.
    await page.getByRole("link", { name: entry, exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: entry })).toBeVisible();
  };

  // The guardian, not linked: no child.
  await signInThroughUi(page, parentAccount.user);
  await openFromNav("My children");
  await expect(page.getByText("No pupil is linked to your account yet.")).toBeVisible();
  // Linked (what the administrator's click does, proven above): the child, by name and admission number.
  await db.guardianRecord.update({ where: { id: grace.id }, data: { userId: parentAccount.user.id } });
  await page.reload();
  await expect(page.getByText(`${adaName} (${tag}/001)`)).toBeVisible();
  await expect(page.getByText("No pupil is linked to your account yet.")).toHaveCount(0);
  await signOut(page);

  // The pupil, not linked: the practice tab cannot find them.
  await signInThroughUi(page, pupilAccount.user);
  await openFromNav("My work");
  // The page's own tab list: the practice area nests a tab of the same name inside it.
  const practiceTab = () => page.getByRole("tablist", { name: "My work sections" }).getByRole("tab", { name: "Practice" });
  await practiceTab().click();
  await expect(page.getByText("Student profile not found.")).toBeVisible();
  // Linked: the practice tab answers for THIS pupil (what it offers depends on the school's question bank; it no longer says the pupil is unknown).
  await db.studentRecord.update({ where: { id: ada.id }, data: { userId: pupilAccount.user.id } });
  await page.reload();
  await practiceTab().click();
  await expect(page.getByText(/No practice questions are ready for your class yet\.|Practice is closed for this school\./)).toBeVisible();
  await expect(page.getByText("Student profile not found.")).toHaveCount(0);
});
