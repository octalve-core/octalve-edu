import { NotificationChannel } from "@prisma/client";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";

/**
 * Standard system notification template codes.
 */
export const SYSTEM_TEMPLATE_CODES = {
  ATTENDANCE_ABSENCE: "ATTENDANCE_ABSENCE",
  RESULTS_PUBLISHED: "RESULTS_PUBLISHED",
  FEE_INVOICE_ISSUED: "FEE_INVOICE_ISSUED",
  FEE_OVERDUE_REMINDER: "FEE_OVERDUE_REMINDER",
  BROADCAST_ANNOUNCEMENT: "BROADCAST_ANNOUNCEMENT",
} as const;

export type SystemTemplateCode = (typeof SYSTEM_TEMPLATE_CODES)[keyof typeof SYSTEM_TEMPLATE_CODES];

export interface SystemTemplateDefinition {
  code: SystemTemplateCode;
  name: string;
  channel: NotificationChannel;
  subjectTemplate?: string;
  bodyTemplate: string;
  variables: string[];
}

/**
 * Standard system templates across supported notification channels.
 */
export const DEFAULT_SYSTEM_TEMPLATES: SystemTemplateDefinition[] = [
  // --- Attendance Absence ---
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate:
      "Dear Guardian, {{student_name}} was marked absent in {{class_arm}} today, {{date}}. Contact {{school_name}} if this was unexpected.",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate:
      "Dear Guardian, *{{student_name}}* was marked absent in {{class_arm}} today, {{date}}.\n\nPlease contact {{school_name}} if you did not authorize this absence.",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
    name: "Attendance Absence Notice (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Absence Notice: {{student_name}} - {{school_name}}",
    bodyTemplate:
      "<p>Dear Guardian,</p><p>This is to notify you that <strong>{{student_name}}</strong> was marked absent in <strong>{{class_arm}}</strong> on <strong>{{date}}</strong>.</p><p>If you have any questions or this was unexpected, please reach out to the school administration.</p><p>Regards,<br/>{{school_name}}</p>",
    variables: ["student_name", "class_arm", "date", "school_name"],
  },

  // --- Results Published ---
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate: "Dear Guardian, {{term_name}} results for {{student_name}} are now published. View report card here: {{report_card_url}}",
    variables: ["student_name", "term_name", "report_card_url"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate:
      "Dear Guardian, {{term_name}} terminal report cards for *{{student_name}}* have been published.\n\nView and verify the report card: {{report_card_url}}\n\n- {{school_name}}",
    variables: ["student_name", "term_name", "report_card_url", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
    name: "Results Published (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Term Results Published: {{student_name}} - {{term_name}}",
    bodyTemplate:
      '<p>Dear Guardian,</p><p>The terminal assessment results for <strong>{{student_name}}</strong> ({{term_name}}) are now published and available for review.</p><p><a href="{{report_card_url}}">Click here to access and verify the official report card</a></p><p>Best regards,<br/>{{school_name}}</p>',
    variables: ["student_name", "term_name", "report_card_url", "school_name"],
  },

  // --- Fee Invoice Issued ---
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
    name: "Fee Invoice Issued (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate:
      "Dear Guardian, invoice of {{invoice_amount}} for {{student_name}} ({{term_name}}) is issued. Due: {{due_date}}. Pay: {{payment_url}}",
    variables: ["student_name", "invoice_amount", "term_name", "due_date", "payment_url"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
    name: "Fee Invoice Issued (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "School Fee Invoice: {{student_name}} - {{term_name}}",
    bodyTemplate:
      '<p>Dear Guardian,</p><p>A new school fee invoice of <strong>{{invoice_amount}}</strong> has been generated for <strong>{{student_name}}</strong> for the <strong>{{term_name}}</strong> academic term.</p><p>Due Date: <strong>{{due_date}}</strong></p><p><a href="{{payment_url}}">Click here to view invoice and make secure payment</a></p><p>Thank you,<br/>Bursary Department, {{school_name}}</p>',
    variables: ["student_name", "invoice_amount", "term_name", "due_date", "payment_url", "school_name"],
  },

  // --- Fee Overdue Reminder ---
  {
    code: SYSTEM_TEMPLATE_CODES.FEE_OVERDUE_REMINDER,
    name: "Fee Overdue Reminder (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate: "Reminder: Outstanding fee of {{balance_due}} for {{student_name}} is overdue. Please settle promptly: {{payment_url}}",
    variables: ["student_name", "balance_due", "payment_url"],
  },

  // --- Broadcast Announcement ---
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "Broadcast Announcement (SMS)",
    channel: NotificationChannel.SMS,
    bodyTemplate: "{{announcement_title}}: {{announcement_body}} - {{school_name}}",
    variables: ["announcement_title", "announcement_body", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "Broadcast Announcement (WhatsApp)",
    channel: NotificationChannel.WHATSAPP,
    bodyTemplate: "*{{announcement_title}}*\n\n{{announcement_body}}\n\n- {{school_name}}",
    variables: ["announcement_title", "announcement_body", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "Broadcast Announcement (Email)",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "{{announcement_title}} - {{school_name}}",
    bodyTemplate:
      "<h2>{{announcement_title}}</h2><div>{{announcement_body}}</div><hr/><p><small>Broadcast sent by {{school_name}}</small></p>",
    variables: ["announcement_title", "announcement_body", "school_name"],
  },
  {
    code: SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT,
    name: "Broadcast Announcement (In-App)",
    channel: NotificationChannel.IN_APP,
    subjectTemplate: "{{announcement_title}}",
    bodyTemplate: "{{announcement_body}}",
    variables: ["announcement_title", "announcement_body"],
  },
];

/**
 * Escapes HTML entities to prevent XSS injection in interpolated templates.
 */
export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

/**
 * Extracts all unique placeholder variable tokens from a template string (e.g. {{student_name}}).
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g);
  const variables = new Set<string>();
  for (const match of matches) {
    if (match[1]) variables.add(match[1]);
  }
  return Array.from(variables);
}

/**
 * Validates whether all required tokens in a template are provided.
 */
export function validateTemplateVariables(
  template: string,
  provided: Record<string, unknown>,
): { valid: boolean; missing: string[]; present: string[] } {
  const required = extractTemplateVariables(template);
  const missing: string[] = [];
  const present: string[] = [];

  for (const token of required) {
    const val = provided[token];
    if (val === undefined || val === null || val === "") {
      missing.push(token);
    } else {
      present.push(token);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    present,
  };
}

/**
 * Safely interpolates placeholders {{token}} in a template with variable values.
 * - For EMAIL: HTML escapes interpolated values to prevent injection.
 * - For SMS / WHATSAPP: plain text, strips control characters.
 */
export function interpolateTokens(template: string, variables: Record<string, unknown>, channel: NotificationChannel): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, token) => {
    const val = variables[token];
    if (val === undefined || val === null) {
      return "";
    }
    const strVal = String(val);

    if (channel === NotificationChannel.EMAIL) {
      return escapeHtml(strVal);
    }

    if (channel === NotificationChannel.SMS) {
      return strVal.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
    }

    return strVal;
  });
}

