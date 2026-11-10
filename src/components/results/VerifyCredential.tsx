"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getJson, NETWORK_ERROR, RATE_LIMITED } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { CheckCircleIcon } from "@/components/ui/icons";
import { VERIFY_CODE, parseVerifyCode } from "@/lib/results/verify-code";

const WRAPPER = "rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";
const LINK =
  "inline-flex min-h-11 items-center font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-md";

type Credential = {
  institution: string;
  studentName: string;
  academicSession: string;
  academicPeriod: string;
  subject: string;
  gradeLetter: string | null;
  publishedAt: string | null;
};
type Outcome = { code: string; state: "found"; credential: Credential } | { code: string; state: "missing" | "problem"; text?: string };

/// The public page where anyone checks a published mark (task 0038): `/verify` asks for the code, `/verify/<code>` (the link printed on a report card) shows the answer.
/// The answer is the public API's: the school, the pupil's name, the term, the subject and the grade, for a PUBLISHED or LOCKED result only; never the score or the admission number.
export function VerifyCredential({ code }: { code?: string }) {
  return code === undefined ? <CodeForm /> : <Answer code={code} />;
}

function CodeForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseVerifyCode(text);
    if (!parsed)
      return setError(
        "That is not a verification code. It is 32 letters and digits (0 to 9 and a to f), the end of the link on the report card.",
      );
    setError(null);
    router.push(`/verify/${parsed}`);
  }
  return (
    <form onSubmit={submit} noValidate className={WRAPPER}>
      <h1 className="text-[22px] font-bold tracking-tight text-fg">Check a report card mark</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
        Every published mark on a report card has a verification link. Open it, or type the code at the end of the link here, to see that
        the school published it.
      </p>
      <div className="mt-6">
        <TextField
          label="Verification code"
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={error}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          className="font-mono"
        />
      </div>
      <Button type="submit" className="mt-6 w-full">
        Check this mark
      </Button>
    </form>
  );
}

function Answer({ code }: { code: string }) {
  const valid = VERIFY_CODE.test(code);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    void getJson(`/api/v1/verify/${code}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (reply.ok && reply.data) setOutcome({ code, state: "found", credential: reply.data as unknown as Credential });
      else if (reply.status === 404) setOutcome({ code, state: "missing" });
      else
        setOutcome({ code, state: "problem", text: reply.status === 429 ? RATE_LIMITED : reply.status === 0 ? NETWORK_ERROR : undefined });
    });
    return () => controller.abort();
  }, [code, valid]);

  const current = outcome?.code === code ? outcome : null;
  if (valid && !current) {
    return (
      <div className={WRAPPER} aria-busy="true">
        <p role="status" className="text-sm text-fg-muted">
          Checking the code…
        </p>
      </div>
    );
  }
  if (current?.state === "found") {
    const c = current.credential;
    const published = c.publishedAt
      ? new Date(c.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
      : null;
    const rows: [string, string][] = [
      ["School", c.institution],
      ["Pupil", c.studentName],
      ["Session", c.academicSession],
      ["Term", c.academicPeriod],
      ["Subject", c.subject],
      ...(c.gradeLetter ? ([["Grade", c.gradeLetter]] as [string, string][]) : []),
      ...(published ? ([["Published on", published]] as [string, string][]) : []),
    ];
    return (
      <div className={WRAPPER}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok-bg text-ok-icon">
          <CheckCircleIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-fg">This mark is genuine</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">The school below published this result.</p>
        <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
              <dt className="shrink-0 text-fg-muted sm:w-28">{label}</dt>
              <dd className="font-semibold break-words text-fg">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-sm">
          <Link href="/verify" className={LINK}>
            Check another mark
          </Link>
        </p>
      </div>
    );
  }
  const text =
    current?.state === "problem"
      ? (current.text ?? "The mark could not be checked just now. Please try again in a moment.")
      : !valid
        ? "This link is incomplete: a verification code is 32 letters and digits. Open the whole link from the report card, or type the code on the check page."
        : "No published mark was found for this code. Check that the whole link was opened. A mark the school has not published yet cannot be verified.";
  return (
    <div className={WRAPPER}>
      <h1 className="text-[22px] font-bold tracking-tight text-fg">
        {current?.state === "problem" ? "The check did not finish" : "Nothing found for this code"}
      </h1>
      <Alert variant={current?.state === "problem" ? "error" : "warning"} className="mt-4">
        {text}
      </Alert>
      <p className="mt-6 text-sm">
        <Link href="/verify" className={LINK}>
          Check a different code
        </Link>
      </p>
    </div>
  );
}
