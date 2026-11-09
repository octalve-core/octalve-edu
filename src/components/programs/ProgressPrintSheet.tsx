"use client";

import { Shown } from "@/components/programs/ProgressDisplay";
import { rowPartsBi, trackLabelBi } from "@/components/programs/progress-model";
import { MESSAGES, PLACE_BI, STATUS_BI, bi, dateBi, rangeBi, type Display } from "@/lib/programs/progress-display";
import type { RecordView } from "@/lib/programs/progress-service";

// The record as a sheet laid out like the paper booklet (task 0030, slice R4, section 10.5): who and when at the top, the profile, then for each track a table of the days. It is on the page all
// the time but only shows when printing (the app's shell already hides the sidebar and the header then), in the viewer's language, dates and digits. It prints the weeks that are loaded.

export function ProgressPrintSheet({ programName, record, display }: { programName: string; record: RecordView; display: Display }) {
  const schema = record.template?.schema;
  if (!schema) return null;
  const adjust = record.settings.hijriAdjust;
  const day = (iso: string, weekday = true) => dateBi(iso, { calendar: display.calendar, adjust, weekday });
  const place = PLACE_BI[record.person.placeState] ?? bi(record.person.placeState);
  const period = rangeBi(day(record.from, false), day(record.to, false));
  const printed = day(new Date().toISOString().slice(0, 10), false);
  const profile = schema.profile.flatMap((field) => {
    const value = record.record?.profile[field.key];
    if (!value) return [];
    const option = field.options?.find((o) => o.value === value);
    return [{ key: field.key, label: bi(field.label.en, field.label.ar), text: option ? bi(option.en, option.ar) : bi(value) }];
  });

  return (
    <section aria-label="Printable record" className="hidden space-y-5 text-sm text-black print:block">
      <header className="space-y-1 border-b border-black pb-3">
        <h1 className="text-xl font-bold">
          <Shown value={bi(schema.name.en, schema.name.ar)} display={display} />
        </h1>
        <p className="text-lg font-semibold">{record.person.name}</p>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <Fact label={MESSAGES.program} value={bi(programName)} display={display} />
          <Fact label={MESSAGES.group} value={bi(record.person.groupPath)} display={display} />
          <Fact label={MESSAGES.status} value={place} display={display} />
          <Fact label={MESSAGES.period} value={period} display={display} />
          {record.person.guardianName ? <Fact label={MESSAGES.guardian} value={bi(record.person.guardianName)} display={display} /> : null}
        </dl>
      </header>
      {profile.length > 0 && (
        <section aria-label="Profile">
          <h2 className="mb-1 text-base font-semibold">
            <Shown value={MESSAGES.profile} display={display} />
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            {profile.map((item) => (
              <Fact key={item.key} label={item.label} value={item.text} display={display} />
            ))}
          </dl>
        </section>
      )}
      {schema.tracks.map((track) => {
        const rows = record.entries.filter((e) => e.trackKey === track.key).sort((a, b) => a.entryDate.localeCompare(b.entryDate));
        if (rows.length === 0) return null;
        const columns = track.columns;
        return (
          <section key={track.key} aria-label={`${track.label.en} (printed)`} className="space-y-1">
            <h2 className="text-base font-semibold">
              <Shown value={trackLabelBi(track)} display={display} />
            </h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <Th>
                    <Shown value={MESSAGES.date} display={display} />
                  </Th>
                  {columns.map((column) => (
                    <Th key={column.key}>
                      <Shown value={bi(column.label.en, column.label.ar)} display={display} />
                    </Th>
                  ))}
                  <Th>
                    <Shown value={MESSAGES.status} display={display} />
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const parts = rowPartsBi(track, entry.values, schema);
                  return (
                    <tr key={entry.id} className="break-inside-avoid">
                      <Td>
                        <Shown value={day(entry.entryDate)} display={display} />
                      </Td>
                      {columns.map((column) => {
                        const part = parts.find((p) => p.key === column.key);
                        return (
                          <Td key={column.key}>
                            {part ? <Shown value={part.text} display={display} className="whitespace-pre-line" /> : null}
                          </Td>
                        );
                      })}
                      <Td>
                        <Shown value={STATUS_BI[entry.status]} display={display} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      <footer className="border-t border-black pt-2 text-xs">
        <Shown value={bi(`Printed on ${printed.en}`, `${MESSAGES.printedOn.ar} ${printed.ar ?? printed.en}`)} display={display} />
      </footer>
    </section>
  );
}

function Fact({ label, value, display }: { label: ReturnType<typeof bi>; value: ReturnType<typeof bi>; display: Display }) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold">
        <Shown value={label} display={display} />
      </dt>
      <dd>
        <Shown value={value} display={display} />
      </dd>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th scope="col" className="border border-black px-1.5 py-1 text-start font-semibold">
    {children}
  </th>
);
const Td = ({ children }: { children?: React.ReactNode }) => <td className="border border-black px-1.5 py-1 align-top">{children}</td>;