/**
 * High-level template renderer generating evaluated subject and body for a specific channel.
 */
export function renderTemplate(
  template: {
    channel: NotificationChannel;
    subjectTemplate?: string | null;
    bodyTemplate: string;
  },
  variables: Record<string, unknown>,
): { subject?: string; body: string } {
  const body = interpolateTokens(template.bodyTemplate, variables, template.channel);
  const subject = template.subjectTemplate ? interpolateTokens(template.subjectTemplate, variables, template.channel) : undefined;

  return { subject, body };
}

/**
 * Idempotently creates or updates system notification templates for a school tenant.
 * Uses forTenant to strictly respect PostgreSQL Row-Level Security policies.
 */
export async function ensureSystemTemplates(tenantId: string): Promise<{ created: number; existing: number }> {
  return forTenant(trustedTenantId(tenantId)).transaction(async (tx) => {
    let created = 0;
    let existing = 0;

    for (const tmpl of DEFAULT_SYSTEM_TEMPLATES) {
      const found = await tx.notificationTemplate.findUnique({
        where: {
          tenantId_code_channel: {
            tenantId,
            code: tmpl.code,
            channel: tmpl.channel,
          },
        },
      });

      if (found) {
        existing++;
      } else {
        await tx.notificationTemplate.create({
          data: {
            tenantId,
            code: tmpl.code,
            name: tmpl.name,
            channel: tmpl.channel,
            subjectTemplate: tmpl.subjectTemplate,
            bodyTemplate: tmpl.bodyTemplate,
            variables: tmpl.variables,
            isSystem: true,
          },
        });
        created++;
      }
    }

    return { created, existing };
  });
}
