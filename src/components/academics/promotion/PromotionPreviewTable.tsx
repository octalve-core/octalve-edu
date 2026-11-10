"use client";

import { SelectField, type SelectOption } from "@/components/ui/SelectField";
import { StatusPill } from "../parts";
import {
  DECISION_LABEL,
  DECISION_PAST,
  NO_CHOICE,
  REGION,
  classLabel,
  finalDecision,
  isOverride,
  percent,
  type Choice,
  type Decision,
  type Preview,
} from "./model";

const tone = (decision: Decision) =>
  decision === "PROMOTED" || decision === "GRADUATED" ? "ok" : decision === "REPEATED" ? "warn" : "neutral";

/// The preview of one class: a row per pupil with the average of each period, the overall average, what the rule advises, and - for an administrator - a choice to handle the pupil
/// differently (with the reason that choice needs). The table scrolls sideways on a phone, so it is a labelled region a keyboard can reach.
export function PromotionPreviewTable({
  preview,
  choices,
  onChoice,
  readOnly,
}: {
  preview: Preview;
  choices: Record<string, Choice>;
  onChoice: (studentId: string, choice: Choice) => void;
  readOnly: boolean;
}) {
  const decisionOptions: SelectOption[] = [
    { value: "", label: "As advised" },
    ...(preview.targetClassGroup
      ? [{ value: "PROMOTED", label: DECISION_LABEL.PROMOTED }]
      : [{ value: "GRADUATED", label: DECISION_LABEL.GRADUATED }]),
    { value: "REPEATED", label: DECISION_LABEL.REPEATED },
    { value: "WITHDRAWN", label: DECISION_LABEL.WITHDRAWN },
  ];
  // Several classes on the next rung (streams): a promoted pupil's class is chosen here, and the arms offered are that class's.
  const severalClasses = preview.rungClasses.length > 1;
  const armsOf = (decision: Decision, classId: string): SelectOption[] | null => {
    if (decision !== "PROMOTED") return null;
    const chosen = classId ? preview.rungClasses.find((c) => c.id === classId) : undefined;
    return (chosen?.arms ?? preview.targetArms).map((a) => ({ value: a.id, label: a.name }));
  };

  return (
    <div role="region" aria-label={`Pupils of ${preview.sourceClassGroup.name}`} tabIndex={0} className={REGION}>
      <table className="w-full min-w-[56rem] text-left text-sm">
        <caption className="sr-only">
          Each pupil of {preview.sourceClassGroup.name}, the average of each period, and what will happen to them.
        </caption>
        <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
          <tr>
            <th scope="col" className="px-3 py-3">
              Pupil
            </th>
            {preview.academicPeriods.map((p) => (
              <th scope="col" key={p.id} className="px-3 py-3">
                {p.label}
              </th>
            ))}
            <th scope="col" className="px-3 py-3">
              Overall
            </th>
            <th scope="col" className="px-3 py-3">
              Advice
            </th>
            {!readOnly && (
              <th scope="col" className="px-3 py-3">
                Your decision
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {preview.students.map((row) => {
            const choice = choices[row.studentId] ?? NO_CHOICE;
            const decision = finalDecision(row, choice);
            const arms = armsOf(decision, choice.classId);
            const overridden = isOverride(row, choice);
            const name = `${row.firstName} ${row.lastName}`;
            return (
              <tr key={row.studentId} className="align-top">
                <th scope="row" className="px-3 py-3 font-medium text-fg">
                  {name}
                  <span className="block text-xs font-normal text-fg-muted">
                    {row.admissionNo} · {row.currentArmName}
                  </span>
                  {row.alreadyEnrolledInTarget && (
                    <span className="mt-1 block text-xs font-normal text-warn-fg">Already placed in the next session: left as it is.</span>
                  )}
                </th>
                {preview.academicPeriods.map((p) => (
                  <td key={p.id} className="px-3 py-3 text-fg-2 tabular-nums">
                    {percent(row.termAverages[String(p.ordinal)] ?? null)}
                  </td>
                ))}
                <td className="px-3 py-3 font-semibold text-fg tabular-nums">{percent(row.overallAverage)}</td>
                <td className="px-3 py-3">
                  <StatusPill tone={tone(row.recommendedDecision)}>{DECISION_PAST[row.recommendedDecision]}</StatusPill>
                  <span className="mt-1 block max-w-[16rem] text-xs text-fg-muted">{row.recommendationReason}</span>
                </td>
                {!readOnly && (
                  <td className="px-3 py-3">
                    {row.alreadyEnrolledInTarget ? (
                      <span className="text-xs text-fg-muted">Nothing to decide.</span>
                    ) : (
                      <div className="grid min-w-[14rem] gap-2">
                        <SelectField
                          label={`Decision for ${name}`}
                          hideLabel
                          value={choice.decision}
                          options={decisionOptions}
                          onChange={(e) => onChoice(row.studentId, { ...choice, decision: e.target.value as Decision | "", armId: "" })}
                        />
                        {severalClasses && decision === "PROMOTED" && (
                          <SelectField
                            label={`Class for ${name}`}
                            hideLabel
                            value={choice.classId}
                            options={[
                              {
                                value: "",
                                label: preview.placementNeeded
                                  ? "Choose a class"
                                  : `Class: ${preview.targetClassGroup?.name ?? "the next one"}`,
                              },
                              ...preview.rungClasses.map((c) => ({ value: c.id, label: classLabel(c) })),
                            ]}
                            onChange={(e) => onChoice(row.studentId, { ...choice, classId: e.target.value, armId: "" })}
                          />
                        )}
                        {arms && arms.length > 0 && (
                          <SelectField
                            label={`Arm for ${name}`}
                            hideLabel
                            value={choice.armId}
                            options={[{ value: "", label: "Arm: matching" }, ...arms]}
                            onChange={(e) => onChoice(row.studentId, { ...choice, armId: e.target.value })}
                          />
                        )}
                        {overridden && (
                          <div>
                            <label htmlFor={`why-${row.studentId}`} className="sr-only">
                              Reason for {name}
                            </label>
                            <input
                              id={`why-${row.studentId}`}
                              value={choice.reason}
                              maxLength={255}
                              placeholder="Reason (required)"
                              aria-invalid={choice.reason.trim() === "" ? true : undefined}
                              onChange={(e) => onChoice(row.studentId, { ...choice, reason: e.target.value })}
                              className="min-h-11 w-full rounded-xl border border-line bg-field px-3 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
