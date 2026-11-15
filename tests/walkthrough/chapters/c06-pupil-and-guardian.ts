import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, family } from "../cast";
import { accept, dialogOf, field, item, mainNav, notice, openPage, send, signIn, signOut, startInvite } from "./shared";

// C06 The pupil and the guardian sign in (task 0053, task 0065): the school administrator invites a pupil and her father to sign in as a Student and a Parent, and they accept through the dev inbox.
// They sign in BEFORE their accounts are linked to their records and find nothing: the portal does not know who they are. The administrator then links each account to the record (the pupil's page),
// unlinks the pupil once and links her again, and the pupil and the father sign in once more and find their own things. It ends signed in as the school administrator.

const chapter = "C06 The pupil and the guardian";

const signInRegion = (page: Page) => page.getByRole("region", { name: "Sign-in" });
const guardianRow = (page: Page, name: string) =>
  page.getByRole("region", { name: "Guardians" }).getByRole("listitem").filter({ hasText: name });
const myWorkTabs = (page: Page) => page.getByRole("tablist", { name: "My work sections" });

export async function c06PupilAndGuardian(walk: Walk, page: Page): Promise<void> {
  const { pupil, brother, father } = family;
  const openPupilPage = async () => {
    await openPage(walk, page, "People");
    await walk.click(item(page, pupil.name).getByRole("link", { name: pupil.name }));
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(pupil.name) })).toBeVisible();
  };
  const linkPupil = async () => {
    await walk.click(page.getByRole("button", { name: `Link ${pupil.name} to an account` }));
    await expect(dialogOf(page).getByText("signs in as a student", { exact: false })).toBeVisible();
    await walk.click(dialogOf(page).getByRole("button", { name: "Link account" }));
    await expect(dialogOf(page).getByText("Choose who this is.")).toBeVisible();
    await walk.selectOption(field(dialogOf(page), "Account"), `${pupil.account.name} · ${pupil.account.email}`);
    await walk.click(dialogOf(page).getByRole("button", { name: "Link account" }));
    await expect(notice(page)).toContainText("Account linked.");
    await expect(signInRegion(page)).toContainText(`Signs in as ${pupil.account.name} (${pupil.account.email}) · Student`);
  };

  await walk.step(
    {
      id: 59,
      chapter,
      role: "School administrator",
      title: "Invite the pupil and her father to sign in",
      caption: "A pupil signs in as a Student and a guardian as a Parent. Both are invited on the Users page, like every other person.",
      covers: ["USR-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Users");
      await startInvite(walk, page, pupil.account.email, "Student");
      await send(walk, page, pupil.account.email);
      await startInvite(walk, page, father.account.email, "Parent");
      await send(walk, page, father.account.email);
    },
  );

  await walk.step(
    {
      id: 60,
      chapter,
      role: "Pupil",
      title: "The pupil accepts the invitation",
      caption: "The link shows the school and the role; the pupil chooses a name and a password.",
      covers: ["INV-01"],
    },
    async () => {
      await signOut(walk, page);
      await accept(walk, page, pupil.account, "Student");
    },
  );

  await walk.step(
    {
      id: 61,
      chapter,
      role: "Guardian",
      title: "The father accepts the invitation",
      caption: "The same steps for a parent.",
      covers: ["INV-01"],
    },
    async () => {
      await accept(walk, page, father.account, "Parent");
    },
  );

  await walk.step(
    {
      id: 62,
      chapter,
      role: "Pupil",
      title: "The pupil signs in and finds nothing yet",
      caption:
        "The account exists, but nothing connects it to a pupil's record yet, so the portal cannot say whose work to show. It says so, in words.",
      covers: ["LOG-01", "PAC-01"],
    },
    async () => {
      await signIn(walk, page, pupil.account);
      await openPage(walk, page, "My work");
      await walk.click(myWorkTabs(page).getByRole("tab", { name: "Practice" }));
      await expect(page.getByText("Student profile not found.")).toBeVisible();
      await expect(mainNav(page).getByRole("link", { name: "Finance", exact: true })).toHaveCount(0);
      await signOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 63,
      chapter,
      role: "Guardian",
      title: "The father signs in and sees no child yet",
      caption: "A guardian's page lists the pupils linked to their account. None is linked yet, and the page says so.",
      covers: ["LOG-01", "PAC-02"],
    },
    async () => {
      await signIn(walk, page, father.account);
      await openPage(walk, page, "My children");
      await expect(page.getByText("No pupil is linked to your account yet.")).toBeVisible();
      await signOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 64,
      chapter,
      role: "School administrator",
      title: "Link the pupil's account to her record",
      caption:
        "On the pupil's page the administrator links the account. Only accounts that sign in as a student are offered, and one has to be chosen.",
      covers: ["PAC-03"],
    },
    async () => {
      await signIn(walk, page, cast.schoolAdmin);
      await openPupilPage();
      await expect(signInRegion(page)).toContainText(`No sign-in yet, so there is nothing for ${pupil.name} in the pupil's portal.`);
      await linkPupil();
    },
  );

  await walk.step(
    {
      id: 65,
      chapter,
      role: "School administrator",
      title: "Link the father's account to his record",
      caption: "A guardian's record is one person across all their children, so linking it shows the father every child he is linked to.",
      covers: ["PAC-04"],
    },
    async () => {
      await expect(guardianRow(page, father.name)).toContainText("No sign-in yet");
      await walk.click(page.getByRole("button", { name: `Link ${father.name} to an account` }));
      await expect(dialogOf(page).getByText("signs in as a parent", { exact: false })).toBeVisible();
      await walk.selectOption(field(dialogOf(page), "Account"), `${father.account.name} · ${father.account.email}`);
      await walk.click(dialogOf(page).getByRole("button", { name: "Link account" }));
      await expect(notice(page)).toContainText("Account linked.");
      await expect(guardianRow(page, father.name)).toContainText(`Signs in as ${father.account.name} (${father.account.email})`);
    },
  );

  await walk.step(
    {
      id: 66,
      chapter,
      role: "School administrator",
      title: "Unlink the pupil's account and link it again",
      caption:
        "Unlinking asks first and says what follows. It does not switch the account off; the pupil is linked again in one more step.",
      covers: ["PAC-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: `Unlink ${pupil.name}'s account` }));
      await expect(
        dialogOf(page).getByText("the pupil will find nothing in the portal until they are linked again", { exact: false }),
      ).toBeVisible();
      await walk.click(dialogOf(page).getByRole("button", { name: "Unlink account" }));
      await expect(notice(page)).toContainText("Account unlinked.");
      await expect(signInRegion(page)).toContainText("No sign-in yet");
      await linkPupil();
    },
  );

  await walk.step(
    {
      id: 67,
      chapter,
      role: "Pupil",
      title: "The pupil signs in and the portal knows her",
      caption:
        "The same account, after the link: the practice tab no longer says the profile is missing. What it offers depends on the school's question bank.",
      covers: ["LOG-01", "PAC-06"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, pupil.account);
      await openPage(walk, page, "My work");
      await walk.click(myWorkTabs(page).getByRole("tab", { name: "Practice" }));
      await expect(
        page.getByText(/No practice questions are ready for your class yet\.|Practice is closed for this school\./),
      ).toBeVisible();
      await expect(page.getByText("Student profile not found.")).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 68,
      chapter,
      role: "Guardian",
      title: "The father signs in and sees his children",
      caption:
        "The page lists every pupil linked to him, by name and admission number: his guardian record is one person across both. This school keeps guardians' practice view off, and the page says so.",
      covers: ["LOG-01", "PAC-07"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, father.account);
      await openPage(walk, page, "My children");
      const children = page.getByLabel("Pupil", { exact: true });
      await expect(children.getByRole("option", { name: new RegExp(`${pupil.name} \\(\\d{4}/0001\\)`) })).toHaveCount(1);
      await expect(children.getByRole("option", { name: new RegExp(`${brother.name} \\(\\d{4}/0002\\)`) })).toHaveCount(1);
      await expect(page.getByText("Practice view is disabled for guardians.")).toBeVisible();
      await expect(page.getByText("No pupil is linked to your account yet.")).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
