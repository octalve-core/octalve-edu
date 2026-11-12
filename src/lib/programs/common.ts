import { Prisma, type Program } from "@prisma/client";
import type { ErrorDetail } from "@/lib/api/envelope";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { canManage, viewerOf, type ProgramViewer } from "./access";
import { isEditableStatus } from "./rules";
import { schoolEnabled } from "./settings-service";

// Shared by the programs services: the result type, the audit write, the lock, and the one guard every change goes through.

export type Failure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string; details?: ErrorDetail[] };
export type Result<T> = { ok: true; data: T } | Failure;

export const refuse = (status: Failure["status"], code: string, message: string, details?: ErrorDetail[]): Failure => ({
  ok: false,
  status,
  code,
  message,
  details,
});
export const done = <T>(data: T): Result<T> => ({ ok: true, data });

export const NOT_FOUND = "That program was not found.";

type Json = Prisma.InputJsonValue;
export type AuditEntry = {
  programId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: Json | null;
  after?: Json | null;
  reason?: string | null;
};

/// Append-only: this is the only place a ProgramAudit row is written, and the database role the application runs as cannot update or delete one.
export async function writeAudit(tx: Tx, tenantId: string, entry: AuditEntry): Promise<void> {
  await tx.programAudit.create({
    data: {
      tenantId,
      programId: entry.programId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      beforeValue: entry.before ?? Prisma.DbNull,
      afterValue: entry.after ?? Prisma.DbNull,
      reason: entry.reason ?? null,
    },
  });
}

/// One structure change at a time per program: a row lock on the program, so "remove this level" cannot race "add a group at this level", and two clients cannot both pass the same
/// count check.
async function lockProgram(tx: Tx, tenantId: string, id: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Program" WHERE "tenantId" = ${tenantId} AND "id" = ${id} FOR UPDATE`;
  return rows.length > 0;
}

type ChangeContext = { tx: Tx; program: Program; viewer: ProgramViewer };

/// `need`: "super" the school's administrator; "manage" the school's administrator or a program admin; "people" those two or the administrator of a campus the program runs in (slice P2: the work
/// then limits itself to the people through THEIR campus); "any" any viewer (slice P3: the work decides from the viewer's staff places which groups they may touch). Runs a change to one program. Order: who you are (404 for a program you have no place
/// in, 403 for one you may read but not change), whether programs are switched off for the school (409), then - inside the transaction that holds the program's lock - whether the program can
/// still be changed (409). `work` must make its checks BEFORE its first write: a refusal it returns does not undo writes already made.
export async function change<T>(
  auth: TenantAuthContext,
  programId: string,
  need: "manage" | "super" | "people" | "any",
  work: (context: ChangeContext) => Promise<Result<T>>,
  options: { allowArchived?: boolean } = {},
): Promise<Result<T>> {
  const { tenantId } = auth.tenant;
  try {
    return await auth.tenant.run(async (tx): Promise<Result<T>> => {
      const viewer = await viewerOf(auth, tx, programId);
      if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
      if (
        need === "super"
          ? viewer.level !== "SUPER"
          : need === "manage"
            ? !canManage(viewer)
            : need === "people"
              ? viewer.level === "STAFF"
              : false
      )
        return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
      if ((await schoolEnabled(tx, tenantId)) === false) return refuse(409, "PROGRAMS_OFF", "Programs are switched off for the school.");
      if (!(await lockProgram(tx, tenantId, programId))) return refuse(404, "NOT_FOUND", NOT_FOUND);
      const program = await tx.program.findFirstOrThrow({ where: { tenantId, id: programId } });
      if (!options.allowArchived && !isEditableStatus(program.status)) {
        return refuse(
          409,
          "PROGRAM_READ_ONLY",
          program.status === "ARCHIVED"
            ? "This program is archived. Restore it to change it."
            : "This program has ended and can't be changed.",
        );
      }
      return work({ tx, program, viewer });
    });
  } catch (error) {
    // The database's own unique indexes are the last word on names (two clients saving the same name at once).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return refuse(409, "DUPLICATE", "That name is already in use.");
    throw error;
  }
}

/// A read of one program: runs inside the tenant transaction, finds the viewer, and answers 404 for a program the person has no place in (the same as one that does not exist).
export async function reading<T>(
  auth: TenantAuthContext,
  programId: string,
  work: (context: { tx: Tx; viewer: ProgramViewer }) => Promise<Result<T>>,
): Promise<Result<T>> {
  return auth.tenant.run(async (tx): Promise<Result<T>> => {
    const viewer = await viewerOf(auth, tx, programId);
    if (!viewer) return refuse(404, "NOT_FOUND", NOT_FOUND);
    return work({ tx, viewer });
  });
}
