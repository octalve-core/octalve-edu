import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, family, forms, marking } from "../cast";
import { dialogOf, item, notice, openPage, signIn, signOut } from "./shared";

// C14 A pupil takes practice sets, and a teacher marks by hand (task 0053, task 0025): the school administrator writes a second practice set with a short-answer question, which is marked by hand.
// The pupil takes the practice set of C12 (the clock runs, an empty attempt is refused, the machine marks it at once and shows what was right) and the new one (the score is "so far" until the
// teacher has marked). The administrator finds the attempt in the Marking section, is refused with no score and with a score above the question's points, marks it with feedback, and it leaves the
// queue. The pupil reads the final score and the feedback. The administrator reads the practice set's results. It ends signed in as the school administrator.

const chapter = "C14 Practice and marking";

const sections = (page: Page) => page.getByRole("tablist", { name: "Forms sections" });
const myWork = async (walk: Walk, page: Page) => {
  await openPage(walk, page, "My work");
  await expect(sections(page).getByRole("tab", { name: "Practice sets" })).toHaveAttribute("aria-selected", "true");
};
const question = (page: Page, n: number) => dialogOf(page).getByRole("group", { name: `Question ${n}` });
const attempt = (page: Page) => page.getByRole("region", { name: "Your attempt" });
const result = (page: Page) => page.getByRole("region", { name: "Your result" });
const answers = (scope: ReturnType<typeof result>) => scope.getByRole("list", { name: "Answers" }).getByRole("listitem");

