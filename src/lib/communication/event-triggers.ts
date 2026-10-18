import { NotificationChannel } from "@prisma/client";
import type { Tx } from "@/lib/tenant/for-tenant";
import { enqueueNotificationDispatch } from "@/lib/queue/dispatch-service";
import { SYSTEM_TEMPLATE_CODES, interpolateTokens, DEFAULT_SYSTEM_TEMPLATES } from "./templates";
import { createGuardianLinkToken, GUARDIAN_LINK_ACTIONS } from "./guardian-link";

export interface AttendanceAbsenceTriggerParams {
  tenantId: string;
  classArmId: string;
  dateStr: string;
  absentStudentIds: string[];
  actorUserId: string;
}

export interface ResultsPublishedTriggerParams {
  tenantId: string;
  resultIds: string[];
  actorUserId: string;
}

export interface InvoiceIssuedTriggerParams {
  tenantId: string;
  invoiceIds: string[];
  actorUserId: string;
}

/**
 * Dispatches attendance absence notifications to primary guardians for absent students.
 */
export async function triggerAttendanceAbsenceAlerts(tx: Tx, params: AttendanceAbsenceTriggerParams): Promise<{ dispatched: number }> {
  const { tenantId, classArmId, dateStr, absentStudentIds, actorUserId } = params;
  if (absentStudentIds.length === 0) return { dispatched: 0 };

  const [tenant, classArm] = await Promise.all([
    tx.tenant.findUnique({ where: { id: tenantId } }),
    tx.classArm.findUnique({ where: { id: classArmId } }),
  ]);

  const schoolName = tenant?.name || "School";
  const armName = classArm?.name || "Class";
  let dispatched = 0;

  for (const studentId of absentStudentIds) {
    const student = await tx.studentRecord.findUnique({
      where: { id: studentId },
      include: {
        guardians: {
          where: { status: "APPROVED", isPrimary: true },
          include: { guardian: true },
        },
      },
    });

    if (!student) continue;

    const primaryGuardian = student.guardians[0]?.guardian;
    if (!primaryGuardian) continue;

    const studentFullName = `${student.firstName} ${student.lastName}`;

    // 1. SMS Alert if phone available
    if (primaryGuardian.phone) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE && t.channel === NotificationChannel.SMS,
      );

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              class_arm: armName,
              date: dateStr,
              school_name: schoolName,
            },
            NotificationChannel.SMS,
          )
        : `Dear Guardian, ${studentFullName} was marked absent in ${armName} today, ${dateStr}. - ${schoolName}`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.SMS,
        recipientAddress: primaryGuardian.phone,
        recipientUserId: primaryGuardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
        body,
        priority: 1, // High priority
        metadata: {
          studentId,
          classArmId,
          date: dateStr,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }

    // 2. Email Alert if email available
    if (primaryGuardian.email) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE && t.channel === NotificationChannel.EMAIL,
      );

      const subject = template?.subjectTemplate
        ? interpolateTokens(template.subjectTemplate, { student_name: studentFullName, school_name: schoolName }, NotificationChannel.EMAIL)
        : `Absence Notice: ${studentFullName} - ${schoolName}`;

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              class_arm: armName,
              date: dateStr,
              school_name: schoolName,
            },
            NotificationChannel.EMAIL,
          )
        : `<p>Dear Guardian,</p><p>${studentFullName} was marked absent in ${armName} on ${dateStr}.</p><p>${schoolName}</p>`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.EMAIL,
        recipientAddress: primaryGuardian.email,
        recipientUserId: primaryGuardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.ATTENDANCE_ABSENCE,
        subject,
        body,
        priority: 1,
        metadata: {
          studentId,
          classArmId,
          date: dateStr,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }
  }

  return { dispatched };
}

/**
 * Dispatches results publication alerts with magic report card links to primary guardians.
 */
export async function triggerResultsPublishedAlerts(tx: Tx, params: ResultsPublishedTriggerParams): Promise<{ dispatched: number }> {
  const { tenantId, resultIds, actorUserId } = params;
  if (resultIds.length === 0) return { dispatched: 0 };

  const results = await tx.result.findMany({
    where: { tenantId, id: { in: resultIds } },
    include: {
      student: {
        include: {
          guardians: {
            where: { status: "APPROVED", isPrimary: true },
            include: { guardian: true },
          },
        },
      },
      period: true,
      tenant: true,
    },
  });

  const studentMap = new Map<string, (typeof results)[0]>();
  for (const res of results) {
    if (!studentMap.has(res.studentId)) {
      studentMap.set(res.studentId, res);
    }
  }

  let dispatched = 0;

  for (const [studentId, sampleResult] of studentMap.entries()) {
    const student = sampleResult.student;
    const guardian = student.guardians[0]?.guardian;
    if (!guardian) continue;

    const studentFullName = `${student.firstName} ${student.lastName}`;
    const termName = sampleResult.period.label;
    const schoolName = sampleResult.tenant.name;

    // Create magic link token for report card
    const magicLink = await createGuardianLinkToken({
      tenantId,
      studentId,
      guardianId: guardian.id,
      channel: guardian.phone ? NotificationChannel.SMS : NotificationChannel.EMAIL,
      action: GUARDIAN_LINK_ACTIONS.VIEW_RESULTS,
      expiresInHours: 72,
    });

    const reportCardUrl = `https://${sampleResult.tenant.code}.octalve.edu${magicLink.urlPath}`;

    if (guardian.phone) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED && t.channel === NotificationChannel.SMS,
      );

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              term_name: termName,
              report_card_url: reportCardUrl,
              school_name: schoolName,
            },
            NotificationChannel.SMS,
          )
        : `Dear Guardian, ${termName} results for ${studentFullName} are published: ${reportCardUrl}`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.SMS,
        recipientAddress: guardian.phone,
        recipientUserId: guardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
        body,
        priority: 5,
        metadata: {
          studentId,
          periodId: sampleResult.periodId,
          magicLinkId: magicLink.id,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }

    if (guardian.email) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED && t.channel === NotificationChannel.EMAIL,
      );

      const subject = template?.subjectTemplate
        ? interpolateTokens(template.subjectTemplate, { student_name: studentFullName, term_name: termName }, NotificationChannel.EMAIL)
        : `Results Published: ${studentFullName} - ${termName}`;

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              term_name: termName,
              report_card_url: reportCardUrl,
              school_name: schoolName,
            },
            NotificationChannel.EMAIL,
          )
        : `<p>Dear Guardian,</p><p>Results for ${studentFullName} (${termName}) are now published.</p><p><a href="${reportCardUrl}">View Report Card</a></p>`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.EMAIL,
        recipientAddress: guardian.email,
        recipientUserId: guardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.RESULTS_PUBLISHED,
        subject,
        body,
        priority: 5,
        metadata: {
          studentId,
          periodId: sampleResult.periodId,
          magicLinkId: magicLink.id,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }
  }

  return { dispatched };
}

