#!/usr/bin/env node
// Operator tool: re-issue a school's FIRST ADMINISTRATOR invitation (task 0010 F2, ISS-0015, ADR 0016 amendment).
//
//   pnpm platform-admin:invite-first-admin -- <school-code> <email> --as <platform-administrator-email>
//
// For the day the platform page can't be used (or its mail is the thing that is broken): a school made from the platform page has ONE invitation for its
// first administrator; if that mail is lost nobody inside the school exists to send another. This writes a new one - and ONLY if the school has no
// active ADMIN (it refuses otherwise, exactly like the platform action). It revokes the school's open ADMIN invitations, creates the new one (7 days),
// writes a row in the school's own audit log for each and one row in the platform's audit log, and PRINTS the invitation link instead of mailing it:
// hand it to the person by a channel you trust. The link is the credential - whoever opens it first becomes the school's administrator.
//
// `--as` is REQUIRED and must name a platform administrator: the platform's log always names a real person who is accountable for this (there are no
// anonymous operator rows). Run it on the server, as the person who administers it, after confirming who is asking: it is deliberately NOT reachable
// over HTTP. It does not ask for the platform administrator's password or second factor - having this shell and the migrator's database URL is the
// authority, the same as `pnpm platform-admin:make`.
//
// Connects with DIRECT_URL (the migrator), like the other operator scripts. Self-contained (plain Node + Prisma, no app imports): it must keep working
// when the app can't build. The token is 256 random bits; only its SHA-256 hash is stored (lib/invitations/token.ts is the reference).
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env - the URLs may come from the environment
}

const USAGE = "Usage: pnpm platform-admin:invite-first-admin -- <school-code> <email> --as <platform-administrator-email>";
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parse(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const positional = [];
  let actor = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--as") {
      actor = args[++i] ?? null;
    } else if (args[i].startsWith("-")) {
      return null;
    } else {
      positional.push(args[i]);
    }
  }
  if (positional.length !== 2 || !actor || actor.startsWith("-")) return null;
  const [code, email] = positional;
  return { code: code.trim().toLowerCase(), email: email.trim().toLowerCase(), actorEmail: actor.trim().toLowerCase() };
}

const input = parse(process.argv.slice(2));
if (!input || !EMAIL.test(input.email) || input.email.length > 254) {
  console.error(USAGE);
  process.exit(2);
}

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_URL (the migrator) in .env or the environment.");
  process.exit(2);
}

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const actor = await prisma.user.findUnique({ where: { email: input.actorEmail }, select: { id: true, isPlatformAdmin: true } });
  if (!actor || !actor.isPlatformAdmin) {
    console.error(`${input.actorEmail} is not a platform administrator (see pnpm platform-admin:make). Nothing changed.`);
    process.exit(1);
  }
  const tenant = await prisma.tenant.findUnique({ where: { code: input.code }, select: { id: true, name: true } });
  if (!tenant) {
    console.error(`No school with the code ${input.code}. Nothing changed.`);
    process.exit(1);
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const outcome = await prisma.$transaction(async (tx) => {
    // The school's tables are under row-level security: the context is this school, for this transaction only.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
    const admins = await tx.tenantMembership.count({ where: { tenantId: tenant.id, role: "ADMIN", deactivatedAt: null } });
    if (admins > 0) return { refused: true };
    const now = new Date();
    const open = await tx.invitation.findMany({
      where: { tenantId: tenant.id, role: "ADMIN", acceptedAt: null, revokedAt: null },
      select: { id: true, email: true },
    });
    for (const old of open) {
      await tx.invitation.update({ where: { id: old.id }, data: { revokedAt: now } });
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: actor.id,
          action: "INVITATION_REVOKED",
          targetType: "Invitation",
          targetId: old.id,
          afterValue: { email: old.email },
          reason: "replaced by a new first-administrator invitation (operator script)",
        },
      });
    }
    const invitation = await tx.invitation.create({
      data: {
        tenantId: tenant.id,
        email: input.email,
        role: "ADMIN",
        campusId: null,
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        invitedById: actor.id,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        actorUserId: actor.id,
        action: "INVITATION_CREATED",
        targetType: "Invitation",
        targetId: invitation.id,
        afterValue: { email: input.email, role: "ADMIN", campusId: null, firstAdministrator: true, reinvited: true },
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: actor.id,
        action: "FIRST_ADMIN_REINVITED",
        targetTenantId: tenant.id,
        afterValue: { email: input.email },
        reason: "Operator script (pnpm platform-admin:invite-first-admin)",
      },
    });
    return { refused: false, revoked: open.length };
  });

  if (outcome.refused) {
    console.error(`${tenant.name} already has an administrator, so nothing was changed. They can invite others from the Users page.`);
    process.exitCode = 1;
  } else {
    const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    console.log(`Invitation written for ${input.email} as the first administrator of ${tenant.name} (valid 7 days).`);
    if (outcome.revoked > 0) console.log(`${outcome.revoked} earlier open administrator invitation(s) were revoked.`);
    console.log("Give this link to that person - whoever opens it first becomes the administrator:");
    console.log(`${base}/accept-invite#token=${token}`);
  }
} finally {
  await prisma.$disconnect();
}
