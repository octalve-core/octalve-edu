import { forVerification } from "@/lib/tenant/for-tenant";
import { maskName } from "./completion-rules";
import { toIsoDate } from "./rules";

// Programs, slice P5: what the PUBLIC may learn from a program certificate's code (task 0027; AlEemaan's task 0043, section 12.3). It says whether the certificate is genuine or has been
// withdrawn, which program, when it was completed, and the person as first name and last initial only (a child may be on it) - never marks, a phone number, a guardian or a reason for a
// withdrawal. A code that does not exist gets the same answer as any wrong code. The read goes through the verification context (the policy `program_certificate_public_verification`).

export type ProgramCertificateCheck = {
  kind: "PROGRAM_CERTIFICATE";
  genuine: true;
  withdrawn: boolean;
  school: string;
  program: string;
  title: string;
  person: string;
  completedOn: string;
  issuedOn: string;
  serialNo: string;
};

export async function verifyProgramCertificate(token: string): Promise<ProgramCertificateCheck | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  return forVerification(token).transaction(async (tx) => {
    const c = await tx.programCertificate.findFirst({
      where: { verificationToken: token },
      select: {
        status: true,
        schoolName: true,
        programName: true,
        title: true,
        personName: true,
        completedOn: true,
        issuedOn: true,
        serialNo: true,
      },
    });
    if (!c) return null;
    return {
      kind: "PROGRAM_CERTIFICATE" as const,
      genuine: true as const,
      withdrawn: c.status === "REVOKED",
      school: c.schoolName,
      program: c.programName,
      title: c.title,
      person: maskName(c.personName),
      completedOn: toIsoDate(c.completedOn),
      issuedOn: toIsoDate(c.issuedOn),
      serialNo: c.serialNo,
    };
  });
}
