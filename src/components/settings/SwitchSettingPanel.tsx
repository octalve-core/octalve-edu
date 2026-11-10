"use client";

import { useState } from "react";
import { failureText, useApi } from "@/components/academics/useApi";
import { sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { StepUpModal, type StepUpChange } from "@/components/settings/StepUpModal";

// A switch with a ceiling (tasks 0027 and 0028): the school's administrator turns it on or off for the whole school (with the fresh proof); each campus can only turn it OFF for itself (a campus
// can never switch on what the school switched off). Used for "may a campus administrator suspend" (Discipline) and "are programs switched on" (Programs); the words are the caller's.
// Presentation only: the API checks everything again and says why not.

type View = {
  school: { stored: boolean | null; effective: boolean };
  campuses: { id: string; name: string; stored: boolean | null; effective: boolean; canEdit: boolean }[];
  canEditSchool: boolean;
};
type StepUp = { type: "totp" | "recovery" | "password"; value: string };

export type SwitchWords = {
  /// The path after /settings/ (standing, programs).
  endpoint: string;
  headingId: string;
  heading: string;
  intro: string;
  /// The sentence about a value: "Suspending by a campus administrator is {allowed}".
  about: (allowed: boolean, where: "school" | "campus") => string;
  /// The step-up dialog's field name.
  field: string;
  offSchool: string;
  onSchool: string;
  offCampus: string;
  /// The words for a state in the "from -> to" line of the step-up dialog.
  state: (on: boolean) => string;
  doneSchool: string;
};

export function SwitchSettingPanel({ schoolCode, hasMfa, words }: { schoolCode: string; hasMfa: boolean; words: SwitchWords }) {
  const base = `/api/v1/schools/${schoolCode}/settings/${words.endpoint}`;
  const { reply, error, loading, reload } = useApi(base);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ change: StepUpChange; send: (stepUp: StepUp) => Promise<Reply>; done: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading && !reply) return <p role="status">Loading the {words.heading.toLowerCase()} setting…</p>;
  if (error || !reply) return <Alert variant="error">{error ?? `The ${words.heading.toLowerCase()} setting could not be loaded.`}</Alert>;
  const view = reply.data as unknown as View;

  const changeSchool = (enabled: boolean | null) => {
    setDone(null);
    setProblem(null);
    setSaveError(null);
    setPending({
      change: {
        field: words.field,
        fromValue: words.state(view.school.effective),
        toValue: enabled === null ? `the default (${words.state(true)})` : words.state(enabled),
        isWeakeningSecurity: false,
      },
      send: (stepUp) => sendJson(base, "PATCH", { scope: "SCHOOL", enabled, stepUp }),
      done: words.doneSchool,
    });
  };

  const changeCampus = async (campusId: string, name: string, enabled: boolean | null) => {
    setDone(null);
    setProblem(null);
    setBusy(campusId);
    const answer = await sendJson(base, "PATCH", { scope: "CAMPUS", campusId, enabled });
    setBusy(null);
    if (!answer.ok) return setProblem(failureText(answer.status, answer.message));
    setDone(`${name}'s setting is saved.`);
    await reload(true);
  };

  const confirm = async (stepUp: StepUp) => {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    const answer = await pending.send(stepUp);
    setSaving(false);
    if (!answer.ok) return setSaveError(failureText(answer.status, answer.message));
    setPending(null);
    setDone(pending.done);
    await reload(true);
  };

  return (
    <section aria-labelledby={words.headingId} className="mt-10 space-y-4">
      <div>
        <h2 id={words.headingId} className="text-lg font-semibold tracking-tight text-fg">
          {words.heading}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">{words.intro}</p>
      </div>
      {done && <Alert variant="success">{done}</Alert>}
      {problem && <Alert variant="error">{problem}</Alert>}

      <div className="rounded-xl border border-line bg-surface p-5">
        <h3 className="text-sm font-semibold text-fg">The school</h3>
        <p className="mt-1 text-sm text-fg-muted">
          {words.about(view.school.effective, "school")}
          {view.school.stored === null ? " (the default)" : ""}.
        </p>
        {view.canEditSchool && (
          <div className="mt-3 flex flex-wrap gap-2">
            {view.school.effective ? (
              <Button type="button" variant="secondary" onClick={() => changeSchool(false)}>
                {words.offSchool}
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={() => changeSchool(true)}>
                {words.onSchool}
              </Button>
            )}
            {view.school.stored !== null && (
              <Button type="button" variant="ghost" onClick={() => changeSchool(null)}>
                Go back to the default
              </Button>
            )}
          </div>
        )}
      </div>

      {view.campuses.length > 0 && (
        <ul className="space-y-3">
          {view.campuses.map((campus) => (
            <li key={campus.id} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-fg">{campus.name}</h3>
              <p className="mt-1 text-sm text-fg-muted">
                {words.about(campus.effective, "campus")}
                {campus.stored === false ? " (turned off for this campus)" : ""}.
              </p>
              {campus.canEdit && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {campus.effective && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy === campus.id}
                      onClick={() => void changeCampus(campus.id, campus.name, false)}
                    >
                      {words.offCampus}
                    </Button>
                  )}
                  {campus.stored !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy === campus.id}
                      onClick={() => void changeCampus(campus.id, campus.name, null)}
                    >
                      Remove this campus&apos;s own setting
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <StepUpModal
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        hasMfa={hasMfa}
        deltas={pending ? [pending.change] : []}
        saving={saving}
        error={saveError}
      />
    </section>
  );
}
