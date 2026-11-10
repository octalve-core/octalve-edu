import { verifyLink, verifyPageUrl } from "@/lib/app-url";
import { STATUS_LABEL, type ReportCardData } from "./model";

/// One pupil's report card for one term, on the theme's colours so it reads in both themes (the card it replaces used a fixed palette and `dark:` classes that this app's own theme switch does not
/// drive). What it shows is what the server sent: a pupil or a guardian is sent only PUBLISHED marks. Printing hides everything around it.
/// `origin` is the address this site is served from (the verification links are printed in full, so they work on paper and when the card is saved as a PDF from the print dialog).
export function ReportCard({ card, institution, origin }: { card: ReportCardData; institution: string; origin: string }) {
  const { student, period, summary, subjects, remarks } = card;
  const tokens = subjects.filter((s) => s.verificationToken && (s.status === "PUBLISHED" || s.status === "LOCKED"));
  return (
    <article
      aria-label={`Report card of ${student.firstName} ${student.lastName}`}
      className="space-y-6 rounded-2xl border border-line bg-surface p-5 sm:p-8 print:border-0 print:p-0"
    >
      <header className="space-y-1 border-b border-line pb-5 text-center">
        <h2 className="text-xl font-bold tracking-tight text-fg uppercase">{institution}</h2>
        <p className="text-sm text-fg-muted">Term report</p>
        <p className="text-sm font-semibold text-fg-2">
          {period.sessionLabel} · {period.label}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-fg-muted">Pupil</dt>
          <dd className="font-semibold text-fg">
            {student.firstName} {student.lastName}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Admission no.</dt>
          <dd className="font-semibold text-fg">{student.admissionNo}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Class</dt>
          <dd className="font-semibold text-fg">{student.classGroup ? `${student.classGroup} ${student.classArm ?? ""}` : "-"}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">Position</dt>
          <dd className="font-semibold text-fg">{summary.classRank ? `${summary.classRank} of ${summary.classSize}` : "-"}</dd>
        </div>
      </dl>

      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line p-4 text-center">
          <dt className="text-xs font-semibold text-fg-muted uppercase">Total</dt>
          <dd className="mt-1 text-2xl font-bold text-fg tabular-nums">
            {summary.totalScore} <span className="text-sm font-normal text-fg-muted">/ {summary.totalMax}</span>
          </dd>
        </div>
        <div className="rounded-xl border border-line p-4 text-center">
          <dt className="text-xs font-semibold text-fg-muted uppercase">Average</dt>
          <dd className="mt-1 text-2xl font-bold text-fg tabular-nums">{summary.percentage}%</dd>
        </div>
        <div className="rounded-xl border border-line p-4 text-center">
          <dt className="text-xs font-semibold text-fg-muted uppercase">This term&apos;s marks</dt>
          <dd className="mt-1 text-2xl font-bold text-fg">{summary.promotionOutcome === "PROMOTED" ? "On track" : "Below the mark"}</dd>
        </div>
      </dl>

      <div
        role="region"
        aria-label="Subjects"
        tabIndex={0}
        className="relative overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">Marks by subject.</caption>
          <thead className="bg-surface-2 text-xs tracking-wide text-fg-2 uppercase">
            <tr>
              <th scope="col" className="px-4 py-3">
                Subject
              </th>
              <th scope="col" className="px-4 py-3">
                Mark
              </th>
              <th scope="col" className="px-4 py-3">
                Grade
              </th>
              <th scope="col" className="px-4 py-3">
                Remark
              </th>
              <th scope="col" className="px-4 py-3 print:hidden">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {subjects.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-fg-muted">
                  No marks have been published for this term yet.
                </td>
              </tr>
            )}
            {subjects.map((s) => (
              <tr key={s.subjectId}>
                <th scope="row" className="px-4 py-3 font-medium text-fg">
                  {s.subjectName}
                  {s.subjectCode ? <span className="ml-2 text-xs font-normal text-fg-muted">{s.subjectCode}</span> : null}
                </th>
                <td className="px-4 py-3 tabular-nums text-fg">
                  {s.score} / {s.maxScore}
                </td>
                <td className="px-4 py-3 font-semibold text-fg">{s.gradeLetter ?? "-"}</td>
                <td className="px-4 py-3 text-fg-2">{s.gradeRemark ?? ""}</td>
                <td className="px-4 py-3 text-fg-2 print:hidden">{STATUS_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(remarks.teacher || remarks.principal) && (
        <section aria-label="Remarks" className="grid gap-4 sm:grid-cols-2">
          {remarks.teacher && (
            <div className="rounded-xl border border-line p-4">
              <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Teacher&apos;s remark</h3>
              <p className="mt-2 text-sm whitespace-pre-line text-fg">{remarks.teacher}</p>
            </div>
          )}
          {remarks.principal && (
            <div className="rounded-xl border border-line p-4">
              <h3 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Principal&apos;s remark</h3>
              <p className="mt-2 text-sm whitespace-pre-line text-fg">{remarks.principal}</p>
            </div>
          )}
        </section>
      )}

      {tokens.length > 0 && (
        <footer className="rounded-xl border border-dashed border-line-strong p-4 text-xs text-fg-muted">
          <p className="font-semibold text-fg-2">Verification links</p>
          <p className="mt-1">
            Anyone can check that a published mark is genuine: open its link, or go to{" "}
            <span className="font-semibold break-all">{verifyPageUrl(origin)}</span> and type the code at the end of the link.
          </p>
          <ul className="mt-2 space-y-1.5">
            {tokens.map((s) => {
              const url = verifyLink(origin, s.verificationToken!);
              return (
                <li key={s.subjectId}>
                  <span className="font-semibold text-fg-2">{s.subjectName}:</span>{" "}
                  <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono break-all text-brand-fg underline">
                    {url}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </footer>
      )}
    </article>
  );
}
