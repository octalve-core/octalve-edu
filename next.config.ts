import type { NextConfig } from "next";
import { distDirFrom } from "./src/lib/build/dist-dir";
import { API_CSP } from "./src/lib/security/csp";

// Baseline response headers for every route (domain-implementation-plan.md
// §0.5.1, "Decisions made during implementation" #14).
//
// Deliberately absent: Strict-Transport-Security. `headers()` here is fixed at
// build time but the scheme is a runtime setting (APP_URL), and TLS terminates
// at the reverse proxy — so HSTS is the proxy's job (the Solo installer's
// Caddyfile), not the app's.
//
// The page CSP (nonce-based, per request) is src/proxy.ts — it can't live here, since `headers()` is
// fixed at build time and a nonce must be fresh for every response (§0.5.B). What stays here is static:
// framing, sniffing, referrers, and the JSON API's own policy (it loads nothing and can't be framed).
const securityHeaders = [
  // Clickjacking. X-Frame-Options for old browsers (the page CSP carries frame-ancestors for the rest).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Tenant codes and record IDs appear in paths; other origins get the origin only.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// NEXT_DIST_DIR gives a production build its own folder (src/lib/build/dist-dir.ts); unset, nothing changes.
const distDir = distDirFrom(process.env.NEXT_DIST_DIR);

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  poweredByHeader: false,
  // `forbidden()` / `forbidden.tsx`: a real HTTP 403 for "you are signed in but this school is not yours"
  // (domain-implementation-plan.md §0.5.2). Still flagged experimental in Next 16; the only thing it gates is the
  // status code and the view of that one response — the authorization decision itself is ours, in
  // lib/tenant/page-tenant.ts, not Next's.
  experimental: { authInterrupts: true },
  // The PDF writer's Unicode fonts (task 0045): `fontkit` and `bidi-js` are required at run time from node_modules instead of being bundled, and the font files (read from disk by
  // src/lib/pdf/unicode-fonts.ts) are copied into the two functions that write report-card PDFs.
  serverExternalPackages: ["fontkit", "bidi-js"],
  outputFileTracingIncludes: {
    "/api/v1/schools/[code]/people/students/[id]/report-card/pdf": ["./src/lib/pdf/fonts/**"],
    "/api/v1/schools/[code]/academics/results/report-cards/pdf": ["./src/lib/pdf/fonts/**"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
    ];
  },
};

export default nextConfig;