export async function c14PracticeAndMarking(walk: Walk, page: Page): Promise<void> {
  const pupil = family.pupil;
  const { set } = marking;

  await walk.step(
    {
      id: 121,
      chapter,
      role: "School administrator",
      title: "Write a practice set with a short-answer question, which a teacher marks by hand",
      caption:
        "A short answer has a model answer to mark against, and is marked by hand: the machine marks the choice question and waits for the teacher on the other. The practice set's page gets a Marking tab.",
      covers: ["FRM-18"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Forms");
      await walk.click(sections(page).getByRole("tab", { name: "Practice sets" }));
      await walk.click(page.getByRole("button", { name: "New practice set" }));
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Title", { exact: true }), set.title);
      await walk.click(d.getByLabel(set.klass, { exact: true }));
      const one = question(page, 1);
      await walk.type(one.getByLabel("Question", { exact: true }), set.single.prompt);
      await walk.click(one.getByRole("button", { name: "Add an option" }));
      for (const [i, text] of set.single.options.entries()) {
        await walk.type(one.getByLabel(`Option ${"ABC"[i]}`, { exact: true }), text);
      }
      await walk.click(one.getByLabel(set.single.correct));
      await walk.click(d.getByRole("button", { name: "Add a question" }));
      const two = question(page, 2);
      await walk.selectOption(two.getByLabel("Question type"), "Short answer");
      await walk.type(two.getByLabel("Question", { exact: true }), set.short.prompt);
      await walk.type(two.getByLabel("Correct answer", { exact: true }), set.short.model);
      await walk.type(two.getByLabel("Points", { exact: true }), set.short.points);
      await walk.click(d.getByRole("button", { name: "Create practice set" }));
      await expect(notice(page).filter({ hasText: "Practice set created." })).toBeVisible();
      await walk.click(item(page, set.title).getByRole("link", { name: set.title }));
      await expect(page.getByRole("tablist", { name: "Form sections" }).getByRole("tab")).toHaveText([
        "Overview",
        "Questions",
        "Results",
        "Marking",
      ]);
    },
  );

  await walk.step(
    {
      id: 122,
      chapter,
      role: "Pupil",
      title: "The pupil starts a practice set: the clock runs, and an empty attempt is refused",
      caption:
        "Starting opens the questions on their own screen. A practice set with a time limit shows the time left, counted from the moment it was started. Submitting with nothing answered is refused.",
      covers: ["FRM-19"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, pupil.account);
      await myWork(walk, page);
      await walk.click(item(page, forms.practice.title).getByRole("button", { name: /^Start/ }));
      await expect(attempt(page).getByRole("timer")).toContainText("Time left: 1");
      await walk.click(attempt(page).getByRole("button", { name: "Submit" }));
      await expect(attempt(page).getByRole("alert")).toContainText("Answer at least one question.");
    },
  );

  await walk.step(
    {
      id: 123,
      chapter,
      role: "Pupil",
      title: "She answers, and the machine marks it at once",
      caption:
        "Every question of this practice set has one right answer, so the result is ready on submitting: the score, each answer with whether it was right, and its points.",
      covers: ["FRM-20"],
    },
    async () => {
      await walk.click(attempt(page).getByLabel(marking.pupil.multiplication, { exact: true }));
      await walk.click(attempt(page).getByLabel(marking.pupil.truth, { exact: true }));
      await walk.click(attempt(page).getByRole("button", { name: "Submit" }));
      await expect(result(page).getByText("Your score: 3 of 3")).toBeVisible();
      await expect(answers(result(page))).toHaveCount(2);
      await expect(answers(result(page)).first()).toContainText("Correct · Score: 2 of 2");
      await expect(answers(result(page)).last()).toContainText("Correct · Score: 1 of 1");
    },
  );

  await walk.step(
    {
      id: 124,
      chapter,
      role: "Pupil",
      title: "A practice set with a hand-marked answer gives a score so far",
      caption:
        "The finished practice set is listed as finished. In the second one the choice is marked at once and the short answer waits for the teacher: the score is called a score so far, and no answer key is shown for the answer that waits.",
      covers: ["FRM-21"],
    },
    async () => {
      await walk.click(result(page).getByRole("button", { name: "Back to practice sets" }));
      await expect(item(page, forms.practice.title)).toContainText("Finished");
      await walk.click(item(page, set.title).getByRole("button", { name: /^Start/ }));
      await expect(attempt(page).getByRole("timer")).toHaveCount(0);
      await walk.click(attempt(page).getByLabel(marking.pupil.city, { exact: true }));
      await walk.type(attempt(page).getByLabel(set.short.prompt), marking.pupil.capital);
      await walk.click(attempt(page).getByRole("button", { name: "Submit" }));
      await expect(result(page).getByText("Score so far: 1 of 3")).toBeVisible();
      await expect(result(page).getByText("Your teacher still has to mark 1 answer, so this may go up.")).toBeVisible();
      await expect(answers(result(page)).last()).toContainText("Waiting for your teacher to mark this answer.");
      await expect(answers(result(page)).last()).not.toContainText("Correct answer");
    },
  );

  await walk.step(
    {
      id: 125,
      chapter,
      role: "School administrator",
      title: "The attempt waits in Marking; no score, and a score above the points, are refused",
      caption:
        "The Marking section lists attempts with an answer to mark by hand. The machine's mark cannot be changed here; the short answer is shown beside its model answer. Saving with no score is refused, and so is a score above the question's points.",
      covers: ["FRM-22"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Forms");
      await walk.click(sections(page).getByRole("tab", { name: "Marking" }));
      await expect(item(page, pupil.name)).toContainText("Waiting");
      await expect(item(page, pupil.name)).toContainText("Score so far: 1 of 3");
      await expect(item(page, pupil.name)).toContainText("1 still to mark");
      await walk.click(item(page, pupil.name).getByRole("button", { name: /^Mark/ }));
      const d = dialogOf(page);
      await expect(d.getByText("Marked automatically: 1 of 1")).toBeVisible();
      await expect(d.getByText(`Model answer: ${set.short.model}`)).toBeVisible();
      await walk.click(d.getByRole("button", { name: "Save marks" }));
      await expect(d.getByRole("alert")).toContainText("Give at least one answer a score.");
      await walk.type(d.getByLabel("Score for question 2 (out of 2)"), marking.tooMany);
      await walk.click(d.getByRole("button", { name: "Save marks" }));
      await expect(d.getByRole("alert")).toContainText("The score for question 2 is from 0 to 2.");
    },
  );

  await walk.step(
    {
      id: 126,
      chapter,
      role: "School administrator",
      title: "Mark the answer with feedback: the attempt is finished and leaves the queue",
      caption:
        "With a score and a line of feedback the marks are saved, the total is said, and nothing is left waiting. Marked attempts stay under their own filter, where they can be reviewed.",
      covers: ["FRM-23"],
    },
    async () => {
      const d = dialogOf(page);
      await walk.type(d.getByLabel("Score for question 2 (out of 2)"), marking.score);
      await walk.type(d.getByLabel("Feedback for question 2 (optional)"), marking.feedback);
      await walk.click(d.getByRole("button", { name: "Save marks" }));
      await expect(notice(page).filter({ hasText: "Marks saved: 3 of 3." })).toBeVisible();
      await expect(page.getByText("Nothing is waiting for marking.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Show"), "Marked");
      await expect(item(page, pupil.name)).toContainText("Score: 3 of 3");
      await expect(item(page, pupil.name).getByRole("button", { name: /^Review/ })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 127,
      chapter,
      role: "Pupil",
      title: "The pupil reads her final score and what her teacher said",
      caption: "The score is no longer a score so far. The hand-marked answer shows its score and the teacher's feedback.",
      covers: ["FRM-24"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, pupil.account);
      await myWork(walk, page);
      await walk.click(item(page, set.title).getByRole("button", { name: /^See result/ }));
      await expect(result(page).getByText("Your score: 3 of 3")).toBeVisible();
      await expect(answers(result(page)).last()).toContainText("Score: 2 of 2");
      await expect(answers(result(page)).last()).toContainText(`Your teacher says: ${marking.feedback}`);
    },
  );

  await walk.step(
    {
      id: 128,
      chapter,
      role: "School administrator",
      title: "The practice set's results list who answered and their score",
      caption:
        "Back as the administrator, the practice set's Results tab lists each pupil who answered, whether they finished, and the score.",
      covers: ["FRM-25"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Forms");
      await expect(item(page, set.title)).toContainText("1 response");
      await walk.click(item(page, set.title).getByRole("link", { name: set.title }));
      await walk.click(page.getByRole("tablist", { name: "Form sections" }).getByRole("tab", { name: "Results" }));
      await expect(page.getByText("1 finished · 0 in progress")).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: pupil.name });
      await expect(row).toContainText("Finished");
      await expect(row).toContainText("3");
    },
  );
}
