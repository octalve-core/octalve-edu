import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { activeSession, member, pupil, type Person, type Pupil } from "../support/qbank-world";
import { alerts, emailField, fillCredentials, signInButton, signInThroughUi } from "./helpers";
import { currentTheme, setTheme } from "../support/theme";

// The Finance page (task 0029 slice F2) and the standing screens (task 0028) in a real browser: the school's invoices, an invoice's page with the rule on parts and the "pay in full" switch,
// the payment rules (the school's with the fresh proof, a campus's read-only for its administrator), the standing of a pupil and of a member of staff (suspend, lift, expel, terminate,
// reinstate, the history), the Users list's Standing dialog, the Discipline setting, the notice a suspended pupil is shown, and the refusal of an expelled pupil at sign-in. The APIs are
// tested in tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and horizontal overflow run in BOTH themes, on desktop and on a phone.

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
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    await page.waitForLoadState("networkidle");
    // the theme fades for 150 ms: a scan taken inside it measures a colour between the two themes
    await page.waitForTimeout(250);
    await expectAccessible(page, `${what} [${theme} theme]`);
    await expectNoHorizontalScroll(page, `${what} [${theme} theme]`);
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
  tag = `S${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const dialog = (page: Page) => page.getByRole("dialog");
const FINANCE = () => `/schools/${school.code}/finance`;

/// One school with a campus: its administrator, the campus's administrator, a teacher and a pupil (with a sign-in, an invoice and an enrolment).
async function world() {
  school = await createTenant({ name: `${tag} School`, campuses: ["North"] });
  const [north] = school.campuses;
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const campusAdmin = await member(school, Role.CAMPUS_ADMIN, north.id, `${tag} Campus`);
  const teacher = await member(school, Role.TEACHING_STAFF, north.id, `${tag} Teacher`);
  await db.staffRecord.create({
    data: {
      tenantId: school.id,
      campusId: north.id,
      userId: teacher.user.id,
      category: "TEACHING",
      firstName: `${tag}Tee`,
      lastName: "Cher",
    },
  });
  const ada: Pupil = await pupil(school, north.id, `${tag} JSS 1`, `${tag}Ada`);
  const session = await activeSession(school);
  const period = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session,
      kind: "TERM",
      ordinal: 1,
      label: "First term",
      startDate: new Date("2046-09-02"),
      endDate: new Date("2046-12-20"),
    },
  });
  const invoice = await db.invoice.create({
    data: {
      tenantId: school.id,
      studentId: ada.student.id,
      periodId: period.id,
      invoiceNo: `INV-${tag}`,
      totalAmount: 20_000,
      lineItems: [],
    },
  });
  return { north, admin, campusAdmin, teacher, ada, invoice };
}
type World = Awaited<ReturnType<typeof world>>;

async function signInTo(page: Page, who: Person, path: string) {
  await signInThroughUi(page, who.user);
  await page.goto(path);
}

test.describe("Finance", () => {
  test("the administrator sees the invoices, opens one and marks it pay in full; both themes", async ({ page }) => {
    const w = await world();
    await signInTo(page, w.admin, FINANCE());
    await expect(page.getByRole("heading", { level: 1, name: "Finance" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Invoices" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Fee structures" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Payment rules" })).toBeVisible();
    await expect(page.getByText(`INV-${tag}`)).toBeVisible();
    await checkBothThemes(page, "the Finance page");

    await page.getByRole("link", { name: "View & Pay" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/finance/invoices/${w.invoice.id}$`));
    await expect(page.getByText(`Invoice No: INV-${tag}`)).toBeVisible();
    const how = page.getByRole("region", { name: "How this invoice may be paid" });
    await expect(how).toContainText("Part payments are allowed");
    await how.getByRole("button", { name: "Require payment in full on this invoice" }).click();
    await expect(page.getByRole("main").getByText("This invoice now has to be paid in full.")).toBeVisible();
    await expect(how).toContainText("has to be paid in full");
    await expect(how.getByRole("button", { name: "Allow part payments on this invoice" })).toBeVisible();
    await checkBothThemes(page, "an invoice");
  });

  test("the payment rules: the school's rule needs the password, a campus administrator only reads", async ({ page, browser }) => {
    const w = await world();
    await signInTo(page, w.admin, FINANCE());
    await page.getByRole("tab", { name: "Payment rules" }).click();
    const form = page.getByRole("form", { name: "Payment rule of the school" });
    await form.getByLabel("Smallest part").selectOption("AMOUNT");
    await form.getByLabel("Amount (₦)").fill("2000");
    await form.getByRole("button", { name: "Save the rule" }).click();
    await dialog(page).getByLabel("Account Password").fill(w.admin.user.password);
    await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
    await expect(page.getByText("The school's rule saved.")).toBeVisible();
    await expect(page.getByText("Part payments are allowed, at least ₦2,000.").first()).toBeVisible();
    await checkBothThemes(page, "the payment rules");

    // the invoice page now says it
    await page.goto(`${FINANCE()}/invoices/${w.invoice.id}`);
    await expect(page.getByRole("region", { name: "How this invoice may be paid" })).toContainText("at least ₦2,000");

    const campusPage = await (await browser.newContext({ baseURL: SAAS_URL })).newPage();
    await signInTo(campusPage, w.campusAdmin, FINANCE());
    await campusPage.getByRole("tab", { name: "Payment rules" }).click();
    await expect(campusPage.getByText("Only the school's administrator changes a rule.").first()).toBeVisible();
    await expect(campusPage.getByRole("button", { name: "Save the rule" })).toHaveCount(0);
    await campusPage.context().close();
  });

  test("a teacher without the finance permission is turned away; the sidebar offers Finance to administrators only", async ({ page }) => {
    const w = await world();
    await signInThroughUi(page, w.teacher.user);
    const refused = await page.goto(FINANCE());
    expect(refused?.status()).toBe(403);
    await page.goto(`/schools/${school.code}`);
    await expect(page.getByRole("link", { name: "Finance" })).toHaveCount(0);
  });
});

