import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { member } from "../support/qbank-world";
import { currentTheme, setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";

// The class-arm and teacher choices of the timetable's slot form and of the notice composer (task 0064). Both screens asked for a route that does not exist (academics/classes: a 404 on every load)
// and read the wrong shapes, so their choices were always empty; the slot form's selects are required, so a lesson could not be scheduled by a person. The forms were also drawn once and never again
// (a slot to edit opened with the values of a new one, a second notice opened with the words of the first), and their labels were not tied to their fields. The API rules are tested in tests/api.

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
async function checkBothThemes(page: Page, what: string) {
  const initial = await currentTheme(page);
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} [${theme} theme]`,
    ).toEqual([]);
  }
  await setTheme(page, initial);
}

test.use({ baseURL: SAAS_URL });
test.describe.configure({ timeout: 120_000 });

let tag = "";
let school: TestTenant;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async () => {
  tag = `C${Date.now().toString(36).toUpperCase()}`;
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

/// A school with one class (Form 1) and its arm A, a subject, a teaching staff record and an administrator.
async function arrange() {
  school = await createTenant({ name: `${tag} School` });
  const group = await db.classGroup.create({ data: { tenantId: school.id, name: `${tag} Form 1`, sortOrder: 1 } });
  const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "A" } });
  const subject = await db.subject.create({ data: { tenantId: school.id, name: `${tag} Mathematics` } });
  const teacher = await db.staffRecord.create({
    data: { tenantId: school.id, category: "TEACHING", firstName: `${tag}Ada`, lastName: "Teacher" },
  });
  const admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  return { admin, arm, subject, teacher, armName: `${tag} Form 1 A` };
}

const slotDialog = (page: Page, name: string) => page.getByRole("dialog", { name });

test("a lesson is scheduled from the school's own class arm, subject and teacher; its form opens with its own values and can be changed", async ({
  page,
}) => {
  const { admin, arm, subject, teacher, armName } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}/academics`);
  await expect(page.getByRole("heading", { level: 2, name: "Weekly Timetable Schedule" })).toBeVisible();

  await page.getByRole("button", { name: "Schedule Slot" }).click();
  const form = slotDialog(page, "Schedule New Lesson Slot");
  await expect(form).toBeVisible();
  // The choices are the school's own (they were empty), each tied to its label.
  await expect(form.getByLabel("Class Arm").getByRole("option", { name: armName })).toHaveCount(1);
  await expect(form.getByLabel("Subject").getByRole("option", { name: `${tag} Mathematics` })).toHaveCount(1);
  await expect(form.getByLabel("Teacher").getByRole("option", { name: `${tag}Ada Teacher` })).toHaveCount(1);
  await form.getByLabel("Room / Venue (optional)").fill("Lab 2");
  await checkBothThemes(page, "the slot form");
  await form.getByRole("button", { name: "Schedule Slot" }).click();
  await expect(form).toBeHidden();

  const saved = await db.timetableSlot.findMany({ where: { tenantId: school.id } });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ classArmId: arm.id, subjectId: subject.id, staffRecordId: teacher.id, room: "Lab 2", dayOfWeek: 1 });

  // The lesson is on the grid, as a button (the mouse and the keyboard alike), named by what it is.
  const card = page.getByRole("button", { name: new RegExp(`^Edit ${tag} Mathematics, ${armName}, ${tag}Ada Teacher, 08:00 to 09:00$`) });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Lab 2");
  await card.focus();
  await page.keyboard.press("Enter");

  // The form of a lesson opens with THAT lesson's values, not those of the first time the form was drawn.
  const edit = slotDialog(page, "Edit Timetable Slot");
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel("Class Arm")).toHaveValue(arm.id);
  await expect(edit.getByLabel("Subject")).toHaveValue(subject.id);
  await expect(edit.getByLabel("Teacher")).toHaveValue(teacher.id);
  await expect(edit.getByLabel("Room / Venue (optional)")).toHaveValue("Lab 2");
  await edit.getByLabel("Room / Venue (optional)").fill("Lab 3");
  await edit.getByRole("button", { name: "Update Slot" }).click();
  await expect(edit).toBeHidden();
  await expect(card).toContainText("Lab 3");
  expect((await db.timetableSlot.findFirstOrThrow({ where: { tenantId: school.id } })).room).toBe("Lab 3");

  // And the form of a NEW lesson opens blank again (room), not with the last lesson's values.
  await page.getByRole("button", { name: "Schedule Slot" }).click();
  await expect(slotDialog(page, "Schedule New Lesson Slot").getByLabel("Room / Venue (optional)")).toHaveValue("");
});

test("a notice can be addressed to a class arm, and the form opens blank each time", async ({ page }) => {
  const { admin, arm, armName } = await arrange();
  await signInThroughUi(page, admin.user);
  await page.goto(`/schools/${school.code}`);
  await page.getByRole("button", { name: "New Notice" }).click();
  const form = page.getByRole("dialog", { name: "Create Broadcast Notice" });
  await expect(form.getByLabel("Class Arm (Optional)").getByRole("option", { name: armName })).toHaveCount(1);
  await form.getByLabel("Announcement Title").fill("Form 1A trip");
  await form.getByLabel("Notice Content").fill("The trip to the museum is on Friday.");
  await form.getByLabel("Class Arm (Optional)").selectOption({ label: armName });
  const students = form.getByRole("button", { name: "Students" });
  await expect(students).toHaveAttribute("aria-pressed", "false");
  await students.click();
  await expect(students).toHaveAttribute("aria-pressed", "true");
  await checkBothThemes(page, "the notice form");
  await form.getByRole("button", { name: "Broadcast Notice" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText("Form 1A trip")).toBeVisible();

  const saved = await db.announcement.findFirstOrThrow({ where: { tenantId: school.id, title: "Form 1A trip" } });
  expect(saved).toMatchObject({ classArmId: arm.id, targetRoles: ["STUDENT"] });

  await page.getByRole("button", { name: "New Notice" }).click();
  const again = page.getByRole("dialog", { name: "Create Broadcast Notice" });
  await expect(again.getByLabel("Announcement Title")).toHaveValue("");
  await expect(again.getByLabel("Notice Content")).toHaveValue("");
  await expect(again.getByLabel("Class Arm (Optional)")).toHaveValue("");
});
