"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { sendForm, sendJson } from "@/components/auth/postJson";
import { say } from "@/components/question-bank/say";
import { useBankApi } from "@/components/question-bank/BankApi";
import { MAX_OPTIONS, MIN_OPTIONS, TYPE_LABEL, blankForm, bodyOf, formOf, imageUrl, type ApiItem, type FormState, type ItemType } from "@/components/question-bank/model";
import { TagInput } from "@/components/question-bank/TagInput";

// Writing or correcting a question. A new question is saved as a draft only its writer sees; pictures are added to a SAVED question (each needs a description, or to be marked
// decorative). Presentation only: the server checks every field and says what is wrong, in words.

const TYPES = Object.keys(TYPE_LABEL) as ItemType[];
const itemUrl = (api: string, id: string) => `${api}/items/${encodeURIComponent(id)}`;

export function QuestionForm({
  open,
  item,
  writeCampuses,
  wholeSchool,
  onClose,
  onSaved,
}: {
  open: boolean;
  /// The question being corrected, or null for a new one.
  item: ApiItem | null;
  /// The campuses the person may write for, and whether they may write for the whole school.
  writeCampuses: { id: string; name: string }[];
  wholeSchool: boolean;
  onClose: () => void;
  /// Called with the saved question (and again whenever a picture changes it).
  onSaved: (item: ApiItem, message: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit the question" : "Write a question"} wide>
      {open && <FormBody key={item?.id ?? "new"} item={item} writeCampuses={writeCampuses} wholeSchool={wholeSchool} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}

function FormBody({ item, writeCampuses, wholeSchool, onClose, onSaved }: { item: ApiItem | null; writeCampuses: { id: string; name: string }[]; wholeSchool: boolean; onClose: () => void; onSaved: (item: ApiItem, message: string) => void }) {
  const api = useBankApi();
  const [saved, setSaved] = useState<ApiItem | null>(item);
  const [form, setForm] = useState<FormState>(item ? formOf(item) : blankForm());
  // "" is the whole school. A person tied to one campus is not asked: the server writes for their own campus.
  const places = [...(wholeSchool ? [{ value: "", label: "The whole school" }] : []), ...writeCampuses.map((c) => ({ value: c.id, label: c.name }))];
  const [campusId, setCampusId] = useState(places[0]?.value ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setProblems([]);
    setPending(true);
    const body = bodyOf(form);
    const reply = saved
      ? await sendJson(itemUrl(api, saved.id), "PATCH", body)
      : await sendJson(`${api}/items`, "POST", { ...(places.length > 1 || (wholeSchool && places.length === 1) ? { campusId: campusId || null } : {}), ...body });
    setPending(false);
    if (!reply.ok) {
      const details = (reply.details ?? []).map((d) => d.message);
      return setProblems(details.length > 0 ? [...new Set(details)] : [say(reply, "That couldn't be saved.")]);
    }
    const next = reply.data!.item as ApiItem;
    setSaved(next);
    onSaved(next, saved ? "Saved." : "Saved as a draft. Add pictures if you need them, then send it for review.");
    if (saved) onClose();
  }

  const multi = form.type === "MULTI";
  const choice = form.type === "SINGLE" || multi;

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="space-y-4" noValidate>
        {problems.length > 0 && (
          <Alert variant="error">
            <ul className="list-disc pl-5">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Alert>
        )}
        {!saved && places.length > 1 && (
          <SelectField label="Written for" value={campusId} onChange={(e) => setCampusId(e.target.value)} options={places} />
        )}
        <SelectField
          label="Kind of question"
          value={form.type}
          onChange={(e) => set("type", e.target.value as ItemType)}
          options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        />
        <TextAreaField label="Question" rows={4} value={form.prompt} onChange={(e) => set("prompt", e.target.value)} maxLength={4200} />

        {choice && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg">Options</legend>
            <p className="text-xs text-fg-muted">{multi ? "Tick every correct option." : "Choose the one correct option."}</p>
            <ul className="space-y-2">
              {form.options.map((text, index) => (
                <li key={index} className="flex items-end gap-2">
                  <label className="flex min-h-11 items-center px-1">
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name="correct"
                      aria-label={`Option ${index + 1} is correct`}
                      checked={multi ? form.multi.includes(index) : form.single === index}
                      onChange={(e) => (multi ? set("multi", e.target.checked ? [...form.multi, index] : form.multi.filter((i) => i !== index)) : set("single", index))}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <TextField
                      label={`Option ${index + 1}`}
                      value={text}
                      onChange={(e) => set("options", form.options.map((o, i) => (i === index ? e.target.value : o)))}
                      maxLength={520}
                    />
                  </div>
                  {form.options.length > MIN_OPTIONS && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        set("options", form.options.filter((_, i) => i !== index));
                        set("multi", form.multi.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)));
                        set("single", form.single === index ? 0 : form.single > index ? form.single - 1 : form.single);
                      }}
                    >
                      Remove<span className="sr-only"> option {index + 1}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {form.options.length < MAX_OPTIONS && (
              <Button variant="secondary" onClick={() => set("options", [...form.options, ""])}>
                Add an option
              </Button>
            )}
          </fieldset>
        )}

        {form.type === "TRUE_FALSE" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg">The correct answer is</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
              <input type="radio" name="truth" checked={form.truth} onChange={() => set("truth", true)} />
              True
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
              <input type="radio" name="truth" checked={!form.truth} onChange={() => set("truth", false)} />
              False
            </label>
          </fieldset>
        )}

        {form.type === "SHORT" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-fg">Accepted answers</legend>
            <p className="text-xs text-fg-muted">A pupil&apos;s answer is right if it matches any of these.</p>
            <ul className="space-y-2">
              {form.accepted.map((text, index) => (
                <li key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <TextField
                      label={`Accepted answer ${index + 1}`}
                      value={text}
                      onChange={(e) => set("accepted", form.accepted.map((a, i) => (i === index ? e.target.value : a)))}
                      maxLength={520}
                    />
                  </div>
                  {form.accepted.length > 1 && (
                    <Button variant="ghost" onClick={() => set("accepted", form.accepted.filter((_, i) => i !== index))}>
                      Remove<span className="sr-only"> answer {index + 1}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {form.accepted.length < 10 && (
              <Button variant="secondary" onClick={() => set("accepted", [...form.accepted, ""])}>
                Add another accepted answer
              </Button>
            )}
          </fieldset>
        )}

        <TextAreaField label="Explanation (optional)" rows={3} value={form.explanation} onChange={(e) => set("explanation", e.target.value)} maxLength={2100} hint="Shown to pupils after they answer." />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Points" inputMode="numeric" value={form.points} onChange={(e) => set("points", e.target.value)} maxLength={3} />
          <SelectField
            label="Difficulty (optional)"
            value={form.difficulty}
            onChange={(e) => set("difficulty", e.target.value)}
            options={[{ value: "", label: "Not set" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} of 5` }))]}
          />
          <TextField label="Topic (optional)" value={form.topic} onChange={(e) => set("topic", e.target.value)} maxLength={130} />
        </div>
        <TextField label="Subject" value={form.subject} onChange={(e) => set("subject", e.target.value)} maxLength={90} hint="For example Mathematics. A reviewer can change it." />
        <TagInput label="Classes" tags={form.classTags} onChange={(tags) => set("classTags", tags)} hint="For example JSS 1. Type one and press Enter." />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {saved ? "Close" : "Cancel"}
          </Button>
          <Button type="submit" loading={pending}>
            {pending ? "Saving…" : saved ? "Save changes" : "Save as a draft"}
          </Button>
        </div>
      </form>

      {saved && <Pictures item={saved} onChanged={(next, message) => { setSaved(next); onSaved(next, message); }} />}
    </div>
  );
}

function Pictures({ item, onChanged }: { item: ApiItem; onChanged: (item: ApiItem, message: string) => void }) {
  const api = useBankApi();
  const [alt, setAlt] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!file) return setError("Choose a picture.");
    if (!decorative && alt.trim() === "") return setError("Describe the picture for someone who cannot see it, or say it is only decoration.");
    setError(null);
    setPending(true);
    const data = new FormData();
    data.append("file", file);
    if (decorative) data.append("decorative", "true");
    else data.append("alt", alt);
    const reply = await sendForm(`${itemUrl(api, item.id)}/images`, data);
    setPending(false);
    if (!reply.ok) return setError(say(reply, "The picture couldn't be added."));
    setAlt("");
    setDecorative(false);
    setFile(null);
    setFileKey(fileKey + 1);
    onChanged(reply.data!.item as ApiItem, "Picture added.");
  }

  async function remove(imageId: string) {
    if (pending) return;
    setPending(true);
    const reply = await sendJson(`${itemUrl(api, item.id)}/images/${encodeURIComponent(imageId)}`, "DELETE");
    setPending(false);
    if (!reply.ok) return setError(say(reply, "The picture couldn't be removed."));
    setError(null);
    onChanged(reply.data!.item as ApiItem, "Picture removed.");
  }

  return (
    <section aria-labelledby="pictures-heading" className="space-y-3 border-t border-line pt-5">
      <h3 id="pictures-heading" className="text-sm font-semibold text-fg">
        Pictures
      </h3>
      <div aria-live="polite" className="empty:hidden">
        {error && <Alert variant="error">{error}</Alert>}
      </div>
      {item.images.length === 0 ? (
        <p className="text-sm text-fg-muted">No pictures yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {item.images.map((image, index) => (
            <li key={image.id} className="space-y-2 rounded-xl border border-line bg-surface-2 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- our own route, same origin, private */}
              <img src={imageUrl(api, item.id, image.id)} alt={image.decorative ? "" : image.alt} width={image.width} height={image.height} className="mx-auto h-auto max-h-40 w-auto max-w-full" />
              <p className="text-xs text-fg-2">{image.decorative ? "Decoration only" : image.alt}</p>
              <Button variant="secondary" onClick={() => remove(image.id)} disabled={pending}>
                Remove<span className="sr-only"> picture {index + 1}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="space-y-3 rounded-xl border border-line p-3" noValidate>
        <div>
          <label htmlFor="picture-file" className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
            Add a picture
          </label>
          <input
            key={fileKey}
            id="picture-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-fg file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line-strong file:bg-surface file:px-4 file:text-sm file:font-semibold file:text-fg"
          />
          <p className="mt-1.5 text-xs text-fg-muted">A JPEG, PNG or WebP picture under 8 MB. It is resized, and anything hidden in it (such as where it was taken) is removed.</p>
        </div>
        <TextField label="Describe the picture" value={alt} onChange={(e) => setAlt(e.target.value)} disabled={decorative} maxLength={320} hint="For someone who cannot see it." />
        <CheckboxField label="It is only decoration (no description needed)" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} />
        <Button type="submit" variant="secondary" loading={pending}>
          {pending ? "Adding…" : "Add picture"}
        </Button>
      </form>
    </section>
  );
}
