import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics, cast, family, school } from "../cast";
import { dialogOf, field, item, notice, openPage } from "./shared";

// C05 People (task 0053, task 0033 section 6.6): the school administrator registers the people the school is about. A pupil and her brother (every form is first sent empty or wrong), the pupil's
// enrolment in the class made in C04, her father and mother as guardians (the first is the primary contact; one is removed again), the brother's parent picked from the register and not typed
// twice, a pupil archived and restored, and the teacher's staff record, linked to the account the teacher signed up with in C03. It ends signed in as the school administrator.

const chapter = "C05 People";

const sections = (page: Page) => page.getByRole("navigation", { name: "People sections" });
const section = (walk: Walk, page: Page, name: string) => walk.click(sections(page).getByRole("link", { name }));
const openPupil = (walk: Walk, page: Page, name: string) => walk.click(item(page, name).getByRole("link", { name }));

export async function c05People(walk: Walk, page: Page): Promise<void> {
  const { pupil, brother, father, mother, teacherRecord } = family;
  const arm = `${academics.group.name} ${academics.group.arm}`;

  await walk.step(
    {
      id: 48,
      chapter,
      role: "School administrator",
      title: "Open People",
      caption: "People has two lists, Students and Staff. A new school has no pupils yet, and the page says how to start.",
      covers: ["PPL-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "People");
      await expect(sections(page).getByRole("link")).toHaveText(["Students", "Staff"]);
      await expect(page.getByRole("heading", { level: 2, name: "Students" })).toBeVisible();
      await expect(page.getByText("No students yet. Add the first one, or import a file.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 49,
      chapter,
      role: "School administrator",
      title: "Register the first pupil",
      caption:
        "A pupil has a name and a date of birth. The form says what is missing beside each field, and the app gives the next admission number.",
      covers: ["PPL-02", "PPL-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add student" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Add student" }));
      await expect(dialogOf(page).getByText("Give the student's first name.")).toBeVisible();
      await expect(dialogOf(page).getByText("Give the student's last name.")).toBeVisible();
      await expect(dialogOf(page).getByText("Give the date of birth.")).toBeVisible();
      await walk.type(field(dialogOf(page), "First name"), pupil.first);
      await walk.type(field(dialogOf(page), "Last name"), pupil.last);
      await walk.type(field(dialogOf(page), "Date of birth"), pupil.dobTyped);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add student" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(notice(page)).toContainText(new RegExp(`Added ${pupil.name} \\(\\d{4}/0001\\)\\.`));
      await expect(item(page, pupil.name)).toBeVisible();
      await expect(page.getByText("1 student")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 50,
      chapter,
      role: "School administrator",
      title: "The same pupil twice is refused; her brother is registered",
      caption:
        "The same name and date of birth, in any capital letters, is refused in the form. A brother with another birthday is a new pupil.",
      covers: ["PPL-04", "PPL-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add student" }));
      await walk.type(field(dialogOf(page), "First name"), pupil.first.toLowerCase());
      await walk.type(field(dialogOf(page), "Last name"), pupil.last.toUpperCase());
      await walk.type(field(dialogOf(page), "Date of birth"), pupil.dobTyped);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add student" }));
      await expect(
        dialogOf(page)
          .getByText(/already exists/i)
          .first(),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByText("1 student")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add student" }));
      await walk.type(field(dialogOf(page), "First name"), brother.first);
      await walk.type(field(dialogOf(page), "Last name"), brother.last);
      await walk.type(field(dialogOf(page), "Date of birth"), brother.dobTyped);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add student" }));
      await expect(notice(page)).toContainText(new RegExp(`Added ${brother.name} \\(\\d{4}/0002\\)\\.`));
      await expect(page.getByText("2 students")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 51,
      chapter,
      role: "School administrator",
      title: "Search the list and filter it by class",
      caption:
        "The search finds a name or an admission number. The class filter includes 'Not in a class yet', which is where a new pupil starts.",
      covers: ["PPL-05"],
    },
    async () => {
      await walk.type(page.getByLabel("Search", { exact: true }), "bis");
      await expect(page.getByText("1 student", { exact: true })).toBeVisible();
      await expect(item(page, brother.name)).toBeVisible();
      await expect(item(page, pupil.name)).toHaveCount(0);
      await walk.type(page.getByLabel("Search", { exact: true }), "zzzz");
      await expect(page.getByText("No student matches these filters.")).toBeVisible();
      await walk.type(page.getByLabel("Search", { exact: true }), "");
      await walk.selectOption(page.getByLabel("Class", { exact: true }), "Not in a class yet");
      await expect(item(page, pupil.name)).toContainText("Not in a class");
      await walk.selectOption(page.getByLabel("Class", { exact: true }), "All students");
      await expect(page.getByText("2 students")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 52,
      chapter,
      role: "School administrator",
      title: "Enrol the pupil in a class",
      caption: "The pupil's page shows the record. Enrolling puts the pupil in a class arm for the open session; a class has to be chosen.",
      covers: ["PPL-06"],
    },
    async () => {
      await openPupil(walk, page, pupil.name);
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(pupil.name) })).toBeVisible();
      await expect(page.getByText("Not in a class yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Enrol in a class" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Enrol student" }));
      await expect(dialogOf(page).getByText("Choose a class.")).toBeVisible();
      await walk.selectOption(field(dialogOf(page), "Class"), arm);
      await walk.click(dialogOf(page).getByRole("button", { name: "Enrol student" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(notice(page)).toContainText("Enrolled.");
      await expect(item(page, arm)).toContainText("Enrolled");
      await expect(item(page, arm)).toContainText(academics.session.name);
    },
  );

  await walk.step(
    {
      id: 53,
      chapter,
      role: "School administrator",
      title: "Add the pupil's father as the primary contact",
      caption: "The first guardian added becomes the primary contact. A phone number that is too short is refused with the rule in words.",
      covers: ["PPL-07"],
    },
    async () => {
      await expect(page.getByText("No guardian recorded yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add guardian" }));
      await expect(dialogOf(page).getByText("The first guardian you add becomes the primary contact.")).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Add guardian" }));
      await expect(dialogOf(page).getByText("Give the guardian's first name.")).toBeVisible();
      await walk.type(field(dialogOf(page), "First name"), father.first);
      await walk.type(field(dialogOf(page), "Last name"), father.last);
      await walk.type(field(dialogOf(page), "Phone (optional)"), father.tooShortPhone);
      await walk.selectOption(field(dialogOf(page), "Relationship to the student"), "FATHER");
      await walk.click(dialogOf(page).getByRole("button", { name: "Add guardian" }));
      await expect(dialogOf(page).getByText("A phone number has 7 to 20 digits, spaces, + - or brackets.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Phone (optional)"), father.phone);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add guardian" }));
      await expect(notice(page)).toContainText("Guardian added.");
      await expect(item(page, father.name)).toContainText("Primary contact");
      await expect(item(page, father.name)).toContainText(`Father · ${father.phone}`);
    },
  );

  await walk.step(
    {
      id: 54,
      chapter,
      role: "School administrator",
      title: "Add the mother, then remove her again",
      caption:
        "A second guardian is not the primary contact unless chosen. Removing one asks first, and says whose guardian they stop being.",
      covers: ["PPL-08"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add guardian" }));
      await walk.type(field(dialogOf(page), "First name"), mother.first);
      await walk.type(field(dialogOf(page), "Last name"), mother.last);
      await walk.selectOption(field(dialogOf(page), "Relationship to the student"), "MOTHER");
      await walk.click(dialogOf(page).getByRole("button", { name: "Add guardian" }));
      await expect(notice(page)).toContainText("Guardian added.");
      await expect(item(page, mother.name)).toBeVisible();
      await expect(item(page, mother.name)).not.toContainText("Primary contact");
      await expect(item(page, father.name)).toContainText("Primary contact");
      await walk.click(page.getByRole("button", { name: `Remove ${mother.name}` }));
      await expect(dialogOf(page).getByText(new RegExp(`no longer ${pupil.name}'s guardian`))).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Remove guardian" }));
      await expect(notice(page)).toContainText("Guardian removed.");
      await expect(item(page, mother.name)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 55,
      chapter,
      role: "School administrator",
      title: "The brother's father is picked from the register",
      caption:
        "A parent of two pupils is one record, not two: the second pupil's form searches the register, and the parent's page says the record is shared.",
      covers: ["PPL-09"],
    },
    async () => {
      await openPage(walk, page, "People");
      await openPupil(walk, page, brother.name);
      await walk.click(page.getByRole("button", { name: "Add guardian" }));
      await walk.selectOption(field(dialogOf(page), "Who is it?"), "existing");
      await walk.type(field(dialogOf(page), "Search guardians"), "gben");
      await walk.selectOption(field(dialogOf(page), "Guardian"), `${father.name} · ${father.phone}`);
      await walk.selectOption(field(dialogOf(page), "Relationship to the student"), "FATHER");
      await walk.click(dialogOf(page).getByRole("button", { name: "Add guardian" }));
      await expect(notice(page)).toContainText("Guardian added.");
      await expect(item(page, father.name)).toContainText("Primary contact");
      await walk.click(page.getByRole("button", { name: `Edit ${father.name}` }));
      await expect(dialogOf(page).getByText(/shared with their other child/)).toBeVisible();
      await page.keyboard.press("Escape");
    },
  );

  await walk.step(
    {
      id: 56,
      chapter,
      role: "School administrator",
      title: "Archive a pupil and restore them",
      caption: "Archiving takes a pupil off the lists without deleting anything. Restoring brings the record back as it was.",
      covers: ["PPL-10"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Archive ${brother.name}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Archive student" }));
      await expect(notice(page)).toContainText("Archived.");
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(brother.name) }).getByText("Archived")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Restore ${brother.name}` }));
      await expect(notice(page)).toContainText("Restored.");
      await expect(page.getByRole("button", { name: `Archive ${brother.name}` })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 57,
      chapter,
      role: "School administrator",
      title: "Add the teacher's staff record",
      caption:
        "A staff record is a person on the school's books, with or without a sign-in. The form says what is missing, and a wrong email address is refused.",
      covers: ["PPL-11"],
    },
    async () => {
      await openPage(walk, page, "People");
      await section(walk, page, "Staff");
      await expect(page.getByText("No staff yet. Add the first member of staff.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add staff member" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Add staff member" }));
      await expect(dialogOf(page).getByText("Give their first name.")).toBeVisible();
      await expect(dialogOf(page).getByText("Give their last name.")).toBeVisible();
      await walk.type(field(dialogOf(page), "First name"), teacherRecord.first);
      await walk.type(field(dialogOf(page), "Last name"), teacherRecord.last);
      await walk.type(field(dialogOf(page), "Email (optional)"), "nope");
      await walk.click(dialogOf(page).getByRole("button", { name: "Add staff member" }));
      await expect(dialogOf(page).getByText("Give a valid email address.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Email (optional)"), cast.teacher.email);
      await walk.selectOption(field(dialogOf(page), "Campus"), school.campuses.north);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add staff member" }));
      await expect(notice(page)).toContainText(`Added ${teacherRecord.name}.`);
      await expect(item(page, teacherRecord.name)).toContainText("No sign-in");
      await expect(item(page, teacherRecord.name)).toContainText("Teaching");
      await expect(item(page, teacherRecord.name)).toContainText(school.campuses.north);
    },
  );

  await walk.step(
    {
      id: 58,
      chapter,
      role: "School administrator",
      title: "Link the staff record to the teacher's account",
      caption:
        "The teacher already has an account from C03. Linking joins it to the record; only accounts whose role fits are offered, and one has to be chosen.",
      covers: ["PPL-12"],
    },
    async () => {
      await walk.click(item(page, teacherRecord.name).getByRole("link", { name: teacherRecord.name }));
      await walk.click(page.getByRole("button", { name: `Link ${teacherRecord.name} to an existing account` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Link account" }));
      await expect(dialogOf(page).getByText("Choose who this record is.")).toBeVisible();
      await walk.selectOption(field(dialogOf(page), "Account"), `${cast.teacher.name} · ${cast.teacher.email}`);
      await walk.click(dialogOf(page).getByRole("button", { name: "Link account" }));
      await expect(notice(page)).toContainText("Account linked.");
      await expect(page.getByText(/Linked to/)).toContainText(cast.teacher.name);
      await expect(page.getByText("Can sign in")).toBeVisible();
    },
  );
}
