"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { getJson } from "@/components/auth/postJson";
import { failureText } from "@/components/academics/useApi";
import type { Reply } from "@/components/auth/postJson";
import { longDate } from "@/lib/programs/completion-rules";
import type { CertificateView } from "@/lib/programs/completion-service";

// A certificate, print-ready (task 0027, slice P5): the school's name, the wording as it was when issued, the signatories, and a QR code to the public check page. Printed from the browser
// (Print, or Save as PDF); the page is one page, and the controls are hidden on paper. The QR is drawn as plain SVG squares: no markup from outside is ever inserted.

const say = (reply: Reply, fallback: string): string => (reply.ok ? fallback : failureText(reply.status, reply.message) || fallback);

function Qr({ text, label }: { text: string; label: string }) {
  const model = useMemo(() => QRCode.create(text, { errorCorrectionLevel: "M" }).modules, [text]);
  const size = model.size;
  const cells: string[] = [];
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (model.get(x, y)) cells.push(`M${x + 1},${y + 1}h1v1h-1z`);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size + 2} ${size + 2}`} className="h-28 w-28 bg-white" shapeRendering="crispEdges">
      <path d={cells.join("")} fill="#000" />
    </svg>
  );
}

export function CertificatePrint({ schoolCode, programId, certId }: { schoolCode: string; programId: string; certId: string }) {
  const programBase = `/api/v1/schools/${schoolCode}/programs/${programId}`;
  const [cert, setCert] = useState<CertificateView | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address of this site, known only in the browser
    setOrigin(window.location.origin);
    const controller = new AbortController();
    void getJson(`${programBase}/certificates/${encodeURIComponent(certId)}`, controller.signal).then((reply) => {
      if (controller.signal.aborted) return;
      if (!reply.ok)
        return setFailed(reply.status === 404 ? "We could not find that certificate." : say(reply, "The certificate couldn't be loaded."));
      setCert(reply.data as unknown as CertificateView);
    });
    return () => controller.abort();
  }, [programBase, certId]);

  if (failed)
    return (
      <div className="space-y-4">
        <Alert variant="error">{failed}</Alert>
        <Link
          href={`/schools/${schoolCode}/programs/${encodeURIComponent(programId)}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-fg hover:underline"
        >
          Back to the program
        </Link>
      </div>
    );
  if (!cert) return <p className="text-sm text-fg-muted">Loading…</p>;
  const url = `${origin}/api/v1/verify-certificate/${cert.verificationToken}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/schools/${schoolCode}/programs/${encodeURIComponent(programId)}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-fg hover:underline"
        >
          Back to the program
        </Link>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      {cert.status === "REVOKED" && (
        <Alert variant="warning">
          <span className="print:hidden">This certificate was withdrawn and is no longer valid. Do not print it for anyone.</span>
        </Alert>
      )}
      <article
        aria-label={`Certificate ${cert.serialNo}`}
        className={`mx-auto max-w-3xl space-y-6 rounded-2xl border-4 border-double border-line-strong bg-surface p-8 text-center text-fg print:max-w-none print:break-inside-avoid print:border-black print:bg-white print:text-black ${cert.status === "REVOKED" ? "print:hidden" : ""}`}
      >
        <p className="text-sm font-semibold tracking-widest uppercase text-fg-2 print:text-black">{cert.schoolName}</p>
        <h1 className="text-3xl font-bold tracking-tight">{cert.title}</h1>
        <p className="mx-auto max-w-prose text-lg leading-relaxed whitespace-pre-line">{cert.bodyText}</p>
        <p className="text-sm text-fg-2 print:text-black">
          Completed on {longDate(cert.completedOn)}. Issued on {longDate(cert.issuedOn)}.
        </p>
        {cert.signatories.length > 0 && (
          <ul className="flex flex-wrap justify-around gap-8 pt-6" aria-label="Signatories">
            {cert.signatories.map((s) => (
              <li key={s.name + s.title} className="min-w-40 border-t border-fg pt-2 text-sm print:border-black">
                <span className="block font-semibold">{s.name}</span>
                {s.title && <span className="block text-fg-2 print:text-black">{s.title}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col items-center gap-1 pt-4">
          {origin && <Qr text={url} label={`Scan to check certificate ${cert.serialNo}`} />}
          <p className="text-xs text-fg-2 print:text-black">
            Certificate number {cert.serialNo}. Check it at {origin ? url.replace(/^https?:\/\//, "") : "the school's verify page"}
          </p>
        </div>
      </article>
    </div>
  );
}
