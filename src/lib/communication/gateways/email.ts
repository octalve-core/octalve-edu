import crypto from "node:crypto";
import { devToolsEnabled } from "@/lib/dev-tools";
import { recordDevEmail } from "@/lib/dev/email-inbox";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface BatchEmailItem {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

/**
 * Validates an email address.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Sends an email via Resend API or dev/mock inbox.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const recipients = Array.isArray(params.to) ? params.to : [params.to];
  const validRecipients = recipients.filter(isValidEmail);

  if (validRecipients.length === 0) {
    return {
      success: false,
      error: `Invalid email address: ${recipients.join(", ")}`,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM || "Octalve Edu <notifications@octalve.com>";
  const from = params.from || defaultFrom;

  // Mock / Dev mode fallback
  if (!apiKey || process.env.NODE_ENV === "test" || devToolsEnabled()) {
    const mockId = `resend-mock-${crypto.randomUUID()}`;
    for (const to of validRecipients) {
      if (devToolsEnabled()) {
        recordDevEmail({
          to,
          subject: params.subject,
          text: params.body,
        });
      }
      if (process.env.NODE_ENV !== "test") {
        console.log(`[EMAIL MOCK → ${to}] ${params.subject}`);
      }
    }

    return {
      success: true,
      messageId: mockId,
    };
  }

  // Production Resend API Call
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: validRecipients,
        subject: params.subject,
        text: params.body,
        html: params.html || params.body,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        success: false,
        error: data.message || `Resend responded with HTTP ${res.status}`,
      };
    }

    return {
      success: true,
      messageId: data.id,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Resend network request failed",
    };
  }
}

/**
 * Sends a batch of emails via Resend batch API.
 */
export async function sendBatchEmails(
  items: BatchEmailItem[],
  fromSender?: string,
): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  const defaultFrom = process.env.EMAIL_FROM || "Octalve Edu <notifications@octalve.com>";
  const from = fromSender || defaultFrom;
  const errors: string[] = [];

  if (!apiKey || process.env.NODE_ENV === "test" || devToolsEnabled()) {
    let sent = 0;
    for (const item of items) {
      const res = await sendEmail({ ...item, from });
      if (res.success) sent++;
      else if (res.error) errors.push(res.error);
    }
    return { success: errors.length === 0, sentCount: sent, errors };
  }

  try {
    const payload = items.map((item) => ({
      from,
      to: [item.to],
      subject: item.subject,
      text: item.body,
      html: item.html || item.body,
    }));

    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        sentCount: 0,
        errors: [data.message || `Resend batch error ${res.status}`],
      };
    }

    return {
      success: true,
      sentCount: Array.isArray(data.data) ? data.data.length : items.length,
      errors: [],
    };
  } catch (err) {
    return {
      success: false,
      sentCount: 0,
      errors: [err instanceof Error ? err.message : "Batch email request failed"],
    };
  }
}
