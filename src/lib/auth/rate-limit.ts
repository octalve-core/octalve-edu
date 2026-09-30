// In-memory rate limiter, ported from AlEemaan's fixed version (see that
// repo's docs/development-history/phases/phase-0.5.1.5-auth-rebuild.md) and
// hardened further. Reserve-then-refund, trusted-proxy-header IP, size-capped.
//
// SCOPE — read this before relying on it: state lives in this process's
// memory. That is correct for Solo installs (always one long-lived process)
// and for a single-instance SaaS deployment. It is NOT sufficient for a
// multi-instance SaaS deployment: a request that lands on a different
// instance sees a different Map, so the limit is effectively multiplied by the
// instance count. That deployment shape needs the Redis-backed implementation
// (domain-implementation-plan.md §0.5.3), which must be built before any
// multi-instance SaaS production rollout. The functions are `async` from day
// one so that swap changes no call site.
//
// INVARIANT: the bodies below must stay synchronous (no `await`). An async
// function runs synchronously until its first await, which is what makes each
// reservation atomic in a single-threaded process — the actual fix for the
// check-then-record race (concurrent requests all passing a check before any
// of them recorded anything). Adding an await inside reserveAttempt would
// silently reintroduce that race.

const WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const MAX_TRACKED_IDENTIFIERS = 10_000; // hard cap — see sweep()

const attempts = new Map<string, number[]>();

/// Evicts the least-recently-touched identifiers once the map grows past the
/// cap. Without a cap an attacker cycling through unique identifiers grows the
/// Map forever. `touch()` re-inserts a key on every write, so Map insertion
/// order == last-touched order and the first keys are the stalest — a hot
/// legitimate key is never evicted ahead of a one-off attacker key.
function sweep() {
  if (attempts.size <= MAX_TRACKED_IDENTIFIERS) return;
  const overflow = attempts.size - MAX_TRACKED_IDENTIFIERS;
  let removed = 0;
  for (const key of attempts.keys()) {
    attempts.delete(key);
    if (++removed >= overflow) break;
  }
}

function touch(identifier: string, recent: number[]) {
  attempts.delete(identifier); // delete-then-set moves the key to the end
  attempts.set(identifier, recent);
}

function recentCount(identifier: string): number {
  const since = Date.now() - WINDOW_MS;
  const recent = (attempts.get(identifier) ?? []).filter((t) => t > since);
  if (recent.length > 0) attempts.set(identifier, recent);
  else attempts.delete(identifier);
  return recent.length;
}

/// Reserve-then-refund: call this at the very start of the handler, before
/// any slow async work, for every key that should gate the request. Returns
/// false (reserving nothing further) the moment a key is already at its limit.
export async function reserveAttempt(
  identifier: string,
  limit: number = DEFAULT_MAX_ATTEMPTS,
): Promise<boolean> {
  const count = recentCount(identifier);
  if (count >= limit) return false;
  const recent = attempts.get(identifier) ?? [];
  recent.push(Date.now());
  touch(identifier, recent);
  sweep();
  return true;
}

/// Call on a SUCCESSFUL attempt to hand back the reservation this request
/// made, so a correct login never counts against the user's own future tries.
export async function refundAttempt(identifier: string): Promise<void> {
  const recent = attempts.get(identifier);
  if (!recent || recent.length === 0) return;
  recent.pop();
  if (recent.length === 0) attempts.delete(identifier);
}

/// Read-only check (does not reserve). Used for the soft per-account signal.
export async function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_MAX_ATTEMPTS,
): Promise<boolean> {
  return recentCount(identifier) < limit;
}

// --- Client IP -------------------------------------------------------------
//
// Only ever reads a header the reverse proxy itself sets, never the
// client-controlled leftmost X-Forwarded-For entry — that value costs an
// attacker nothing to spoof and is exactly what let the previous limiter be
// bypassed with a fresh fake IP per request (docs/auth-review-2026-09-29.md).
//
// Configure to match the deployment (both default to the nginx convention):
//   CLIENT_IP_HEADER    "x-real-ip" (default) — proxy overwrites it with the
//                       real peer address, e.g. nginx `proxy_set_header
//                       X-Real-IP $remote_addr`, or Caddy `header_up X-Real-IP
//                       {remote_host}`.
//                       "x-forwarded-for" — take the Nth entry from the RIGHT,
//                       where N = TRUSTED_PROXY_HOPS (default 1). Entries to
//                       the left of the trusted proxies' own are client-
//                       controlled and are never read.
//   TRUSTED_PROXY_HOPS  number of trusted proxies appending to
//                       X-Forwarded-For (default 1).
//
// No usable header (plain local dev, or a misconfigured proxy) falls back to
// ONE shared bucket. That is correct for local dev (one client) but in a
// deployment that really has many clients it turns the per-IP limit into a
// school-wide limit — so it warns once in production.

const MAX_IP_LENGTH = 64;
let warnedNoProxy = false;

function nthFromRight(value: string, hops: number): string | null {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const index = parts.length - hops;
  return index >= 0 && index < parts.length ? parts[index] : null;
}

export function getClientIp(req: {
  headers: { get(name: string): string | null };
}): string {
  const header = (process.env.CLIENT_IP_HEADER ?? "x-real-ip").toLowerCase();
  const raw = req.headers.get(header);

  let ip: string | null = null;
  if (raw) {
    if (header === "x-forwarded-for") {
      const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
      ip = nthFromRight(raw, hops);
    } else {
      ip = raw.trim();
    }
  }

  if (!ip) {
    if (!warnedNoProxy && process.env.NODE_ENV === "production") {
      warnedNoProxy = true;
      console.warn(
        `[RATE_LIMIT] No client IP in "${header}" — per-IP limits collapse into one shared bucket. ` +
          "Configure the reverse proxy to set it (see CLIENT_IP_HEADER in .env.example).",
      );
    }
    return "unproxied";
  }
  return ip.slice(0, MAX_IP_LENGTH);
}
