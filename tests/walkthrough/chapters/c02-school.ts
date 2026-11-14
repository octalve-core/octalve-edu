import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, cast, school } from "../cast";
import { mainNav } from "./shared";

// C02 The school (task 0053, task 0033 section 6.6): the school administrator reads the overview of a school that has no campus yet, opens Settings, adds two campuses by typing (the same name
// again is refused in the server's words), reads the overview again, stages two changes and discards them, saves them with a wrong password (refused) and then the right one, reads the audit
// history and leaves and comes back. Campuses were made by an API call and by nothing a person could click until task 0063 (a finding of this walkthrough); this chapter is the screen working.
// After each change the chapter leaves the page by clicking and comes back by clicking, and reads it again: "it rendered" is not evidence.

const chapter = "C02 The school";

const campusList = (page: Page) => page.getByRole("list", { name: "Campuses" }).getByRole("listitem");
const timeZone = (page: Page) => page.getByLabel("School time zone");
const feeReminders = (page: Page) => page.getByRole("switch", { name: "Automated Fee Reminders" });
const stepUp = (page: Page) => page.getByRole("dialog", { name: "Step-up Authentication Required" });

/// Stages the two changes of this chapter the way a person does: choose the time zone, flip the switch.
async function stageChanges(walk: Walk, page: Page): Promise<void> {
  await walk.selectOption(timeZone(page), school.timeZone.to);
  await walk.click(feeReminders(page));
  await expect(page.getByText("2 unsaved changes")).toBeVisible();
}

async function addCampus(walk: Walk, page: Page, name: string): Promise<void> {
  await walk.type(page.getByLabel("Campus name"), name);
  await walk.click(page.getByRole("button", { name: "Add campus", exact: true }));
}

