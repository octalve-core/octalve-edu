import AxeBuilder from "@axe-core/playwright";
import crypto from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { currentTheme, setTheme } from "../support/theme";

// The public page where anyone checks a published mark (task 0038): `/verify/<code>` is the link printed on a report card and opens straight onto the answer; `/verify` takes a typed or pasted code.
// Signed out, on purpose. The answer is the school, the pupil, the term, the subject and the grade, never the score or the admission number. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH
// themes, on desktop and on a phone.

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
test.describe.configure({ timeout: 120_000 });

let tag = "";
let school: TestTenant;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `V${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with one pupil (Ada) who has a PUBLISHED mark in Mathematics, with its verification code, and a DRAFT mark in English, which has none.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2093`, startDate: day("2093-09-01"), endDate: day("2094-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2093-09-01"),
      endDate: day("2093-12-15"),
      isCurrent: true,
    },
  });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  const english = await db.subject.create({ data: { tenantId: school.id, name: "English" } });
  const ada = await db.studentRecord.create({
    data: {
      tenantId: school.id,
      firstName: `${tag}Ada`,
      lastName: "Verify",
      dateOfBirth: day("2014-01-01"),
      admissionNo: `${tag}/SECRET-ADM`,
    },
  });
  const code = crypto.randomBytes(16).toString("hex");
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: ada.id,
      subjectId: maths.id,
      periodId: term.id,
      score: 91.5,
      maxScore: 100,
      status: "PUBLISHED",
      verificationToken: code,
      gradeLetter: "A",
      publishedAt: new Date("2093-12-10T10:00:00Z"),
    },
  });
  const draftCode = crypto.randomBytes(16).toString("hex");
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: ada.id,
      subjectId: english.id,
      periodId: term.id,
      score: 40,
      maxScore: 100,
      status: "DRAFT",
      verificationToken: draftCode,
      gradeLetter: "D",
    },
  });
  return { code, draftCode };
}

test("the link on a report card opens onto the answer: the school, the pupil, the term, the subject and the grade, and nothing private", async ({
  page,
}) => {
  const { code } = await arrange();
  await page.goto(`/verify/${code}`);
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
  const facts = page.getByRole("definition");
  for (const expected of [`${tag} School`, `${tag}Ada Verify`, `${tag} 2093`, "First Term", "Mathematics", "A", "10 December 2093"]) {
    await expect(facts.filter({ hasText: new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }), expected).toHaveCount(1);
  }
  // The score and the admission number are not public.
  await expect(page.getByText("91.5")).toHaveCount(0);
  await expect(page.getByText("SECRET-ADM")).toHaveCount(0);
  await checkBothThemes(page, "a checked mark");
  // Kept out of search engines, and does not pass its address on.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await page.getByRole("link", { name: "Check another mark" }).click();
  await expect(page).toHaveURL(/\/verify$/);
});

test("a code that no published mark has, a mark not yet published, and an incomplete link each say so in words", async ({ page }) => {
  const { draftCode } = await arrange();
  // A well-formed code nobody has.
  await page.goto(`/verify/${"0".repeat(32)}`);
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "No published mark was found for this code." })).toBeVisible();
  await checkBothThemes(page, "a code with no mark");
  // A draft's code is as good as no code: nothing about it is told.
  await page.goto(`/verify/${draftCode}`);
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toBeVisible();
  await expect(page.getByText(`${tag}Ada`)).toHaveCount(0);
  // A link that was cut short.
  await page.goto("/verify/abc123");
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "This link is incomplete" })).toBeVisible();
  await checkBothThemes(page, "an incomplete link");
  await page.getByRole("link", { name: "Check a different code" }).click();
  await expect(page).toHaveURL(/\/verify$/);
});

test("the check page takes a typed code, a pasted link, or refuses what is not a code, in words", async ({ page }) => {
  const { code } = await arrange();
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "Check a report card mark" })).toBeVisible();
  await checkBothThemes(page, "the check page");
  const box = page.getByLabel("Verification code");
  await box.fill("not a code");
  await page.getByRole("button", { name: "Check this mark" }).click();
  await expect(page.getByText("That is not a verification code.")).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
  await checkBothThemes(page, "the check page with a refusal");
  // Typed, in capitals and with spaces: the same code.
  await box.fill(`  ${code.toUpperCase()} `);
  await page.getByRole("button", { name: "Check this mark" }).click();
  await expect(page).toHaveURL(new RegExp(`/verify/${code}$`));
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
  // The whole link, as pasted from the report card.
  await page.goto("/verify");
  await page.getByLabel("Verification code").fill(`${SAAS_URL}/verify/${code}`);
  await page.getByRole("button", { name: "Check this mark" }).click();
  await expect(page).toHaveURL(new RegExp(`/verify/${code}$`));
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
});

test("the raw API address is not a page people are sent to: the old wording is gone from the check page", async ({ page }) => {
  await page.goto("/verify");
  await expect(page.getByText("/api/v1")).toHaveCount(0);
});
