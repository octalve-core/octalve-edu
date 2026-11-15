import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, academics, cast, family, finance } from "../cast";
import { dialogOf, openPage, signIn, signOut } from "./shared";

// C09 Finance (task 0053, task 0033 section 6.6): the school administrator sets the fees (one for JSS 1 only, one for every class), generates the term's invoices (a second generation skips what exists),
// opens the pupil's invoice, switches it to "pay in full" and back, records a part payment received at the bursary, applies a discount, and changes the school's rule on the smallest part, which asks
// for the password. A campus administrator then finds the rule readable and not changeable. It ends signed in as the school administrator.

const chapter = "C09 Finance";

const tabs = (page: Page) => page.getByRole("tab");
const financeTab = (page: Page, name: string) => page.getByRole("tab", { name });
const how = (page: Page) => page.getByRole("region", { name: "How this invoice may be paid" });

export async function c09Finance(walk: Walk, page: Page): Promise<void> {
  const { tuition, levy, dueDate, part, discount, rule } = finance;
  const { pupil } = family;
  const { group, term, session } = academics;
  // After the school copied its year (C04) there are two terms called "Term 1"; the Finance page names the session of each (task 0067).
  const termName = `${term.name} · ${session.name}`;

  await walk.step(
    {
      id: 79,
      chapter,
      role: "School administrator",
      title: "Open Finance",
      caption: "Finance has three tabs: the invoices, the fee schedules that make them, and the payment rules.",
      covers: ["FIN-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await openPage(walk, page, "Finance");
      await expect(tabs(page)).toHaveText(["Invoices", "Fee structures", "Payment rules"]);
      await expect(financeTab(page, "Invoices")).toHaveAttribute("aria-selected", "true");
    },
  );

  await walk.step(
    {
      id: 80,
      chapter,
      role: "School administrator",
      title: "Set the fees",
      caption:
        "A fee is a name, an amount and, optionally, one class. A fee with no class is charged to every pupil. Each is listed under the term it belongs to.",
      covers: ["FIN-02"],
    },
    async () => {
      await walk.click(financeTab(page, "Fee structures"));
      await expect(page.getByRole("button", { name: termName })).toBeVisible();
      await expect(page.getByText(/No fee structures defined for this period/)).toBeVisible();
      await walk.click(page.getByRole("button", { name: "+ Add Fee Schedule" }));
      await walk.type(dialogOf(page).getByLabel("Fee Item Name"), tuition.name);
      await walk.type(dialogOf(page).getByLabel("Amount (Naira)"), tuition.amount);
      await walk.selectOption(dialogOf(page).getByLabel("Target Class (Optional)"), group.name);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create Fee" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(page.getByRole("row").filter({ hasText: tuition.name })).toContainText(`${group.name} only`);
      await walk.click(page.getByRole("button", { name: "+ Add Fee Schedule" }));
      await walk.type(dialogOf(page).getByLabel("Fee Item Name"), levy.name);
      await walk.type(dialogOf(page).getByLabel("Amount (Naira)"), levy.amount);
      await walk.click(dialogOf(page).getByRole("button", { name: "Create Fee" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(page.getByRole("row").filter({ hasText: levy.name })).toContainText("All Classes");
    },
  );

  await walk.step(
    {
      id: 81,
      chapter,
      role: "School administrator",
      title: "Generate the term's invoices",
      caption:
        "One click makes an invoice for every enrolled pupil from the fees that apply to them. Run again, it skips what already exists.",
      covers: ["FIN-03"],
    },
    async () => {
      await walk.click(financeTab(page, "Invoices"));
      await walk.click(page.getByRole("button", { name: "Generate Term Invoices" }));
      await expect(dialogOf(page).getByLabel("Academic Period").locator("option:checked")).toHaveText(termName);
      await walk.selectOption(dialogOf(page).getByLabel("Academic Period"), termName);
      await walk.type(dialogOf(page).getByLabel("Due Date (Optional)"), dueDate);
      await walk.click(dialogOf(page).getByRole("button", { name: "Generate Invoices" }));
      await expect(dialogOf(page).getByText(/Generated 1 new invoices/)).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: pupil.name })).toContainText("Unpaid");
    },
  );

  await walk.step(
    {
      id: 82,
      chapter,
      role: "School administrator",
      title: "Open the invoice and require payment in full",
      caption:
        "The invoice page says how it may be paid. The school's rule allows parts; the administrator can require this one to be paid in full, and allow parts again.",
      covers: ["FIN-04"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await walk.click(page.getByRole("row").filter({ hasText: pupil.name }).getByRole("link", { name: "View & Pay" }));
      await expect(page.getByText(/Invoice No: /)).toBeVisible();
      await expect(how(page)).toContainText("Part payments are allowed");
      await walk.click(how(page).getByRole("button", { name: "Require payment in full on this invoice" }));
      await expect(page.getByRole("main").getByText("This invoice now has to be paid in full.")).toBeVisible();
      await expect(how(page)).toContainText("has to be paid in full");
      await walk.click(how(page).getByRole("button", { name: "Allow part payments on this invoice" }));
      await expect(how(page).getByRole("button", { name: "Require payment in full on this invoice" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 83,
      chapter,
      role: "School administrator",
      title: "Record a part payment received at the bursary",
      caption:
        "Cash, a POS terminal or a bank transfer is recorded with its amount and channel, and a receipt is issued. The invoice becomes partly paid and shows what is left.",
      covers: ["FIN-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Record Payment" }));
      await walk.type(dialogOf(page).getByLabel("Amount Paid (₦)"), part);
      await walk.selectOption(dialogOf(page).getByLabel("Payment Channel"), "Cash Receipt");
      await walk.click(dialogOf(page).getByRole("button", { name: "Record Payment & Issue Receipt" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(page.getByText("PARTIALLY PAID")).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Payment & Receipt Ledger" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 84,
      chapter,
      role: "School administrator",
      title: "Apply a discount",
      caption:
        "A discount has an amount and a reason, and is applied directly or sent for the principal's approval. It is listed on the invoice and lowers what is left.",
      covers: ["FIN-06"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: "Apply Discount" }));
      await walk.type(dialogOf(page).getByLabel("Discount Amount (₦)"), discount.amount);
      await walk.type(dialogOf(page).getByLabel("Reason / Scholarship Scheme"), discount.reason);
      await walk.click(dialogOf(page).getByRole("button", { name: "Apply Discount" }));
      await expect(dialogOf(page)).toBeHidden();
      await expect(page.getByRole("heading", { level: 3, name: "Applied Discounts & Waivers" })).toBeVisible();
      await expect(page.getByText(discount.reason)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 85,
      chapter,
      role: "School administrator",
      title: "Change the school's rule on part payments",
      caption:
        "The rule sets the smallest part a payer may pay. Changing it asks for the administrator's password, and the invoices then say it.",
      covers: ["FIN-07", "LOG-01"],
    },
    async () => {
      await walk.click(page.getByRole("link", { name: "Back to Invoices" }));
      await walk.click(financeTab(page, "Payment rules"));
      const form = page.getByRole("form", { name: "Payment rule of the school" });
      await walk.selectOption(form.getByLabel("Smallest part"), "AMOUNT");
      await walk.type(form.getByLabel("Amount (₦)"), rule.smallestPart);
      await walk.click(form.getByRole("button", { name: "Save the rule" }));
      await walk.type(dialogOf(page).getByLabel("Account Password"), PASSWORD);
      await walk.click(dialogOf(page).getByRole("button", { name: "Confirm & Apply" }));
      await expect(page.getByText("The school's rule saved.")).toBeVisible();
      await expect(page.getByText(rule.shown).first()).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 86,
      chapter,
      role: "Campus administrator",
      title: "A campus administrator can read the rule and not change it",
      caption: "Only the school's administrator changes a rule. The campus administrator sees it, with no save button.",
      covers: ["LOG-01", "FIN-08"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.campusAdmin);
      await openPage(walk, page, "Finance");
      await walk.click(financeTab(page, "Payment rules"));
      await expect(page.getByText("Only the school's administrator changes a rule.").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Save the rule" })).toHaveCount(0);
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
    },
  );
}
