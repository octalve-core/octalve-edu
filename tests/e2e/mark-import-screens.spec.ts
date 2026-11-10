import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// Importing marks from a file (task 0039) in a real browser: the sheet is downloaded as a CSV file, a file is CHECKED before it is imported, a file with a problem imports nothing and says why row by row,
// typed-and-unsaved marks block the import, and a refusal from the server is shown in its own words. The rules are tested in tests/unit and tests/api; this is the screen. Axe (WCAG 2.2 A/AA) and
// horizontal overflow in BOTH themes, on desktop and on a phone.

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
  tag = `I${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with a term, a class (Form 1 A) with a scheme (CA /40 and the exam /60), two pupils (Ada and Bayo) and a teacher assigned to Mathematics there.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const session = await db.academicSession.create({
    data: { tenantId: school.id, label: `${tag} 2101`, startDate: day("2101-09-01"), endDate: day("2102-07-20"), status: "ACTIVE" },
  });
  await db.academicPeriod.create({
    data: {
      tenantId: school.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2101-09-01"),
      endDate: day("2101-12-15"),
      isCurrent: true,
    },
  });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Form 1", sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const maths = await db.subject.create({ data: { tenantId: school.id, name: "Mathematics" } });
  await db.subjectOffering.create({ data: { tenantId: school.id, classGroupId: group.id, subjectId: maths.id } });
  await db.assessmentScheme.create({
    data: {
      tenantId: school.id,
      classGroupId: group.id,
      name: `${tag} scheme`,
      totalMax: 100,
      examMax: 60,
      components: { create: [{ name: "CA", maxScore: 40, sortOrder: 1 }] },
    },
  });
  const pupils: Record<string, string> = {};
  for (const key of ["Ada", "Bayo"]) {
    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        firstName: `${tag}${key}`,
        lastName: "Imp",
        dateOfBirth: day("2014-01-01"),
        admissionNo: `${tag}/${key}`,
      },
    });
    await db.studentEnrollment.create({ data: { tenantId: school.id, studentId: student.id, sessionId: session.id, classArmId: arm.id } });
    pupils[key] = student.id;
  }
  const teacher = await member(school, Role.TEACHING_STAFF, null, `${tag} Teacher`);
  const staff = await db.staffRecord.create({
    data: { tenantId: school.id, userId: teacher.user.id, category: "TEACHING", firstName: "Tess", lastName: tag },
  });
  await db.staffSubjectAssignment.create({
    data: { tenantId: school.id, staffRecordId: staff.id, subjectId: maths.id, classArmId: arm.id },
  });
  return { teacher, pupils };
}

const marks = (page: Page) => page.getByRole("region", { name: "Marks for Mathematics" });
const header = "admission_no,name,CA (40),Exam (60)";
const fileOf = (name: string, ...rows: string[]) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(`${header}\r\n${rows.join("\r\n")}\r\n`),
});
const open = async (page: Page, teacher: Person) => {
  await signInThroughUi(page, teacher.user);
  await page.goto(`/schools/${school.code}/results?tab=marks`);
  await expect(marks(page).getByRole("columnheader", { name: "Exam /60" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import marks from a file" })).toBeVisible();
};
const chooser = (page: Page) => page.getByLabel("Marks file (CSV)");
const check = (page: Page) => page.getByRole("button", { name: "Check the file", exact: true });

test("the sheet is downloaded as a CSV file: the header the import wants, the pupils on the roll, the saved marks in place", async ({
  page,
}) => {
  const { teacher, pupils } = await arrange();
  await db.result.create({
    data: {
      tenantId: school.id,
      studentId: pupils.Ada,
      subjectId: (await db.subject.findFirstOrThrow({ where: { tenantId: school.id } })).id,
      periodId: (await db.academicPeriod.findFirstOrThrow({ where: { tenantId: school.id } })).id,
      score: 70,
      maxScore: 100,
      status: "DRAFT",
      componentScores: [
        { name: "CA", score: 30, maxScore: 40 },
        { name: "Exam", score: 40, maxScore: 60 },
      ],
      verificationToken: "0".repeat(32),
    },
  });
  await open(page, teacher);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download the sheet (CSV)", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("marks-Form-1-A-Mathematics-First-Term.csv");
  const text = (await readFile((await download.path())!)).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff); // a spreadsheet reads the names as UTF-8
  expect(text.slice(1).split("\r\n").filter(Boolean)).toEqual([header, `${tag}/Ada,${tag}Ada Imp,30,40`, `${tag}/Bayo,${tag}Bayo Imp,,`]);
});

test("a file is checked, then imported: the check shows each row and writes nothing; the import saves the marks as drafts and the grid shows them", async ({
  page,
}) => {
  const { teacher, pupils } = await arrange();
  await open(page, teacher);
  await expect(page.getByRole("button", { name: "Import the marks", exact: true })).toBeDisabled();
  await expect(check(page)).toBeDisabled(); // no file yet
  await chooser(page).setInputFiles(fileOf("marks.csv", `${tag}/Ada,x,30,50`, `${tag}/Bayo,x,35.5,55`));
  await check(page).click();
  const summary = page.getByRole("status").filter({ hasText: "The file is fine: 2 pupils' marks to save (2 new, 0 changed)." });
  await expect(summary).toBeVisible();
  const table = page.getByRole("region", { name: "What the file would do, row by row" });
  await expect(table.getByRole("row", { name: new RegExp(`${tag}Ada Imp.*New.*80`) })).toBeVisible();
  await expect(table.getByRole("row", { name: new RegExp(`${tag}Bayo Imp.*New.*90\\.5`) })).toBeVisible();
  expect(await db.result.count({ where: { tenantId: school.id } })).toBe(0); // a check writes nothing
  await checkBothThemes(page, "the check of a good file");

  await page.getByRole("button", { name: "Import 2 pupils' marks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported the marks of 2 pupils from marks.csv." })).toBeVisible();
  const ada = marks(page).getByRole("row", { name: new RegExp(`${tag}Ada Imp`) });
  await expect(ada.getByLabel(`CA for ${tag}Ada Imp`)).toHaveValue("30");
  await expect(ada.getByLabel(`Exam for ${tag}Ada Imp`)).toHaveValue("50");
  await expect(ada.getByText("Draft")).toBeVisible();
  const saved = await db.result.findMany({ where: { tenantId: school.id }, orderBy: { score: "asc" } });
  expect(saved.map((r) => [r.studentId, Number(r.score), r.status])).toEqual([
    [pupils.Ada, 80, "DRAFT"],
    [pupils.Bayo, 90.5, "DRAFT"],
  ]);
  expect(await db.auditLog.count({ where: { tenantId: school.id, action: "RESULTS_IMPORTED" } })).toBe(1);
  await checkBothThemes(page, "the sheet after an import");
});

test("a file with a problem imports nothing and says which row and why; choosing a corrected file starts the check again", async ({
  page,
}) => {
  const { teacher } = await arrange();
  await open(page, teacher);
  await chooser(page).setInputFiles(fileOf("bad.csv", `${tag}/Ada,x,30,50`, `${tag}/Bayo,x,45,55`, "NOPE/1,x,1,1"));
  await check(page).click();
  await expect(
    page.getByRole("status").filter({ hasText: "2 rows have problems. Nothing was imported: fix the file and check it again." }),
  ).toBeVisible();
  const table = page.getByRole("region", { name: "What the file would do, row by row" });
  await expect(table.getByRole("row", { name: new RegExp(`${tag}Bayo Imp.*Problem.*CA: at most 40\\.`) })).toBeVisible();
  await expect(table.getByText("No pupil with this admission number is on the roll of this class for this term.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import the marks", exact: true })).toBeDisabled();
  await checkBothThemes(page, "the check of a file with problems");
  expect(await db.result.count({ where: { tenantId: school.id } })).toBe(0);
  // A corrected file: the old check is gone, and the import is not offered until the new file is checked.
  await chooser(page).setInputFiles(fileOf("good.csv", `${tag}/Ada,x,30,50`));
  await expect(table).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import the marks", exact: true })).toBeDisabled();
  await check(page).click();
  await expect(page.getByRole("button", { name: "Import 1 pupil's marks", exact: true })).toBeEnabled();
});

test("a file whose header is wrong says so in words and lists no rows", async ({ page }) => {
  const { teacher } = await arrange();
  await open(page, teacher);
  await chooser(page).setInputFiles({
    name: "odd.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`admission_no,CA (40),Behaviour\r\n${tag}/Ada,30,3\r\n`),
  });
  await check(page).click();
  const status = page.getByRole("status").filter({ hasText: "The file can't be read." });
  await expect(status).toBeVisible();
  await expect(status).toContainText('Unknown column "Behaviour"');
  await expect(status).toContainText('The file needs a column for "Exam (60)".');
  await expect(page.getByRole("region", { name: "What the file would do, row by row" })).toHaveCount(0);
  await checkBothThemes(page, "a file that cannot be read");
});

test("marks typed in the grid and not saved block the import, and say why; saving them lifts it", async ({ page }) => {
  const { teacher } = await arrange();
  await open(page, teacher);
  await chooser(page).setInputFiles(fileOf("marks.csv", `${tag}/Bayo,x,30,50`));
  await expect(check(page)).toBeEnabled();
  await marks(page).getByLabel(`CA for ${tag}Ada Imp`).fill("12");
  await expect(page.getByRole("alert").filter({ hasText: "You have typed marks above that are not saved." })).toBeVisible();
  await expect(check(page)).toBeDisabled();
  await marks(page).getByLabel(`Exam for ${tag}Ada Imp`).fill("40");
  await page.getByRole("button", { name: "Save marks", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved the marks of 1 pupil." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "You have typed marks above that are not saved." })).toHaveCount(0);
});

test("a refusal from the server is shown in the server's words; a file over 1 MB is refused on the screen without being sent", async ({
  page,
}) => {
  const { teacher } = await arrange();
  await open(page, teacher);
  const requests: string[] = [];
  page.on("request", (r) => r.url().includes("/results/import") && requests.push(r.url()));
  await page.route("**/academics/results/import", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        data: null,
        meta: {},
        error: { code: "CONFLICT", message: "That result has left DRAFT and cannot be changed here." },
      }),
    }),
  );
  await chooser(page).setInputFiles(fileOf("marks.csv", `${tag}/Ada,x,30,50`));
  await check(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "That result has left DRAFT and cannot be changed here." })).toBeVisible();
  expect(requests).toHaveLength(1);
  await checkBothThemes(page, "a refusal from the server");

  await chooser(page).setInputFiles({ name: "huge.csv", mimeType: "text/csv", buffer: Buffer.alloc(1024 * 1024 + 1, "a") });
  await expect(page.getByRole("alert").filter({ hasText: "That file is larger than 1 MB. Split it into smaller files." })).toBeVisible();
  await expect(check(page)).toBeDisabled();
  expect(requests).toHaveLength(1); // nothing more was sent
});