export async function c02School(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 10,
      chapter,
      role: "School administrator",
      title: "Read the overview of a school with no campus",
      caption: "The overview names the school and the role of whoever is signed in. This school has no campus yet, and the page says so.",
      covers: ["DSH-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { level: 1, name: /^Welcome, Amina/ })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: school.name })).toBeVisible();
      await expect(page.getByText(/You're signed in as\s*Administrator\s*· all campuses/)).toBeVisible();
      await expect(page.getByText("No campuses have been added yet.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 11,
      chapter,
      role: "School administrator",
      title: "Open Settings",
      caption: "Settings is the school administrator's page: the school's campuses, then its configuration.",
      covers: ["STG-01"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Campuses" })).toBeVisible();
      await expect(page.getByText("This school has no campus yet.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 12,
      chapter,
      role: "School administrator",
      title: "Add a campus",
      caption: "A campus is one site of the school. A name, Add campus: it is announced and listed.",
      covers: ["STG-02"],
    },
    async () => {
      await addCampus(walk, page, school.campuses.north);
      await expect(page.getByText(`“${school.campuses.north}” was added.`)).toBeVisible();
      await expect(campusList(page)).toHaveText([school.campuses.north]);
    },
  );

  await walk.step(
    {
      id: 13,
      chapter,
      role: "School administrator",
      title: "Add a second campus",
      caption: "The list is in name order.",
      covers: ["STG-02"],
    },
    async () => {
      await addCampus(walk, page, school.campuses.south);
      await expect(page.getByText(`“${school.campuses.south}” was added.`)).toBeVisible();
      await expect(campusList(page)).toHaveText([school.campuses.north, school.campuses.south]);
    },
  );

  await walk.step(
    {
      id: 14,
      chapter,
      role: "School administrator",
      title: "The same name again is refused",
      caption: "A campus name is unique in the school. The refusal is a sentence beside the field, and nothing is made.",
      covers: ["STG-03"],
    },
    async () => {
      await addCampus(walk, page, school.campuses.south);
      await expect(page.getByText("This school already has a campus with that name.")).toBeVisible();
      await expect(page.getByLabel("Campus name")).toHaveAttribute("aria-invalid", "true");
      await expect(campusList(page)).toHaveCount(2);
    },
  );

  await walk.step(
    {
      id: 15,
      chapter,
      role: "School administrator",
      title: "Leave and come back: the overview lists the campuses",
      caption: "Persistence is shown by leaving the page and returning to it. The overview now lists both campuses.",
      covers: ["DSH-01", "STG-02"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: /^Welcome, Amina/ })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Campuses" })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: school.campuses.north })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: school.campuses.south })).toBeVisible();
      await expect(page.getByText("No campuses have been added yet.")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 16,
      chapter,
      role: "School administrator",
      title: "Stage two changes",
      caption: "A change is only staged: the page counts the changes that wait, and nothing is saved yet.",
      covers: ["STG-04"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
      await stageChanges(walk, page);
      await expect(page.getByText("2 settings modified")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 17,
      chapter,
      role: "School administrator",
      title: "Discard puts everything back",
      caption: "Discard drops the staged changes: the time zone and the fee-reminder switch, which starts on, are as they were.",
      covers: ["STG-04"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Discard" }));
      await expect(page.getByText(/unsaved change/)).toHaveCount(0);
      await expect(timeZone(page)).toHaveValue(school.timeZone.from);
      await expect(feeReminders(page)).toHaveAttribute("aria-checked", "true");
    },
  );

  await walk.step(
    {
      id: 18,
      chapter,
      role: "School administrator",
      title: "Saving asks for the password again, and a wrong one is refused",
      caption: "A change to the school's configuration needs the person to prove who they are once more. A wrong password changes nothing.",
      covers: ["STG-05"],
    },
    async () => {
      await stageChanges(walk, page);
      await walk.click(page.getByRole("button", { name: "Review & Save Changes" }));
      await expect(stepUp(page)).toBeVisible();
      await expect(stepUp(page)).toContainText(school.timeZone.to);
      await walk.type(stepUp(page).getByLabel("Account Password"), "Not-the-password-1");
      await walk.click(stepUp(page).getByRole("button", { name: "Confirm & Apply" }));
      await expect(stepUp(page).getByRole("alert")).toBeVisible();
      await expect(stepUp(page)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 19,
      chapter,
      role: "School administrator",
      title: "The right password saves the changes",
      caption: "With the right password the changes are applied and recorded.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.type(stepUp(page).getByLabel("Account Password"), PASSWORD);
      await walk.click(stepUp(page).getByRole("button", { name: "Confirm & Apply" }));
      await expect(stepUp(page)).toBeHidden();
      await expect(page.getByText("School configuration updated successfully and recorded in audit log.")).toBeVisible();
      await expect(page.getByText(/unsaved change/)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 20,
      chapter,
      role: "School administrator",
      title: "The audit history lists each change",
      caption: "Every change is kept: who made it, the value before and after, and that it was confirmed.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^Audit History \(\d+\)$/ }));
      await expect(page.getByRole("heading", { level: 3, name: "Immutable Change History" })).toBeVisible();
      await expect(
        page.getByRole("row", { name: new RegExp(`School Time Zone.*${school.timeZone.from}.*${school.timeZone.to}`) }),
      ).toBeVisible();
      await expect(page.getByRole("row", { name: /Automated Fee Reminders.*Step-up Verified/ })).toBeVisible();
      await expect(page.getByText(cast.schoolAdmin.email).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 21,
      chapter,
      role: "School administrator",
      title: "Leave and come back: the settings are still changed",
      caption: "The changes were saved, not just shown.",
      covers: ["STG-06"],
    },
    async () => {
      await walk.click(mainNav(page).getByRole("link", { name: "Overview", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: /^Welcome, Amina/ })).toBeVisible();
      await walk.click(mainNav(page).getByRole("link", { name: "Settings", exact: true }));
      await expect(timeZone(page)).toHaveValue(school.timeZone.to);
      await expect(feeReminders(page)).toHaveAttribute("aria-checked", "false");
    },
  );
}
