"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { sendJson } from "@/components/auth/postJson";
import { SUPPORT_AREA_LABELS, type SupportArea } from "@/lib/support/areas";

/// Shown at the top of every page while a platform administrator has a support view of a school open (ADR 0017): which school, that it is read-only,
/// what they were allowed to look at, when it ends - and the way out. Display only; the pages and routes enforce.
export function SupportBanner({ name, areas, endsAt }: { name: string; areas: readonly SupportArea[]; endsAt: string }) {
  const [pending, setPending] = useState(false);
  async function leave() {
    if (pending) return;
    setPending(true);
    await sendJson("/api/v1/platform/support/close", "POST", {});
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a FULL load on purpose: the layout (and its banner) must be drawn again
    window.location.href = "/platform"; // a full load: the layout (and its banner) must be drawn again
  }
  const ends = new Date(endsAt).toLocaleTimeString(undefined, { timeStyle: "short" });
  return (
    <div role="region" aria-label="Support view" className="border-b border-warn-fg/30 bg-warn-bg px-4 py-3 text-sm text-warn-fg sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p>
          <strong className="font-semibold">Support view of {name}</strong> · read-only ·{" "}
          {areas.map((a) => SUPPORT_AREA_LABELS[a]).join(", ")} · ends at {ends}
        </p>
        <Button variant="secondary" onClick={leave} disabled={pending}>
          Leave support view
        </Button>
      </div>
    </div>
  );
}
