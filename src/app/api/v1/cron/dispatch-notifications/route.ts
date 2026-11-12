import { NextResponse } from "next/server";
import { checkCronAuthorization } from "@/lib/queue/cron-auth";
import { drainDispatchQueue } from "@/lib/queue/dispatch-drain";

// GET /api/v1/cron/dispatch-notifications
// Sends the queued messages that are due (task 0057, option A of task 0054). A scheduler calls it: Vercel Cron (a `crons` entry in vercel.json) or anything that can send a header.
//   503  no CRON_SECRET of at least 16 characters on this server: nothing runs, for anyone (fail closed)
//   401  no `Authorization: Bearer <CRON_SECRET>`, or the wrong one: nothing runs
//   200  the run is done; the answer is COUNTS only (schools, rows, sent, retrying, failed), never an address, a message or an error text
//   500  something unforeseen: logged here, nothing about it said
// There is no session and no school here, so it is on the route-role guard's allowlist with that reason. A browser's cookie is not a credential for it.

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  const auth = checkCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth === "not-configured") {
    return NextResponse.json(
      { ok: false, error: "The dispatch schedule is not configured on this server." },
      { status: 503, headers: NO_STORE },
    );
  }
  if (auth === "denied") {
    return NextResponse.json(
      { ok: false, error: "Not authorised." },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" } },
    );
  }
  try {
    const report = await drainDispatchQueue();
    return NextResponse.json({ ok: true, report }, { headers: NO_STORE });
  } catch (err: unknown) {
    console.error("[DISPATCH_DRAIN_ERROR]", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ ok: false, error: "The dispatch run failed." }, { status: 500, headers: NO_STORE });
  }
}
