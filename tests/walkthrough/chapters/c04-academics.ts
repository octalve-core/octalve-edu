import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics } from "../cast";
import { dialogOf, field, item, notice, openPage } from "./shared";

// C04 Academic setup (task 0053, task 0033 section 6.6): the school administrator sets up the school year and what it teaches, in the order the later chapters need: a session and its first term,
// next year's copy, a class with an arm, the subjects and which of them the class studies, an assessment scheme and a grade scale. Every form is first sent empty or wrong, so that what the screen
// says is shown, and a thing that cannot be archived is shown being refused in words. It ends signed in as the school administrator on the same page it started from.

const chapter = "C04 Academic setup";

const sections = (page: Page) => page.getByRole("navigation", { name: "Academic setup sections" });
const section = (walk: Walk, page: Page, name: string) => walk.click(sections(page).getByRole("link", { name }));

export async function c04Academics(walk: Walk, page: Page): Promise<void> {
  const { session, term, group, maths, english, drawing, scheme, scale } = academics;

  await walk.step(
    {
      id: 38,
      chapter,
      role: "School administrator",
      title: "Open Academic setup",
      caption: "Academic setup has eight sections. A new school has no school year yet, so the sessions list is empty and says so.",
      covers: ["ACA-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Academics", "Academic setup");
      await expect(sections(page).getByRole("link")).toHaveText([
        "Timetable",
        "Attendance",
        "LMS & Assignments",
        "Sessions & terms",
        "Classes & subjects",
        "Assessment",
        "Grading",
        "Promotion",
      ]);
      await section(walk, page, "Sessions & terms");
      await expect(page.getByText("No sessions yet.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 39,
      chapter,
      role: "School administrator",
      title: "Create the school year",
      caption:
        "A session is a name and its first and last day. An empty form, and a last day before the first, are refused in words beside the field.",
      covers: ["ACA-02", "ACA-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New session" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Create session" }));
      await expect(dialogOf(page).getByText("Give the session a name, such as 2026/2027.")).toBeVisible();
      await expect(dialogOf(page).getByText("Choose the first day.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Name"), session.name);
      await walk.type(field(dialogOf(page), "First day"), session.firstDay);
      await walk.type(field(dialogOf(page), "Last day"), session.wrongLastDay);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create session" }));
      await expect(dialogOf(page).getByText("The end must be after the start.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Last day"), session.lastDay);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create session" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(notice(page)).toContainText(`Saved ${session.name}.`);
      await expect(item(page, session.name)).toContainText("Planned");
      await expect(item(page, session.name)).toContainText("Whole school");
    },
  );

  await walk.step(
    {
      id: 40,
      chapter,
      role: "School administrator",
      title: "Open the session",
      caption: "A planned session becomes the school's active year when it is opened. Only one session is active at a time.",
      covers: ["ACA-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Open ${session.name}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Open session" }));
      await expect(notice(page)).toContainText(`${session.name} is now open`);
      await expect(item(page, session.name)).toContainText("Active");
    },
  );

  await walk.step(
    {
      id: 41,
      chapter,
      role: "School administrator",
      title: "Add a term and make it the current term",
      caption: "A session is divided into terms. The current term is the one attendance, fees and results refer to.",
      covers: ["ACA-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Terms of ${session.name}` }));
      await expect(page.getByRole("heading", { level: 2, name: `Terms of ${session.name}` })).toBeVisible();
      await expect(page.getByText("No terms yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add a term" }));
      await walk.type(field(dialogOf(page), "Name"), term.name);
      await walk.type(field(dialogOf(page), "First day"), term.firstDay);
      await walk.type(field(dialogOf(page), "Last day"), term.lastDay);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add term" }));
      await expect(notice(page)).toContainText("Saved the term.");
      await expect(item(page, term.name)).toContainText(term.shown);
      await walk.click(page.getByRole("button", { name: `Make ${term.name} the current term` }));
      await expect(notice(page)).toContainText(`${term.name} is now the current term.`);
      await expect(item(page, term.name)).toContainText("Current");
      await walk.click(page.getByRole("button", { name: "All sessions" }));
      await expect(item(page, session.name)).toContainText("1 term");
    },
  );

  await walk.step(
    {
      id: 42,
      chapter,
      role: "School administrator",
      title: "Copy the year for next year",
      caption:
        "The copy is previewed first: nothing is written until it is confirmed. A year that was already copied is refused, with the reason.",
      covers: ["ACA-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Copy ${session.name} to next year` }));
      await expect(dialogOf(page).getByRole("button", { name: "Create session" })).toBeDisabled();
      await walk.click(dialogOf(page).getByRole("button", { name: "Preview" }));
      await expect(dialogOf(page).getByText(session.copy, { exact: true })).toBeVisible();
      await expect(dialogOf(page).getByText("No clashes.")).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Create session" }));
      await expect(notice(page)).toContainText(`${session.copy} was created as a planned session.`);
      await walk.click(page.getByRole("button", { name: `Copy ${session.name} to next year` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Preview" }));
      await expect(dialogOf(page).getByText("This session has already been copied", { exact: false })).toBeVisible();
      await expect(dialogOf(page).getByRole("button", { name: "Create session" })).toBeDisabled();
      await page.keyboard.press("Escape");
    },
  );

  await walk.step(
    {
      id: 43,
      chapter,
      role: "School administrator",
      title: "Create a class and give it an arm",
      caption:
        "A class is a level such as JSS 1; an arm is one group of it, with an optional capacity. A second arm with the same name is refused.",
      covers: ["ACA-07"],
    },
    async () => {
      await section(walk, page, "Classes & subjects");
      await expect(page.getByText("No classes yet.")).toBeVisible();
      await expect(page.getByText("No subjects yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New class" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Create class" }));
      await expect(dialogOf(page).getByText("Give the class a name, such as JSS 1.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Name"), group.name);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create class" }));
      await expect(notice(page)).toContainText(`Saved ${group.name}.`);
      await walk.click(page.getByRole("button", { name: `Add an arm to ${group.name}` }));
      await walk.type(field(dialogOf(page), "Name"), group.arm);
      await walk.type(field(dialogOf(page), "Capacity (optional)"), group.capacity);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add arm" }));
      await expect(notice(page)).toContainText(`Saved arm ${group.arm} of ${group.name}.`);
      await walk.click(page.getByRole("button", { name: `Add an arm to ${group.name}` }));
      await walk.type(field(dialogOf(page), "Name"), group.arm);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add arm" }));
      await expect(dialogOf(page).getByText("That name is already used here.")).toBeVisible();
      await page.keyboard.press("Escape");
    },
  );

  await walk.step(
    {
      id: 44,
      chapter,
      role: "School administrator",
      title: "Create subjects and choose what the class studies",
      caption: "Subjects belong to the school; each class chooses the ones it studies. A subject nobody studies can be archived at once.",
      covers: ["ACA-08", "ACA-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New subject" }));
      await walk.type(field(dialogOf(page), "Name"), maths.name);
      await walk.type(field(dialogOf(page), "Short code (optional)"), maths.code);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create subject" }));
      await expect(notice(page)).toContainText(`Saved ${maths.name}.`);
      await expect(item(page, maths.name)).toContainText(maths.shownCode);
      await walk.click(page.getByRole("button", { name: "New subject" }));
      await walk.type(field(dialogOf(page), "Name"), english.name);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create subject" }));
      await expect(item(page, english.name)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New subject" }));
      await walk.type(field(dialogOf(page), "Name"), drawing.name);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create subject" }));
      await expect(item(page, drawing.name)).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Archive ${drawing.name}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Archive subject" }));
      await expect(item(page, drawing.name)).toHaveCount(0);

      await walk.click(page.getByRole("button", { name: `Subjects of ${group.name}` }));
      await walk.click(dialogOf(page).getByLabel(`${maths.name} (${maths.shownCode})`));
      await walk.click(dialogOf(page).getByLabel(english.name, { exact: true }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Save subjects" }));
      await expect(notice(page)).toContainText(`Saved the subjects of ${group.name}.`);
    },
  );

  await walk.step(
    {
      id: 45,
      chapter,
      role: "School administrator",
      title: "A subject or a class in use cannot be archived",
      caption: "Archiving is refused, in words, while something depends on it: a class that studies the subject, or arms in the class.",
      covers: ["ACA-10"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Archive ${maths.name}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Archive subject" }));
      await expect(dialogOf(page).getByRole("alert")).toContainText("A class still studies this subject");
      await page.keyboard.press("Escape");
      await walk.click(page.getByRole("button", { name: `Archive ${group.name}`, exact: true }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Archive class" }));
      await expect(dialogOf(page).getByRole("alert")).toContainText("This class still has arms");
      await page.keyboard.press("Escape");
    },
  );

  await walk.step(
    {
      id: 46,
      chapter,
      role: "School administrator",
      title: "Create the assessment scheme",
      caption:
        "A scheme says how a subject's mark is made: components plus the exam. The form shows the total as it is typed, and it has to be 100.",
      covers: ["ACA-11", "ACA-12"],
    },
    async () => {
      await section(walk, page, "Assessment");
      await expect(page.getByText("No assessment scheme yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New scheme" }));
      await walk.type(field(dialogOf(page), "Name"), scheme.name);
      await walk.type(field(dialogOf(page), "Exam mark"), scheme.exam);
      await walk.type(field(dialogOf(page), "Component 1 name"), scheme.component);
      await walk.type(field(dialogOf(page), "Component 1 maximum"), scheme.tooSmall);
      await expect(dialogOf(page).getByText(/add up to\s*90\s*of\s*100/)).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Create scheme" }));
      await expect(dialogOf(page).getByText(/add up to 90, not the total/)).toBeVisible();
      await walk.type(field(dialogOf(page), "Component 1 maximum"), scheme.right);
      await expect(dialogOf(page).getByText(/that matches/)).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Create scheme" }));
      await expect(notice(page)).toContainText(`Saved ${scheme.name}.`);
      await expect(item(page, scheme.name)).toContainText("School default");
      await expect(item(page, scheme.name)).toContainText("Not used yet");
      await expect(item(page, scheme.name)).toContainText(scheme.component);
    },
  );

  await walk.step(
    {
      id: 47,
      chapter,
      role: "School administrator",
      title: "Create the grade scale",
      caption:
        "A grade scale turns a mark into a letter and a remark. One click fills in the usual A to F; the bands must cover 0 to 100 with no gap.",
      covers: ["ACA-13"],
    },
    async () => {
      await section(walk, page, "Grading");
      await expect(page.getByText("No grade scale yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New scale" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Create scale" }));
      await expect(dialogOf(page).getByText("Give the scale a name, such as Standard A–F.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Name"), scale);
      await walk.click(dialogOf(page).getByRole("button", { name: "Fill in a standard A–F scale" }));
      await expect(field(dialogOf(page), "Band 1 letter")).toHaveValue("A");
      await walk.click(dialogOf(page).getByRole("button", { name: "Create scale" }));
      await expect(notice(page)).toContainText(`Saved ${scale}.`);
      await expect(item(page, scale)).toContainText("Default");
      await expect(
        item(page, scale)
          .getByRole("table", { name: `Bands of ${scale}` })
          .getByRole("row"),
      ).toHaveCount(7);
      await expect(item(page, scale).getByRole("button", { name: `Archive ${scale}` })).toHaveCount(0);
    },
  );
}
