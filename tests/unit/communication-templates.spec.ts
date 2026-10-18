import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import {
  escapeHtml,
  extractTemplateVariables,
  validateTemplateVariables,
  interpolateTokens,
  renderTemplate,
  DEFAULT_SYSTEM_TEMPLATES,
  SYSTEM_TEMPLATE_CODES,
  ensureSystemTemplates,
} from "@/lib/communication/templates";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

const asSchool = (t: TestTenant) => forTenant(trustedTenantId(t.id));

test.describe("Communication Template Engine (Unit)", () => {
  test("escapeHtml escapes HTML dangerous characters", () => {
    const raw = `<script>alert('xss') & "test"</script>`;
    const escaped = escapeHtml(raw);
    expect(escaped).toBe("&lt;script&gt;alert(&#039;xss&#039;) &amp; &quot;test&quot;&lt;/script&gt;");
  });

  test("extractTemplateVariables extracts unique tokens ignoring whitespace", () => {
    const template = "Hello {{ student_name }}, your class is {{class_arm}}. See you {{ date }} or {{student_name}}!";
    const tokens = extractTemplateVariables(template);
    expect(tokens).toEqual(["student_name", "class_arm", "date"]);
  });

  test("validateTemplateVariables flags missing variables accurately", () => {
    const template = "Student: {{student_name}}, Due: {{due_date}}, Amount: {{amount}}";
    const res = validateTemplateVariables(template, {
      student_name: "Fatima",
      amount: "50,000",
    });

    expect(res.valid).toBe(false);
    expect(res.missing).toEqual(["due_date"]);
    expect(res.present).toEqual(["student_name", "amount"]);

    const validRes = validateTemplateVariables(template, {
      student_name: "Fatima",
      due_date: "2026-11-01",
      amount: "50,000",
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.missing).toEqual([]);
  });

  test("interpolateTokens escapes HTML in EMAIL channel to prevent XSS", () => {
    const template = "<p>Notice for {{student_name}} in {{school_name}}</p>";
    const rendered = interpolateTokens(
      template,
      {
        student_name: "<img src=x onerror=alert(1)>",
        school_name: "Al-Eemaan & Sons",
      },
      NotificationChannel.EMAIL,
    );

    expect(rendered).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(rendered).toContain("Al-Eemaan &amp; Sons");
    expect(rendered).not.toContain("<img src=x");
  });

  test("interpolateTokens handles SMS channel and strips control characters", () => {
    const template = "Dear Guardian, {{student_name}} was absent on {{date}}.";
    const rendered = interpolateTokens(
      template,
      {
        student_name: "Ahmad\x00\x07",
        date: "2026-10-16",
      },
      NotificationChannel.SMS,
    );

    expect(rendered).toBe("Dear Guardian, Ahmad was absent on 2026-10-16.");
    expect(rendered).not.toContain("\x00");
    expect(rendered).not.toContain("\x07");
  });

  test("renderTemplate evaluates subject and body appropriately", () => {
    const template = {
      channel: NotificationChannel.WHATSAPP,
      subjectTemplate: null,
      bodyTemplate: "Hello *{{name}}*! Your balance is {{amount}}.",
    };

    const res = renderTemplate(template, { name: "Ibrahim", amount: "N12,000" });
    expect(res.subject).toBeUndefined();
    expect(res.body).toBe("Hello *Ibrahim*! Your balance is N12,000.");
  });

  test("DEFAULT_SYSTEM_TEMPLATES covers all standard system codes", () => {
    const codes = new Set(DEFAULT_SYSTEM_TEMPLATES.map((t) => t.code));
    expect(codes.has(SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE)).toBe(true);
    expect(codes.has(SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED)).toBe(true);
    expect(codes.has(SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED)).toBe(true);
    expect(codes.has(SYSTEM_TEMPLATE_CODES.FEE_OVERDUE_REMINDER)).toBe(true);
    expect(codes.has(SYSTEM_TEMPLATE_CODES.BROADCAST_ANNOUNCEMENT)).toBe(true);

    for (const tmpl of DEFAULT_SYSTEM_TEMPLATES) {
      expect(tmpl.name).toBeTruthy();
      expect(tmpl.bodyTemplate).toBeTruthy();
      expect(tmpl.variables.length).toBeGreaterThan(0);
    }
  });
});

test.describe("System Template Seeding (ensureSystemTemplates)", () => {
  let tenant: TestTenant;

  test.beforeAll(async () => {
    await seedInstance();
    tenant = await createTenant({ name: "Template Seeding School" });
  });

  test.afterAll(async () => {
    await removeCreatedTenants();
  });

  test("ensureSystemTemplates seeds templates idempotently", async () => {
    // 1. Initial seeding
    const res1 = await ensureSystemTemplates(tenant.id);
    expect(res1.created).toBe(DEFAULT_SYSTEM_TEMPLATES.length);
    expect(res1.existing).toBe(0);

    // Verify in db via tenant context
    const rows = await asSchool(tenant).transaction((tx) => tx.notificationTemplate.findMany());
    expect(rows.length).toBe(DEFAULT_SYSTEM_TEMPLATES.length);

    // 2. Second seeding should be idempotent
    const res2 = await ensureSystemTemplates(tenant.id);
    expect(res2.created).toBe(0);
    expect(res2.existing).toBe(DEFAULT_SYSTEM_TEMPLATES.length);
  });
});
