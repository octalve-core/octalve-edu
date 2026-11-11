import "./env";
import crypto from "node:crypto";
import { computeCertificateHash } from "@/lib/certificates/rules";
import { db, type TestTenant } from "./db";

// What the public check page and its API routes are tested against (task 0043): a published mark, a school's vocational certificate (ISSUED, a draft, or one whose fingerprint no longer matches) and
// a certificate of completion of a program (in force or withdrawn). Everything is arranged through the admin client, so the specs can put the database in any state; what they then ask goes over HTTP.

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const newCode = () => crypto.randomBytes(16).toString("hex");
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;

/// A PUBLISHED result with its verification code (and a DRAFT one, which has a code that proves nothing). Returns the codes and the names the page will show.
export async function publishedMark(tenant: TestTenant, tag: string) {
  const session = await db.academicSession.create({
    data: { tenantId: tenant.id, label: `${tag} 2093`, startDate: day("2093-09-01"), endDate: day("2094-07-20"), status: "ACTIVE" },
  });
  const term = await db.academicPeriod.create({
    data: {
      tenantId: tenant.id,
      sessionId: session.id,
      kind: "TERM",
      ordinal: 1,
      label: "First Term",
      startDate: day("2093-09-01"),
      endDate: day("2093-12-15"),
      isCurrent: true,
    },
  });
  const maths = await db.subject.create({ data: { tenantId: tenant.id, name: "Mathematics" } });
  const english = await db.subject.create({ data: { tenantId: tenant.id, name: "English" } });
  const pupil = await db.studentRecord.create({
    data: {
      tenantId: tenant.id,
      firstName: `${tag}Ada`,
      lastName: "Verify",
      dateOfBirth: day("2014-01-01"),
      admissionNo: `${tag}/SECRET-ADM`,
    },
  });
  const code = newCode();
  await db.result.create({
    data: {
      tenantId: tenant.id,
      studentId: pupil.id,
      subjectId: maths.id,
      periodId: term.id,
      score: 91.5,
      maxScore: 100,
      status: "PUBLISHED",
      verificationToken: code,
      gradeLetter: "A",
      publishedAt: new Date("2093-12-10T10:00:00Z"),
    },
  });
  const draftCode = newCode();
  await db.result.create({
    data: {
      tenantId: tenant.id,
      studentId: pupil.id,
      subjectId: english.id,
      periodId: term.id,
      score: 40,
      maxScore: 100,
      status: "DRAFT",
      verificationToken: draftCode,
      gradeLetter: "D",
    },
  });
  return { code, draftCode, pupilName: `${tag}Ada Verify`, session: `${tag} 2093` };
}

/// A school's vocational certificate. `status` ISSUED by default; `tampered` records a fingerprint that is not the certificate's own.
export async function vocationalCertificate(
  tenant: TestTenant,
  tag: string,
  opts: { status?: "ISSUED" | "DRAFT" | "REVOKED"; tampered?: boolean } = {},
) {
  const pupil = await db.studentRecord.create({
    data: { tenantId: tenant.id, firstName: `${tag}Ngozi`, lastName: "Eze", dateOfBirth: day("2005-05-05"), admissionNo: `${tag}/VOC-ADM` },
  });
  const certificateNo = uniq("VOC-");
  const title = `${tag} Certificate in Welding`;
  const issueDate = new Date("2093-11-05T00:00:00Z");
  const token = newCode();
  const metadataText = `METADATA-${tag}`;
  const fingerprint = { tenantId: tenant.id, studentId: pupil.id, certificateNo, title, issueDate };
  await db.certificate.create({
    data: {
      ...fingerprint,
      verificationToken: token,
      verificationHash: opts.tampered
        ? computeCertificateHash({ ...fingerprint, title: "A different title" })
        : computeCertificateHash(fingerprint),
      status: opts.status ?? "ISSUED",
      metadata: { remark: metadataText },
    },
  });
  return { token, certificateNo, title, studentName: `${tag}Ngozi Eze`, metadataText };
}

/// A certificate of completion of a program (and the program, its group and its participant, which it needs). `withdrawn` makes it a REVOKED one.
export async function programCertificate(tenant: TestTenant, tag: string, opts: { withdrawn?: boolean } = {}) {
  const program = await db.program.create({
    data: { tenantId: tenant.id, name: `${tag} Quran Class`, kind: "ONGOING", status: "ACTIVE", createdByUserId: "verify-world" },
  });
  const group = await db.programGroup.create({ data: { tenantId: tenant.id, programId: program.id, levelIndex: 0, name: "G" } });
  const participant = await db.programParticipant.create({
    data: {
      tenantId: tenant.id,
      programId: program.id,
      kind: "ADULT",
      firstName: `${tag}Ibrahim`,
      lastName: "Bello",
      groupId: group.id,
      joinedOn: day("2093-01-10"),
      createdByUserId: "verify-world",
    },
  });
  const serialNo = uniq("CERT-");
  const token = newCode();
  const certificate = await db.programCertificate.create({
    data: {
      tenantId: tenant.id,
      programId: program.id,
      participantId: participant.id,
      serialNo,
      verificationToken: token,
      issuedOn: day("2093-10-03"),
      completedOn: day("2093-10-01"),
      title: "Certificate of Completion",
      bodyText: "This is to certify that the person named has completed the program.",
      personName: `${tag}Ibrahim Bello`,
      programName: program.name,
      schoolName: tenant.name,
      issuedByUserId: "verify-world",
      ...(opts.withdrawn ? { status: "REVOKED" as const, revokedAt: new Date(), revokeReason: "Issued in error" } : {}),
    },
  });
  return { token, serialNo, programName: program.name, personMasked: `${tag}Ibrahim B.`, programId: program.id, certId: certificate.id };
}
