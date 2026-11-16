import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, family, forms, paperWork } from "../cast";
import { dialogOf, item, notice, openPage, signIn, signOut } from "./shared";

// C13 Paper work, and the pupil's side of Forms (task 0053, task 0025): the school administrator tries to save empty paper work (refused, with the reasons), makes paper work for JSS 1 whose closing time
// has passed (first refused without an opening time), opens its roll call, marks the pupil as having handed it in and finds her recorded as late. The pupil signs in and finds the paper work in her own list, handed in late, with the teacher's
// note, and the practice set of C12 open for her; no questionnaire is waiting for her (the staff one is not addressed to pupils). It ends signed in as the school administrator.

const chapter = "C13 Paper work";

const sections = (page: Page) => page.getByRole("tablist", { name: "Forms sections" });
const formTabs = (page: Page) => page.getByRole("tablist", { name: "Form sections" });
const myWorkTabs = (page: Page) => page.getByRole("tablist", { name: "My work sections" });
const rollCall = (page: Page) => page.getByRole("list", { name: "Roll call" });

export async function c13PaperWork(walk: Walk, page: Page): Promise<void> {
  const pupil = family.pupil;

  await walk.step(
    {
      id: 114,
      chapter,
      role: "School administrator",
      title: "Empty paper work is refused, and the form says what is missing",
      caption: "Paper work needs a title and at least one class. Saving the empty form changes nothing and lists what to add.",
      covers: ["FRM-11"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Forms");
      await walk.click(sections(page).getByRole("tab", { name: "Paper work" }));
      await expect(page.getByText("No paper work yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New paper work" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Create paper work" }));
      await expect(dialogOf(page).getByRole("alert")).toContainText("Give it a title.");
      await expect(dialogOf(page).getByRole("alert")).toContainText("Choose at least one class for the paper work.");
    },
  );

  await walk.step(
    {
      id: 115,
      chapter,
      role: "School administrator",
      title: "Make paper work for JSS 1 that opened and closed in September",
      caption:
        "Paper work names a class and may have an opening and a closing time; a paper handed in after the closing time is recorded as late. A closing time that has passed, with no opening time, is refused: it would close before it opened. The list says how many have handed it in.",
      covers: ["FRM-12"],
    },
    async () => {
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Title", { exact: true }), paperWork.title);
      await walk.type(d.getByLabel("Instructions", { exact: true }), paperWork.instructions);
      await walk.click(d.getByLabel(paperWork.klass, { exact: true }));
      // a date-and-time field has segments (month, day, year, hour, minute, AM or PM): a person clicks it, goes to the first segment and types the date, moves on with Tab and types the time
      const typeWhen = async (label: string, when: { date: string; time: string }) => {
        await walk.click(d.getByLabel(label, { exact: true }));
        for (let segment = 0; segment < when.date.length; segment++) await page.keyboard.press("ArrowLeft");
        await page.keyboard.type(when.date);
        await page.keyboard.press("Tab");
        await page.keyboard.type(when.time);
      };
      // a closing time in the past with no opening time would close it before it opened: refused in words, and nothing is saved
      await typeWhen("Closes", paperWork.closes);
      await walk.click(d.getByRole("button", { name: "Create paper work" }));
      await expect(d.getByRole("alert")).toContainText(paperWork.past);
      await typeWhen("Opens", paperWork.opens);
      await walk.click(d.getByRole("button", { name: "Create paper work" }));
      await expect(notice(page).filter({ hasText: "Paper work created." })).toBeVisible();
      await expect(item(page, paperWork.title)).toContainText(`Closes ${paperWork.closes.shown}`);
      await expect(item(page, paperWork.title)).toContainText("Opens 1 Sept 2026");
      await expect(item(page, paperWork.title)).toContainText(paperWork.klass);
    },
  );

  await walk.step(
    {
      id: 116,
      chapter,
      role: "School administrator",
      title: "The roll call lists the pupils of the class, none of them handed in yet",
      caption:
        "Opening the paper work shows its details and its roll call: each pupil of the class, with a status and a note, and how many have handed it in.",
      covers: ["FRM-13"],
    },
    async () => {
      await walk.click(item(page, paperWork.title).getByRole("link", { name: paperWork.title }));
      await expect(page.getByRole("heading", { level: 1, name: paperWork.title })).toBeVisible();
      await expect(formTabs(page).getByRole("tab")).toHaveText(["Overview", "Roll call"]);
      await walk.click(formTabs(page).getByRole("tab", { name: "Roll call" }));
      await expect(rollCall(page).getByRole("listitem").filter({ hasText: pupil.name })).toBeVisible();
      await expect(page.getByText(/0 of \d+ handed in · 0 late/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 117,
      chapter,
      role: "School administrator",
      title: "Mark the pupil as handed in, with a note: after the closing time she is recorded as late",
      caption:
        "Changes are collected and saved together. The status is chosen from Pending, Handed in and Late; a paper marked handed in after the closing time is recorded as late by the system, not by the teacher.",
      covers: ["FRM-14"],
    },
    async () => {
      const row = rollCall(page).getByRole("listitem").filter({ hasText: pupil.name });
      await walk.selectOption(row.getByLabel(`Status of ${pupil.name}`), "Handed in");
      await walk.type(row.getByLabel(`Note for ${pupil.name}`), paperWork.note);
      await walk.click(page.getByRole("button", { name: "Save changes (1)" }));
      await expect(notice(page).filter({ hasText: "1 change saved." })).toBeVisible();
      await expect(row.getByLabel(`Status of ${pupil.name}`)).toHaveValue("LATE");
      await expect(page.getByText(/1 of \d+ handed in · 1 late · 0 still to hand in/)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 118,
      chapter,
      role: "Pupil",
      title: "The pupil finds the paper work in her own list, handed in late, with the note",
      caption:
        "The pupil's Forms section has three lists: practice sets, questionnaires and paper work. Her paper work says it was handed in late and shows the teacher's note.",
      covers: ["FRM-15"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, pupil.account);
      await openPage(walk, page, "My work");
      await expect(myWorkTabs(page).getByRole("tab")).toHaveText(["Forms", "Practice", "Progress"]);
      await expect(page.getByRole("tablist", { name: "Forms sections" }).getByRole("tab")).toHaveText([
        "Practice sets",
        "Questionnaires",
        "Paper work",
      ]);
      await walk.click(page.getByRole("tablist", { name: "Forms sections" }).getByRole("tab", { name: "Paper work" }));
      await expect(item(page, paperWork.title)).toContainText("Handed in late");
      await expect(item(page, paperWork.title)).toContainText(paperWork.note);
      await expect(item(page, paperWork.title).getByRole("button", { name: /Request marking/ })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 119,
      chapter,
      role: "Pupil",
      title: "The practice set of her class is open for her, and no questionnaire is waiting",
      caption:
        "A practice set for JSS 1 is open for a pupil of JSS 1 and has not been started. The staff questionnaire was addressed to staff, so none is waiting for her.",
      covers: ["FRM-16"],
    },
    async () => {
      await walk.click(page.getByRole("tablist", { name: "Forms sections" }).getByRole("tab", { name: "Practice sets" }));
      await expect(item(page, forms.practice.title)).toContainText("Not started");
      await expect(item(page, forms.practice.title)).toContainText("2 questions");
      await expect(item(page, forms.practice.title)).toContainText("15 minutes");
      await walk.click(page.getByRole("tablist", { name: "Forms sections" }).getByRole("tab", { name: "Questionnaires" }));
      await expect(page.getByText("No questionnaires are waiting for you.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 120,
      chapter,
      role: "School administrator",
      title: "The paper work list now says how many have handed it in",
      caption:
        "Back as the administrator, the Paper work list shows the paper work with one of one pupils handed in, as the roll call left it.",
      covers: ["FRM-17"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Forms");
      await walk.click(sections(page).getByRole("tab", { name: "Paper work" }));
      await expect(item(page, paperWork.title)).toContainText("1 of 1 handed in");
    },
  );
}
