"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import type { ApproverView, ClassGroupView, SectionView } from "@/lib/results/approver-settings";
import { fitsCampus, heldEntries, sameEntries, scopeEntries } from "@/lib/results/approver-view";
import type { ScopeEntry } from "@/lib/results/section-rules";

// Where one approver approves (ADR 0018): Everything (General), or any mix of sections and classes. Only what fits the person's campus is offered, because the server refuses the
// rest. A section the person holds but that is archived stays in the list, ticked and marked, so the screen explains the refusal (restore it first) instead of hiding it.

export function ScopeEditor({
  approver,
  sections,
  classGroups,
  campusNames,
  busy,
  onSave,
  onCancel,
}: {
  approver: ApproverView;
  sections: readonly SectionView[];
  classGroups: readonly ClassGroupView[];
  campusNames: ReadonlyMap<string, string>;
  busy: boolean;
  /// Called with the entries to save and the words for the step-up dialog (what they are now, what they would be).
  onSave: (entries: ScopeEntry[], toWords: string) => void;
  onCancel: () => void;
}) {
  const held = useMemo(() => heldEntries(approver.scopes), [approver.scopes]);
  const [general, setGeneral] = useState(held.some((entry) => entry.kind === "GENERAL"));
  const [sectionIds, setSectionIds] = useState<Set<string>>(
    new Set(held.flatMap((entry) => (entry.kind === "SECTION" ? [entry.sectionId] : []))),
  );
  const [classIds, setClassIds] = useState<Set<string>>(
    new Set(held.flatMap((entry) => (entry.kind === "CLASS" ? [entry.classGroupId] : []))),
  );

  const offeredSections = sections.filter(
    (section) => fitsCampus(approver.campusId, section.campusId) && (!section.archived || sectionIds.has(section.id)),
  );
  const offeredClasses = classGroups.filter((group) => fitsCampus(approver.campusId, group.campusId));
  const multiCampus = campusNames.size > 1;
  const campusOf = (campusId: string | null) => (multiCampus && campusId ? ` · ${campusNames.get(campusId) ?? ""}` : "");

  const entries = scopeEntries(general, [...sectionIds], [...classIds]);
  const changed = !sameEntries(entries, held);

  const toggle = (set: Set<string>, setter: (next: Set<string>) => void, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    setter(next);
  };

  const words = () => {
    if (general) return "Everything";
    const parts = [
      ...sections.filter((section) => sectionIds.has(section.id)).map((section) => `Section: ${section.name}`),
      ...classGroups.filter((group) => classIds.has(group.id)).map((group) => `Class: ${group.name}`),
    ];
    return parts.length === 0 ? "Nothing" : parts.join(", ");
  };

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-line bg-field/30 p-4">
      <CheckboxField
        label="Everything (General)"
        checked={general}
        onChange={(event) => {
          setGeneral(event.target.checked);
          if (event.target.checked) {
            setSectionIds(new Set());
            setClassIds(new Set());
          }
        }}
      />
      <p className="-mt-2 text-xs text-fg-muted">
        Every class in the school{approver.campusId ? " that this person's campus covers" : ""}. Ticking it takes the boxes below away,
        because it already covers them.
      </p>

      <fieldset disabled={general} className="min-w-0 space-y-1 disabled:opacity-60">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Sections</legend>
        {offeredSections.length === 0 ? (
          <p className="text-xs text-fg-muted">There is no section this person can be given yet.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {offeredSections.map((section) => (
              <li key={section.id}>
                <CheckboxField
                  label={`${section.name}${campusOf(section.campusId)}${section.archived ? " (archived: restore it first)" : ""}`}
                  checked={sectionIds.has(section.id)}
                  onChange={(event) => toggle(sectionIds, setSectionIds, section.id, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={general} className="min-w-0 space-y-1 disabled:opacity-60">
        <legend className="text-xs font-semibold tracking-wide text-fg-2 uppercase">Classes</legend>
        {offeredClasses.length === 0 ? (
          <p className="text-xs text-fg-muted">There is no class this person can be given.</p>
        ) : (
          <ul className="grid gap-x-6 sm:grid-cols-2">
            {offeredClasses.map((group) => (
              <li key={group.id}>
                <CheckboxField
                  label={`${group.name}${campusOf(group.campusId)}`}
                  checked={classIds.has(group.id)}
                  onChange={(event) => toggle(classIds, setClassIds, group.id, event.target.checked)}
                />
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {entries.length === 0 && (
        <p className="text-xs text-fg-muted">With nothing ticked this person approves nothing, until you give them somewhere.</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" variant="primary" onClick={() => onSave(entries, words())} disabled={busy || !changed}>
          Review & save
        </Button>
      </div>
    </div>
  );
}
