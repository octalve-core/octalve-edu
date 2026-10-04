// The ONE gate for every development affordance (domain-implementation-plan.md §0.5.F): the dev email inbox
// today, a mock payment checkout with Finance later. Pure functions of the environment, unit-tested over the
// whole matrix, and FAIL CLOSED: the default for anything unrecognised is production, where none of this exists.
//
// Why not `NODE_ENV` or `VERCEL_ENV !== 'production'`: `next start` forces NODE_ENV=production (so a preview or
// staging build can't be told apart by it), and `VERCEL_ENV` is simply unset on every host that isn't Vercel —
// including a self-hosted production install, where "not production" would read as TRUE and open the tools.

export type AppEnv = "development" | "staging" | "production";
type Env = Record<string, string | undefined>;

/// Which kind of deployment this is. `APP_ENV` says so explicitly (development | staging | production,
/// case-insensitive); anything else non-empty is a typo and means production; with no `APP_ENV`,
/// `NODE_ENV=production` means production and `next dev` means development. `VERCEL_ENV=production` always
/// wins — belt and braces for a Vercel production deploy that someone also gave `APP_ENV=staging`.
export function appEnv(env: Env = process.env): AppEnv {
  if (env.VERCEL_ENV === "production") return "production";
  const raw = env.APP_ENV?.trim().toLowerCase();
  if (raw) return raw === "development" || raw === "staging" || raw === "production" ? raw : "production";
  return env.NODE_ENV === "production" ? "production" : "development";
}

/// What a visitor needs to use the dev tools — ONE decision, so "no token needed" can never be confused with "no
/// token configured":
///  - `off`   — production always (not with `DEV_TOOLS=true`, not with a token); staging without
///              `DEV_TOOLS=true` AND a non-empty `DEV_TOOLS_TOKEN`; development with `DEV_TOOLS=false`.
///  - `open`  — development (your own machine): on by default, no token.
///  - `token` — staging, switched on: reachable by other people, so the shared secret must be presented.
export type DevToolsAccess = { kind: "off" } | { kind: "open" } | { kind: "token"; token: string };

export function devToolsAccess(env: Env = process.env): DevToolsAccess {
  const kind = appEnv(env);
  if (kind === "production") return { kind: "off" };
  if (kind === "staging") {
    const token = env.DEV_TOOLS_TOKEN?.trim();
    return env.DEV_TOOLS === "true" && token ? { kind: "token", token } : { kind: "off" };
  }
  return env.DEV_TOOLS === "false" ? { kind: "off" } : { kind: "open" };
}

/// Are the dev tools available at all?
export const devToolsEnabled = (env: Env = process.env): boolean => devToolsAccess(env).kind !== "off";
