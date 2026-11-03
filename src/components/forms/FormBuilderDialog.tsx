"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { KIND_PATH, useFormsApi } from "@/components/forms/FormsApi";
import { QuestionEditor } from "@/components/forms/QuestionEditor";
import {
  KIND_NOUN,
  ROLE_CHOICES,
  blankQuestion,
  instantOf,
  questionPayload,
  questionProblem,
  type DraftQuestion,
  type FormKindKey,
} from "@/components/forms/model";

// Writing a new practice set, questionnaire or piece of paper work. The same dialog for the three kinds, showing only what each needs. Presentation only: the API checks every field
// again and says what is wrong, in words; what is written here is never trusted for who may do what.

type ClassGroup = { id: string; name: string };

export function FormBuilderDialog({
  kind,
  open,
  classGroups,
  onClose,
  onSaved,
}: {
  kind: FormKindKey;
  open: boolean;
  classGroups: ClassGroup[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`New ${KIND_NOUN[kind]}`} wide>
      {open && <Body kind={kind} classGroups={classGroups} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function Body({
  kind,
  classGroups,
  onClose,
  onSaved,
}: {
  kind: FormKindKey;
  classGroups: ClassGroup[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { api } = useFormsApi();
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [minutes, setMinutes] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>(kind === "PAPER_WORK" ? [] : [blankQuestion()]);
  const [publicLink, setPublicLink] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);

  const noun = KIND_NOUN[kind];
  const asks = kind !== "PAPER_WORK";
  const hasTimeLimit = kind !== "QUESTIONNAIRE";
  const showsClasses =
    kind === "PRACTICE_SET" ||
    kind === "PAPER_WORK" ||
    (kind === "QUESTIONNAIRE" && !publicLink && (roles.length === 0 || roles.includes("STUDENT")));
  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  function problemsOf(): string[] {
    const found: string[] = [];
    if (title.trim().length === 0) found.push("Give it a title.");
    if (kind === "PAPER_WORK" && classIds.length === 0) found.push("Choose at least one class for the paper work.");
    if (hasTimeLimit && minutes.trim() !== "" && !(Number.isInteger(Number(minutes)) && Number(minutes) >= 1 && Number(minutes) <= 1440))
      found.push("The time limit is a whole number of minutes, from 1 to 1440.");
    const from = instantOf(opens);
    const until = instantOf(closes);
    if ((opens && !from) || (closes && !until)) found.push("Check the dates: one of them is not a date.");
    else if (from && until && new Date(until) <= new Date(from)) found.push("It must close after it opens.");
    if (asks) {
      if (questions.length === 0) found.push("Add at least one question.");
      for (const [i, q] of questions.entries()) {
        const problem = questionProblem(q, i + 1, kind);
        if (problem) found.push(problem);
      }
    }
    return found;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found = problemsOf();
    if (found.length > 0) return setProblems(found);
    setProblems([]);
    setPending(true);
    const body: Record<string, unknown> = {
      title: title.trim(),
      instructions: instructions.trim() || null,
      opensAt: instantOf(opens),
      closesAt: instantOf(closes),
    };
    if (showsClasses) body.classGroupIds = classIds;
    if (hasTimeLimit) body.maxDurationMinutes = minutes.trim() === "" ? null : Number(minutes);
    if (asks) body.questions = questions.map((q, i) => questionPayload(q, i, kind));
    if (kind === "QUESTIONNAIRE") {
      body.audienceKind = publicLink ? "PUBLIC" : "MEMBERS";
      body.isAnonymous = anonymous;
      body.roles = publicLink ? [] : roles;
    }
    const reply = await sendJson(`${api}/${KIND_PATH[kind]}`, "POST", body);
    setPending(false);
    if (!reply.ok) {
      const details = (reply.details ?? []).map((d) => d.message);
      return setProblems(details.length > 0 ? [...new Set(details)] : [say(reply, `The ${noun} couldn't be saved.`)]);
    }
    // Here a practice set and paper work are open as soon as they are made (their window decides when pupils can start); a questionnaire is a draft until it is published.
    onSaved(
      kind === "QUESTIONNAIRE"
        ? "Questionnaire saved as a draft. Publish it when it is ready."
        : kind === "PAPER_WORK"
          ? "Paper work created."
          : "Practice set created. Pupils of its classes can start it in its window.",
    );
    onClose();
  }

  return (
    <form onSubmit={save} className="space-y-5" noValidate>
      {problems.length > 0 && (
        <Alert variant="error">
          <ul className="list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <TextAreaField
        label="Instructions"
        rows={3}
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={5000}
      />

      {kind === "QUESTIONNAIRE" && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-fg">Who answers</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
            <input type="radio" name="audience" checked={!publicLink} onChange={() => setPublicLink(false)} />
            Members of the school
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm text-fg-2">
            <input type="radio" name="audience" checked={publicLink} onChange={() => setPublicLink(true)} />
            Anyone with the link
          </label>
          {publicLink && (
            <p className="text-xs text-fg-muted">
              A public link cannot tell who is answering. Each browser is asked to answer once, but anyone can clear that and answer again.
              Do not ask about pupils. It is rate-limited and checked for spam.
            </p>
          )}
          <CheckboxField label="Anonymous" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          <p className="text-xs text-fg-muted">
            {anonymous ? "Nobody, including you, will be able to see who gave which answer." : "You will be able to see who answered."}
          </p>
        </fieldset>
      )}

      {kind === "QUESTIONNAIRE" && !publicLink && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-fg">Roles</legend>
          <p className="text-xs text-fg-muted">Leave all unticked to address every role.</p>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {ROLE_CHOICES.map((r) => (
              <CheckboxField
                key={r.value}
                label={r.label}
                checked={roles.includes(r.value)}
                onChange={(e) => setRoles(toggle(roles, r.value, e.target.checked))}
              />
            ))}
          </div>
        </fieldset>
      )}

      {showsClasses && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-fg">{kind === "QUESTIONNAIRE" ? "Pupils of these classes" : "Classes"}</legend>
          <p className="text-xs text-fg-muted">{kind === "PAPER_WORK" ? "Choose at least one." : "Leave all unticked for every class."}</p>
          {classGroups.length === 0 ? (
            <p className="text-sm text-fg-muted">There are no classes yet.</p>
          ) : (
            <div className="grid gap-x-6 sm:grid-cols-2">
              {classGroups.map((g) => (
                <CheckboxField
                  key={g.id}
                  label={g.name}
                  checked={classIds.includes(g.id)}
                  onChange={(e) => setClassIds(toggle(classIds, g.id, e.target.checked))}
                />
              ))}
            </div>
          )}
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="Opens" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
        <TextField label="Closes" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
        {hasTimeLimit && (
          <TextField
            label="Time limit (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            max={1440}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            hint="Leave empty for no limit."
          />
        )}
      </div>

      {asks && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-fg">Questions</h3>
          {questions.map((q, i) => (
            <QuestionEditor
              key={i}
              number={i + 1}
              kind={kind}
              question={q}
              onChange={(next) => setQuestions(questions.map((x, j) => (j === i ? next : x)))}
              onRemove={questions.length > 1 ? () => setQuestions(questions.filter((_, j) => j !== i)) : null}
            />
          ))}
          <Button variant="secondary" onClick={() => setQuestions([...questions, blankQuestion()])}>
            Add a question
          </Button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {kind === "PAPER_WORK" ? "Create paper work" : kind === "PRACTICE_SET" ? "Create practice set" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
