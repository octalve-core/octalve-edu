"use client";

import { useState } from "react";
import { useApi } from "@/components/academics/useApi";
import { Alert } from "@/components/ui/Alert";
import type { FamilyProgram } from "@/lib/programs/progress-family";
import { PortalProgressTab } from "./PortalProgressTab";

// A pupil's or a guardian's progress records (task 0027, slice R3): what the school lets them see of what the teachers have recorded, only the verified copy. Presentation only: the API reads the
// school's, the campus's and the program's switches on every request and sends nothing that may not be shown.

type Reply = { actor: "PUPIL" | "GUARDIAN"; children: { studentId: string; name: string; programs: FamilyProgram[] }[] };

export function ProgressFamilyPanel({ schoolCode }: { schoolCode: string }) {
  const { reply, error, loading, reload } = useApi(`/api/v1/schools/${schoolCode}/portal/progress`);
  const [, setVersion] = useState(0);
  const data = reply?.data as unknown as Reply | undefined;
  if (loading && !data)
    return (
      <p role="status" className="text-sm text-fg-muted">
        Loading…
      </p>
    );
  if (error || !data) return <Alert variant="error">{error ?? "The progress records could not be loaded."}</Alert>;
  const shown = data.children.filter((child) => child.programs.length > 0);
  if (shown.length === 0)
    return (
      <section aria-labelledby="progress-family-heading">
        <h2 id="progress-family-heading" className="text-lg font-semibold tracking-tight text-fg">
          Progress records
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          There is nothing to show yet. A record appears here when the teacher has written it and the school has verified it.
        </p>
      </section>
    );
  return (
    <section aria-labelledby="progress-family-heading" className="space-y-4">
      <h2 id="progress-family-heading" className="text-lg font-semibold tracking-tight text-fg">
        Progress records
      </h2>
      {shown.map((child) => (
        <div key={child.studentId} className="space-y-2">
          {data.actor === "GUARDIAN" && <h3 className="text-base font-semibold text-fg">{child.name}</h3>}
          <PortalProgressTab
            schoolCode={schoolCode}
            studentId={child.studentId}
            data={{ actor: data.actor, programs: child.programs }}
            actor={data.actor}
            onChanged={() => {
              setVersion((v) => v + 1);
              void reload(true);
            }}
          />
        </div>
      ))}
    </section>
  );
}
