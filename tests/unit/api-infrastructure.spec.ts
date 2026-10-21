import "../support/env";
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  cursorMeta,
  decodeCursor,
  encodeCursor,
  offsetMeta,
  parseCursorPagination,
  parseOffsetPagination,
} from "@/lib/api/pagination";
import { NUL_MESSAGE } from "@/lib/api/no-nul";
import { MAX_BODY_BYTES, validate } from "@/lib/api/validate";

// Pagination and validation helpers (plan §0.5.3, A): strict on purpose — a malformed parameter is a 400 that names
// the field, never silently clamped or "first value wins".

const q = (query: string) => new URLSearchParams(query);

test.describe("offset pagination", () => {
  test("defaults, and the happy path", () => {
    expect(parseOffsetPagination(q(""))).toEqual({ ok: true, page: 1, limit: DEFAULT_LIMIT, skip: 0, take: DEFAULT_LIMIT });
    expect(parseOffsetPagination(q("page=3&limit=10"))).toEqual({ ok: true, page: 3, limit: 10, skip: 20, take: 10 });
    expect(parseOffsetPagination(q(`limit=${MAX_LIMIT}`))).toMatchObject({ ok: true, limit: MAX_LIMIT });
    expect(parseOffsetPagination(q(`page=${MAX_PAGE}`))).toMatchObject({ ok: true, page: MAX_PAGE });
  });

  test("every malformed value is refused WITH the field named — not clamped, not defaulted", () => {
    const refused = (query: string) => {
      const result = parseOffsetPagination(q(query));
      if (result.ok) throw new Error(`expected a refusal for ${query}`);
      return result.issues.map((i) => i.path).sort();
    };
    expect(refused("page=0")).toEqual(["page"]);
    expect(refused("page=-1")).toEqual(["page"]);
    expect(refused(`page=${MAX_PAGE + 1}`)).toEqual(["page"]);
    expect(refused("limit=0")).toEqual(["limit"]);
    expect(refused(`limit=${MAX_LIMIT + 1}`)).toEqual(["limit"]);
    expect(refused("limit=999999999")).toEqual(["limit"]);
    for (const bad of ["abc", "1.5", "1e3", "+2", "-0", " 2", "2 ", "0x10", "", "٣", "NaN", "Infinity", "12345678901"]) {
      expect(refused(`page=${encodeURIComponent(bad)}`), `page=${JSON.stringify(bad)}`).toEqual(["page"]);
    }
    expect(refused("page=0&limit=0")).toEqual(["limit", "page"]); // both reported at once
    // A signed number is refused as "not a whole number" — a different failure from "out of range".
    const signed = parseOffsetPagination(q("page=-1"));
    expect(signed).toMatchObject({ ok: false, issues: [{ path: "page", message: "page must be a whole number." }] });
  });

  test("a REPEATED parameter is a 400, never 'the first one wins'", () => {
    const result = parseOffsetPagination(q("page=1&page=2"));
    expect(result).toMatchObject({ ok: false, issues: [{ path: "page" }] });
    expect(parseOffsetPagination(q("limit=5&limit=5"))).toMatchObject({ ok: false });
  });

  test("custom defaults and caps are honoured", () => {
    expect(parseOffsetPagination(q(""), { defaultLimit: 10, maxLimit: 20 })).toMatchObject({ ok: true, limit: 10 });
    expect(parseOffsetPagination(q("limit=21"), { defaultLimit: 10, maxLimit: 20 })).toMatchObject({ ok: false });
  });

  test("offsetMeta: pages round up, an empty list still has one page, hasNext is exact", () => {
    expect(offsetMeta({ page: 1, limit: 10, total: 0 })).toEqual({ page: 1, limit: 10, total: 0, pages: 1, hasNext: false });
    expect(offsetMeta({ page: 1, limit: 10, total: 10 })).toEqual({ page: 1, limit: 10, total: 10, pages: 1, hasNext: false });
    expect(offsetMeta({ page: 1, limit: 10, total: 11 })).toEqual({ page: 1, limit: 10, total: 11, pages: 2, hasNext: true });
    expect(offsetMeta({ page: 2, limit: 10, total: 11 }).hasNext).toBe(false);
  });
});

