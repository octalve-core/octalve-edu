/// A request body as bytes, read no further than `cap` bytes: `null` when it is larger. A declared Content-Length over the cap is refused without reading anything; a body with
/// no declared length (a chunked upload), or one that is longer than it said, can only be measured by reading it, so it is read until the cap is passed and then dropped:
/// the rest of it is never buffered, and a sender that never finishes cannot hold the request open.
export async function readBoundedBytes(req: Request, cap: number): Promise<Uint8Array | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return null;
  const body = req.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      // Not awaited, on purpose: when the body is one half of a tee (a handler that cloned the request), a cancel settles only when the OTHER half is cancelled too, and
      // awaiting it here would hold the request open for ever.
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/// A request body as text, read no further than `cap` bytes: `null` when it is larger (see `readBoundedBytes`).
export async function readBoundedText(req: Request, cap: number): Promise<string | null> {
  const bytes = await readBoundedBytes(req, cap);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

export type BoundedForm = { ok: true; form: FormData } | { ok: false; reason: "TOO_BIG" | "NOT_MULTIPART" | "UNREADABLE" };

/// A multipart/form-data body, read no further than `cap` bytes and then parsed. The parser only ever sees bytes that are already within the cap, so a form cannot make the
/// server hold more than that. Anything that is not a well-formed multipart body is `NOT_MULTIPART` (the wrong Content-Type) or `UNREADABLE` (a broken body).
export async function readBoundedForm(req: Request, cap: number): Promise<BoundedForm> {
  const type = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(type)) return { ok: false, reason: "NOT_MULTIPART" };
  const bytes = await readBoundedBytes(req, cap);
  if (bytes === null) return { ok: false, reason: "TOO_BIG" };
  try {
    return { ok: true, form: await new Response(bytes as BodyInit, { headers: { "content-type": type } }).formData() };
  } catch {
    return { ok: false, reason: "UNREADABLE" };
  }
}
