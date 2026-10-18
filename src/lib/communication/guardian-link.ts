import crypto from "node:crypto";
import { NotificationChannel } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

export const GUARDIAN_LINK_ACTIONS = {
  VIEW_ATTENDANCE: "VIEW_ATTENDANCE",
  VIEW_RESULTS: "VIEW_RESULTS",
  PAY_INVOICE: "PAY_INVOICE",
  VIEW_NOTICE: "VIEW_NOTICE",
} as const;

export type GuardianLinkAction = (typeof GUARDIAN_LINK_ACTIONS)[keyof typeof GUARDIAN_LINK_ACTIONS];

export interface CreateGuardianLinkParams {
  tenantId: string;
  studentId: string;
  guardianId?: string | null;
  channel: NotificationChannel;
  action: GuardianLinkAction | string;
  expiresInHours?: number; // Default 72 hours
}

export interface GuardianLinkTokenResult {
  id: string;
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
  urlPath: string;
}

export interface VerifyGuardianLinkResult {
  valid: boolean;
  error?: string;
  tokenRecord?: {
    id: string;
    tenantId: string;
    studentId: string;
    guardianId?: string | null;
    action: string;
    channel: NotificationChannel;
    expiresAt: Date;
    usedAt?: Date | null;
  };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a cryptographically signed magic link token for a guardian.
 */
export async function createGuardianLinkToken(params: CreateGuardianLinkParams): Promise<GuardianLinkTokenResult> {
  const { tenantId, studentId, guardianId, channel, action, expiresInHours = 72 } = params;
  const verifiedTenant = trustedTenantId(tenantId);

  // Generate 256-bit cryptographically secure random token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tokenRecord = await forTenant(verifiedTenant).transaction(async (tx) => {
    return tx.guardianLinkToken.create({
      data: {
        tenantId,
        studentId,
        guardianId: guardianId || null,
        channel,
        action,
        tokenHash,
        expiresAt,
      },
    });
  });

  return {
    id: tokenRecord.id,
    rawToken,
    tokenHash,
    expiresAt,
    urlPath: `/portal/g/${rawToken}`,
  };
}

/**
 * Verifies a magic link token and optionally marks it as used.
 */
export async function verifyGuardianLinkToken(
  tenantId: string,
  rawToken: string,
  options: { markUsed?: boolean } = {},
): Promise<VerifyGuardianLinkResult> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length !== 64) {
    return { valid: false, error: "Malformed or invalid token format" };
  }

  const tokenHash = hashToken(rawToken);
  const verifiedTenant = trustedTenantId(tenantId);

  return forTenant(verifiedTenant).transaction(async (tx) => {
    const record = await tx.guardianLinkToken.findUnique({
      where: {
        tenantId_tokenHash: {
          tenantId,
          tokenHash,
        },
      },
    });

    if (!record) {
      return { valid: false, error: "Token not found" };
    }

    if (new Date() > record.expiresAt) {
      return { valid: false, error: "Token has expired" };
    }

    if (record.usedAt) {
      return { valid: false, error: "Token has already been used" };
    }

    if (options.markUsed) {
      await tx.guardianLinkToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    }

    return {
      valid: true,
      tokenRecord: {
        id: record.id,
        tenantId: record.tenantId,
        studentId: record.studentId,
        guardianId: record.guardianId,
        action: record.action,
        channel: record.channel,
        expiresAt: record.expiresAt,
        usedAt: record.usedAt,
      },
    };
  });
}
