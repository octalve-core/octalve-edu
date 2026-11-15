import { NotificationChannel, NotificationDispatchStatus, Prisma } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { getNotificationDispatchQueue, type NotificationDispatchJobData } from "../queue/definitions";
import { enqueueBulkNotificationDispatches, type EnqueueDispatchParams } from "../queue/dispatch-service";
import { readSchoolTimeZone } from "../school-settings/read";
import { ensureSystemTemplates, interpolateTokens } from "./templates";
import { joinNames, messageDate } from "./tags";
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

/// Whose messages a caller may read or retry (task 0068): the whole school's (the school's administrator) or one campus's (a campus administrator). A campus administrator with no campus has no messages.
export type DispatchScope = { kind: "school" } | { kind: "campus"; campusId: string | null };

/// Anyone who is not the school's administrator is held to a campus: the routes admit an administrator and a campus administrator only, and this fails closed for any other role added later.
export const dispatchScopeOf = (tenant: { role: string; campusId: string | null }): DispatchScope =>
  tenant.role === "ADMIN" ? { kind: "school" } : { kind: "campus", campusId: tenant.campusId };

/// The rows of a scope. A message carries the campuses of the people it is about in `metadata.campusIds` (broadcasts and the three events); one without it (made before task 0068) belongs to no campus,
/// so a campus administrator does not see it. The school's administrator sees every row.
const inScope = (scope: DispatchScope): Prisma.NotificationDispatchWhereInput =>
  scope.kind === "school"
    ? {}
    : scope.campusId === null
      ? { id: { in: [] } }
      : { metadata: { path: ["campusIds"], array_contains: [scope.campusId] } };

/**
 * Query dispatches with status / channel filters and pagination, within the caller's scope.
 */
