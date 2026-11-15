import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { academics, cast, family, marks } from "../cast";
import { dialogOf, field, openPage, signIn, signOut } from "./shared";

// C08 Results (task 0053, task 0033 section 6.6): the teacher enters the marks of JSS 1 A from the scheme's parts (a half-filled row and a mark above its maximum stop the save), saves them as drafts and
// sends them for review, for Mathematics and for English. The school administrator reviews: approves one, returns the other with a reason (a reason is required) and publishes the approved one; the report
// card shows the published mark. A member of the non-teaching staff and a campus administrator then show who may look and who may approve. It ends signed in as the school administrator.

const chapter = "C08 Results";

const tabs = (page: Page) => page.getByRole("navigation", { name: "Results sections" });
const sheet = (page: Page, subject: string) => page.getByRole("region", { name: `Marks for ${subject}` });
const review = (page: Page) => page.getByRole("region", { name: "Marks to review" });
const saveButton = (page: Page) => page.getByRole("button", { name: "Save marks", exact: true });
const approveButton = (page: Page) => page.getByRole("button", { name: "Approve", exact: true });
const statusNotice = (page: Page, words: string) => page.getByRole("status").filter({ hasText: words });

export async function c08Results(walk: Walk, page: Page): Promise<void> {
  const { maths, english, scheme, term, group } = academics;
  const { pupil } = family;
  const arm = `${group.name} ${group.arm}`;

  await walk.step(
    {
      id: 73,
      chapter,
      role: "Teacher",
      title: "The teacher enters the Mathematics marks",
      caption:
        "The sheet has one column for each part of the school's scheme. A half-filled row, or a mark above its part's maximum, says why and stops the save. A saved mark is a draft.",
      covers: ["LOG-01", "RES-01", "RES-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await openPage(walk, page, "Results");
      await expect(page.getByRole("heading", { level: 2, name: "Enter marks" })).toBeVisible();
      await walk.selectOption(page.getByLabel("Subject"), maths.name);
      await expect(sheet(page, maths.name)).toBeVisible();
      await expect(sheet(page, maths.name).getByRole("columnheader", { name: `${scheme.component} /${scheme.right}` })).toBeVisible();
      await expect(sheet(page, maths.name).getByRole("columnheader", { name: `Exam /${scheme.exam}` })).toBeVisible();
      const row = sheet(page, maths.name).getByRole("row").filter({ hasText: pupil.name });
      await expect(row).toContainText("Not entered");
      await expect(saveButton(page)).toBeDisabled();
      await walk.type(row.getByLabel(`${scheme.component} for ${pupil.name}`), marks.maths.ca);
      await expect(row).toContainText("Fill every part, or leave this pupil blank.");
      await walk.type(row.getByLabel(`Exam for ${pupil.name}`), marks.maths.examTooHigh);
      await expect(row).toContainText(`At most ${scheme.exam}.`);
      await expect(saveButton(page)).toBeDisabled();
      await walk.type(row.getByLabel(`Exam for ${pupil.name}`), marks.maths.exam);
      await expect(row).not.toContainText("At most");
      await expect(row.getByRole("cell").nth(2)).toHaveText(marks.maths.total);
      await walk.click(saveButton(page));
      await expect(statusNotice(page, "Saved the marks of 1 pupil.")).toBeVisible();
      await expect(row).toContainText("Draft");
    },
  );

  await walk.step(
    {
      id: 74,
      chapter,
      role: "Teacher",
      title: "Send the marks for review",
      caption:
        "Sending moves the marks from draft to submitted, and the row can no longer be typed into. The teacher does the same for English.",
      covers: ["RES-03"],
    },
    async () => {
      const row = sheet(page, maths.name).getByRole("row").filter({ hasText: pupil.name });
      await walk.click(page.getByRole("button", { name: "Send 1 saved for review", exact: true }));
      await expect(statusNotice(page, "Sent 1 saved mark for review.")).toBeVisible();
      await expect(row).toContainText("Submitted");
      await expect(row.getByLabel(`${scheme.component} for ${pupil.name}`)).toBeDisabled();
      await walk.selectOption(page.getByLabel("Subject"), english.name);
      const englishRow = sheet(page, english.name).getByRole("row").filter({ hasText: pupil.name });
      await walk.type(englishRow.getByLabel(`${scheme.component} for ${pupil.name}`), marks.english.ca);
      await walk.type(englishRow.getByLabel(`Exam for ${pupil.name}`), marks.english.exam);
      await walk.click(saveButton(page));
      await expect(statusNotice(page, "Saved the marks of 1 pupil.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Send 1 saved for review", exact: true }));
      await expect(englishRow).toContainText("Submitted");
    },
  );

  await walk.step(
    {
      id: 75,
      chapter,
      role: "School administrator",
      title: "Approve one mark, return the other, publish the approved one",
      caption:
        "The administrator reviews what was sent. Approving moves a mark on; returning needs a reason, and the dialog will not send without one. An approved mark is published from its own filter.",
      covers: ["LOG-01", "RES-04", "RES-05", "RES-06"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await openPage(walk, page, "Results");
      await walk.click(tabs(page).getByRole("link", { name: "Review" }));
      await expect(review(page)).toContainText(pupil.name);
      await expect(approveButton(page)).toBeDisabled();
      await walk.click(review(page).getByLabel(`Select ${maths.name} for ${pupil.name}`));
      await expect(statusNotice(page, "1 of 2 selected")).toBeVisible();
      await walk.click(approveButton(page));
      await expect(statusNotice(page, "1 mark moved to approved.")).toBeVisible();
      await walk.click(review(page).getByLabel(`Select ${english.name} for ${pupil.name}`));
      await walk.click(page.getByRole("button", { name: "Return to author", exact: true }));
      await expect(dialogOf(page).getByRole("button", { name: "Return", exact: true })).toBeDisabled();
      await walk.type(field(dialogOf(page), "Reason"), marks.returnReason);
      await walk.click(dialogOf(page).getByRole("button", { name: "Return", exact: true }));
      await expect(statusNotice(page, "1 mark moved to draft.")).toBeVisible();
      await walk.selectOption(page.getByLabel("Status"), "APPROVED");
      await walk.click(review(page).getByLabel(`Select ${maths.name} for ${pupil.name}`));
      await walk.click(page.getByRole("button", { name: "Publish", exact: true }));
      await expect(statusNotice(page, "1 mark moved to published.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 76,
      chapter,
      role: "School administrator",
      title: "Read the report card",
      caption:
        "The class list shows how many subjects of each pupil are published. The card shows the published mark with its total and the class.",
      covers: ["RES-07"],
    },
    async () => {
      await walk.click(tabs(page).getByRole("link", { name: "Cards" }));
      const list = page.getByRole("region", { name: "Pupils of the class" });
      await expect(list.getByRole("row").filter({ hasText: pupil.name })).toContainText(/\d of \d/);
      await walk.click(list.getByRole("button", { name: `Open the report card of ${pupil.name}` }));
      const card = page.getByRole("article", { name: `Report card of ${pupil.name}` });
      await expect(card).toContainText(term.name);
      await expect(card).toContainText(maths.name);
      await expect(card).toContainText(`${marks.maths.total} / 100`);
      await expect(card).toContainText(arm);
      await walk.click(page.getByRole("button", { name: "Back to the class", exact: true }));
      await expect(list).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 77,
      chapter,
      role: "Non-teaching staff",
      title: "A member of the non-teaching staff reads and reviews but cannot approve",
      caption: "The Marks tab is the teachers'. The Review tab is the first one offered, and it has no Approve button.",
      covers: ["LOG-01", "RES-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await openPage(walk, page, "Results");
      await expect(tabs(page).getByRole("link", { name: "Marks" })).toHaveCount(0);
      await expect(tabs(page).getByRole("link", { name: "Review" })).toHaveAttribute("aria-current", "page");
      await expect(approveButton(page)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 78,
      chapter,
      role: "Campus administrator",
      title: "A campus administrator sees all three tabs but cannot approve",
      caption:
        "Approving is a permission the school administrator grants; without it the campus administrator enters and sends marks and has no Approve button.",
      covers: ["LOG-01", "RES-09"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.campusAdmin);
      await openPage(walk, page, "Results");
      await expect(tabs(page).getByRole("link", { name: "Marks" })).toBeVisible();
      await expect(tabs(page).getByRole("link", { name: "Review" })).toBeVisible();
      await expect(tabs(page).getByRole("link", { name: "Cards" })).toBeVisible();
      await walk.click(tabs(page).getByRole("link", { name: "Review" }));
      await expect(approveButton(page)).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