/**
 * Dispatches fee invoice issuance alerts with online payment magic links to primary guardians.
 */
export async function triggerInvoiceIssuedAlerts(tx: Tx, params: InvoiceIssuedTriggerParams): Promise<{ dispatched: number }> {
  const { tenantId, invoiceIds, actorUserId } = params;
  if (invoiceIds.length === 0) return { dispatched: 0 };

  const invoices = await tx.invoice.findMany({
    where: { tenantId, id: { in: invoiceIds } },
    include: {
      student: {
        include: {
          guardians: {
            where: { status: "APPROVED", isPrimary: true },
            include: { guardian: true },
          },
        },
      },
      period: true,
      tenant: true,
    },
  });

  let dispatched = 0;

  for (const invoice of invoices) {
    const student = invoice.student;
    const guardian = student.guardians[0]?.guardian;
    if (!guardian) continue;

    const studentFullName = `${student.firstName} ${student.lastName}`;
    const termName = invoice.period.label;
    const schoolName = invoice.tenant.name;
    const invoiceAmount = `NGN ${Number(invoice.totalAmount).toLocaleString()}`;
    const dueDate = invoice.dueDate ? invoice.dueDate.toISOString().split("T")[0] : "End of Term";

    // Magic link for payment
    const magicLink = await createGuardianLinkToken({
      tenantId,
      studentId: student.id,
      guardianId: guardian.id,
      channel: guardian.phone ? NotificationChannel.SMS : NotificationChannel.EMAIL,
      action: GUARDIAN_LINK_ACTIONS.PAY_INVOICE,
      expiresInHours: 168, // 7 days for invoice
    });

    const paymentUrl = `https://${invoice.tenant.code}.octalve.edu${magicLink.urlPath}`;

    if (guardian.phone) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED && t.channel === NotificationChannel.SMS,
      );

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              invoice_amount: invoiceAmount,
              term_name: termName,
              due_date: dueDate,
              payment_url: paymentUrl,
              school_name: schoolName,
            },
            NotificationChannel.SMS,
          )
        : `Dear Guardian, invoice of ${invoiceAmount} for ${studentFullName} (${termName}) is issued. Due: ${dueDate}. Pay: ${paymentUrl}`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.SMS,
        recipientAddress: guardian.phone,
        recipientUserId: guardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
        body,
        priority: 5,
        metadata: {
          studentId: student.id,
          invoiceId: invoice.id,
          magicLinkId: magicLink.id,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }

    if (guardian.email) {
      const template = DEFAULT_SYSTEM_TEMPLATES.find(
        (t) => t.code === SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED && t.channel === NotificationChannel.EMAIL,
      );

      const subject = template?.subjectTemplate
        ? interpolateTokens(template.subjectTemplate, { student_name: studentFullName, term_name: termName }, NotificationChannel.EMAIL)
        : `Invoice Issued: ${studentFullName} - ${termName}`;

      const body = template
        ? interpolateTokens(
            template.bodyTemplate,
            {
              student_name: studentFullName,
              invoice_amount: invoiceAmount,
              term_name: termName,
              due_date: dueDate,
              payment_url: paymentUrl,
              school_name: schoolName,
            },
            NotificationChannel.EMAIL,
          )
        : `<p>Dear Guardian,</p><p>An invoice of ${invoiceAmount} has been issued for ${studentFullName} for ${termName}.</p><p>Due: ${dueDate}</p><p><a href="${paymentUrl}">Pay Invoice Online</a></p>`;

      await enqueueNotificationDispatch({
        tenantId,
        channel: NotificationChannel.EMAIL,
        recipientAddress: guardian.email,
        recipientUserId: guardian.userId,
        templateCode: SYSTEM_TEMPLATE_CODES.FEE_INVOICE_ISSUED,
        subject,
        body,
        priority: 5,
        metadata: {
          studentId: student.id,
          invoiceId: invoice.id,
          magicLinkId: magicLink.id,
          triggeredBy: actorUserId,
        },
      });
      dispatched++;
    }
  }

  return { dispatched };
}
