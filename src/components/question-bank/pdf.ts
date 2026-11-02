import type { Reply } from "@/components/auth/postJson";

// A PDF the server makes on request (the print routes answer with the file itself, not JSON). `postForPdf` asks for it and gives back the file, or, when the server refused, the same
// shape of reply every other call gives, so the screen can say the API's own sentence. `downloadBlob` saves it as a file the person downloads.

export type PdfReply = { ok: true; blob: Blob; name: string } | { ok: false; reply: Reply };

export async function postForPdf(path: string, body: unknown): Promise<PdfReply> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok && (res.headers.get("content-type") ?? "").includes("application/pdf")) {
      const named = /filename="?([^";]+)"?/.exec(res.headers.get("content-disposition") ?? "")?.[1];
      let name = "document.pdf";
      if (named) {
        try {
          name = decodeURIComponent(named);
        } catch {
          name = named;
        }
      }
      return { ok: true, blob: await res.blob(), name };
    }
    const json = await res.json().catch(() => null);
    return { ok: false, reply: { ok: false, status: res.status, code: json?.error?.code, message: json?.error?.message } };
  } catch {
    return { ok: false, reply: { ok: false, status: 0, code: "NETWORK" } };
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
