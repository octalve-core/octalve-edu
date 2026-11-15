import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics, cast, family } from "../cast";
import { dialogOf, field, item, notice, openPage, signIn, signOut } from "./shared";

// C07 Teaching and attendance (task 0053, task 0033 section 6.6): the school administrator says what the teacher teaches (Mathematics and English to JSS 1 A), schedules a lesson on the
// timetable and changes its room, and takes the roll of JSS 1 A. The teacher then signs in and is offered only the class they teach, takes the roll, and finds the setup pages readable but with no
// button that writes. It ends signed in as the school administrator.

const chapter = "C07 Teaching and attendance";

const sections = (page: Page) => page.getByRole("navigation", { name: "Academic setup sections" });
const peopleSections = (page: Page) => page.getByRole("navigation", { name: "People sections" });

export async function c07Teaching(walk: Walk, page: Page): Promise<void> {
  const { maths, english, group, session } = academics;
  const { pupil, teacherRecord } = family;
  const arm = `${group.name} ${group.arm}`;
  const card = (room: string) =>
    page
      .getByRole("button", { name: new RegExp(`^Edit ${maths.name}, ${arm}, ${teacherRecord.name}, 08:00 to 09:00$`) })
      .filter({ hasText: room });

  await walk.step(
    {
      id: 69,
      chapter,
      role: "School administrator",
      title: "Say what the teacher teaches",
      caption:
        "A teacher's page lists the subjects they teach, each for a class. The form says what is missing, and a person with subjects assigned cannot be archived until they are removed.",
      covers: ["TCH-01", "TCH-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "People");
      await walk.click(peopleSections(page).getByRole("link", { name: "Staff" }));
      await walk.click(item(page, teacherRecord.name).getByRole("link", { name: teacherRecord.name }));
      await expect(page.getByText("Nothing assigned yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add a subject" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(dialogOf(page).getByText("Choose a subject.")).toBeVisible();
      await expect(dialogOf(page).getByText("Choose a class.")).toBeVisible();
      await walk.selectOption(field(dialogOf(page), "Subject"), maths.name);
      await walk.selectOption(field(dialogOf(page), "Class"), arm);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(notice(page)).toContainText("Added.");
      await expect(item(page, maths.name)).toContainText(arm);
      await walk.click(page.getByRole("button", { name: "Add a subject" }));
      await walk.selectOption(field(dialogOf(page), "Subject"), english.name);
      await walk.selectOption(field(dialogOf(page), "Class"), arm);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(item(page, english.name)).toContainText(arm);
      await walk.click(page.getByRole("button", { name: `Archive ${teacherRecord.name}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Archive record" }));
      await expect(dialogOf(page).getByText("Subjects are still assigned to this person. Remove those first.")).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Cancel" }));
    },
  );

  await walk.step(
    {
      id: 70,
      chapter,
      role: "School administrator",
      title: "Schedule a lesson and change its room",
      caption:
        "The timetable's form offers the school's own classes, subjects and teachers. A lesson is a card on the week; opening it shows its own values, and a change shows on the card at once.",
      covers: ["TIM-01", "TIM-02"],
    },
    async () => {
      await openPage(walk, page, "Academics", "Academic setup");
      await walk.click(sections(page).getByRole("link", { name: "Timetable" }));
      await expect(page.getByRole("heading", { level: 2, name: "Weekly Timetable Schedule" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Schedule Slot" }));
      const form = page.getByRole("dialog", { name: "Schedule New Lesson Slot" });
      await walk.selectOption(form.getByLabel("Class Arm"), arm);
      await walk.selectOption(form.getByLabel("Subject"), `${maths.name} (${maths.shownCode})`);
      await walk.selectOption(form.getByLabel("Teacher"), teacherRecord.name);
      await walk.type(form.getByLabel("Room / Venue (optional)"), "Lab 2");
      await walk.click(form.getByRole("button", { name: "Schedule Slot" }));
      await expect(form).toBeHidden();
      await expect(card("Lab 2")).toBeVisible();
      await walk.click(card("Lab 2"));
      const edit = page.getByRole("dialog", { name: "Edit Timetable Slot" });
      await expect(edit.getByLabel("Room / Venue (optional)")).toHaveValue("Lab 2");
      await walk.type(edit.getByLabel("Room / Venue (optional)"), "Lab 3");
      await walk.click(edit.getByRole("button", { name: "Update Slot" }));
      await expect(edit).toBeHidden();
      await expect(card("Lab 3")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 71,
      chapter,
      role: "School administrator",
      title: "Take the roll of the class",
      caption:
        "The daily roll lists the pupils enrolled in the class arm. Mark All Present is one click; a pupil who is late is set by hand, and the roll is saved.",
      covers: ["ATT-01"],
    },
    async () => {
      await walk.click(sections(page).getByRole("link", { name: "Attendance" }));
      await expect(page.getByRole("heading", { level: 2, name: "Daily Attendance" })).toBeVisible();
      await expect(page.getByText(`${pupil.last}, ${pupil.first}`)).toBeVisible();
      await expect(page.getByText(/Admission: \d{4}\/0001/)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Mark All Present" }));
      await walk.click(page.getByRole("button", { name: "LATE" }));
      await walk.click(page.getByRole("button", { name: "Save Roll Call" }).first());
      await expect(page.getByText(/Attendance saved for/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 72,
      chapter,
      role: "Teacher",
      title: "The teacher takes the roll of their own class, and finds setup read-only",
      caption:
        "A teacher is offered only the classes they teach. They take the roll the same way. The other setup pages can be read, with no button that changes anything.",
      covers: ["LOG-01", "ATT-02", "ACA-14"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Academics", "Academic setup");
      await walk.click(sections(page).getByRole("link", { name: "Attendance" }));
      await expect(page.getByLabel("Class Arm").locator("option")).toHaveText([`${group.name} — ${group.arm}`]);
      await expect(page.getByText(`${pupil.last}, ${pupil.first}`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Mark All Present" }));
      await walk.click(page.getByRole("button", { name: "Save Roll Call" }).first());
      await expect(page.getByText(/Attendance saved for/)).toBeVisible();
      await walk.click(sections(page).getByRole("link", { name: "Sessions & terms" }));
      await expect(item(page, session.name)).toBeVisible();
      await expect(page.getByRole("button", { name: "New session" })).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
