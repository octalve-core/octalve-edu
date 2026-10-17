import { NotificationChannel, NotificationDispatchStatus, Prisma } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { getNotificationDispatchQueue, type NotificationDispatchJobData } from "../queue/definitions";
import { enqueueBulkNotificationDispatches, type EnqueueDispatchParams } from "../queue/dispatch-service";
import { ensureSystemTemplates } from "./templates";
import type { CreateBroadcastInput, CreateTemplateInput, QueryDispatchesInput, QueryTemplatesInput, UpdateTemplateInput } from "./http";

export interface TemplateListItem {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  variables: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface DispatchListItem {
  id: string;
  templateId: string | null;
  channel: NotificationChannel;
  recipientAddress: string;
  recipientUserId: string | null;
  status: NotificationDispatchStatus;
  subject: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  attempts: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
}

export interface PaginatedDispatches {
  items: DispatchListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * List templates for a school tenant, automatically seeding default system templates if missing.
 */
export async function listTemplates(tenantId: string, query?: QueryTemplatesInput): Promise<TemplateListItem[]> {
  // Ensure default system templates are seeded
  await ensureSystemTemplates(tenantId);

  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const where: Prisma.NotificationTemplateWhereInput = {
      tenantId,
      ...(query?.channel ? { channel: query.channel } : {}),
      ...(query?.search
        ? {
            OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }],
          }
        : {}),
    };

    const records = await tx.notificationTemplate.findMany({
      where,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return records.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      channel: t.channel,
      subjectTemplate: t.subjectTemplate,
      bodyTemplate: t.bodyTemplate,
      variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
      isSystem: t.isSystem,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  });
}

/**
 * Get a single template by ID.
 */
export async function getTemplate(tenantId: string, id: string): Promise<TemplateListItem | null> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const t = await tx.notificationTemplate.findUnique({
      where: {
        tenantId_id: { tenantId, id },
      },
    });

    if (!t) return null;

    return {
      id: t.id,
      code: t.code,
      name: t.name,
      channel: t.channel,
      subjectTemplate: t.subjectTemplate,
      bodyTemplate: t.bodyTemplate,
      variables: Array.isArray(t.variables) ? (t.variables as string[]) : [],
      isSystem: t.isSystem,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  });
}

/**
 * Update a template's subject and body.
 */
export async function updateTemplate(tenantId: string, id: string, input: UpdateTemplateInput): Promise<TemplateListItem | null> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const existing = await tx.notificationTemplate.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });

    if (!existing) return null;

    const updated = await tx.notificationTemplate.update({
      where: { tenantId_id: { tenantId, id } },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subjectTemplate !== undefined ? { subjectTemplate: input.subjectTemplate } : {}),
        ...(input.bodyTemplate !== undefined ? { bodyTemplate: input.bodyTemplate } : {}),
      },
    });

    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      channel: updated.channel,
      subjectTemplate: updated.subjectTemplate,
      bodyTemplate: updated.bodyTemplate,
      variables: Array.isArray(updated.variables) ? (updated.variables as string[]) : [],
      isSystem: updated.isSystem,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  });
}

/**
 * Create a custom notification template.
 */
export async function createTemplate(tenantId: string, input: CreateTemplateInput): Promise<TemplateListItem> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const created = await tx.notificationTemplate.create({
      data: {
        tenantId,
        code: input.code,
        name: input.name,
        channel: input.channel,
        subjectTemplate: input.subjectTemplate || null,
        bodyTemplate: input.bodyTemplate,
        variables: input.variables || [],
        isSystem: false,
      },
    });

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      channel: created.channel,
      subjectTemplate: created.subjectTemplate,
      bodyTemplate: created.bodyTemplate,
      variables: Array.isArray(created.variables) ? (created.variables as string[]) : [],
      isSystem: created.isSystem,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  });
}

/**
 * Query dispatches with status / channel filters and pagination.
 */
export async function listDispatches(tenantId: string, query: QueryDispatchesInput): Promise<PaginatedDispatches> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const where: Prisma.NotificationDispatchWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.recipient ? { recipientAddress: { contains: query.recipient, mode: "insensitive" } } : {}),
    };

    const [total, records] = await Promise.all([
      tx.notificationDispatch.count({ where }),
      tx.notificationDispatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    const items: DispatchListItem[] = records.map((r) => ({
      id: r.id,
      templateId: r.templateId,
      channel: r.channel,
      recipientAddress: r.recipientAddress,
      recipientUserId: r.recipientUserId,
      status: r.status,
      subject: r.subject,
      body: r.body,
      metadata: r.metadata ? (r.metadata as Record<string, unknown>) : null,
      attempts: r.attempts,
      lastError: r.lastError,
      sentAt: r.sentAt,
      createdAt: r.createdAt,
    }));

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit) || 1,
    };
  });
}

/**
 * Retries a failed notification dispatch.
 */
