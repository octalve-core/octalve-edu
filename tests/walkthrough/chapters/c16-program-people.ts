import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { family, program, programPeople as pp } from "../cast";
import { dialogOf, openPage } from "./shared";

// C16 The people of a program (task 0053, task 0027): the school administrator opens the program of C15 and its People tab (empty), adds a pupil, a member of staff and a guardian from the school's records
// (a search of one letter is refused), adds the pupils of a whole class (shown first, then confirmed: the pupil already in is skipped), types in an adult and a child with a guardian, moves one person to
// another group, withdraws one (a reason of two letters is refused) and brings them back, suspends one with a reason and lifts it, edits one's phone, reads a person's history, and narrows the list by
// who and by state. It ends signed in as the school administrator.

const chapter = "C16 Program people";

const tabs = (page: Page) => page.getByRole("tablist", { name: "Program sections" });
const people = (page: Page) => page.getByRole("list", { name: "People of the program" });
const person = (page: Page, name: string) => people(page).getByRole("listitem").filter({ hasText: name });
// the program page keeps a live region (a status) around its notices and a notice is itself a status; the list's count is a status too: find the notice by what it says
const said = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text }).last();

export async function c16ProgramPeople(walk: Walk, page: Page): Promise<void> {
  const pupil = family.pupil;
  const father = family.father;
  const brother = family.brother;

  const openPeople = async () => {
    await page.keyboard.press("Escape");
    await openPage(walk, page, "Programs");
    await walk.click(page.getByRole("link", { name: program.name }));
    await expect(page.getByRole("heading", { level: 2, name: program.name })).toBeVisible();
    await walk.click(tabs(page).getByRole("tab", { name: "People" }));
  };

  await walk.step(
    {
      id: 136,
      chapter,
      role: "School administrator",
      title: "Add a pupil to the program from the school's records",
      caption:
        "The People tab is empty. Adding people asks how, and which group they go into. A pupil is found by name in the school's records; one letter is too few to search. Nothing is copied: the pupil's details stay on the school's record.",
      covers: ["PRG-08"],
    },
    async () => {
      await openPeople();
      await expect(page.getByText("No one matches.")).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const d = dialogOf(page);
      await walk.selectOption(d.getByLabel("Into this group"), pp.group);
      await walk.type(d.getByLabel("Name or admission number"), pp.tooShort);
      await walk.click(d.getByRole("button", { name: "Find", exact: true }));
      await expect(d.getByText("Type at least 2 letters of the name.")).toBeVisible();
      await walk.type(d.getByLabel("Name or admission number"), brother.first);
      await walk.click(d.getByRole("button", { name: "Find", exact: true }));
      await walk.click(d.getByRole("button", { name: `Add ${brother.name}` }));
      await expect(said(page, `${brother.name} is added.`)).toBeVisible();
      await expect(person(page, brother.name)).toContainText("Taking part");
      await expect(person(page, brother.name)).toContainText("Pupil");
      await expect(person(page, brother.name)).toContainText(pp.group);
    },
  );

  await walk.step(
    {
      id: 137,
      chapter,
      role: "School administrator",
      title: "Add a member of staff and a guardian from the school's records",
      caption:
        "The same dialog finds a member of staff or a guardian, by choosing who is being looked for. Each is added into the chosen group.",
      covers: ["PRG-09"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const d = dialogOf(page);
      await walk.selectOption(d.getByLabel("Into this group"), pp.group);
      await walk.selectOption(d.getByLabel("Who", { exact: true }), "A member of staff");
      await walk.type(d.getByLabel("Name or admission number"), family.teacherRecord.first);
      await walk.click(d.getByRole("button", { name: "Find", exact: true }));
      await walk.click(d.getByRole("button", { name: `Add ${family.teacherRecord.name}` }));
      await expect(said(page, `${family.teacherRecord.name} is added.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add people" }));
      await walk.selectOption(dialogOf(page).getByLabel("Into this group"), pp.group);
      await walk.selectOption(dialogOf(page).getByLabel("Who", { exact: true }), "A guardian");
      await walk.type(dialogOf(page).getByLabel("Name or admission number"), father.first);
      await walk.click(dialogOf(page).getByRole("button", { name: "Find", exact: true }));
      await walk.click(dialogOf(page).getByRole("button", { name: `Add ${father.name}` }));
      await expect(said(page, `${father.name} is added.`)).toBeVisible();
      await expect(person(page, family.teacherRecord.name)).toContainText("Member of staff");
      await expect(person(page, father.name)).toContainText("Guardian");
    },
  );

  await walk.step(
    {
      id: 138,
      chapter,
      role: "School administrator",
      title: "Add the pupils of a whole class: shown first, then confirmed",
      caption:
        "Choosing a class lists who would be added and who would be skipped, and why: Only after the list is seen are the pupils added, and choosing the same class again shows that the pupil now in the program is skipped.",
      covers: ["PRG-10"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const d = dialogOf(page);
      await walk.selectOption(d.getByLabel("Into this group"), pp.group);
      await walk.selectOption(d.getByLabel("How"), "A whole class of pupils");
      const classOption = await d.getByLabel("Class", { exact: true }).locator("option").nth(1).innerText();
      await walk.selectOption(d.getByLabel("Class", { exact: true }), classOption);
      await walk.click(d.getByRole("button", { name: "See who would be added" }));
      await expect(d.getByLabel("Who would be added")).toContainText("1 to add");
      await walk.click(d.getByRole("button", { name: "Add 1 pupil" }));
      await expect(said(page, "The class is added.")).toBeVisible();
      await expect(person(page, pupil.name)).toContainText("Taking part");
      await page.keyboard.press("Escape");
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const again = dialogOf(page);
      await walk.selectOption(again.getByLabel("Into this group"), pp.group);
      await walk.selectOption(again.getByLabel("How"), "A whole class of pupils");
      await walk.selectOption(again.getByLabel("Class", { exact: true }), classOption);
      await walk.click(again.getByRole("button", { name: "See who would be added" }));
      await expect(again.getByLabel("Who would be added")).toContainText("0 to add, 1 skipped");
      await expect(again.getByLabel("Who would be added")).toContainText(`${pupil.name}: already in the program`);
      await expect(again.getByRole("button", { name: "Add 0 pupils" })).toBeDisabled();
    },
  );

  await walk.step(
    {
      id: 139,
      chapter,
      role: "School administrator",
      title: "Type in an adult and a child who have no school record",
      caption:
        "A program can hold people the school has no record of: an adult, or a child who needs a birth date and a guardian. The child is typed with the guardian's phone, which is the adult's phone too: the form asks to confirm that this is a different person, and only then adds the child. The campus they belong through is the school when none is chosen.",
      covers: ["PRG-11"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await walk.click(page.getByRole("button", { name: "Add people" }));
      const d = dialogOf(page);
      await walk.selectOption(d.getByLabel("Into this group"), pp.group);
      await walk.selectOption(d.getByLabel("How"), "A new person (an adult or a child with no school record)");
      await walk.type(d.getByLabel("First name"), pp.adult.first);
      await walk.type(d.getByLabel("Last name"), pp.adult.last);
      await walk.type(d.getByLabel("Phone (optional)"), pp.adult.phone);
      await walk.click(d.getByRole("button", { name: "Add", exact: true }).last());
      await expect(said(page, `${pp.adult.name} is added.`)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Add people" }));
      await walk.selectOption(dialogOf(page).getByLabel("Into this group"), pp.group);
      await walk.selectOption(dialogOf(page).getByLabel("How"), "A new person (an adult or a child with no school record)");
      await walk.selectOption(dialogOf(page).getByLabel("Kind"), "A child (needs a birth date and a guardian)");
      await walk.type(dialogOf(page).getByLabel("First name"), pp.child.first);
      await walk.type(dialogOf(page).getByLabel("Last name"), pp.child.last);
      await walk.type(dialogOf(page).getByLabel("Date of birth"), pp.child.born);
      await walk.type(dialogOf(page).getByLabel("Guardian's name"), pp.child.guardian);
      await walk.type(dialogOf(page).getByLabel("Guardian's phone"), pp.child.guardianPhone);
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }).last());
      await expect(dialogOf(page).getByText(/with the same birth date or phone number is already in this program/)).toBeVisible();
      await walk.click(dialogOf(page).getByLabel("This is a different person"));
      await walk.click(dialogOf(page).getByRole("button", { name: "Add", exact: true }).last());
      await expect(said(page, `${pp.child.name} is added.`)).toBeVisible();
      await expect(person(page, pp.adult.name)).toContainText("Adult");
      await expect(person(page, pp.child.name)).toContainText("Child");
      await expect(page.getByText("6 people")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 140,
      chapter,
      role: "School administrator",
      title: "Move a person to another group, withdraw another, and bring them back",
      caption:
        "A move needs no reason; ending a person's place does, and a reason of two letters is refused. A person who left can be re-enrolled into a group, with a reason.",
      covers: ["PRG-12"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Move ${pp.adult.name}` }));
      await walk.selectOption(dialogOf(page).getByLabel("Group"), pp.other);
      await walk.click(dialogOf(page).getByRole("button", { name: "Move", exact: true }));
      await expect(said(page, "They are moved.")).toBeVisible();
      await expect(person(page, pp.adult.name)).toContainText(pp.other);
      await walk.click(page.getByRole("button", { name: `Withdraw ${pp.child.name}` }));
      await walk.type(dialogOf(page).getByLabel("Reason"), pp.reasons.tooShort);
      await walk.click(dialogOf(page).getByRole("button", { name: "Withdraw", exact: true }));
      await expect(dialogOf(page).getByText("Say why (at least 3 characters).")).toBeVisible();
      await walk.type(dialogOf(page).getByLabel("Reason"), pp.reasons.withdraw);
      await walk.click(dialogOf(page).getByRole("button", { name: "Withdraw", exact: true }));
      await expect(said(page, "Their place is ended.")).toBeVisible();
      await expect(person(page, pp.child.name)).toContainText("Left");
      await walk.click(page.getByRole("button", { name: `Re-enrol ${pp.child.name}` }));
      await walk.type(dialogOf(page).getByLabel("Reason"), "Back after the term");
      await walk.click(dialogOf(page).getByRole("button", { name: "Re-enrol", exact: true }));
      await expect(said(page, "They are back in the program.")).toBeVisible();
      await expect(person(page, pp.child.name)).toContainText("Taking part");
    },
  );

  await walk.step(
    {
      id: 141,
      chapter,
      role: "School administrator",
      title: "Suspend a person with a reason and lift it; edit another's phone; read a history",
      caption:
        "A person typed into the program can be suspended (with a reason, kept in the history) and brought back, and their details can be edited. A pupil with a school record has her state read from that record, and can only be moved or withdrawn here. Each place has its own history.",
      covers: ["PRG-13"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Suspend ${pp.adult.name}` }));
      await walk.type(dialogOf(page).getByLabel("Reason"), pp.reasons.suspend);
      await walk.click(dialogOf(page).getByRole("button", { name: "Suspend", exact: true }));
      await expect(said(page, "The suspension is recorded.")).toBeVisible();
      await expect(person(page, pp.adult.name)).toContainText("Suspended");
      await walk.click(page.getByRole("button", { name: `Lift the suspension of ${pp.adult.name}` }));
      await walk.type(dialogOf(page).getByLabel("Reason"), "Returned and apologised");
      await walk.click(dialogOf(page).getByRole("button", { name: "Lift the suspension", exact: true }));
      await expect(said(page, "The suspension is lifted.")).toBeVisible();
      await expect(person(page, pp.adult.name)).toContainText("Taking part");
      await walk.click(page.getByRole("button", { name: `Edit ${pp.adult.name}` }));
      await walk.type(dialogOf(page).getByLabel("Phone"), pp.editedPhone);
      await walk.click(dialogOf(page).getByRole("button", { name: "Save", exact: true }));
      await expect(said(page, "The details are saved.")).toBeVisible();
      await expect(person(page, pp.adult.name)).toContainText(pp.editedPhone);
      await expect(page.getByRole("button", { name: `Suspend ${pupil.name}` })).toHaveCount(0);
      await walk.click(page.getByRole("button", { name: `History of ${pp.adult.name}` }));
      await expect(dialogOf(page).getByRole("list", { name: "History of this place" }).getByRole("listitem").first()).toContainText(
        "Details changed",
      );
      // the times read like every other date of the page (17 Nov 2026), not in the browser's own shape (task 0077)
      await expect(dialogOf(page).getByRole("list", { name: "History of this place" }).getByRole("listitem").first()).toContainText(
        /\d{1,2} [A-Z][a-z]{2,3} \d{4}/,
      );
    },
  );

  await walk.step(
    {
      id: 142,
      chapter,
      role: "School administrator",
      title: "Narrow the list by who is in it, by name, and by state",
      caption: "The People tab can be narrowed to pupils, staff, guardians, adults or children, searched by name, and filtered by group.",
      covers: ["PRG-14"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await walk.selectOption(page.getByLabel("Who", { exact: true }), "Pupils");
      await expect(page.getByText("2 people")).toBeVisible();
      await expect(person(page, pp.adult.name)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Who", { exact: true }), "Everyone");
      await walk.type(page.getByLabel("Search", { exact: true }), pp.adult.last);
      await expect(page.getByText("2 people")).toBeVisible();
      await walk.type(page.getByLabel("Search", { exact: true }), "");
      await walk.selectOption(page.getByLabel("Group", { exact: true }), pp.other);
      await expect(page.getByText("1 person")).toBeVisible();
      await expect(person(page, pp.adult.name)).toBeVisible();
    },
  );
}
