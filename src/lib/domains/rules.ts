// --- Pure Custom Domain Rules (Phase 5 White-Labeling) ---
import { randomBytes } from "node:crypto";

export const RESERVED_SUBDOMAINS = new Set([
  "api",
  "app",
  "admin",
  "auth",
  "platform",
  "staging",
  "mail",
  "email",
  "ftp",
  "dev",
  "test",
  "www",
  "octalve",
  "status",
  "billing",
  "support",
  "internal",
  "root",
]);

/**
 * Validates a fully-qualified domain name (FQDN).
 * Rules:
 * - Length between 4 and 253 characters.
 * - Each label between 1 and 63 characters, alphanumeric with hyphens (not leading/trailing).
 * - Minimum 2 labels (e.g. portal.myschool.edu or myschool.edu).
 * - No reserved subdomain on the apex platform domain.
 */
export function validateCustomDomain(domainInput: string): { valid: boolean; normalized?: string; error?: string } {
  if (!domainInput || typeof domainInput !== "string") {
    return { valid: false, error: "Domain name is required." };
  }

  const normalized = domainInput.trim().toLowerCase();

  if (normalized.length < 4 || normalized.length > 253) {
    return { valid: false, error: "Domain name must be between 4 and 253 characters." };
  }

  if (normalized.includes("://") || normalized.includes("/") || normalized.includes(":") || normalized.includes("@")) {
    return { valid: false, error: "Enter a valid hostname without protocol, port, or path (e.g. portal.myschool.ng)." };
  }

  const labels = normalized.split(".");
  if (labels.length < 2) {
    return { valid: false, error: "Domain must include at least one dot (e.g. school.edu)." };
  }

  const labelRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  for (const label of labels) {
    if (!labelRegex.test(label)) {
      return {
        valid: false,
        error: `Invalid domain label "${label}". Labels must be alphanumeric and may contain hyphens (no leading/trailing hyphens).`,
      };
    }
  }

  // Check top label for reserved subdomains
  const sub = labels[0];
  if (RESERVED_SUBDOMAINS.has(sub)) {
    return {
      valid: false,
      error: `Subdomain "${sub}" is reserved for platform infrastructure.`,
    };
  }

  return { valid: true, normalized };
}

/**
 * Generates a cryptographic verification token for DNS TXT verification.
 */
export function generateDomainVerificationToken(): string {
  return `octalve-domain-verify-${randomBytes(16).toString("hex")}`;
}

export interface DnsInstructions {
  type: "TXT" | "CNAME";
  host: string;
  value: string;
  instructions: string;
}

export function getDnsVerificationInstructions(domain: string, token: string): DnsInstructions[] {
  return [
    {
      type: "TXT",
      host: `_octalve-challenge.${domain}`,
      value: token,
      instructions: "Add a TXT record at your DNS provider to verify domain ownership.",
    },
    {
      type: "CNAME",
      host: domain,
      value: "cname.octalve.com",
      instructions: "Add a CNAME record pointing to our edge router to route custom domain traffic.",
    },
  ];
}
