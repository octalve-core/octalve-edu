"use client";

import { useEffect, useState } from "react";
import { failureText } from "@/components/academics/useApi";
import { getJson, sendJson, type Reply } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import type { ProgramDetail } from "./model";

// Who runs the program and who works in it (task 0027, slices P1 and P3). Only the school's administrator names or ends a program admin (so nobody can promote themselves); the school's
// administrator or a program admin names supervisors, teachers and recorders and says which groups a teacher or a recorder takes attendance for. Presentation only: the API checks everything again.

type Act = (send: () => Promise<Reply>, done: string) => Promise<boolean>;
type Candidate = { userId: string; name: string; email: string | null; role: string; campusName: string | null };
type Place = ProgramDetail["staff"][number];
type RoleKey = "ADMIN" | "SUPERVISOR" | "TEACHER" | "RECORDER";

const ROLE_TEXT: Record<string, string> = {
  ADMIN: "Administrator",
  CAMPUS_ADMIN: "Campus administrator",
  TEACHING_STAFF: "Teaching staff",
  NON_TEACHING_STAFF: "Non-teaching staff",
};

const SECTIONS: {
  role: RoleKey;
  id: string;
  title: string;
  one: string;
  help: string;
  empty: string;
  name: string;
  named: (name: string) => string;
}[] = [
  {
    role: "ADMIN",
    id: "program-admins",
    title: "Program admins",
    one: "program admin",
    help: "A program admin runs the program's structure and details. They must be a member of staff whose campus is one the program runs in (or the whole school), and lose the role the moment that membership ends. Administrators of a campus can see the program and manage their own campus's people in it.",
    empty: "Nobody has been named: the school's administrator runs it.",
    name: "Name a program admin",
    named: () => "The program admin is named.",
  },
  {
    role: "SUPERVISOR",
    id: "program-supervisors",
    title: "Supervisors",
    one: "supervisor",
    help: "A supervisor reads the attendance of every group and corrects a mark, always with a reason. They cannot take attendance themselves.",
    empty: "No supervisor has been named.",
    name: "Name a supervisor",
    named: (name) => `${name} is now a supervisor.`,
  },
  {
    role: "TEACHER",
    id: "program-teachers",
    title: "Teachers",
    one: "teacher",
    help: "A teacher takes attendance for the groups they are assigned to, and for the groups inside them: for today and the 6 days before. A teacher with no group sees nothing.",
    empty: "No teacher has been named.",
    name: "Name a teacher",
    named: (name) => `${name} is now a teacher.`,
  },
  {
    role: "RECORDER",
    id: "program-recorders",
    title: "Recorders",
    one: "recorder",
    help: "A recorder takes attendance for the groups they are assigned to, like a teacher, and enters scores and entries for them. A recorder with no group sees nothing.",
    empty: "No recorder has been named.",
    name: "Name a recorder",
    named: (name) => `${name} is now a recorder.`,
  },
];

