import type { NextConfig } from "next";

// Baseline response headers for every route (domain-implementation-plan.md
// §0.5.1, "Decisions made during implementation" #14).
//
// Deliberately absent: Strict-Transport-Security. `headers()` here is fixed at
// build time but the scheme is a runtime setting (APP_URL), and TLS terminates
// at the reverse proxy — so HSTS is the proxy's job (the Solo installer's
// Caddyfile), not the app's.
//
// A nonce-based script CSP is separate, larger work (§0.5.3); `frame-ancestors`
// alone is safe to ship now and is what stops the login form being framed.
const securityHeaders = [
  // Clickjacking. X-Frame-Options for old browsers, CSP frame-ancestors for the rest.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Tenant codes and record IDs appear in paths; other origins get the origin only.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
