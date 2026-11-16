import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, forms } from "../cast";
import { dialogOf, item, notice, openPage, signIn, signOut } from "./shared";

// C12 Forms (task 0053, task 0025): the school administrator finds the five sections of Forms, tries to save an empty practice set (refused, with what is missing), writes a practice set of two
// questions for JSS 1, writes a questionnaire for the staff (a draft until it is published) and a public questionnaire (its link works only once it is published). A visitor answers the public
// questionnaire from the link and finds that this browser has answered; the administrator reads the results (an anonymous questionnaire with one answer shows only the count), closes the
// questionnaire and the link says it is not open for answers. A member of the non-teaching staff finds the staff questionnaire under "For you" and none of the writer's sections, and answers it; the
// administrator reads the answer in the results. It ends signed in as the school administrator.

const chapter = "C12 Forms";

const sections = (page: Page) => page.getByRole("tablist", { name: "Forms sections" });
const section = (page: Page, name: string) => sections(page).getByRole("tab", { name });
const question = (page: Page, n: number) => dialogOf(page).getByRole("group", { name: `Question ${n}` });

export async function c12Forms(walk: Walk, page: Page): Promise<void> {
  const { practice, staffSurvey, openDay } = forms;

  await walk.step(
    {
      id: 104,
      chapter,
      role: "School administrator",
      title: "The administrator finds the five sections of Forms",
      caption:
        "Practice sets, questionnaires and paper work are written here; Marking is for what pupils hand in; For you holds the questionnaires addressed to the signed-in person. A school with no forms says so.",
      covers: ["FRM-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Forms");
      await expect(sections(page).getByRole("tab")).toHaveText(["Practice sets", "Questionnaires", "Paper work", "Marking", "For you"]);
      await expect(section(page, "Practice sets")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("No practice sets yet.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 105,
      chapter,
      role: "School administrator",
      title: "An empty practice set is refused, and the form says what is missing",
      caption:
        "Saving a practice set with nothing in it changes nothing. The form lists what to add: a title and the words of the first question.",
      covers: ["FRM-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New practice set" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Create practice set" }));
      await expect(dialogOf(page).getByRole("alert")).toContainText("Give it a title.");
      await expect(dialogOf(page).getByRole("alert")).toContainText("Write the question for question 1.");
    },
  );

  await walk.step(
    {
      id: 106,
      chapter,
      role: "School administrator",
      title: "Write a practice set of two questions for JSS 1",
      caption:
        "A practice set has a title, instructions, the classes it is for, a time limit and questions with their correct answers and points. It is open as soon as it is made; the class and the window decide who can start it.",
      covers: ["FRM-03"],
    },
    async () => {
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Title", { exact: true }), practice.title);
      await walk.type(d.getByLabel("Instructions", { exact: true }), practice.instructions);
      await walk.click(d.getByLabel(practice.klass, { exact: true }));
      await walk.type(d.getByLabel("Time limit (minutes)"), practice.minutes);
      const one = question(page, 1);
      await walk.type(one.getByLabel("Question", { exact: true }), practice.single.prompt);
      await walk.click(one.getByRole("button", { name: "Add an option" }));
      await walk.click(one.getByRole("button", { name: "Add an option" }));
      for (const [i, text] of practice.single.options.entries()) {
        await walk.type(one.getByLabel(`Option ${"ABCD"[i]}`, { exact: true }), text);
      }
      await walk.click(one.getByLabel(practice.single.correct));
      await walk.type(one.getByLabel("Points", { exact: true }), practice.single.points);
      await walk.click(d.getByRole("button", { name: "Add a question" }));
      const two = question(page, 2);
      await walk.selectOption(two.getByLabel("Question type"), "True or false");
      await walk.type(two.getByLabel("Question", { exact: true }), practice.truth.prompt);
      await walk.click(d.getByRole("button", { name: "Create practice set" }));
      await expect(notice(page).filter({ hasText: "Practice set created." })).toBeVisible();
      await expect(item(page, practice.title)).toContainText("2 questions");
      await expect(item(page, practice.title)).toContainText("15 min limit");
      await expect(item(page, practice.title)).toContainText("0 responses");
    },
  );

  await walk.step(
    {
      id: 107,
      chapter,
      role: "School administrator",
      title: "Write a questionnaire for the staff: a draft until it is published",
      caption:
        "A questionnaire asks and has no right answer. It is addressed to roles (here the teachers and the non-teaching staff), it is saved as a draft, and nobody can answer it until it is published.",
      covers: ["FRM-04"],
    },
    async () => {
      await walk.click(section(page, "Questionnaires"));
      await expect(page.getByText("No questionnaires yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "New questionnaire" }));
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Title", { exact: true }), staffSurvey.title);
      await walk.type(d.getByLabel("Instructions", { exact: true }), staffSurvey.instructions);
      await walk.click(d.getByLabel("Teachers", { exact: true }));
      await walk.click(d.getByLabel("Non-teaching staff", { exact: true }));
      const one = question(page, 1);
      await walk.selectOption(one.getByLabel("Question type"), "Rating (1 to 5)");
      await walk.type(one.getByLabel("Question", { exact: true }), staffSurvey.rating);
      await walk.click(d.getByRole("button", { name: "Add a question" }));
      const two = question(page, 2);
      await walk.selectOption(two.getByLabel("Question type"), "Long answer");
      await walk.type(two.getByLabel("Question", { exact: true }), staffSurvey.text);
      await walk.click(d.getByRole("button", { name: "Save as draft" }));
      await expect(notice(page).filter({ hasText: "Questionnaire saved as a draft." })).toBeVisible();
      await expect(item(page, staffSurvey.title)).toContainText("Draft");
      await expect(item(page, staffSurvey.title)).toContainText("Members");
      await walk.click(item(page, staffSurvey.title).getByRole("button", { name: /^Publish/ }));
      await expect(notice(page).filter({ hasText: "Questionnaire published." })).toBeVisible();
      await expect(item(page, staffSurvey.title).getByRole("button", { name: /^Close/ })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 108,
      chapter,
      role: "School administrator",
      title: "A public questionnaire has a link, and the link works once it is published",
      caption:
        "Anyone with the link can answer a public questionnaire. It cannot tell who is answering, and says so. Until it is published the box says the link is not working yet.",
      covers: ["FRM-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New questionnaire" }));
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Title", { exact: true }), openDay.title);
      await walk.type(d.getByLabel("Instructions", { exact: true }), openDay.instructions);
      await walk.click(d.getByLabel("Anyone with the link"));
      await expect(d).toContainText("A public link cannot tell who is answering.");
      await walk.click(d.getByLabel("Anonymous", { exact: true }));
      await expect(d).toContainText("Nobody, including you, will be able to see who gave which answer.");
      const one = question(page, 1);
      await walk.type(one.getByLabel("Question", { exact: true }), openDay.single.prompt);
      await walk.click(one.getByRole("button", { name: "Add an option" }));
      for (const [i, text] of openDay.single.options.entries()) {
        await walk.type(one.getByLabel(`Option ${"ABC"[i]}`, { exact: true }), text);
      }
      await walk.click(d.getByRole("button", { name: "Add a question" }));
      const two = question(page, 2);
      await walk.selectOption(two.getByLabel("Question type"), "Long answer");
      await walk.type(two.getByLabel("Question", { exact: true }), openDay.text.prompt);
      await walk.click(d.getByRole("button", { name: "Save as draft" }));
      await expect(item(page, openDay.title)).toContainText("The link works once the questionnaire is published.");
      await expect(item(page, openDay.title)).toContainText("Anyone with the link · Anonymous");
      await walk.click(item(page, openDay.title).getByRole("button", { name: /^Publish/ }));
      await expect(item(page, openDay.title).locator("code")).toContainText("/q/");
    },
  );

  let link = "";
  await walk.step(
    {
      id: 109,
      chapter,
      role: "Visitor",
      title: "A visitor opens the link and answers, and this browser is told it has answered",
      caption:
        "The visitor sees only the questionnaire, with no name asked for. Sending the answers thanks them; opening the link again from the same browser says it has already been answered.",
      covers: ["FRM-06"],
    },
    async () => {
      link = (await item(page, openDay.title).locator("code").innerText()).trim();
      const tab = await walk.typedAddress(link);
      await expect(tab.getByRole("heading", { level: 1, name: openDay.title })).toBeVisible();
      await expect(tab.getByText("Your answers are sent without your name.")).toBeVisible();
      await walk.click(tab.getByRole("button", { name: "Send my answers" }));
      await expect(tab.getByRole("alert").filter({ hasText: "Answer at least one question." })).toBeVisible();
      await walk.click(tab.getByLabel(openDay.visitor.chose, { exact: true }));
      await walk.type(tab.getByLabel(openDay.text.prompt), openDay.visitor.wrote);
      await walk.click(tab.getByRole("button", { name: "Send my answers" }));
      await expect(tab.getByText("Thank you. Your answers were sent.")).toBeVisible();
      await walk.closeTypedAddress();
      const again = await walk.typedAddress(link);
      await expect(again.getByText("You have already answered this questionnaire from this browser. Thank you.")).toBeVisible();
      await walk.closeTypedAddress();
    },
  );

  await walk.step(
    {
      id: 110,
      chapter,
      role: "School administrator",
      title: "The results of an anonymous questionnaire hold the breakdown back until enough people have answered",
      caption:
        "With one answer a breakdown could point at the person who gave it, so the page shows the count and the questions and says when the breakdown will appear.",
      covers: ["FRM-07"],
    },
    async () => {
      await walk.click(item(page, openDay.title).getByRole("link", { name: openDay.title }));
      await expect(page.getByRole("heading", { level: 1, name: openDay.title })).toBeVisible();
      await expect(page.getByText("Answers so far")).toBeVisible();
      await walk.click(page.getByRole("tab", { name: "Results" }));
      await expect(page.getByText("1 answered · anonymous: names are not recorded")).toBeVisible();
      await expect(page.getByText(/It appears once \d+ people have answered\./)).toBeVisible();
      await expect(page.getByText(openDay.visitor.wrote)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 111,
      chapter,
      role: "School administrator",
      title: "Closing a questionnaire asks first, and its link then says it is closed",
      caption:
        "Closing asks whether to keep it open. Once closed nobody can answer it, and a visitor with the link is told that the questionnaire is not open for answers.",
      covers: ["FRM-08"],
    },
    async () => {
      await walk.click(page.getByRole("tab", { name: "Overview" }));
      await walk.click(page.getByRole("button", { name: "Close", exact: true }));
      await expect(dialogOf(page).getByRole("heading", { name: "Close this questionnaire?" })).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Keep it open" }));
      await expect(dialogOf(page)).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: "Close", exact: true }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Close it" }));
      await expect(notice(page).filter({ hasText: "Questionnaire closed." })).toBeVisible();
      const tab = await walk.typedAddress(link);
      await expect(tab.getByText("This questionnaire isn't open for answers.")).toBeVisible();
      await walk.closeTypedAddress();
    },
  );

  await walk.step(
    {
      id: 112,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff finds the staff questionnaire under For you, and no other section of Forms",
      caption:
        "Non-teaching staff do not write or mark forms. They are offered the questionnaires addressed to them, and answering one marks it answered.",
      covers: ["FRM-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Forms");
      await expect(sections(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 2, name: "For you" })).toBeVisible();
      await expect(item(page, staffSurvey.title)).toBeVisible();
      await expect(item(page, openDay.title)).toHaveCount(0);
      await walk.click(item(page, staffSurvey.title).getByRole("button", { name: /^Answer/ }));
      await walk.click(dialogOf(page).getByLabel(staffSurvey.answer.rating, { exact: true }));
      await walk.type(dialogOf(page).getByLabel(staffSurvey.text), staffSurvey.answer.wrote);
      await walk.click(dialogOf(page).getByRole("button", { name: /Send/ }));
      await expect(item(page, staffSurvey.title)).toContainText("Answered");
      await expect(item(page, staffSurvey.title).getByRole("button", { name: /^Answer/ })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 113,
      chapter,
      role: "School administrator",
      title: "The administrator reads what the staff answered",
      caption:
        "A questionnaire that is not anonymous shows its results at once: how many answered, the count for each rating, and the written answers, listed without names.",
      covers: ["FRM-10"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Forms");
      await walk.click(section(page, "Questionnaires"));
      await expect(item(page, staffSurvey.title)).toContainText("1 response");
      await walk.click(item(page, staffSurvey.title).getByRole("link", { name: staffSurvey.title }));
      await expect(page.getByRole("heading", { level: 1, name: staffSurvey.title })).toBeVisible();
      await walk.click(page.getByRole("tab", { name: "Results" }));
      await expect(page.getByText("1 answered", { exact: true })).toBeVisible();
      await expect(page.getByText(/It appears once/)).toHaveCount(0);
      await expect(page.getByText(staffSurvey.answer.wrote)).toBeVisible();
    },
  );
}
