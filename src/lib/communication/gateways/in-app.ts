import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

export interface InAppNotification {
  id: string;
  subject?: string | null;
  body: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
  readAt?: Date | null;
}

/**
 * Lists in-app notifications for a user in a tenant.
 */
export async function listUserInAppNotifications(
  tenantId: string,
  userId: string,
  options: { unreadOnly?: boolean; limit?: number } = {},
): Promise<InAppNotification[]> {
  const verifiedTenant = trustedTenantId(tenantId);
  const limit = options.limit || 50;

  return forTenant(verifiedTenant).transaction(async (tx) => {
    const dispatches = await tx.notificationDispatch.findMany({
      where: {
        tenantId,
        recipientUserId: userId,
        channel: NotificationChannel.IN_APP,
        status: NotificationDispatchStatus.SENT,
        ...(options.unreadOnly ? { sentAt: { not: null } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return dispatches.map((d) => ({
      id: d.id,
      subject: d.subject,
      body: d.body,
      metadata: d.metadata as Record<string, unknown> | null,
      createdAt: d.createdAt,
      readAt: d.sentAt,
    }));
  });
}

/**
 * Marks an in-app notification as delivered/read.
 */
export async function markInAppNotificationRead(tenantId: string, userId: string, dispatchId: string): Promise<boolean> {
  const verifiedTenant = trustedTenantId(tenantId);

  return forTenant(verifiedTenant).transaction(async (tx) => {
    const res = await tx.notificationDispatch.updateMany({
      where: {
        id: dispatchId,
        tenantId,
        recipientUserId: userId,
        channel: NotificationChannel.IN_APP,
      },
      data: {
        status: NotificationDispatchStatus.SENT,
        sentAt: new Date(),
      },
    });

    return res.count > 0;
  });
}