test.describe("cursor pagination", () => {
  const cursor = { createdAt: new Date("2026-10-05T12:00:00.000Z"), id: "clx123" };

  test("a cursor round-trips", () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  test("garbage, tampered and oversized cursors are refused", () => {
    const good = encodeCursor(cursor);
    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    for (const bad of [
      "",
      "!!!",
      "not base64 url",
      good + "A".repeat(300),
      good.slice(0, -4),
      b64(null),
      b64("str"),
      b64([]),
      b64({}),
      b64({ t: 1, id: "x" }),
      b64({ t: "2026-10-05", id: "x" }), // not the exact ISO form
      b64({ t: "not a date", id: "x" }),
      b64({ t: cursor.createdAt.toISOString(), id: "" }),
      b64({ t: cursor.createdAt.toISOString(), id: "x".repeat(200) }),
      b64({ t: cursor.createdAt.toISOString(), id: 7 }),
    ]) {
      expect(decodeCursor(bad), JSON.stringify(bad).slice(0, 60)).toBeNull();
    }
  });

  test("a VALID cursor padded past the length cap is refused too (the cap is its own rule, not a side effect)", () => {
    const padded = Buffer.from(JSON.stringify({ t: cursor.createdAt.toISOString(), id: cursor.id, pad: "x".repeat(400) })).toString(
      "base64url",
    );
    expect(padded.length).toBeGreaterThan(256);
    expect(decodeCursor(padded)).toBeNull();
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor); // …while the ordinary one is fine
  });

  test("parseCursorPagination: limit rules, 'after' validated, take = limit + 1", () => {
    expect(parseCursorPagination(q(""))).toEqual({ ok: true, limit: DEFAULT_LIMIT, take: DEFAULT_LIMIT + 1, after: null });
    const after = encodeCursor(cursor);
    expect(parseCursorPagination(q(`limit=5&after=${after}`))).toEqual({ ok: true, limit: 5, take: 6, after: cursor });
    expect(parseCursorPagination(q("after=garbage"))).toMatchObject({ ok: false, issues: [{ path: "after" }] });
    expect(parseCursorPagination(q(`after=${after}&after=${after}`))).toMatchObject({ ok: false, issues: [{ path: "after" }] });
    expect(parseCursorPagination(q("limit=0"))).toMatchObject({ ok: false, issues: [{ path: "limit" }] });
  });

  test("cursorMeta: the extra row says 'there is more' and is not returned; the last page has no cursor", () => {
    const row = (n: number) => ({ id: `r${n}`, createdAt: new Date(Date.UTC(2026, 9, 5, 12, n)) });
    const rows = [row(1), row(2), row(3)];
    const more = cursorMeta(rows, 2);
    expect(more.items.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(decodeCursor(more.meta.nextCursor!)).toEqual({ createdAt: rows[1].createdAt, id: "r2" });
    expect(cursorMeta(rows.slice(0, 2), 2)).toEqual({ items: rows.slice(0, 2), meta: { limit: 2, nextCursor: null } });
    expect(cursorMeta([], 2)).toEqual({ items: [], meta: { limit: 2, nextCursor: null } });
  });
});

// --- validate ---------------------------------------------------------------------------------------------------

function request(opts: { body?: string; query?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`http://localhost/api/x${opts.query ? `?${opts.query}` : ""}`, {
    method: opts.body === undefined ? "GET" : "POST",
    body: opts.body,
    headers: opts.headers,
  });
}
const bodySchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(10, "Too long."),
  age: z.number().int().min(0).optional(),
});
const querySchema = z.object({ q: z.string().max(5).optional(), tag: z.union([z.string(), z.array(z.string())]).optional() });

function route() {
  const calls: unknown[] = [];
  const handler = validate({ body: bodySchema, query: querySchema }, async (_req, _auth: unknown, _ctx: unknown, input) => {
    calls.push(input);
    return Response.json({ ok: true });
  });
  return { handler, calls };
}
const run = async (handler: ReturnType<typeof route>["handler"], req: NextRequest) => {
  const res = await handler(req, undefined, undefined);
  return { status: res.status, json: await res.json() };
};

