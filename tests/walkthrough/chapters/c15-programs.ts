import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { program } from "../cast";
import { dialogOf, field, item, openPage } from "./shared";

// C15 Programs (task 0053, task 0027): the school administrator finds the Programs page empty, tries to make a program with nothing filled in (refused, with the reasons beside the fields), makes a
// program that never ends and runs on one campus, finds it a draft, gives it its level names and a tree of groups (one inside another, one renamed, one archived and restored), adds and removes a
// campus, edits its details and activates it. The list then shows it active with its groups, and its history lists what was done. It ends signed in as the school administrator.

const chapter = "C15 Programs";

const tabs = (page: Page) => page.getByRole("tablist", { name: "Program sections" });
// the program page keeps a live region (a status) around its notices and a notice is itself a status: the notice is the inner one
const status = (page: Page) => page.getByRole("status").filter({ hasText: /\S/ }).last();

export async function c15Programs(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 129,
      chapter,
      role: "School administrator",
      title: "The administrator finds the Programs page, with no program yet",
      caption:
        "A program is learning that is not a normal class: it has its own levels and groups, and its own people. The school's administrator makes them; the page says there is none yet.",
      covers: ["PRG-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Programs");
      await expect(page.getByText("No program has been made yet.")).toBeVisible();
      await expect(page.getByRole("button", { name: "New program" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 130,
      chapter,
      role: "School administrator",
      title: "A program with nothing filled in is refused, with the reasons beside the fields",
      caption: "A program needs a name and at least one level name. Making the empty form changes nothing and says what to give.",
      covers: ["PRG-02"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "New program" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Make the program" }));
      await expect(dialogOf(page).getByText("Give the program a name.")).toBeVisible();
      await expect(dialogOf(page).getByText("Give the program at least one level name.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 131,
      chapter,
      role: "School administrator",
      title: "Make a program that never ends, on the North campus, with two level names",
      caption:
        "A program is made as a draft: it has a name, a description, how long it runs, where it runs (one campus, or the whole school) and what it calls its levels. Making it opens its page.",
      covers: ["PRG-03"],
    },
    async () => {
      const d = dialogOf(page);
      await walk.type(field(d, "Name"), program.name);
      await walk.type(d.getByLabel("Description (optional)"), program.description);
      await walk.click(d.getByLabel(program.campus, { exact: true }));
      await walk.type(d.getByLabel("Level 1", { exact: true }), program.levels[0]);
      await walk.type(d.getByLabel("Level 2 (optional)", { exact: true }), program.levels[1]);
      await walk.click(d.getByRole("button", { name: "Make the program" }));
      await expect(page.getByRole("heading", { level: 2, name: program.name })).toBeVisible();
      await expect(page.getByText("Draft", { exact: true })).toBeVisible();
      await expect(tabs(page).getByRole("tab").first()).toHaveText("Overview");
      await expect(page.getByText("Never ends · No dates")).toBeVisible();
      await expect(page.getByText(program.campus, { exact: true }).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 132,
      chapter,
      role: "School administrator",
      title: "Give it a tree of groups: one inside another",
      caption:
        "The Structure tab holds the level names and the groups. The first level is added at the top; a group at a level that has another below it can have groups inside it, named for that level.",
      covers: ["PRG-04"],
    },
    async () => {
      await walk.click(tabs(page).getByRole("tab", { name: "Structure" }));
      await expect(page.getByText("No groups yet.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Add a ${program.levels[0].toLowerCase()}` }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(dialogOf(page).getByText("Give the group a name.")).toBeVisible();
      await walk.type(field(dialogOf(page), "Name"), program.groups.top);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(status(page)).toContainText(`${program.groups.top} was added.`);
      await walk.click(page.getByRole("button", { name: `Add a group inside ${program.groups.top}` }));
      await walk.type(field(dialogOf(page), "Name"), program.groups.inside);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await expect(status(page)).toContainText(`${program.groups.inside} was added.`);
      await expect(item(page, program.groups.top)).toContainText(`${program.groups.inside}`);
    },
  );

  await walk.step(
    {
      id: 133,
      chapter,
      role: "School administrator",
      title: "Rename a group, move it, archive it and bring it back",
      caption:
        "A second group at the top is renamed and moved above the first. Archiving takes it off the tree into the archived list, where it can be restored.",
      covers: ["PRG-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Add a ${program.levels[0].toLowerCase()}` }));
      await walk.type(field(dialogOf(page), "Name"), program.groups.second);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }));
      await walk.click(page.getByRole("button", { name: `Rename ${program.groups.second}` }));
      await walk.type(field(dialogOf(page), "Name"), program.groups.renamed);
      await walk.click(dialogOf(page).getByRole("button", { name: "Rename", exact: true }));
      await expect(status(page)).toContainText("The group is renamed.");
      await walk.click(page.getByRole("button", { name: `Move ${program.groups.renamed} up` }));
      await expect(status(page)).toContainText(`${program.groups.renamed} moved up.`);
      await walk.click(page.getByRole("button", { name: `Archive ${program.groups.renamed}` }));
      await expect(status(page)).toContainText(`${program.groups.renamed} is archived.`);
      await walk.click(page.getByText("Archived groups (1)"));
      await walk.click(page.getByRole("button", { name: `Restore ${program.groups.renamed}` }));
      await expect(status(page)).toContainText(`${program.groups.renamed} is back.`);
    },
  );

  await walk.step(
    {
      id: 134,
      chapter,
      role: "School administrator",
      title: "Add a campus to the program and take it away again",
      caption: "A program that runs on some campuses can be given another and can lose one. Each change is said in words.",
      covers: ["PRG-06"],
    },
    async () => {
      await walk.click(tabs(page).getByRole("tab", { name: "Overview" }));
      await walk.selectOption(page.getByLabel("Add a campus"), program.otherCampus);
      await walk.click(page.getByRole("button", { name: "Add", exact: true }));
      await expect(status(page)).toContainText("The campus was added.");
      await expect(page.getByRole("button", { name: `Remove ${program.otherCampus}` })).toBeVisible();
      await walk.click(page.getByRole("button", { name: `Remove ${program.otherCampus}` }));
      await expect(status(page)).toContainText(`${program.otherCampus} was removed.`);
    },
  );

  await walk.step(
    {
      id: 135,
      chapter,
      role: "School administrator",
      title: "Edit the details, activate the program, and read its history",
      caption:
        "A draft is changed and activated. The Programs list then shows it active, with its groups, and the History tab lists what was done, newest first.",
      covers: ["PRG-07"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Edit details" }));
      await walk.type(dialogOf(page).getByLabel("Description", { exact: true }), program.editedDescription);
      await walk.click(dialogOf(page).getByRole("button", { name: "Save", exact: true }));
      await expect(status(page)).toContainText("The details are saved.");
      await expect(page.getByText(program.editedDescription)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Activate" }));
      await expect(status(page)).toContainText("The program is active.");
      await walk.click(tabs(page).getByRole("tab", { name: "History" }));
      await expect(page.getByRole("list", { name: "History, newest first" }).getByRole("listitem").first()).toContainText("Activated");
      await walk.click(page.getByRole("link", { name: "All programs" }));
      await expect(page.getByRole("list", { name: "Programs" }).getByRole("listitem").filter({ hasText: program.name })).toContainText(
        "Active",
      );
      await expect(page.getByRole("list", { name: "Programs" }).getByRole("listitem").filter({ hasText: program.name })).toContainText(
        `${program.campus} · 3 groups`,
      );
    },
  );
}
