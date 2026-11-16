import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, questions } from "../cast";
import { dialogOf, field, openPage, signIn, signOut } from "./shared";

// C11 Question bank (task 0053, task 0033 section 6.6): a teacher writes three questions (one correct answer, true or false, a short answer; an empty form is refused with its reasons), edits one and
// sends all three for review. The school administrator, who reviews, opens the Review queue, approves one and sends one back with a reason (an empty reason is refused). The teacher then finds each
// question in the state the reviewer left it, narrows the list by state, and reads the reason. It ends signed in as the school administrator.

const chapter = "C11 Question bank";

const sections = (page: Page) => page.getByRole("tablist", { name: "Question bank sections" });
const section = (page: Page, name: string) => sections(page).getByRole("tab", { name });
const row = (page: Page, text: string) => page.getByRole("button").filter({ hasText: text });

export async function c11QuestionBank(walk: Walk, page: Page): Promise<void> {
  const { mcq, truth, short, reason } = questions;

  // Writes one question of the kind the form is on and saves it as a draft; the form then stays open (a saved question can take pictures) and is closed with the Close button at its foot (the dialog has a second one, the cross at its head).
  const finish = async (saved: RegExp) => {
    await walk.click(dialogOf(page).getByRole("button", { name: "Save as a draft" }));
    await expect(page.getByText(saved)).toBeVisible();
    await walk.click(dialogOf(page).getByRole("button", { name: "Close", exact: true }).last());
    await expect(dialogOf(page)).toHaveCount(0);
  };
  const open = async (text: string) => {
    await walk.click(row(page, text));
    await expect(dialogOf(page).getByRole("heading", { name: "Question", level: 2 })).toBeVisible();
  };

  await walk.step(
    {
      id: 96,
      chapter,
      role: "Teacher",
      title: "A teacher finds the question bank, with no review sections",
      caption:
        "Browse lists the approved questions; My questions lists what the teacher wrote, in every state; My reports lists problems the teacher reported. The sections for reviewers and administrators are not offered.",
      covers: ["QBK-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await expect(sections(page).getByRole("tab")).toHaveText(["Browse", "My questions", "My reports"]);
      await expect(section(page, "Browse")).toHaveAttribute("aria-selected", "true");
    },
  );

  await walk.step(
    {
      id: 97,
      chapter,
      role: "Teacher",
      title: "Write a question: an empty form is refused, and the form lists what is missing",
      caption:
        "A question needs its words and its options. Saving the empty form changes nothing and lists what is missing, so the writer knows what to add.",
      covers: ["QBK-02"],
    },
    async () => {
      await walk.click(section(page, "My questions"));
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Save as a draft" }));
      await expect(dialogOf(page).getByRole("alert")).toContainText("The question is required.");
      await expect(dialogOf(page).getByRole("alert")).toContainText("A question needs at least 2 options.");
    },
  );

  await walk.step(
    {
      id: 98,
      chapter,
      role: "Teacher",
      title: "Write a question with one correct answer and save it as a draft",
      caption:
        "With the question, its options, the one correct option, an explanation, points, difficulty, topic, subject and class, it is saved as a draft that only its writer can see.",
      covers: ["QBK-03"],
    },
    async () => {
      await walk.type(field(dialogOf(page), "Question"), mcq.prompt);
      // The form opens with two options; the others are added one at a time.
      const [first, second, ...more] = mcq.options;
      await walk.type(field(dialogOf(page), "Option 1"), first);
      await walk.type(field(dialogOf(page), "Option 2"), second);
      for (const [offset, text] of more.entries()) {
        await walk.click(dialogOf(page).getByRole("button", { name: "Add an option" }));
        await walk.type(field(dialogOf(page), `Option ${offset + 3}`), text);
      }
      await walk.click(dialogOf(page).getByLabel(`Option ${mcq.correctOption} is correct`));
      await walk.type(field(dialogOf(page), "Explanation (optional)"), mcq.explanation);
      await walk.type(field(dialogOf(page), "Points"), mcq.points);
      await walk.selectOption(field(dialogOf(page), "Difficulty (optional)"), mcq.difficulty);
      await walk.type(field(dialogOf(page), "Topic (optional)"), mcq.topic);
      await walk.type(field(dialogOf(page), "Subject"), mcq.subject);
      await walk.type(field(dialogOf(page), "Classes"), mcq.klass);
      await page.keyboard.press("Enter");
      await expect(dialogOf(page).getByRole("list", { name: "Classes chosen" })).toContainText(mcq.klass);
      await finish(/Saved as a draft/);
      await expect(row(page, mcq.prompt)).toContainText("Draft · One correct answer");
    },
  );

  await walk.step(
    {
      id: 99,
      chapter,
      role: "Teacher",
      title: "Write a true-or-false question and a short-answer question",
      caption:
        "A true-or-false question has one answer. A short-answer question lists every answer it accepts, and a pupil is right if theirs matches any of them.",
      covers: ["QBK-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      await walk.selectOption(field(dialogOf(page), "Kind of question"), "True or false");
      await walk.type(field(dialogOf(page), "Question"), truth.prompt);
      await walk.click(dialogOf(page).getByLabel(truth.answer, { exact: true }));
      await walk.type(field(dialogOf(page), "Subject"), truth.subject);
      await walk.type(field(dialogOf(page), "Classes"), truth.klass);
      await page.keyboard.press("Enter");
      await finish(/Saved as a draft/);
      await walk.click(page.getByRole("button", { name: "Write a question" }));
      await walk.selectOption(field(dialogOf(page), "Kind of question"), "Short answer");
      await walk.type(field(dialogOf(page), "Question"), short.prompt);
      await walk.type(field(dialogOf(page), "Accepted answer 1"), short.accepted[0]);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add another accepted answer" }));
      await walk.type(field(dialogOf(page), "Accepted answer 2"), short.accepted[1]);
      await walk.type(field(dialogOf(page), "Subject"), short.subject);
      await walk.type(field(dialogOf(page), "Classes"), short.klass);
      await page.keyboard.press("Enter");
      await finish(/Saved as a draft/);
      await expect(row(page, truth.prompt)).toContainText("Draft · True or false");
      await expect(row(page, short.prompt)).toContainText("Draft · Short answer");
    },
  );

  await walk.step(
    {
      id: 100,
      chapter,
      role: "Teacher",
      title: "Change a draft and send the three questions for review",
      caption:
        "A draft can still be changed. Send for review puts it in the reviewers' queue; from then on it waits for a decision and the writer sees it as Waiting for review.",
      covers: ["QBK-05"],
    },
    async () => {
      await open(mcq.prompt);
      await walk.click(dialogOf(page).getByRole("button", { name: "Edit", exact: true }));
      await walk.type(field(dialogOf(page), "Points"), mcq.editedPoints);
      await walk.click(dialogOf(page).getByRole("button", { name: "Save changes" }));
      await expect(page.getByText("Saved.")).toBeVisible();
      await expect(dialogOf(page)).toHaveCount(0);
      for (const prompt of [mcq.prompt, truth.prompt, short.prompt]) {
        await open(prompt);
        await walk.click(dialogOf(page).getByRole("button", { name: "Send for review" }));
        await expect(page.getByText("Sent for review. A reviewer will look at it.")).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialogOf(page)).toHaveCount(0);
        await expect(row(page, prompt)).toContainText("Waiting for review");
      }
    },
  );

  await walk.step(
    {
      id: 101,
      chapter,
      role: "School administrator",
      title: "The reviewer finds the queue and approves a question",
      caption:
        "The school's administrator reviews. The Review queue lists the questions waiting for a decision, the oldest first. Approving asks the reviewer to confirm the subject and the classes.",
      covers: ["QBK-06", "QBK-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Question bank");
      await expect(sections(page).getByRole("tab")).toHaveText([
        "Browse",
        "My questions",
        "My reports",
        "Review queue",
        "Reports",
        "Print log",
        "Reviewers",
        "Settings",
      ]);
      await walk.click(section(page, "Review queue"));
      await expect(row(page, mcq.prompt)).toBeVisible();
      await expect(row(page, truth.prompt)).toBeVisible();
      await expect(row(page, short.prompt)).toBeVisible();
      await open(mcq.prompt);
      await walk.click(dialogOf(page).getByRole("button", { name: "Approve", exact: true }));
      await expect(dialogOf(page).getByRole("heading", { name: "Approve this question" })).toBeVisible();
      await expect(field(dialogOf(page), "Subject")).toHaveValue(mcq.subject);
      await walk.click(dialogOf(page).getByRole("button", { name: "Approve", exact: true }).last());
      await expect(row(page, mcq.prompt)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 102,
      chapter,
      role: "School administrator",
      title: "Send a question back: a reason is required",
      caption:
        "A question that is not right is sent back with a reason. The reviewer cannot send it back without one. The writer will read the reason.",
      covers: ["QBK-07"],
    },
    async () => {
      // The approved question is still open from the step before.
      await page.keyboard.press("Escape");
      await expect(dialogOf(page)).toHaveCount(0);
      await open(truth.prompt);
      await walk.click(dialogOf(page).getByRole("button", { name: "Send back", exact: true }));
      await expect(dialogOf(page).getByRole("heading", { name: "Send this question back?" })).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Send back", exact: true }).last());
      await expect(dialogOf(page).getByText("Give a reason.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Reason"), reason);
      await walk.click(dialogOf(page).getByRole("button", { name: "Send back", exact: true }).last());
      await expect(page.getByRole("dialog", { name: "Send this question back?" })).toHaveCount(0);
      const detail = page.getByRole("dialog", { name: "Question", exact: true });
      await expect(detail).toContainText("Sent back");
      await expect(detail).toContainText(reason);
    },
  );

  await walk.step(
    {
      id: 103,
      chapter,
      role: "Teacher",
      title: "The teacher finds each question in the state the reviewer left it, and reads the reason",
      caption:
        "My questions shows each question's state: approved, sent back, or still waiting. The list can be narrowed by state. Opening the question that was sent back shows the reviewer's reason.",
      covers: ["QBK-08"],
    },
    async () => {
      // The question that was sent back is still open from the step before.
      await page.keyboard.press("Escape");
      await expect(dialogOf(page)).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Question bank");
      await walk.click(section(page, "My questions"));
      await expect(row(page, mcq.prompt)).toContainText("Approved");
      await expect(row(page, truth.prompt)).toContainText("Sent back");
      await expect(row(page, short.prompt)).toContainText("Waiting for review");
      await walk.selectOption(page.getByLabel("State", { exact: true }), "Sent back");
      await expect(row(page, truth.prompt)).toBeVisible();
      await expect(row(page, mcq.prompt)).toHaveCount(0);
      await open(truth.prompt);
      await expect(dialogOf(page)).toContainText(reason);
      await page.keyboard.press("Escape");
      await expect(dialogOf(page)).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
