/// A request body as text, read no further than `cap` bytes: `null` when it is larger. A declared Content-Length over the cap is refused without reading anything; a body with
/// no declared length (a chunked upload), or one that is longer than it said, can only be measured by reading it, so it is read until the cap is passed and then dropped:
/// the rest of it is never buffered, and a sender that never finishes cannot hold the request open.
export async function readBoundedText(req: Request, cap: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return null;
  const body = req.body;
  if (!body) return "";
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
  return new TextDecoder().decode(Buffer.concat(chunks));
}