export async function listDispatches(tenantId: string, query: QueryDispatchesInput, scope: DispatchScope): Promise<PaginatedDispatches> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    const where: Prisma.NotificationDispatchWhereInput = {
      tenantId,
      ...inScope(scope),
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
 * Retries a failed notification dispatch of the caller's scope: a message outside it answers as an unknown id does.
 */
export async function retryDispatch(tenantId: string, dispatchId: string, scope: DispatchScope): Promise<boolean> {
  const verifiedTenant = trustedTenantId(tenantId);
  return forTenant(verifiedTenant).transaction(async (tx) => {
    const dispatch = await tx.notificationDispatch.findFirst({
      where: { tenantId, id: dispatchId, ...inScope(scope) },
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
  /// The campuses of the people the message is about (task 0068): a guardian's children in scope, or the member of staff's own campus. Empty for people of the whole school.
  campusIds: string[];
  /// A guardian's children, for the `{{student_name}}` and `{{class_arm}}` tags (task 0056); absent for staff.
  guardian?: { children: Array<{ name: string; classArm: string | null }> };
}

/**
 * Broadcasts an announcement to selected audience roles, campus, or class arm.
 */
export async function createBroadcast(
  tenantId: string,
  _authorUserId: string,
  input: CreateBroadcastInput,
): Promise<{ count: number; channel: NotificationChannel; withoutAddress: number }> {
  const verifiedTenant = trustedTenantId(tenantId);

  // 1. Resolve recipients under tenant RLS context
  const { recipients, withoutAddress, schoolName, today } = await forTenant(verifiedTenant).transaction(async (tx) => {
    const list: TargetRecipient[] = [];
    // the people in the audience with no address for the channel (task 0069), each once: a guardian of two children in the chosen class is one person
    const missing = new Set<string>();
    // the values of the tags that are the same for everyone: the school's name and today's date in the school's own time zone
    const school = await tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const zone = await readSchoolTimeZone(tx, tenantId);

    // A. Guardians
    if (input.audienceRole === "ALL" || input.audienceRole === "GUARDIAN") {
      let guardianRecords: Array<{ id: string; firstName: string; lastName: string; email: string | null; phone: string | null }> = [];
      // with a class arm chosen, a guardian's tags name only the children in that arm
      let armStudentIds: string[] | null = null;

      if (input.classArmId) {
        const enrolments = await tx.studentEnrollment.findMany({
          where: { tenantId, classArmId: input.classArmId, status: "ACTIVE" },
          select: { studentId: true },
        });
        const studentIds = enrolments.map((e) => e.studentId);
        armStudentIds = studentIds;
        if (studentIds.length > 0) {
          const links = await tx.guardianLink.findMany({
            where: {
              tenantId,
              studentId: { in: studentIds },
              status: "APPROVED",
              ...(input.campusId ? { student: { campusId: input.campusId } } : {}),
            },
            include: { guardian: true },
          });
          guardianRecords = links.map((l) => l.guardian);
        }
      } else {
        guardianRecords = await tx.guardianRecord.findMany({
          // with a campus chosen: the guardians of at least one live pupil of that campus (the campus choice used to be read for staff only)
          where: {
            tenantId,
            archivedAt: null,
            ...(input.campusId ? { links: { some: { status: "APPROVED", student: { campusId: input.campusId, archivedAt: null } } } } : {}),
          },
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        });
      }

      // each guardian's children: approved links to pupils who are not archived, with the class each has in the ACTIVE session
      const childrenOf = new Map<string, Array<{ name: string; classArm: string | null }>>();
      const campusesOf = new Map<string, Set<string>>();
      const guardianIds = guardianRecords.map((g) => g.id);
      if (guardianIds.length > 0) {
        const childLinks = await tx.guardianLink.findMany({
          where: {
            tenantId,
            guardianId: { in: guardianIds },
            status: "APPROVED",
            // with a campus chosen, a guardian's tags and campuses name only the children on that campus (as with a class arm), so a campus administrator's text never carries another campus's pupil
            student: { archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}) },
            ...(armStudentIds ? { studentId: { in: armStudentIds } } : {}),
          },
          orderBy: { createdAt: "asc" },
          select: {
            guardianId: true,
            student: {
              select: {
                firstName: true,
                lastName: true,
                campusId: true,
                enrollments: {
                  where: { status: "ACTIVE", session: { status: "ACTIVE" } },
                  select: { classArm: { select: { name: true, classGroup: { select: { name: true } } } } },
                  take: 1,
                },
              },
            },
          },
        });
        for (const link of childLinks) {
          const arm = link.student.enrollments[0]?.classArm;
          const children = childrenOf.get(link.guardianId) ?? [];
          children.push({
            name: `${link.student.firstName} ${link.student.lastName}`.trim(),
            classArm: arm ? `${arm.classGroup.name} ${arm.name}` : null,
          });
          childrenOf.set(link.guardianId, children);
          if (link.student.campusId)
            campusesOf.set(link.guardianId, (campusesOf.get(link.guardianId) ?? new Set()).add(link.student.campusId));
        }
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
            campusIds: [...(campusesOf.get(g.id) ?? [])],
            guardian: { children: childrenOf.get(g.id) ?? [] },
          });
        } else {
          missing.add(`guardian:${g.id}`);
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
            campusIds: s.campusId ? [s.campusId] : [],
          });
        } else {
          missing.add(`staff:${s.id}`);
        }
      }
    }

    return { recipients: list, withoutAddress: missing.size, schoolName: school?.name ?? "School", today: messageDate(new Date(), zone) };
  });

  // De-duplicate by address
  const uniqueMap = new Map<string, TargetRecipient>();
  for (const r of recipients) {
    const first = uniqueMap.get(r.address);
    if (!first) uniqueMap.set(r.address, { ...r, campusIds: [...r.campusIds] });
    // one address shared by two people (a phone both parents use): one message, belonging to every campus either is on
    else first.campusIds = [...new Set([...first.campusIds, ...r.campusIds])];
  }
  const uniqueRecipients = Array.from(uniqueMap.values());

  if (uniqueRecipients.length === 0) {
    return { count: 0, channel: input.channel, withoutAddress };
  }

  // 2. Prepare dispatch jobs. The tags are filled in here, one message per recipient (tags.ts says which exist for whom; the input check has refused any other): the school's name and
  // today's date for everyone, and for a guardian their children's names and classes ("your child" and "their class" for a guardian with none). Values are HTML-escaped for EMAIL.
  const fill = (text: string, target: TargetRecipient) =>
    interpolateTokens(
      text,
      {
        school_name: schoolName,
        date: today,
        ...(target.guardian
          ? {
              student_name: joinNames(target.guardian.children.map((child) => child.name)) || "your child",
              class_arm: joinNames(target.guardian.children.flatMap((child) => (child.classArm ? [child.classArm] : []))) || "their class",
            }
          : {}),
      },
      input.channel,
    );
  const dispatches: EnqueueDispatchParams[] = uniqueRecipients.map((target) => ({
    tenantId,
    channel: input.channel,
    recipientAddress: target.address,
    recipientUserId: target.userId,
    templateCode: "BROADCAST_ANNOUNCEMENT",
    subject: fill(input.subject || "School Announcement", target),
    body: fill(input.body, target),
    metadata: {
      broadcast: true,
      audienceRole: input.audienceRole,
      campusId: input.campusId,
      classArmId: input.classArmId,
      campusIds: target.campusIds,
      recipientName: target.name,
    },
    priority: input.channel === NotificationChannel.SMS ? 1 : 5,
  }));

  // 3. Queue in BullMQ
  await enqueueBulkNotificationDispatches(dispatches);

  return { count: dispatches.length, channel: input.channel, withoutAddress };
}
