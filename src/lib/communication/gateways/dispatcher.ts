import { NotificationChannel } from "@prisma/client";
import { type NotificationDispatchJobData } from "@/lib/queue/definitions";
import { type DispatchHandlerResult } from "@/lib/queue/dispatch-worker";
import { sendEmail } from "./email";
import { sendTermiiMessage } from "./termii";

/**
 * Universal multi-channel message dispatcher.
 * Dispatches to Resend, Termii, or internal In-App mechanisms based on jobData.channel.
 */
export async function defaultNotificationDispatcher(jobData: NotificationDispatchJobData): Promise<DispatchHandlerResult> {
  const { channel, recipientAddress, subject, body } = jobData;

  switch (channel) {
    case NotificationChannel.EMAIL: {
      const emailRes = await sendEmail({
        to: recipientAddress,
        subject: subject || "Notification from Octalve Edu",
        body,
      });

      return {
        success: emailRes.success,
        externalId: emailRes.messageId,
        error: emailRes.error,
      };
    }

    case NotificationChannel.SMS: {
      const termiiRes = await sendTermiiMessage({
        to: recipientAddress,
        message: body,
        channel: "generic",
      });

      return {
        success: termiiRes.success,
        externalId: termiiRes.messageId,
        error: termiiRes.error,
      };
    }

    case NotificationChannel.WHATSAPP: {
      const whatsappRes = await sendTermiiMessage({
        to: recipientAddress,
        message: body,
        channel: "whatsapp",
      });

      return {
        success: whatsappRes.success,
        externalId: whatsappRes.messageId,
        error: whatsappRes.error,
      };
    }

    case NotificationChannel.IN_APP: {
      // For In-App, reaching this point means it is ready in the user's feed
      return {
        success: true,
        externalId: `inapp-${jobData.dispatchId}`,
      };
    }

    default: {
      return {
        success: false,
        error: `Unsupported notification channel: ${channel}`,
      };
    }
  }
}
