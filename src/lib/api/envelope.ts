import { NextResponse } from "next/server";

// PRD §7's mandatory response shape: "every response is { data, meta, error }
// — never a bare array or ad hoc shape." First API route in the repo, so
// this is where that convention starts.
export function ok<T>(
  data: T,
  meta: Record<string, unknown> = {},
  status = 200,
) {
  return NextResponse.json({ data, meta, error: null }, { status });
}

export function fail(message: string, status: number, code?: string) {
  return NextResponse.json(
    { data: null, meta: {}, error: { code: code ?? String(status), message } },
    { status },
  );
}