async function openStudent(page: Page, w: World) {
  await signInTo(page, w.admin, `/schools/${school.code}/people/students/${w.ada.student.id}`);
  await expect(page.getByRole("heading", { level: 2, name: "Standing" })).toBeVisible();
}

test.describe("Standing", () => {
  test("a pupil is suspended, lifted, expelled and reinstated, with the history; both themes", async ({ page }) => {
    const w = await world();
    await openStudent(page, w);
    const standing = page.getByRole("region", { name: "Standing" });
    await expect(standing).toContainText("Taking part");

    await standing.getByRole("button", { name: "Suspend", exact: true }).click();
    await dialog(page).getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(dialog(page).getByText("Give the reason")).toBeVisible();
    await dialog(page).getByLabel("Reason").fill("Fighting in the yard");
    await dialog(page).getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(standing).toContainText("Suspended");
    await expect(standing).toContainText("until someone lifts it");
    await expect(standing.getByRole("list", { name: /Standing history/ })).toContainText("Fighting in the yard");
    await checkBothThemes(page, "a suspended pupil's page");

    await standing.getByRole("button", { name: "Lift the suspension" }).click();
    await dialog(page).getByLabel("Reason").fill("Back after the meeting");
    await dialog(page).getByRole("button", { name: "Lift the suspension" }).click();
    await expect(standing).toContainText("Taking part");

    await standing.getByRole("button", { name: "Expel", exact: true }).click();
    await dialog(page).getByLabel("Reason").fill("Expelled after the hearing");
    await dialog(page).getByRole("button", { name: "Expel", exact: true }).click();
    await expect(standing).toContainText("Expelled");
    await expect(standing.getByRole("button", { name: "Reinstate" })).toBeVisible();
    await expect(standing.getByRole("button", { name: "Suspend", exact: true })).toHaveCount(0);

    await standing.getByRole("button", { name: "Reinstate" }).click();
    await dialog(page).getByLabel("Reason").fill("The appeal succeeded");
    await dialog(page).getByRole("button", { name: "Reinstate" }).click();
    await expect(standing).toContainText("Taking part");
    await expect(standing.getByRole("list", { name: /Standing history/ }).getByRole("listitem")).toHaveCount(4);
    await checkBothThemes(page, "a pupil's standing history");
  });

  test("a suspended pupil is told, without the reason; an expelled pupil cannot sign in and is told nothing more than a wrong password", async ({
    page,
    browser,
  }) => {
    const w = await world();
    await db.studentRecord.update({ where: { id: w.ada.student.id }, data: { standing: "SUSPENDED" } });
    await db.standingEvent.create({
      data: {
        tenantId: school.id,
        subject: "STUDENT",
        studentId: w.ada.student.id,
        campusId: w.north.id,
        action: "SUSPENDED",
        reason: "A reason the pupil must never see",
        startsOn: new Date(),
        decidedByUserId: w.admin.user.id,
      },
    });
    await signInTo(page, w.ada, `/schools/${school.code}/learn`);
    await expect(page.getByText(/You are suspended/)).toBeVisible();
    await expect(page.getByText("A reason the pupil must never see")).toHaveCount(0);
    await checkBothThemes(page, "a suspended pupil's page of work");

    await db.studentRecord.update({ where: { id: w.ada.student.id }, data: { standing: "EXPELLED" } });
    const again = await (await browser.newContext({ baseURL: SAAS_URL })).newPage();
    await again.goto("/login");
    await fillCredentials(again, w.ada.user.email, w.ada.user.password);
    await signInButton(again).click();
    await expect(alerts(again).filter({ hasText: "The email or password you entered is incorrect" })).toBeVisible();
    await expect(emailField(again)).toBeVisible();
    await again.context().close();
  });

  test("a member of staff is terminated and reinstated from the Users list; a campus administrator is not offered it for the whole school", async ({
    page,
  }) => {
    const w = await world();
    await signInTo(page, w.admin, `/schools/${school.code}/users`);
    await page.getByRole("button", { name: `Standing of ${w.teacher.user.name}` }).click();
    await expect(dialog(page).getByRole("heading", { level: 2, name: "Standing", exact: true })).toBeVisible();
    await dialog(page).getByRole("button", { name: "Terminate", exact: true }).click();
    await dialog(page).getByLabel("Reason").fill("Contract ended");
    await dialog(page).getByRole("button", { name: "Terminate", exact: true }).last().click();
    await expect(dialog(page).getByText("Terminated").first()).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Reinstate" })).toBeVisible();
  });

  test("the Discipline setting: the school turns campus suspensions off with the password", async ({ page }) => {
    const w = await world();
    await signInTo(page, w.admin, `/schools/${school.code}/settings`);
    await expect(page.getByRole("heading", { level: 2, name: "Discipline" })).toBeVisible();
    await page.getByRole("button", { name: "Do not allow campus administrators to suspend" }).click();
    await dialog(page).getByLabel("Account Password").fill(w.admin.user.password);
    await dialog(page).getByRole("button", { name: "Confirm & Apply" }).click();
    await expect(page.getByText("The school's setting is saved.")).toBeVisible();
    await expect(page.getByText("is not allowed").first()).toBeVisible();
    await checkBothThemes(page, "the Discipline setting");
  });
});