export function ProgramStaffTab({ program, base, act }: { program: ProgramDetail; base: string; act: Act }) {
  const [naming, setNaming] = useState<RoleKey | null>(null);
  const [ending, setEnding] = useState<Place | null>(null);
  const [assigning, setAssigning] = useState<Place | null>(null);
  const manage = program.can.editDetails;
  const groupName = (id: string) => program.groups.find((group) => group.id === id)?.path ?? "A group that no longer exists";

  return (
    <div className="space-y-5">
      {SECTIONS.map((section) => {
        const places = program.staff.filter((place) => place.role === section.role);
        const may = section.role === "ADMIN" ? program.can.administer : manage;
        const takesGroups = section.role === "TEACHER" || section.role === "RECORDER";
        return (
          <section key={section.role} aria-labelledby={section.id} className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id={section.id} className="text-base font-semibold text-fg">
                {section.title}
              </h3>
              {may && (
                <Button type="button" onClick={() => setNaming(section.role)}>
                  {section.name}
                </Button>
              )}
            </div>
            <p className="text-sm text-fg-muted">{section.help}</p>
            {places.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-muted">{section.empty}</p>
            ) : (
              <ul className="space-y-2" aria-label={section.title}>
                {places.map((place) => (
                  <li key={place.id} className="space-y-1 rounded-xl border border-line px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0 break-words text-fg">
                        <span className="font-semibold">{place.name}</span>
                        <span className="text-fg-muted">
                          {place.email ? ` · ${place.email}` : ""} · {place.campusName ? `through ${place.campusName}` : "the whole school"}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {may && takesGroups && (
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`Choose the groups of ${place.name}`}
                            onClick={() => setAssigning(place)}
                          >
                            Groups
                          </Button>
                        )}
                        {may && (
                          <Button
                            type="button"
                            variant="ghost"
                            aria-label={`End ${place.name}'s place as ${section.one}`}
                            onClick={() => setEnding(place)}
                          >
                            End
                          </Button>
                        )}
                      </span>
                    </div>
                    {takesGroups && (
                      <p className="text-xs break-words text-fg-muted">
                        {place.groupIds.length === 0
                          ? "No groups yet: they see nothing."
                          : `Takes attendance for ${place.groupIds.map(groupName).join(", ")}`}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {naming && <NameDialog key={naming} role={naming} onClose={() => setNaming(null)} base={base} act={act} />}
      {assigning && (
        <GroupsDialog key={assigning.id} place={assigning} program={program} base={base} onClose={() => setAssigning(null)} act={act} />
      )}
      {ending && (
        <Dialog
          open
          onClose={() => setEnding(null)}
          title={`End ${ending.name}'s place?`}
          description={`They stop being ${ending.role === "ADMIN" ? "a program admin" : `a ${ending.role.toLowerCase()}`} at once. It stays in the history.`}
        >
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" data-initial-focus onClick={() => setEnding(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                const target = ending;
                setEnding(null);
                await act(
                  () => sendJson(`${base}/staff/${target.id}`, "DELETE"),
                  `${target.name} no longer works in the program as ${target.role === "ADMIN" ? "a program admin" : `a ${target.role.toLowerCase()}`}.`,
                );
              }}
            >
              End place
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function NameDialog({ role, onClose, base, act }: { role: RoleKey; onClose: () => void; base: string; act: Act }) {
  const section = SECTIONS.find((candidate) => candidate.role === role)!;
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void getJson(`${base}/staff/candidates?role=${role}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok) return setFailed(failureText(reply.status, reply.message));
      setCandidates((reply.data as unknown as { candidates: Candidate[] }).candidates);
    });
    return () => controller.abort();
  }, [base, role]);

  const pick = candidates?.find((c) => c.userId === chosen);

  return (
    <Dialog open onClose={onClose} title={section.name} description="Choose a member of staff whose campus is one the program runs in.">
      <div className="mt-5 space-y-4">
        {failed && <Alert variant="error">{failed}</Alert>}
        {candidates === null && !failed ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : candidates !== null && candidates.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {role === "ADMIN"
              ? "There is no one left to name: every member of staff who can run this program already does."
              : `There is no one left to name as a ${section.one}: every member of staff who can already is one.`}
          </p>
        ) : candidates !== null ? (
          <SelectField
            label="Member of staff"
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            options={[
              { value: "", label: "Choose a person" },
              ...candidates.map((c) => ({
                value: c.userId,
                label: `${c.name} (${ROLE_TEXT[c.role] ?? c.role}${c.campusName ? `, ${c.campusName}` : ""})`,
              })),
            ]}
          />
        ) : null}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!pick}
            onClick={async () => {
              if (!pick) return;
              onClose();
              await act(() => sendJson(`${base}/staff`, "POST", { userId: pick.userId, role }), section.named(pick.name));
            }}
          >
            {role === "ADMIN" ? "Name program admin" : `Name ${section.one}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function GroupsDialog({
  place,
  program,
  base,
  onClose,
  act,
}: {
  place: Place;
  program: ProgramDetail;
  base: string;
  onClose: () => void;
  act: Act;
}) {
  const live = program.groups.filter((group) => !group.archived);
  const [picked, setPicked] = useState<Set<string>>(new Set(place.groupIds.filter((id) => live.some((group) => group.id === id))));

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Groups of ${place.name}`}
      description="They take attendance for these groups and for the groups inside them. Pick none and they see nothing."
    >
      <div className="mt-5 space-y-4">
        {live.length === 0 ? (
          <p className="text-sm text-fg-muted">The program has no group yet. Add groups in the Structure tab first.</p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto" aria-label="Groups">
            {live.map((group) => (
              <li key={group.id}>
                <CheckboxField
                  label={group.path}
                  checked={picked.has(group.id)}
                  onChange={(e) =>
                    setPicked((current) => {
                      const next = new Set(current);
                      if (e.target.checked) next.add(group.id);
                      else next.delete(group.id);
                      return next;
                    })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="ghost" data-initial-focus onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={async () => {
              onClose();
              await act(
                () => sendJson(`${base}/staff/${place.id}/groups`, "PUT", { groupIds: [...picked] }),
                `The groups of ${place.name} are saved.`,
              );
            }}
          >
            Save groups
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