test.describe("validate()", () => {
  test("valid input reaches the handler parsed; unknown keys are STRIPPED, never passed on", async () => {
    const { handler, calls } = route();
    const res = await run(
      handler,
      request({ body: JSON.stringify({ name: "  Amina  ", age: 3, isAdmin: true, role: "ADMIN" }), query: "q=ab&tag=x&tag=y" }),
    );
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ body: { name: "Amina", age: 3 }, query: { q: "ab", tag: ["x", "y"] } }]);
  });

  test("a body that is not JSON is 400 INVALID_BODY and the handler never runs", async () => {
    const { handler, calls } = route();
    for (const body of ["{nope", "", "undefined", "<xml/>"]) {
      const res = await run(handler, request({ body }));
      expect(res).toEqual({ status: 400, json: { data: null, meta: {}, error: { code: "INVALID_BODY", message: "Invalid JSON body" } } });
    }
    expect(calls).toHaveLength(0);
  });

  test("a schema failure is 400 VALIDATION with EVERY failing field in `details` — our messages, our paths", async () => {
    const { handler, calls } = route();
    const res = await run(handler, request({ body: JSON.stringify({ name: "", age: -1 }) }));
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("VALIDATION");
    expect(res.json.error.details).toEqual([
      { path: "body.name", message: "Enter a name." },
      { path: "body.age", message: expect.any(String) },
    ]);
    expect(calls).toHaveLength(0);
    for (const wrong of [null, [], "str", 5, { name: 5 }]) {
      expect((await run(handler, request({ body: JSON.stringify(wrong) }))).json.error.code).toBe("VALIDATION");
    }
  });

  test("query failures are reported under `query.`", async () => {
    const { handler } = route();
    const res = await run(handler, request({ body: JSON.stringify({ name: "ok" }), query: "q=toolong" }));
    expect(res.json.error.details).toEqual([{ path: "query.q", message: expect.any(String) }]);
  });

  test("a NUL character anywhere in the body (a value, a key, nested) is 400 VALIDATION before the schema is asked, and the handler never runs", async () => {
    const { handler, calls } = route();
    const nul = String.fromCharCode(0);
    // each of these would pass the schema (a string of 3 characters; keys the schema does not name are stripped): only the scan refuses them
    const refused = [{ name: `a${nul}b` }, { name: "ok", [`x${nul}`]: 1 }, { name: "ok", extra: { deep: [`${nul}`] } }];
    for (const body of refused) {
      const res = await run(handler, request({ body: JSON.stringify(body) }));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.json.error).toEqual({
        code: "VALIDATION",
        message: "Some of the fields are not valid.",
        details: [{ path: "body", message: NUL_MESSAGE }],
      });
    }
    expect(calls).toHaveLength(0);
    // the six characters of an escape are text, not a NUL: they reach the schema like any other text
    const literalEscape = ["\\", "u0000"].join("");
    expect((await run(handler, request({ body: JSON.stringify({ name: literalEscape }) }))).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  test("details are capped at 20, so a hostile payload cannot make a huge response", async () => {
    const wide = validate({ body: z.array(z.string().max(1)) }, async () => Response.json({}));
    const res = await run(wide as never, request({ body: JSON.stringify(Array.from({ length: 500 }, () => "too long")) }));
    expect(res.json.error.details).toHaveLength(20);
  });

  test("an oversized body is 413 — by its declared length and by its actual length", async () => {
    const { handler, calls } = route();
    const declared = await run(handler, request({ body: "{}", headers: { "content-length": String(MAX_BODY_BYTES + 1) } }));
    expect(declared).toMatchObject({ status: 413, json: { error: { code: "PAYLOAD_TOO_LARGE" } } });
    const actual = await run(handler, request({ body: JSON.stringify({ name: "x".repeat(MAX_BODY_BYTES) }) }));
    expect(actual).toMatchObject({ status: 413 });
    expect(calls).toHaveLength(0);
  });

  test("one route may declare a higher body cap (the CSV import); the cap applies to that route only, and a lower or zero value never lowers the default", async () => {
    const big = JSON.stringify({ name: "x".repeat(MAX_BODY_BYTES + 100) });
    const roomy = validate(
      { body: z.object({ name: z.string() }), maxBodyBytes: MAX_BODY_BYTES * 2 },
      async (_r, _a: unknown, _c: unknown, input) => Response.json({ n: input.body.name.length }),
    );
    expect((await run(roomy as never, request({ body: big }))).json).toEqual({ n: MAX_BODY_BYTES + 100 });
    const tooBig = JSON.stringify({ name: "x".repeat(MAX_BODY_BYTES * 2) });
    expect(await run(roomy as never, request({ body: tooBig }))).toMatchObject({ status: 413 });
    expect(await run(roomy as never, request({ body: "{}", headers: { "content-length": String(MAX_BODY_BYTES * 2 + 1) } }))).toMatchObject(
      { status: 413 },
    );
    for (const maxBodyBytes of [0, 1, MAX_BODY_BYTES - 1]) {
      const stingy = validate({ body: z.object({ name: z.string() }), maxBodyBytes }, async () => Response.json({}));
      expect(await run(stingy as never, request({ body: JSON.stringify({ name: "x".repeat(1000) }) })), String(maxBodyBytes)).toMatchObject(
        { status: 200 },
      ); // not lowered
      expect(await run(stingy as never, request({ body: big })), String(maxBodyBytes)).toMatchObject({ status: 413 });
    }
    const { handler } = route(); // an ordinary route is still capped at the default
    expect(await run(handler, request({ body: big }))).toMatchObject({ status: 413 });
  });

  // A body with no declared length (a chunked upload) can only be measured by reading it, so it is read no further than the cap.
  const CHUNK = 64 * 1024;
  const streamedRequest = (stream: ReadableStream<Uint8Array>) =>
    new NextRequest("http://localhost/api/x", { method: "POST", body: stream, duplex: "half" as const } as ConstructorParameters<
      typeof NextRequest
    >[1]);
  /// `total` bytes in chunks of `chunk`; `state.pulled` is how many the consumer has taken. With `stall` the stream never ends after the last chunk.
  function streamOf(total: number, chunk = CHUNK, stall = false) {
    let sent = 0;
    const state = { pulled: 0 };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= total) {
          if (!stall) controller.close();
          return;
        }
        const n = Math.min(chunk, total - sent);
        sent += n;
        state.pulled = sent;
        controller.enqueue(new Uint8Array(n).fill(0x78));
      },
    });
    return { stream, state };
  }
  const streamBytes = (bytes: Uint8Array, chunk: number) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.subarray(at, at + chunk));
        controller.close();
      },
    });

  test("a body streamed past the cap is refused once the cap is passed: the rest of it is never read", async () => {
    const { stream, state } = streamOf(MAX_BODY_BYTES * 20);
    const { handler, calls } = route();
    const res = await run(handler, streamedRequest(stream));
    expect(res).toMatchObject({ status: 413, json: { error: { code: "PAYLOAD_TOO_LARGE" } } });
    expect(calls).toHaveLength(0);
    expect(state.pulled, "bytes taken from a stream of 20 MiB").toBeLessThanOrEqual(MAX_BODY_BYTES + 8 * CHUNK);
  });

  test("a body that stalls after passing the cap is still refused: the end of it is not waited for", async () => {
    const { stream } = streamOf(MAX_BODY_BYTES + 3 * CHUNK, CHUNK, true);
    const { handler } = route();
    const outcome = await Promise.race([
      run(handler, streamedRequest(stream)),
      new Promise<"still waiting">((resolve) => setTimeout(() => resolve("still waiting"), 5_000)),
    ]);
    expect(outcome).toMatchObject({ status: 413 });
  });

  test("a streamed body is read whole up to the cap: exactly the cap is accepted, one byte more is not, and characters split across chunks decode intact", async () => {
    const echo = validate({ body: z.object({ pad: z.string() }) }, async (_r, _a: unknown, _c: unknown, input) =>
      Response.json({ n: input.body.pad.length }),
    );
    const exact = Buffer.from(JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES - 10) }));
    expect(exact.byteLength).toBe(MAX_BODY_BYTES);
    expect((await run(echo as never, streamedRequest(streamBytes(exact, 50_000)))).json).toEqual({ n: MAX_BODY_BYTES - 10 });
    const over = Buffer.from(JSON.stringify({ pad: "x".repeat(MAX_BODY_BYTES - 9) }));
    expect(over.byteLength).toBe(MAX_BODY_BYTES + 1);
    expect(await run(echo as never, streamedRequest(streamBytes(over, 50_000)))).toMatchObject({ status: 413 });
    // two, three and four bytes per character, one byte per chunk: every character is split across chunks
    const text = "é€😀 ok";
    expect((await run(echo as never, streamedRequest(streamBytes(Buffer.from(JSON.stringify({ pad: text })), 1)))).json).toEqual({
      n: text.length,
    });
  });

  test("a route with only a query schema never reads the body; one with only a body never reads the query", async () => {
    const onlyQuery = validate({ query: querySchema }, async (_r, _a: unknown, _c: unknown, input) => Response.json(input));
    expect((await run(onlyQuery as never, request({ query: "q=a" }))).json).toEqual({ query: { q: "a" } });
    const onlyBody = validate({ body: bodySchema }, async (_r, _a: unknown, _c: unknown, input) => Response.json(input));
    expect((await run(onlyBody as never, request({ body: JSON.stringify({ name: "n" }), query: "q=whatever&evil=1" }))).json).toEqual({
      body: { name: "n" },
    });
  });
});
