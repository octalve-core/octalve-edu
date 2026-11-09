"use client";

import { useState, type FormEvent } from "react";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { SelectField } from "@/components/ui/SelectField";
import { bandsProblem } from "@/lib/programs/assessment-rules";
import { offText } from "./attendance-model";
import type { ProgramDetail } from "./model";

// The program's own switches and numbers (task 0027): the third level under the school's and the campus's. Presentation only: the API checks who may and says why not. (Slices P3b, P4 and P5 add
// their sections here.)

type Act = (send: () => Promise<Reply>, done: string) => Promise<boolean>;

export function ProgramSettingsTab({ program, base, act }: { program: ProgramDetail; base: string; act: Act }) {
  const settings = program.settings;
  const editable = program.can.editDetails && settings !== null;
  const [percent, setPercent] = useState(String(settings?.lowAttendancePercent ?? 75));
  const [problem, setProblem] = useState<string | null>(null);
  const [bands, setBands] = useState<{ name: string; from: string }[]>(
    (settings?.gradeBands ?? []).map((b) => ({ name: b.name, from: String(b.from) })),
  );
  const [bandProblem, setBandProblem] = useState<string | null>(null);
  const [cert, setCert] = useState({
    title: settings?.certTitle ?? "",
    body: settings?.certBody ?? "",
    signatories: (settings?.certSignatories ?? []).map((x) => ({ name: x.name, title: x.title })),
    minAverage:
      settings?.completionMinAverage === null || settings?.completionMinAverage === undefined ? "" : String(settings.completionMinAverage),
  });
  const [certProblem, setCertProblem] = useState<string | null>(null);
  if (!settings) return <p className="text-sm text-fg-muted">The settings are shown to the people who manage the program.</p>;

  async function savePercent(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    const value = Number(percent);
    if (!Number.isInteger(value) || value < 1 || value > 100) return setProblem("The threshold is a whole percentage from 1 to 100.");
    await act(() => sendJson(`${base}/settings`, "PATCH", { lowAttendancePercent: value }), "The threshold is saved.");
  }

  async function saveBands(event: FormEvent) {
    event.preventDefault();
    setBandProblem(null);
    if (bands.some((b) => b.name.trim() === "" || b.from.trim() === "" || !Number.isFinite(Number(b.from))))
      return setBandProblem("Give each grade a name and the percentage it starts at.");
    const parsed = bands.map((b) => ({ name: b.name.trim(), from: Number(b.from) }));
    const why = bandsProblem(parsed);
    if (why) return setBandProblem(why);
    await act(
      () => sendJson(`${base}/settings`, "PATCH", { gradeBands: parsed }),
      parsed.length === 0 ? "The grades are removed." : "The grades are saved.",
    );
  }

  async function saveCert(event: FormEvent) {
    event.preventDefault();
    setCertProblem(null);
    const average = cert.minAverage.trim() === "" ? null : Number(cert.minAverage);
    if (average !== null && (!Number.isFinite(average) || average < 0 || average > 100))
      return setCertProblem("The average is a percentage from 0 to 100.");
    const signatories = cert.signatories.map((x) => ({ name: x.name.trim(), title: x.title.trim() })).filter((x) => x.name !== "");
    await act(
      () =>
        sendJson(`${base}/settings`, "PATCH", {
          certTitle: cert.title.trim(),
          certBody: cert.body.trim(),
          certSignatories: signatories,
          completionMinAverage: average,
        }),
      "The completion settings are saved.",
    );
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="attendance-settings" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="attendance-settings" className="text-base font-semibold text-fg">
          Attendance
        </h3>
        <p className="text-sm text-fg-muted">{offText(program.attendance, "Attendance is")}</p>
        <div className="flex items-center gap-3">
          <Switch
            id="program-attendance-switch"
            checked={settings.attendanceEnabled}
            disabled={!editable}
            onChange={() =>
              void act(
                () => sendJson(`${base}/settings`, "PATCH", { attendanceEnabled: !settings.attendanceEnabled }),
                settings.attendanceEnabled ? "Attendance is off for this program." : "Attendance is on for this program.",
              )
            }
          />
          <label htmlFor="program-attendance-switch" className="text-sm text-fg">
            Take attendance in this program
          </label>
        </div>
        <form onSubmit={savePercent} className="flex flex-wrap items-end gap-3" aria-label="Low attendance threshold" noValidate>
          <TextField
            label="Flag people under (%)"
            inputMode="numeric"
            value={percent}
            disabled={!editable}
            onChange={(e) => setPercent(e.target.value)}
            hint="A person whose attendance is under this is marked Low in the summary."
          />
          {editable && (
            <Button type="submit" variant="secondary">
              Save
            </Button>
          )}
        </form>
        {problem && <Alert variant="error">{problem}</Alert>}
      </section>

      <section aria-labelledby="assessments-settings" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="assessments-settings" className="text-base font-semibold text-fg">
          Assessments
        </h3>
        <p className="text-sm text-fg-muted">{offText(program.assessments, "Assessments are")}</p>
        <div className="flex items-center gap-3">
          <Switch
            id="program-assessments-switch"
            checked={settings.assessmentsEnabled}
            disabled={!editable}
            onChange={() =>
              void act(
                () => sendJson(`${base}/settings`, "PATCH", { assessmentsEnabled: !settings.assessmentsEnabled }),
                settings.assessmentsEnabled ? "Assessments are off for this program." : "Assessments are on for this program.",
              )
            }
          />
          <label htmlFor="program-assessments-switch" className="text-sm text-fg">
            Use assessments in this program
          </label>
        </div>
        <form onSubmit={saveBands} className="space-y-3" aria-label="Grades" noValidate>
          <p className="text-sm font-medium text-fg">Grades (optional)</p>
          <p className="text-xs text-fg-muted">
            With no grades a result is shown as a percentage and pass or fail. One grade must start at 0.
          </p>
          {bands.map((band, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <TextField
                label={`Grade ${index + 1} name`}
                value={band.name}
                maxLength={30}
                disabled={!editable}
                onChange={(e) => setBands((c) => c.map((b, i) => (i === index ? { ...b, name: e.target.value } : b)))}
              />
              <TextField
                label={`Grade ${index + 1} starts at (%)`}
                inputMode="decimal"
                value={band.from}
                disabled={!editable}
                onChange={(e) => setBands((c) => c.map((b, i) => (i === index ? { ...b, from: e.target.value } : b)))}
              />
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove grade ${index + 1}`}
                  onClick={() => setBands((c) => c.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {editable && (
            <div className="flex flex-wrap gap-2">
              {bands.length < 10 && (
                <Button type="button" variant="secondary" onClick={() => setBands((c) => [...c, { name: "", from: "" }])}>
                  Add a grade
                </Button>
              )}
              <Button type="submit" variant="secondary">
                Save the grades
              </Button>
            </div>
          )}
          {bandProblem && <Alert variant="error">{bandProblem}</Alert>}
        </form>
      </section>

      <section aria-labelledby="fees-settings" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="fees-settings" className="text-base font-semibold text-fg">
          Fees
        </h3>
        <p className="text-sm text-fg-muted">{offText(program.fees, "Fees are")}</p>
        <div className="flex items-center gap-3">
          <Switch
            id="program-fees-switch"
            checked={settings.feesEnabled}
            disabled={!editable}
            onChange={() =>
              void act(
                () => sendJson(`${base}/settings`, "PATCH", { feesEnabled: !settings.feesEnabled }),
                settings.feesEnabled ? "Fees are off for this program." : "Fees are on for this program.",
              )
            }
          />
          <label htmlFor="program-fees-switch" className="text-sm text-fg">
            Charge fees in this program
          </label>
        </div>
      </section>

      <section aria-labelledby="completion-settings" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="completion-settings" className="text-base font-semibold text-fg">
          Completion and certificates
        </h3>
        <p className="text-sm text-fg-muted">
          The wording a certificate carries when it is issued (a later change never changes an old one), and the rule a person must meet to
          be completed. In the wording, {"{name}"}, {"{program}"}, {"{from}"}, {"{to}"} and {"{school}"} are replaced.
        </p>
        <form onSubmit={saveCert} className="space-y-3" aria-label="Completion and certificates" noValidate>
          <TextField
            label="Certificate title"
            value={cert.title}
            maxLength={80}
            disabled={!editable}
            onChange={(e) => setCert({ ...cert, title: e.target.value })}
          />
          <TextAreaField
            label="Certificate wording"
            value={cert.body}
            maxLength={600}
            rows={3}
            disabled={!editable}
            onChange={(e) => setCert({ ...cert, body: e.target.value })}
          />
          {cert.signatories.map((sig, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <TextField
                label={`Signatory ${index + 1} name`}
                value={sig.name}
                maxLength={80}
                disabled={!editable}
                onChange={(e) =>
                  setCert({ ...cert, signatories: cert.signatories.map((x, i) => (i === index ? { ...x, name: e.target.value } : x)) })
                }
              />
              <TextField
                label={`Signatory ${index + 1} title`}
                value={sig.title}
                maxLength={80}
                disabled={!editable}
                onChange={(e) =>
                  setCert({ ...cert, signatories: cert.signatories.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)) })
                }
              />
              {editable && (
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`Remove signatory ${index + 1}`}
                  onClick={() => setCert({ ...cert, signatories: cert.signatories.filter((_, i) => i !== index) })}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
          {editable && cert.signatories.length < 2 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCert({ ...cert, signatories: [...cert.signatories, { name: "", title: "" }] })}
            >
              Add a signatory
            </Button>
          )}
          <TextField
            label="Completion needs an average of at least (%)"
            inputMode="decimal"
            value={cert.minAverage}
            disabled={!editable}
            hint="Leave empty for no average. Counted over the published assessments."
            onChange={(e) => setCert({ ...cert, minAverage: e.target.value })}
          />
          {editable && (
            <Button type="submit" variant="secondary">
              Save the wording and the average
            </Button>
          )}
          {certProblem && <Alert variant="error">{certProblem}</Alert>}
        </form>
        <div className="flex items-center gap-3">
          <Switch
            id="program-require-passed"
            checked={settings.completionRequirePassed}
            disabled={!editable}
            onChange={() =>
              void act(
                () => sendJson(`${base}/settings`, "PATCH", { completionRequirePassed: !settings.completionRequirePassed }),
                "The rule is saved.",
              )
            }
          />
          <label htmlFor="program-require-passed" className="text-sm text-fg">
            Every required assessment must be passed
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="program-no-cert-owing"
            checked={settings.noCertWhileOwing}
            disabled={!editable}
            onChange={() =>
              void act(() => sendJson(`${base}/settings`, "PATCH", { noCertWhileOwing: !settings.noCertWhileOwing }), "The rule is saved.")
            }
          />
          <label htmlFor="program-no-cert-owing" className="text-sm text-fg">
            No certificate while fees are owed
          </label>
        </div>
      </section>

      <section aria-labelledby="progress-settings" className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <h3 id="progress-settings" className="text-base font-semibold text-fg">
          Progress records
        </h3>
        <p className="text-sm text-fg-muted" data-testid="progress-settings-state">
          {offText(program.progress, "Progress records are")}
        </p>
        <div className="flex items-center gap-3">
          <Switch
            id="program-progress-switch"
            checked={settings.progressEnabled}
            disabled={!editable || (!settings.progressEnabled && !settings.progressTemplate)}
            onChange={() =>
              void act(
                () => sendJson(`${base}/settings`, "PATCH", { progressEnabled: !settings.progressEnabled }),
                settings.progressEnabled ? "Progress records are off for this program." : "Progress records are on for this program.",
              )
            }
          />
          <label htmlFor="program-progress-switch" className="text-sm text-fg">
            Keep progress records in this program
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Template"
            options={[
              { value: "", label: settings.progressTemplate ? "Choose another template" : "Choose a template" },
              { value: "QURAN_BOOKLET", label: "Quran booklet (new text, revision, follow-up)" },
              { value: "SIMPLE_LOG", label: "Simple log (a dated note and a rating)" },
            ]}
            value={settings.progressTemplate ?? ""}
            disabled={!editable}
            onChange={(e) =>
              e.target.value &&
              void act(() => sendJson(`${base}/settings`, "PATCH", { progressTemplate: e.target.value }), "The template is chosen.")
            }
          />
          <SelectField
            label="Who may write"
            options={[
              { value: "BOTH", label: "The group's teachers and the recorders" },
              { value: "TEACHERS", label: "The group's teachers" },
              { value: "ASSIGNED", label: "The recorders assigned to the group" },
            ]}
            value={settings.progressWriters}
            disabled={!editable}
            onChange={(e) => void act(() => sendJson(`${base}/settings`, "PATCH", { progressWriters: e.target.value }), "Saved.")}
          />
        </div>
        {(
          [
            ["progressRequireVerification", "Entries must be verified before families see them"],
            ["progressFourEyes", "The person who verified must not be the one who wrote the entry"],
            ["progressStudentView", "Pupils can see their own records"],
            ["progressGuardianView", "Guardians can see their child's records"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex items-center gap-3">
            <Switch
              id={`program-${key}`}
              checked={settings[key]}
              disabled={!editable || (key === "progressFourEyes" && !program.progress.canChangeFourEyes)}
              onChange={() => void act(() => sendJson(`${base}/settings`, "PATCH", { [key]: !settings[key] }), "Saved.")}
            />
            <label htmlFor={`program-${key}`} className="text-sm text-fg">
              {label}
            </label>
          </div>
        ))}
        {program.progress.studentViewOffBy && (
          <p className="text-xs text-fg-muted">
            Pupils cannot see it: switched off by the{" "}
            {program.progress.studentViewOffBy === "SCHOOL"
              ? "school"
              : program.progress.studentViewOffBy === "CAMPUS"
                ? "campuses"
                : "program"}
            .
          </p>
        )}
        {program.progress.guardianViewOffBy && (
          <p className="text-xs text-fg-muted">
            Guardians cannot see it: switched off by the{" "}
            {program.progress.guardianViewOffBy === "SCHOOL"
              ? "school"
              : program.progress.guardianViewOffBy === "CAMPUS"
                ? "campuses"
                : "program"}
            .
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="What a guardian sees"
            options={[
              { value: "SUMMARY", label: "A summary" },
              { value: "FULL", label: "The full entries" },
            ]}
            value={settings.progressGuardianDetail}
            disabled={!editable}
            onChange={(e) => void act(() => sendJson(`${base}/settings`, "PATCH", { progressGuardianDetail: e.target.value }), "Saved.")}
          />
          <SelectField
            label="Hijri date adjustment (days)"
            options={[-2, -1, 0, 1, 2].map((n) => ({ value: String(n), label: n > 0 ? `+${n}` : String(n) }))}
            value={String(settings.progressHijriAdjust)}
            disabled={!editable}
            onChange={(e) =>
              void act(() => sendJson(`${base}/settings`, "PATCH", { progressHijriAdjust: Number(e.target.value) }), "Saved.")
            }
          />
        </div>
      </section>
    </div>
  );
}
