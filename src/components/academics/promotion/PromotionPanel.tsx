"use client";

import { useMemo, useState } from "react";
import type { SchoolType } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { getJson, sendJson } from "@/components/auth/postJson";
import { defaultPromotionSessions, sessionAfter } from "@/lib/promotion/choices";
import { LiveNotice, useDialog, type Notice } from "../parts";
import { periodWords } from "../model";
import { failureText } from "../useApi";
import { PromotionHistory } from "./PromotionHistory";
import { PromotionPreviewTable } from "./PromotionPreviewTable";
import {
  DECISION_LABEL,
  NO_CHOICE,
  classLabel,
  finalDecision,
  isOverride,
  missingPlacements,
  placedClassId,
  type BatchView,
  type Choice,
  type ClassOption,
  type Decision,
  type Preview,
  type SessionOption,
} from "./model";

type View = "roll" | "history";

/// "Promotion": roll one class into the next session. Pick the session being finished, the session the pupils move into and the class; look at what the rule advises for each pupil; change
/// anyone's decision (with a reason); confirm. The server decides everything again (who may, whether the pair makes sense, whether anyone changed under you): this screen is a convenience.
export function PromotionPanel({
  schoolCode,
  sessions,
  classes,
  schoolType,
  readOnly,
  canUndo,
  hasMfa,
}: {
  schoolCode: string;
  sessions: SessionOption[];
  classes: ClassOption[];
  schoolType: SchoolType;
  /// A support view, or anyone who may not roll: the preview is shown, nothing that writes is drawn.
  readOnly: boolean;
  /// The school's administrator outside a support view: may undo a roll (task 0040), and `hasMfa` says which proof the dialog asks for.
  canUndo: boolean;
  hasMfa: boolean;
}) {
  const words = periodWords(schoolType);
  const start = useMemo(() => defaultPromotionSessions(sessions), [sessions]);
  const [view, setView] = useState<View>("roll");
  const [sourceId, setSourceId] = useState(start.sourceId);
  const [targetId, setTargetId] = useState(start.targetId);
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [passMark, setPassMark] = useState("50");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [refresh, setRefresh] = useState(0);
  const [notes, setNotes] = useState("");
  const confirm = useDialog();

  const source = sessions.find((s) => s.id === sourceId);
  // The target list offers only the sessions that begin after the source in the SAME calendar (the server refuses anything else).
  const targets = sessions.filter(
    (s) =>
      s.id !== sourceId &&
      s.status !== "CLOSED" &&
      (s.campusId ?? null) === (source?.campusId ?? null) &&
      new Date(s.startDate) > new Date(source?.startDate ?? 0),
  );
  const passMarkNumber = Number(passMark);
  const passMarkOk = passMark.trim() !== "" && Number.isFinite(passMarkNumber) && passMarkNumber >= 0 && passMarkNumber <= 100;

  // Any change of selection throws the preview away: what is on screen must be what will be rolled.
  const reset = () => {
    setPreview(null);
    setChoices({});
    setProblem(null);
  };

  async function show() {
    setNotice(null);
    reset();
    setLoading(true);
    const q = new URLSearchParams({
      sourceSessionId: sourceId,
      targetSessionId: targetId,
      sourceClassGroupId: classId,
      passMark: String(passMarkNumber),
    });
    const answer = await getJson(`/api/v1/schools/${schoolCode}/academics/promotion/preview?${q}`);
    setLoading(false);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    setPreview(answer.data?.preview as Preview);
  }

  const missingReason =
    preview?.students.some(
      (row) => isOverride(row, choices[row.studentId] ?? NO_CHOICE) && (choices[row.studentId]?.reason ?? "").trim() === "",
    ) ?? false;

  const plan = useMemo(() => {
    const counts: Record<Decision, number> = { PROMOTED: 0, REPEATED: 0, GRADUATED: 0, WITHDRAWN: 0 };
    let skipped = 0;
    for (const row of preview?.students ?? []) {
      if (row.alreadyEnrolledInTarget) skipped++;
      else counts[finalDecision(row, choices[row.studentId] ?? NO_CHOICE)]++;
    }
    // With streams: how many of the promoted pupils go to each class (the confirmation names them).
    const byClass = new Map<string, number>();
    if (preview && preview.rungClasses.length > 1) {
      for (const row of preview.students) {
        const c = choices[row.studentId] ?? NO_CHOICE;
        if (row.alreadyEnrolledInTarget || finalDecision(row, c) !== "PROMOTED") continue;
        const id = placedClassId(row, c, preview);
        if (id) byClass.set(id, (byClass.get(id) ?? 0) + 1);
      }
    }
    return { counts, skipped, byClass };
  }, [preview, choices]);
  const unplaced = preview ? missingPlacements(preview, choices) : 0;

  /// "Set all": every pupil who is to be promoted goes to this class.
  function placeAll(classId: string) {
    if (!preview) return;
    setChoices((current) => {
      const next = { ...current };
      for (const row of preview.students) {
        if (row.alreadyEnrolledInTarget) continue;
        const c = current[row.studentId] ?? NO_CHOICE;
        if (finalDecision(row, c) === "PROMOTED") next[row.studentId] = { ...c, classId, armId: "" };
      }
      return next;
    });
  }

  async function run() {
    if (!preview) return;
    setRunning(true);
    setConfirmError(null);
    const overrides = preview.students.flatMap((row) => {
      const c = choices[row.studentId] ?? NO_CHOICE;
      if (row.alreadyEnrolledInTarget || !isOverride(row, c)) return [];
      return [
        {
          studentId: row.studentId,
          decision: finalDecision(row, c),
          ...(c.armId ? { targetClassArmId: c.armId } : {}),
          overrideReason: c.reason.trim(),
        },
      ];
    });
    const placements = preview.students.flatMap((row) => {
      const c = choices[row.studentId] ?? NO_CHOICE;
      if (row.alreadyEnrolledInTarget || finalDecision(row, c) !== "PROMOTED" || c.classId === "") return [];
      return [{ studentId: row.studentId, classGroupId: c.classId }];
    });
    const answer = await sendJson(`/api/v1/schools/${schoolCode}/academics/promotion/execute`, "POST", {
      sourceSessionId: sourceId,
      targetSessionId: targetId,
      sourceClassGroupId: classId,
      targetClassGroupId: preview.targetClassGroup?.id ?? null,
      passMark: passMarkNumber,
      overrides,
      ...(placements.length > 0 ? { placements } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    setRunning(false);
    if (!answer.ok) return setConfirmError(failureText(answer.status, answer.message));
    const batch = answer.data?.batch as BatchView;
    confirm.hide();
    reset();
    setNotes("");
    setRefresh((n) => n + 1);
    setNotice({
      variant: "success",
      text: `${preview.sourceClassGroup.name} was rolled: ${batch.totals.promoted} promoted, ${batch.totals.repeated} repeating, ${batch.totals.graduated} graduated${batch.totals.withdrawn ? `, ${batch.totals.withdrawn} withdrawn` : ""}${batch.totals.skipped ? `, ${batch.totals.skipped} left as they were` : ""}.`,
    });
  }

  if (sessions.length === 0 || classes.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
        Promotion needs at least one session and one class. Set them up under Sessions &amp; {words.many} and Classes &amp; subjects first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div role="group" aria-label="Promotion views" className="flex gap-2">
        {(["roll", "history"] as const).map((v) => (
          <Button key={v} variant={view === v ? "primary" : "secondary"} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "roll" ? "Roll a class" : "History"}
          </Button>
        ))}
      </div>
      <LiveNotice notice={notice} />

      {view === "history" ? (
        <PromotionHistory
          schoolCode={schoolCode}
          refreshKey={refresh}
          canUndo={canUndo}
          hasMfa={hasMfa}
          onUndone={() => {
            // Pupils' places have moved back: a preview made before is stale.
            setPreview(null);
            setChoices({});
          }}
        />
      ) : (
        <section aria-labelledby="promotion-heading" className="space-y-4">
          <div>
            <h2 id="promotion-heading" className="text-lg font-semibold tracking-tight text-fg">
              Roll a class into the next session
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Pupils are promoted when their average over the published {words.many} of the session reaches the pass mark; the class after
              the last one graduates. You can change anyone&apos;s decision before you confirm, and you say why.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Session being finished"
              value={sourceId}
              onChange={(e) => {
                const next = e.target.value;
                setSourceId(next);
                setTargetId(sessionAfter(sessions, next));
                reset();
              }}
              options={sessions.map((s) => ({ value: s.id, label: `${s.label} (${s.scope})` }))}
            />
            <SelectField
              label="Session they move into"
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                reset();
              }}
              options={[
                { value: "", label: targets.length === 0 ? "No later session yet" : "Choose a session" },
                ...targets.map((s) => ({ value: s.id, label: `${s.label} (${s.scope})` })),
              ]}
            />
            <SelectField
              label="Class"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                reset();
              }}
              options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c.scope})` }))}
            />
            <TextField
              label="Pass mark (%)"
              inputMode="decimal"
              value={passMark}
              error={passMarkOk ? null : "Give a number from 0 to 100."}
              onChange={(e) => {
                setPassMark(e.target.value);
                reset();
              }}
            />
          </div>
          {targets.length === 0 && (
            <Alert variant="info">
              There is no session after {source?.label ?? "this one"} in the same calendar yet. Create the next session under Sessions &amp;{" "}
              {words.many} first.
            </Alert>
          )}
          <div>
            <Button onClick={() => void show()} loading={loading} disabled={!sourceId || !targetId || !classId || !passMarkOk}>
              Show the class
            </Button>
          </div>
          {problem && <Alert variant="error">{problem}</Alert>}

          {preview && (
            <div className="space-y-4">
              <p className="text-sm text-fg-2" role="status">
                {preview.sourceClassGroup.name} →{" "}
                {preview.placementNeeded
                  ? preview.rungClasses.map(classLabel).join(" or ")
                  : preview.targetClassGroup
                    ? preview.targetClassGroup.name
                    : "graduation (this is the last class)"}
                . {preview.summary.totalEvaluated} pupil
                {preview.summary.totalEvaluated === 1 ? "" : "s"} on the roll.
              </p>
              {!preview.eligibility.eligible && (
                <Alert variant="warning">{preview.eligibility.reason} You can still go on: the school may promote early.</Alert>
              )}
              {preview.targetClassGroup && preview.targetArms.length === 0 && (
                <Alert variant="error">
                  {preview.targetClassGroup.name} has no arm yet, so nobody can be promoted into it. Add an arm under Classes &amp;
                  subjects.
                </Alert>
              )}
              {preview.rungClasses.length > 1 && (
                <Alert variant={preview.placementNeeded ? "warning" : "info"}>
                  {preview.sourceClassGroup.name} moves up into more than one class.{" "}
                  {preview.placementNeeded
                    ? "It is not a stream of any of them, so choose the class of each pupil who is moving up."
                    : `The pupils go to ${preview.targetClassGroup?.name} unless you choose another class for them.`}
                </Alert>
              )}
              {preview.rungClasses.length > 1 && !readOnly && preview.students.length > 0 && (
                <div className="sm:max-w-xs">
                  <SelectField
                    label="Place every pupil who is moving up in"
                    value=""
                    options={[
                      { value: "", label: "Choose a class" },
                      ...preview.rungClasses.map((c) => ({ value: c.id, label: classLabel(c) })),
                    ]}
                    onChange={(e) => e.target.value && placeAll(e.target.value)}
                  />
                </div>
              )}
              {preview.students.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
                  Nobody is on the roll of this class for {source?.label}. It may already have been rolled.
                </p>
              ) : (
                <>
                  <PromotionPreviewTable
                    preview={preview}
                    choices={choices}
                    onChoice={(id, c) => setChoices((m) => ({ ...m, [id]: c }))}
                    readOnly={readOnly}
                  />
                  {!readOnly && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div className="sm:max-w-md sm:flex-1">
                        <TextField
                          label="Note for the record (optional)"
                          value={notes}
                          maxLength={500}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                      <div>
                        <Button
                          onClick={() => {
                            setConfirmError(null);
                            confirm.show(true);
                          }}
                          disabled={
                            missingReason ||
                            unplaced > 0 ||
                            (preview.targetClassGroup !== null && preview.targetArms.length === 0 && plan.counts.PROMOTED > 0)
                          }
                        >
                          Review and roll
                        </Button>
                        {missingReason && (
                          <p className="mt-2 text-xs text-danger-fg">Give a reason for each pupil you handle differently.</p>
                        )}
                        {unplaced > 0 && (
                          <p className="mt-2 text-xs text-danger-fg">
                            Choose a class for {unplaced === 1 ? "the pupil" : `each of the ${unplaced} pupils`} who{" "}
                            {unplaced === 1 ? "is" : "are"} moving up.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {confirm.n > 0 && preview && (
        <Dialog
          key={`confirm-${confirm.n}`}
          open={confirm.open}
          onClose={confirm.hide}
          title={`Roll ${preview.sourceClassGroup.name}?`}
          description={`${source?.label} → ${sessions.find((s) => s.id === targetId)?.label}`}
        >
          <ul className="mt-4 space-y-1 text-sm text-fg-2">
            {(["PROMOTED", "REPEATED", "GRADUATED", "WITHDRAWN"] as const).map((d) => (
              <li key={d}>
                {plan.counts[d]} to {DECISION_LABEL[d].toLowerCase()}
              </li>
            ))}
            {preview.rungClasses.length > 1 &&
              preview.rungClasses
                .filter((c) => plan.byClass.has(c.id))
                .map((c) => (
                  <li key={c.id} className="ml-4 text-fg-muted">
                    {plan.byClass.get(c.id)} into {classLabel(c)}
                  </li>
                ))}
            {plan.skipped > 0 && <li>{plan.skipped} already placed in the next session: left as they are</li>}
          </ul>
          {!preview.eligibility.eligible && <p className="mt-3 text-sm text-warn-fg">{preview.eligibility.reason}</p>}
          <p className="mt-3 text-sm text-fg-muted">
            This is recorded for good. Rolling the same class again is safe: pupils who have already been dealt with are left alone, and a
            second roll with nobody left is refused.
          </p>
          {confirmError && (
            <Alert variant="error" className="mt-3">
              {confirmError}
            </Alert>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" data-initial-focus onClick={confirm.hide}>
              Cancel
            </Button>
            <Button onClick={() => void run()} loading={running}>
              Roll the class
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
