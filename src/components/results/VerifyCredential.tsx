"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getJson, NETWORK_ERROR, RATE_LIMITED } from "@/components/auth/postJson";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { AlertTriangleIcon, CheckCircleIcon } from "@/components/ui/icons";
import { VERIFY_CODE, parseVerifyCode } from "@/lib/results/verify-code";
import { describe, type Found, type MarkAnswer, type ProgramAnswer, type VocationalAnswer } from "@/lib/results/verified-view";

const WRAPPER = "rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none";
const LINK =
  "inline-flex min-h-11 items-center font-semibold text-brand-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-md";

type Outcome = { code: string; state: "found"; found: Found } | { code: string; state: "missing" | "problem"; text?: string };

/// The public page where anyone checks a published mark or an issued certificate (tasks 0038 and 0043): `/verify` asks for the code, `/verify/<code>` (the link printed on a report card or
/// under a certificate's QR code) shows the answer. The answer is the public API's, asked in turn: the mark route, and if it finds nothing the certificate route (what each says is
/// `describe` in `lib/results/verified-view.ts`). Never a score or an admission number.
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
        "That is not a verification code. It is 32 letters and digits (0 to 9 and a to f), the end of the link on the report card or the certificate.",
      );
    setError(null);
    router.push(`/verify/${parsed}`);
  }
  return (
    <form onSubmit={submit} noValidate className={WRAPPER}>
      <h1 className="text-[22px] font-bold tracking-tight text-fg">Check a mark or certificate</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
        Every published mark on a report card, and every certificate, has a verification link. Open it, or type the code at the end of the
        link here, to see that the school published or issued it.
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
        Check this code
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
    const trouble = (status: number): Outcome => ({
      code,
      state: "problem",
      text: status === 429 ? RATE_LIMITED : status === 0 ? NETWORK_ERROR : undefined,
    });
    void (async () => {
      const mark = await getJson(`/api/v1/verify/${code}`, controller.signal);
      if (controller.signal.aborted) return;
      if (mark.ok && mark.data)
        return setOutcome({ code, state: "found", found: { kind: "MARK", data: mark.data as unknown as MarkAnswer } });
      if (mark.status !== 404) return setOutcome(trouble(mark.status));
      const certificate = await getJson(`/api/v1/verify-certificate/${code}`, controller.signal);
      if (controller.signal.aborted) return;
      if (certificate.ok && certificate.data)
        return setOutcome({
          code,
          state: "found",
          found: { kind: "CERTIFICATE", data: certificate.data as unknown as VocationalAnswer | ProgramAnswer },
        });
      setOutcome(certificate.status === 404 ? { code, state: "missing" } : trouble(certificate.status));
    })();
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
    const view = describe(current.found);
    const good = view.tone === "good";
    return (
      <div className={WRAPPER}>
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full ${good ? "bg-ok-bg text-ok-icon" : "bg-warn-bg text-warn-icon"}`}
        >
          {good ? <CheckCircleIcon className="h-6 w-6" /> : <AlertTriangleIcon className="h-6 w-6" />}
        </span>
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-fg">{view.heading}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{view.lead}</p>
        {view.rows.length > 0 && (
          <dl className="mt-5 divide-y divide-line rounded-xl border border-line text-sm">
            {view.rows.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4">
                <dt className="shrink-0 text-fg-muted sm:w-28">{label}</dt>
                <dd className="font-semibold break-words text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-6 text-sm">
          <Link href="/verify" className={LINK}>
            Check another code
          </Link>
        </p>
      </div>
    );
  }
  const text =
    current?.state === "problem"
      ? (current.text ?? "The code could not be checked just now. Please try again in a moment.")
      : !valid
        ? "This link is incomplete: a verification code is 32 letters and digits. Open the whole link from the report card or the certificate, or type the code on the check page."
        : "No published mark or issued certificate was found for this code. Check that the whole link was opened. A mark the school has not published yet, or a certificate that is only a draft, cannot be verified.";
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
