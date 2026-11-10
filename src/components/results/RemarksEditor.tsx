"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { sendJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { CardRemarks, ReportCardData } from "./model";

const MAX = 500;

/// The teacher's and the principal's remark of one card (task 0036), for the person who may write them: a field only for each remark this person may write now. A blank clears a remark. Nothing here
/// is trusted: the server decides who may write what and whether the term's results are already published, and says so in a sentence.
export function RemarksEditor({
  schoolCode,
  card,
  onSaved,
}: {
  schoolCode: string;
  card: ReportCardData;
  onSaved: (remarks: CardRemarks) => void;
}) {
  const { remarks } = card;
  const [teacher, setTeacher] = useState(remarks.teacher ?? "");
  const [principal, setPrincipal] = useState(remarks.principal ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!remarks.editable)
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-fg-muted print:hidden">
        The results for this term are published, so the remarks are final.
      </p>
    );
  if (!remarks.canWriteTeacher && !remarks.canWritePrincipal) return null;

  const name = `${card.student.firstName} ${card.student.lastName}`;
  const tooLong = (text: string) => Array.from(text.trim()).length > MAX;

  async function save() {
    setSaving(true);
    setProblem(null);
    setSaved(null);
    const answer = await sendJson(`/api/v1/schools/${schoolCode}/people/students/${card.student.id}/report-remarks`, "PUT", {
      periodId: card.period.id,
      ...(remarks.canWriteTeacher ? { teacherRemark: teacher.trim() === "" ? null : teacher } : {}),
      ...(remarks.canWritePrincipal ? { principalRemark: principal.trim() === "" ? null : principal } : {}),
    });
    setSaving(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    const now = answer.data?.remarks as { teacherRemark: string | null; principalRemark: string | null };
    onSaved({ ...remarks, teacher: now.teacherRemark, principal: now.principalRemark });
    // The fields show what the server holds now (trimmed, or empty when cleared).
    if (remarks.canWriteTeacher) setTeacher(now.teacherRemark ?? "");
    if (remarks.canWritePrincipal) setPrincipal(now.principalRemark ?? "");
    setSaved(answer.data?.changed ? `Saved the remarks for ${name}.` : "Nothing changed.");
  }

  return (
    <section aria-labelledby="remarks-heading" className="space-y-4 rounded-2xl border border-line bg-surface p-5 print:hidden">
      <div>
        <h3 id="remarks-heading" className="text-base font-semibold text-fg">
          Remarks for {name}
        </h3>
        <p className="mt-1 text-sm text-fg-muted">
          They appear on the card. A pupil or parent sees them once the term&apos;s results are published, and they cannot be changed after
          that.
        </p>
      </div>
      {remarks.canWriteTeacher && (
        <TextAreaField
          label="Teacher's remark"
          rows={3}
          value={teacher}
          onChange={(e) => setTeacher(e.target.value)}
          error={tooLong(teacher) ? `At most ${MAX} characters.` : null}
          hint={`${Array.from(teacher.trim()).length} of ${MAX}. Leave it empty to clear it.`}
        />
      )}
      {remarks.canWritePrincipal && (
        <TextAreaField
          label="Principal's remark"
          rows={3}
          value={principal}
          onChange={(e) => setPrincipal(e.target.value)}
          error={tooLong(principal) ? `At most ${MAX} characters.` : null}
          hint={`${Array.from(principal.trim()).length} of ${MAX}. Leave it empty to clear it.`}
        />
      )}
      {problem && <Alert variant="error">{problem}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} loading={saving} disabled={tooLong(teacher) || tooLong(principal)}>
          Save remarks
        </Button>
        <p role="status" className="text-sm text-fg-2">
          {saved}
        </p>
      </div>
    </section>
  );
}