export async function retryDispatch(tenantId: string, dispatchId: string): Promise<boolean> {
  const verifiedTenant = trustedTenantId(tenantId);
  return forTenant(verifiedTenant).transaction(async (tx) => {
    const dispatch = await tx.notificationDispatch.findUnique({
      where: { tenantId_id: { tenantId, id: dispatchId } },
    });

    if (!dispatch || dispatch.status !== NotificationDispatchStatus.FAILED) {
      return false;
    }

    const updated = await tx.notificationDispatch.update({
      where: { tenantId_id: { tenantId, id: dispatchId } },
      data: {
        status: NotificationDispatchStatus.QUEUED,
        lastError: null,
      },
    });

    const jobData: NotificationDispatchJobData = {
      dispatchId: updated.id,
      tenantId,
      channel: updated.channel,
      recipientAddress: updated.recipientAddress,
      recipientUserId: updated.recipientUserId,
      subject: updated.subject ?? undefined,
      body: updated.body,
      metadata: (updated.metadata as Record<string, unknown>) ?? undefined,
    };

    const queue = getNotificationDispatchQueue();
    await queue.add(`retry:${updated.channel}:${updated.id}:${Date.now()}`, jobData, {
      priority: 2,
    });

    return true;
  });
}

interface TargetRecipient {
  address: string;
  userId?: string | null;
  name: string;
}

/**
 * Broadcasts an announcement to selected audience roles, campus, or class arm.
 */
export async function createBroadcast(
  tenantId: string,
  _authorUserId: string,
  input: CreateBroadcastInput,
): Promise<{ count: number; channel: NotificationChannel }> {
  const verifiedTenant = trustedTenantId(tenantId);

  // 1. Resolve recipients under tenant RLS context
  const recipients = await forTenant(verifiedTenant).transaction(async (tx) => {
    const list: TargetRecipient[] = [];

    // A. Guardians
    if (input.audienceRole === "ALL" || input.audienceRole === "GUARDIAN") {
      let guardianRecords: Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }> = [];

      if (input.classArmId) {
        const enrolments = await tx.studentEnrollment.findMany({
          where: { tenantId, classArmId: input.classArmId, status: "ACTIVE" },
          select: { studentId: true },
        });
        const studentIds = enrolments.map((e) => e.studentId);
        if (studentIds.length > 0) {
          const links = await tx.guardianLink.findMany({
            where: { tenantId, studentId: { in: studentIds }, status: "APPROVED" },
            include: { guardian: true },
          });
          guardianRecords = links.map((l) => l.guardian);
        }
      } else {
        guardianRecords = await tx.guardianRecord.findMany({
          where: { tenantId, archivedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        });
      }

      for (const g of guardianRecords) {
        const address =
          input.channel === NotificationChannel.EMAIL
            ? g.email
            : input.channel === NotificationChannel.SMS || input.channel === NotificationChannel.WHATSAPP
              ? g.phone
              : null;

        if (address?.trim()) {
          list.push({
            address: address.trim(),
            name: `${g.firstName} ${g.lastName}`.trim(),
          });
        }
      }
    }

    // B. Staff
    if (input.audienceRole === "ALL" || input.audienceRole === "STAFF") {
      const staffRecords = await tx.staffRecord.findMany({
        where: {
          tenantId,
          archivedAt: null,
          ...(input.campusId ? { campusId: input.campusId } : {}),
        },
      });

      for (const s of staffRecords) {
        const address =
          input.channel === NotificationChannel.EMAIL || input.channel === NotificationChannel.IN_APP
            ? s.email
            : input.channel === NotificationChannel.SMS || input.channel === NotificationChannel.WHATSAPP
              ? s.phone
              : null;

        if (address?.trim()) {
          list.push({
            address: address.trim(),
            userId: s.userId,
            name: `${s.firstName} ${s.lastName}`.trim(),
          });
        }
      }
    }

    return list;
  });

  // De-duplicate by address
  const uniqueMap = new Map<string, TargetRecipient>();
  for (const r of recipients) {
    if (!uniqueMap.has(r.address)) {
      uniqueMap.set(r.address, r);
    }
  }
  const uniqueRecipients = Array.from(uniqueMap.values());

  if (uniqueRecipients.length === 0) {
    return { count: 0, channel: input.channel };
  }

  // 2. Prepare dispatch jobs
  const dispatches: EnqueueDispatchParams[] = uniqueRecipients.map((target) => ({
    tenantId,
    channel: input.channel,
    recipientAddress: target.address,
    recipientUserId: target.userId,
    templateCode: "BROADCAST_ANNOUNCEMENT",
    subject: input.subject || "School Announcement",
    body: input.body,
    metadata: {
      broadcast: true,
      audienceRole: input.audienceRole,
      campusId: input.campusId,
      classArmId: input.classArmId,
      recipientName: target.name,
    },
    priority: input.channel === NotificationChannel.SMS ? 1 : 5,
  }));

  // 3. Queue in BullMQ
  await enqueueBulkNotificationDispatches(dispatches);

  return { count: dispatches.length, channel: input.channel };
}
