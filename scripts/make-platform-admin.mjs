#!/usr/bin/env node
// Operator tool for platform authority (domain-implementation-plan.md, campus administrators and a platform superadmin, C5).
//
//   pnpm platform-admin:make -- <email>
//
// Makes the person with this address a PLATFORM ADMINISTRATOR (`User.isPlatformAdmin`): the way to create the first one — the setup wizard never
// does — and the way back if every one is lost. A platform administrator lists, creates and suspends schools and changes a school's type; they
// read NO school's data. Run it on the server, as the person who administers it, after confirming who is asking: it is deliberately NOT reachable
// over HTTP. Idempotent. The person does not need to belong to any school. The platform pages also require two-step verification, so the script
// says so when the person has not turned it on. Writes a row to the platform's own audit log.
//
// Connects with DIRECT_URL (the migrator / an administrator), like `pnpm db:roles`: the platform audit log has no policy for the application's
// runtime role, on purpose. Self-contained (plain Node + Prisma, no app imports): it must keep working when the app can't build.
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env — the URLs may come from the environment
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length !== 1 || args[0].startsWith("-")) {
  console.error("Usage: pnpm platform-admin:make -- <email>");
  process.exit(2);
}
const email = args[0].trim().toLowerCase();

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_URL (the migrator) in .env or the environment.");
  process.exit(2);
}

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isPlatformAdmin: true } });
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exitCode = 1;
  } else if (user.isPlatformAdmin) {
    console.log(`${email} is already a platform administrator. Nothing changed.`);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: user.id,
          action: "PLATFORM_ADMIN_GRANTED",
          beforeValue: { isPlatformAdmin: false },
          afterValue: { isPlatformAdmin: true },
          reason: "Operator grant (pnpm platform-admin:make)",
        },
      });
    });
    console.log(`${email} is now a platform administrator.`);
    const mfa = await prisma.mfaCredential.count({ where: { userId: user.id, confirmedAt: { not: null } } });
    if (mfa === 0) {
      console.log("They must turn on two-step verification (Account → Security) before the platform pages will open for them.");
    }
  }
} finally {
  await prisma.$disconnect();
}
