"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FeeStructuresPanel, type FeeItem } from "@/components/finance/FeeStructuresPanel";
import { InvoicesDashboard, type InvoiceListItem } from "@/components/finance/InvoicesDashboard";
import { PaymentRulesPanel } from "@/components/finance/PaymentRulesPanel";
import { SectionTabs } from "@/components/forms/SectionTabs";

// The Finance page's sections behind one tab list (the same ARIA tabs as Forms and the Question bank): the invoices, the fee structures and the payment rules. The data comes from the
// server page; a change calls the finance APIs and the page is refreshed. Presentation only: the APIs decide who may do what.

const SECTIONS = [
  { id: "invoices", label: "Invoices" },
  { id: "fees", label: "Fee structures" },
  { id: "rules", label: "Payment rules" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function FinanceSections({
  schoolCode,
  invoices,
  feeStructures,
  periods,
  classGroups,
  canManageFinance,
  canChangeRules,
  hasMfa,
}: {
  schoolCode: string;
  invoices: InvoiceListItem[];
  feeStructures: FeeItem[];
  periods: { id: string; label: string }[];
  classGroups: { id: string; name: string }[];
  /// May record payments, apply discounts, generate invoices and set fee structures (the API checks again).
  canManageFinance: boolean;
  /// May change the payment rules (the school's administrator only).
  canChangeRules: boolean;
  hasMfa: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState<SectionId>("invoices");
  const refresh = () => router.refresh();
  return (
    <SectionTabs label="Finance sections" idPrefix="fin" sections={SECTIONS} active={active} onChange={setActive}>
      {active === "invoices" && (
        <InvoicesDashboard
          schoolCode={schoolCode}
          invoices={invoices}
          periods={periods}
          canManageFinance={canManageFinance}
          onRefresh={refresh}
        />
      )}
      {active === "fees" && (
        <FeeStructuresPanel
          schoolCode={schoolCode}
          feeStructures={feeStructures}
          periods={periods}
          classGroups={classGroups}
          canManageFinance={canManageFinance}
          onRefresh={refresh}
        />
      )}
      {active === "rules" && <PaymentRulesPanel schoolCode={schoolCode} hasMfa={hasMfa} canManage={canChangeRules} />}
    </SectionTabs>
  );
}
