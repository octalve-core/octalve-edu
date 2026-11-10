import AxeBuilder from "@axe-core/playwright";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { pdfPages, pdfProblems } from "../support/pdf";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Report cards as PDF (task 0038) in a real browser: a card and a whole class are downloaded as files from the Cards panel, what the file says is what the card says, and the screen
// says why in words when the server refuses. The rules are tested in tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, on desktop and on a phone.

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
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `P${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with a term, a class with two pupils (Ada and Bayo) with one published mark each, and an administrator.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2091`, startDate: day("2091-09-01"), endDate: day("2092-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2091-09-01"),
      endDate: day("2091-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Form 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  const codes: Record<string, string> = {};
  for (const key of ["Ada", "Bayo"]) {
    const s = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Pdf",
        dateOfBirth: day("2014-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    await db.studentEnrollment.create({ data: { tenantId: school.id, studentId: s.id, sessionId: session.id, classArmId: arm.id } });
    await db.result.create({
      data: {
        tenantId: school.id,
        studentId: s.id,
        subjectId: maths.id,
        periodId: term.id,
        score: 88,
        maxScore: 100,
        status: "PUBLISHED",
        verificationToken: (codes[key] = crypto.randomBytes(16).toString("hex")),
        gradeLetter: "A",
        gradeRemark: "Excellent",
      },
    });
  }
  return { admin: await member(school, Role.ADMIN, null, `${tag} Admin`), codes };
}

test("a card is downloaded as a PDF that says what the card says", async ({ page }) => {
  const { admin, codes } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Pdf` }).click();
  await expect(page.getByRole("article", { name: `Report card of ${tag}Ada Pdf` })).toBeVisible();
  // The verification links on the card are full addresses of the public check page, not an API path.
  const link = `${SAAS_URL}/verify/${codes.Ada}`;
  const card = page.getByRole("article", { name: `Report card of ${tag}Ada Pdf` });
  await expect(card.getByRole("link", { name: link })).toHaveAttribute("href", link);
  await expect(card.getByText(`${SAAS_URL}/verify and type the code`)).toBeVisible();
  await expect(card.getByText("/api/v1")).toHaveCount(0);
  await checkBothThemes(page, "a card with its Download PDF button");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`report-card-${tag}-Ada-First-Term.pdf`);
  const bytes = await readFile((await download.path())!);
  expect(pdfProblems(bytes)).toEqual([]);
  const text = pdfPages(bytes).join("\n");
  for (const expected of [`${tag} School`.toUpperCase(), `${tag}Ada Pdf`, "Mathematics", "88 / 100", "Excellent"]) {
    expect(text, expected).toContain(expected);
  }
  expect(text).not.toContain(`${tag}Bayo`);
  expect(text).toContain(link);
  expect(text).not.toContain("/api/");
});

test("a whole class is downloaded as one PDF with a page for each pupil", async ({ page }) => {
  const { admin } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await expect(page.getByRole("button", { name: `Open the report card of ${tag}Ada Pdf` })).toBeVisible();
  await checkBothThemes(page, "the class list with its Download all cards button");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download all cards (PDF)", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("report-cards-Form-1-A-First-Term.pdf");
  const bytes = await readFile((await download.path())!);
  expect(pdfProblems(bytes)).toEqual([]);
  const pages = pdfPages(bytes);
  expect(pages).toHaveLength(2);
  expect(pages[0]).toContain(`${tag}Ada Pdf`);
  expect(pages[1]).toContain(`${tag}Bayo Pdf`);
});

test("when the server refuses a download the screen says why in the server's words, and nothing is saved", async ({ page }) => {
  const { admin } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/results?tab=cards`);
  await page.getByRole("button", { name: `Open the report card of ${tag}Ada Pdf` }).click();
  await expect(page.getByRole("article", { name: `Report card of ${tag}Ada Pdf` })).toBeVisible();
  // The server refuses (here: the pupil's record is gone from under the screen): it answers 404 with a sentence and the screen reads that sentence out.
  await page.route("**/report-card/pdf?**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ data: null, meta: {}, error: { code: "NOT_FOUND", message: "No such student." } }),
    }),
  );
  let saved = false;
  page.on("download", () => (saved = true));
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No such student." })).toBeVisible();
  expect(saved).toBe(false);
  await checkBothThemes(page, "a card with a download problem");
  // Going back to the class clears the problem.
  await page.getByRole("button", { name: "Back to the class" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No such student." })).toHaveCount(0);
});
