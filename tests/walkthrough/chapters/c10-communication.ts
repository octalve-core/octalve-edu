import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, family, messages, school } from "../cast";
import { dialogOf, mainNav, openPage, signIn, signOut } from "./shared";

// C10 Communication (task 0053, task 0033 section 6.6): the school administrator writes a broadcast to the staff by email (a tag added with its chip, Clear empties the form, a confirmation says who it
// goes to), finds that an email to the parents reaches nobody because their addresses were never recorded (and is told so, task 0069), sends them a text message instead, reads the delivery log (filters,
// a search, one message opened) and customises a message template. A teacher is offered no Communication. A campus administrator is offered their own campus only, reaches that campus's staff, and
// does not see messages about pupils who belong to the whole school (task 0068). It ends signed in as the school administrator.

const chapter = "C10 Communication";

const tab = (page: Page, name: string) => page.getByRole("tab", { name });
const logTable = (page: Page) => page.getByRole("region", { name: "Delivery logs table" });
const nobody = (page: Page) => page.getByRole("alert").filter({ hasText: "Nothing was sent" });

export async function c10Communication(walk: Walk, page: Page): Promise<void> {
  const { staff, parents, sms, template } = messages;
  const { father } = family;
  const card = (name: string) =>
    page.getByRole("heading", { level: 3, name }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");

  await walk.step(
    {
      id: 87,
      chapter,
      role: "School administrator",
      title: "Write a broadcast to the staff by email",
      caption:
        "Choose the channel and who it goes to, write the message and add a personalised tag with its chip. Clear empties the form. A confirmation says who the message goes to before anything is sent.",
      covers: ["COM-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Communication");
      await expect(tab(page, "Broadcast Composer")).toHaveAttribute("aria-selected", "true");
      await walk.selectOption(page.getByLabel("Target Group"), "Staff Members");
      await walk.type(page.getByLabel("Email Subject"), staff.subject);
      await walk.type(page.getByLabel("Message Content"), staff.body);
      await walk.click(page.getByRole("button", { name: "+ {{school_name}}", exact: true }));
      await expect(page.getByLabel("Message Content")).toHaveValue(/\{\{school_name\}\}/);
      await walk.click(page.getByRole("button", { name: "Clear", exact: true }));
      await expect(page.getByLabel("Message Content")).toHaveValue("");
      await expect(page.getByLabel("Email Subject")).toHaveValue("");
      await walk.type(page.getByLabel("Email Subject"), staff.subject);
      await walk.type(page.getByLabel("Message Content"), staff.body);
      await walk.click(page.getByRole("button", { name: "Dispatch Broadcast" }));
      await expect(dialogOf(page)).toContainText("Audience: STAFF (All Campuses)");
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Send" }));
      await expect(tab(page, "Delivery Logs & Diagnostics")).toHaveAttribute("aria-selected", "true");
      // one member of staff has an email address, so the school's own line above the tabs says so in the singular (task 0070)
      await expect(page.getByRole("status").filter({ hasText: "The message was sent." })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 88,
      chapter,
      role: "School administrator",
      title: "An email to the parents reaches nobody, and the screen says why",
      caption:
        "The school recorded its parents' phone numbers and not their email addresses. Sending an email to them sends nothing, and the page says so: how many people have no address, and what to do. What was written is kept.",
      covers: ["COM-02"],
    },
    async () => {
      await walk.click(tab(page, "Broadcast Composer"));
      await walk.selectOption(page.getByLabel("Target Group"), "Parents / Guardians");
      await walk.type(page.getByLabel("Email Subject"), parents.subject);
      await walk.type(page.getByLabel("Message Content"), parents.body);
      await walk.click(page.getByRole("button", { name: "Dispatch Broadcast" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Send" }));
      await expect(nobody(page)).toContainText("Nothing was sent. 2 people in this audience have no email address on record.");
      await expect(page.getByText(/queued successfully/)).toHaveCount(0);
      await expect(tab(page, "Broadcast Composer")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByLabel("Message Content")).toHaveValue(parents.body);
    },
  );

  await walk.step(
    {
      id: 89,
      chapter,
      role: "School administrator",
      title: "Send the parents a text message with the pupil's name",
      caption:
        "A text message has no subject. The chip adds the pupil's name, which is filled in for each parent. The message goes to the phone numbers on record, and the page moves to the delivery log.",
      covers: ["COM-03"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "SMS", exact: true }));
      await expect(page.getByLabel("Email Subject")).toHaveCount(0);
      await walk.type(page.getByLabel("Message Content"), sms.body);
      await walk.click(page.getByRole("button", { name: "+ {{student_name}}", exact: true }));
      await expect(page.getByLabel("Message Content")).toHaveValue(/\{\{student_name\}\}/);
      await walk.click(page.getByRole("button", { name: "Dispatch Broadcast" }));
      await expect(dialogOf(page)).toContainText("Channel: SMS");
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Send" }));
      await expect(tab(page, "Delivery Logs & Diagnostics")).toHaveAttribute("aria-selected", "true");
      await expect(nobody(page)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 90,
      chapter,
      role: "School administrator",
      title: "Read the delivery log and open one message",
      caption:
        "Every message the school sent, with its status, channel and recipient. The log can be narrowed by status, by channel and by a recipient's address or phone number. One message opens to show what was sent.",
      covers: ["COM-04"],
    },
    async () => {
      await expect(logTable(page).getByText(cast.teacher.email)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "SENT", exact: true }));
      await expect(logTable(page).getByText(cast.teacher.email)).toBeVisible();
      await walk.selectOption(page.getByLabel("Filter by channel"), "SMS");
      await expect(logTable(page).getByText(father.phone).first()).toBeVisible();
      await expect(logTable(page).getByText(cast.teacher.email)).toHaveCount(0);
      await walk.selectOption(page.getByLabel("Filter by channel"), "All Channels");
      await walk.type(page.getByLabel("Search recipient address or phone"), "chidi");
      await expect(logTable(page).getByText(cast.teacher.email)).toBeVisible();
      await expect(logTable(page).getByText(father.phone)).toHaveCount(0);
      await walk.type(page.getByLabel("Search recipient address or phone"), "nobody@example");
      await expect(page.getByText("No communication dispatches found matching filters.")).toBeVisible();
      await walk.type(page.getByLabel("Search recipient address or phone"), "chidi");
      await walk.click(logTable(page).getByRole("button", { name: "View diagnostic details" }).first());
      await expect(dialogOf(page)).toContainText("Dispatch Diagnostic Details");
      await expect(dialogOf(page)).toContainText(cast.teacher.email);
      await expect(dialogOf(page)).toContainText(staff.subject);
      await page.keyboard.press("Escape");
      await expect(dialogOf(page)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 91,
      chapter,
      role: "School administrator",
      title: "Preview a message template and customise it",
      caption:
        "The school's templates are the wording of the messages the system sends by itself. A channel button and a search narrow the list. Preview shows a template with sample values; Customize changes its name and wording.",
      covers: ["COM-05"],
    },
    async () => {
      await walk.click(tab(page, "Notification Templates"));
      await walk.click(page.getByRole("button", { name: "EMAIL", exact: true }));
      await expect(page.getByRole("heading", { level: 3, name: template.seeded })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Attendance Absence Notice (SMS)" })).toHaveCount(0);
      await walk.type(page.getByLabel("Search templates"), "absence");
      await expect(page.getByRole("heading", { level: 3, name: template.seeded })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Broadcast Announcement (Email)" })).toHaveCount(0);
      await walk.click(card(template.seeded).getByRole("button", { name: "Preview" }));
      await expect(dialogOf(page)).toContainText(`Preview: ${template.seeded}`);
      await walk.click(dialogOf(page).getByRole("button", { name: "Close Preview" }));
      await walk.click(card(template.seeded).getByRole("button", { name: "Customize" }));
      await expect(dialogOf(page)).toContainText(`Customize Template: ${template.seeded}`);
      await walk.type(dialogOf(page).getByLabel("Template Name"), template.name);
      await walk.click(dialogOf(page).getByRole("button", { name: "Save Changes" }));
      await expect(page.getByText(`Template "${template.name}" updated successfully.`)).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: template.name })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 92,
      chapter,
      role: "School administrator",
      title: "A template name that is too short is refused",
      caption:
        "A template keeps its name only if it is a real one. A name of one letter is refused, and the dialog stays open with what was typed.",
      covers: ["COM-06"],
    },
    async () => {
      await walk.click(card(template.name).getByRole("button", { name: "Customize" }));
      await walk.type(dialogOf(page).getByLabel("Template Name"), template.short);
      await walk.click(dialogOf(page).getByRole("button", { name: "Save Changes" }));
      await expect(dialogOf(page).getByRole("alert")).toHaveText("Give the template a name of at least 2 characters.");
      await expect(dialogOf(page).getByLabel("Template Name")).toHaveValue(template.short);
    },
  );

  await walk.step(
    {
      id: 93,
      chapter,
      role: "Teacher",
      title: "A teacher is offered no Communication",
      caption:
        "Communication is for administrators. A teacher's sidebar does not list it, and typing its address shows the page for someone with no access.",
      covers: ["COM-07"],
    },
    async () => {
      // the refused dialog of the step before is closed the way a person closes it, and the template is as it was
      await page.keyboard.press("Escape");
      await expect(dialogOf(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 3, name: template.name })).toBeVisible();
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await expect(mainNav(page).getByRole("link", { name: "Communication", exact: true })).toHaveCount(0);
      const here = new URL(page.url());
      const typed = await walk.typedAddress(`${here.origin}/schools/${here.pathname.split("/")[2]}/communication`);
      await expect(typed.getByRole("heading", { level: 1, name: "You don't have access to this school" })).toBeVisible();
      await walk.closeTypedAddress();
    },
  );

  await walk.step(
    {
      id: 94,
      chapter,
      role: "Campus administrator",
      title: "A campus administrator writes to their own campus only",
      caption:
        "The campus administrator is offered their own campus and no other, and no class of another campus. Their broadcast reaches that campus's staff. The log shows messages about their campus; messages the school sent to parents of pupils who belong to the whole school are not shown.",
      covers: ["COM-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.campusAdmin);
      await openPage(walk, page, "Communication");
      await expect(page.getByLabel("Campus Scope").locator("option")).toHaveText([school.campuses.north]);
      await expect(page.getByLabel("Class Arm").locator("option")).toHaveText(["All Classes"]);
      await walk.selectOption(page.getByLabel("Target Group"), "Staff Members");
      await walk.type(page.getByLabel("Email Subject"), staff.subject);
      await walk.type(page.getByLabel("Message Content"), staff.body);
      await walk.click(page.getByRole("button", { name: "Dispatch Broadcast" }));
      await expect(dialogOf(page)).toContainText(`Audience: STAFF (Campus: ${school.campuses.north})`);
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Send" }));
      await expect(tab(page, "Delivery Logs & Diagnostics")).toHaveAttribute("aria-selected", "true");
      await expect(logTable(page).getByText(cast.teacher.email).first()).toBeVisible();
      await expect(logTable(page).getByText(father.phone)).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 95,
      chapter,
      role: "Campus administrator",
      title: "The parents of pupils who belong to the whole school are not the campus administrator's to write to",
      caption:
        "The pupils of this school are not placed on a campus, so they belong to the whole school. A campus administrator who writes to the parents finds nobody in the audience, and the page says so.",
      covers: ["COM-09"],
    },
    async () => {
      await walk.click(tab(page, "Broadcast Composer"));
      await walk.click(page.getByRole("button", { name: "SMS", exact: true }));
      await walk.selectOption(page.getByLabel("Target Group"), "Parents / Guardians");
      await walk.type(page.getByLabel("Message Content"), sms.body);
      await walk.click(page.getByRole("button", { name: "Dispatch Broadcast" }));
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Send" }));
      await expect(nobody(page)).toContainText("Nothing was sent: nobody is in this audience.");
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
