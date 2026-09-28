// Tenant code format + reserved-word rules from PRD §7 ("Tenant code
// selection"). SaaS signup will reuse this same function; Solo's setup
// wizard uses it only to derive an internal code from the school name (Solo
// installs never generate or see a code at all, per PRD §7).
const RESERVED_CODES = new Set([
  "dashboard",
  "admin",
  "api",
  "settings",
  "list",
  "login",
  "logout",
  "setup",
  "schools",
  "app",
  "www",
  "octalve",
]);

const CODE_PATTERN = /^[a-z0-9-]{2,40}$/;

export function slugifyTenantCode(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isValidTenantCode(code: string): boolean {
  return CODE_PATTERN.test(code) && !RESERVED_CODES.has(code);
}
