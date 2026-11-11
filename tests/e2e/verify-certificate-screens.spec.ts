import AxeBuilder from "@axe-core/playwright";
import QRCode from "qrcode";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { api } from "../support/http";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { newCode, programCertificate, publishedMark, vocationalCertificate } from "../support/verify-world";
import { signInThroughUi } from "./helpers";

// A certificate is checked on the same public page as a mark (task 0043): `/verify/<code>` answers for a school's vocational certificate, for a certificate of completion of a program (in force
// or withdrawn), and says so in words when the record does not match or there is nothing. The old printed address of a certificate (the raw API route) brings a browser here too, and the
// QR code on the printed certificate is this page's link. Signed out, on purpose. Axe (WCAG 2.2 A/AA) and horizontal overflow in BOTH themes, on desktop and on a phone.

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

/// The answer's rows as `{ label: value }`: exactly what the page says, so an extra row (something private) fails as surely as a missing one.
async function rowsOf(page: Page): Promise<Record<string, string>> {
  return page
    .locator("dl > div")
    .evaluateAll((rows) =>
      Object.fromEntries(
        rows.map((row) => [row.querySelector("dt")?.textContent?.trim() ?? "", row.querySelector("dd")?.textContent?.trim() ?? ""]),
      ),
    );
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 180_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `C${Date.now().toString(36).toUpperCase()}`;
  school = await createTenant({ name: `${tag} School` });
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

test("a school's vocational certificate is answered with what the holder shows, and nothing the school keeps to itself", async ({
  page,
}) => {
  const cert = await vocationalCertificate(school, tag);
  await page.goto(`/verify/${cert.token}`);
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toBeVisible();
  expect(await rowsOf(page)).toEqual({
    School: `${tag} School`,
    "Awarded to": cert.studentName,
    Certificate: cert.title,
    Number: cert.certificateNo,
    "Issued on": "5 November 2093",
  });
  // The free-form metadata and the admission number are not on the page.
  await expect(page.getByText(cert.metadataText)).toHaveCount(0);
  await expect(page.getByText("VOC-ADM")).toHaveCount(0);
  await checkBothThemes(page, "a checked vocational certificate");
  // The same tab says what it is for, and the page is kept out of search engines and does not pass its address on.
  await expect(page).toHaveTitle(/Check a mark or certificate/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
  await page.getByRole("link", { name: "Check another code" }).click();
  await expect(page).toHaveURL(/\/verify$/);
});

test("a certificate of completion is answered with the program, the dates and the name as first name and last initial", async ({
  page,
}) => {
  const cert = await programCertificate(school, tag);
  await page.goto(`/verify/${cert.token}`);
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toBeVisible();
  expect(await rowsOf(page)).toEqual({
    School: `${tag} School`,
    Program: cert.programName,
    Certificate: "Certificate of Completion",
    "Awarded to": cert.personMasked,
    "Completed on": "1 October 2093",
    "Issued on": "3 October 2093",
    Number: cert.serialNo,
  });
  await expect(page.getByText("Bello")).toHaveCount(0); // the surname is never spelt out
  await checkBothThemes(page, "a checked certificate of completion");
});

test("a withdrawn certificate says so and tells only the school and the number", async ({ page }) => {
  const cert = await programCertificate(school, tag, { withdrawn: true });
  await page.goto(`/verify/${cert.token}`);
  await expect(page.getByRole("heading", { name: "This certificate was withdrawn" })).toBeVisible();
  await expect(page.getByText("no longer valid. Do not rely on it; contact the school.")).toBeVisible();
  expect(await rowsOf(page)).toEqual({ School: `${tag} School`, Number: cert.serialNo });
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toHaveCount(0);
  await expect(page.getByText(cert.personMasked)).toHaveCount(0);
  await expect(page.getByText("Issued in error")).toHaveCount(0); // why it was withdrawn is the school's to tell
  await checkBothThemes(page, "a withdrawn certificate");
});

test("a certificate that does not match the school's record is not vouched for, and tells nothing about the holder", async ({ page }) => {
  const cert = await vocationalCertificate(school, tag, { tampered: true });
  await page.goto(`/verify/${cert.token}`);
  await expect(page.getByRole("heading", { name: "This code does not match the school's record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toHaveCount(0);
  await expect(page.locator("dl")).toHaveCount(0);
  await expect(page.getByText(cert.studentName)).toHaveCount(0);
  await expect(page.getByText(cert.title)).toHaveCount(0);
  await checkBothThemes(page, "a certificate that does not match");
});

test("a certificate that is only a draft, a code nobody has and a mark's code each get their own answer", async ({ page }) => {
  const draft = await vocationalCertificate(school, tag, { status: "DRAFT" });
  const mark = await publishedMark(school, tag);
  await page.goto(`/verify/${draft.token}`);
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "No published mark or issued certificate was found for this code." }),
  ).toBeVisible();
  await expect(page.getByText(draft.studentName)).toHaveCount(0);
  await page.goto(`/verify/${newCode()}`);
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toBeVisible();
  await checkBothThemes(page, "a code with nothing found");
  // A mark is still a mark.
  await page.goto(`/verify/${mark.code}`);
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
  expect((await rowsOf(page)).Pupil).toBe(mark.pupilName);
});

test("the check page takes a certificate's code, its whole link, and the raw address an old printed certificate has", async ({ page }) => {
  const cert = await programCertificate(school, tag);
  await page.goto("/verify");
  await expect(page.getByRole("heading", { name: "Check a mark or certificate" })).toBeVisible();
  await checkBothThemes(page, "the check page");
  const box = page.getByLabel("Verification code");
  for (const typed of [
    `  ${cert.token.toUpperCase()} `,
    `${SAAS_URL}/verify/${cert.token}`,
    `${SAAS_URL}/api/v1/verify-certificate/${cert.token}`,
    `${SAAS_URL}/api/v1/verify/${cert.token}`,
  ]) {
    await page.goto("/verify");
    await box.fill(typed);
    await page.getByRole("button", { name: "Check this code" }).click();
    await expect(page, typed).toHaveURL(new RegExp(`/verify/${cert.token}$`));
    await expect(page.getByRole("heading", { name: "This certificate is genuine" }), typed).toBeVisible();
  }
  // Something after the code is not that code.
  await page.goto("/verify");
  await box.fill(`${SAAS_URL}/verify/${cert.token}/extra`);
  await page.getByRole("button", { name: "Check this code" }).click();
  await expect(page.getByText("That is not a verification code.")).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
});

test("an old printed QR code, which opens the raw address of the certificate, lands on the page", async ({ page }) => {
  const voc = await vocationalCertificate(school, tag);
  const prog = await programCertificate(school, tag);
  await page.goto(`/api/v1/verify-certificate/${voc.token}`);
  await expect(page).toHaveURL(new RegExp(`/verify/${voc.token}$`));
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toBeVisible();
  await page.goto(`/api/v1/verify-certificate/${prog.token}`);
  await expect(page).toHaveURL(new RegExp(`/verify/${prog.token}$`));
  await expect(page.getByRole("heading", { name: "This certificate is genuine" })).toBeVisible();
  // And an old report card's raw address for a mark.
  const mark = await publishedMark(school, tag);
  await page.goto(`/api/v1/verify/${mark.code}`);
  await expect(page).toHaveURL(new RegExp(`/verify/${mark.code}$`));
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
});

test("the check does not guess: when the certificate lookup is limited the page says the check did not finish, and a mark is still answered", async ({
  page,
  clientIp,
}) => {
  const cert = await programCertificate(school, tag);
  const mark = await publishedMark(school, tag);
  // Use up the browser's own allowance on the certificate route (60 in five minutes per address); the mark route is untouched.
  for (let i = 0; i < 60; i++) {
    const res = await api(`/api/v1/verify-certificate/${newCode()}`, { baseUrl: SAAS_URL, ip: clientIp });
    if (res.status !== 404) throw new Error(`use-up ${i + 1} was ${res.status}, not 404`);
  }
  // A mark is found by the first lookup, so the limit on the second is never met.
  await page.goto(`/verify/${mark.code}`);
  await expect(page.getByRole("heading", { name: "This mark is genuine" })).toBeVisible();
  // A certificate needs the second lookup, which is refused: that is not "no such certificate".
  await page.goto(`/verify/${cert.token}`);
  await expect(page.getByRole("heading", { name: "The check did not finish" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts. Please wait a few minutes and try again." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing found for this code" })).toHaveCount(0);
  await checkBothThemes(page, "a check that did not finish");
});

test("the printed certificate draws a QR code for the page's link, and prints that same address, never an API path", async ({ page }) => {
  const cert = await programCertificate(school, tag);
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/programs/${cert.programId}/certificates/${cert.certId}`);
  const sheet = page.getByRole("article", { name: `Certificate ${cert.serialNo}` });
  await expect(sheet).toBeVisible();
  const link = `${SAAS_URL}/verify/${cert.token}`;
  await expect(sheet.getByText(`Check it at ${link.replace(/^https?:\/\//, "")}`)).toBeVisible();
  await expect(sheet.getByText("/api/")).toHaveCount(0);
  // The picture is the QR code of exactly that link: the same squares, drawn the way the page draws them.
  const qr = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
  const squares: string[] = [];
  for (let y = 0; y < qr.size; y += 1) for (let x = 0; x < qr.size; x += 1) if (qr.get(x, y)) squares.push(`M${x + 1},${y + 1}h1v1h-1z`);
  const drawn = sheet.getByRole("img", { name: `Scan to check certificate ${cert.serialNo}` });
  await expect(drawn).toBeVisible();
  expect(await drawn.locator("path").getAttribute("d")).toBe(squares.join(""));
  await checkBothThemes(page, "the printed certificate");
});
