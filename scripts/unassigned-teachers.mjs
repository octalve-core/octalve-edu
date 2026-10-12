#!/usr/bin/env node
// Operator check (task 0010 F3, ISS-0013): which active teachers would see NO class arm under the attendance rule?
//
//   pnpm teachers:unassigned [-- <school-code>]
//
// Since task 0010 F3 a teacher reads and writes attendance only for the arms they are ASSIGNED to - a subject assignment or a timetable slot of their
// staff record - within their own campus. Before that, any teacher could mark any arm, so a school that never recorded assignments would find all its
// teachers locked out the day this ships. Run this against a school BEFORE deploying: every teacher it lists needs an administrator to assign them (People -> Staff
// -> assignments) or to add them to the timetable. READ-ONLY: it changes nothing. Without a code it reports every school.
//
// Connects with DIRECT_URL (the migrator), like the other operator scripts, and sets each school's context for its own reads (the tables are under
// row-level security). Self-contained (plain Node + Prisma, no app imports).
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env - the URLs may come from the environment
}

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) {
  console.error("Usage: pnpm teachers:unassigned [-- <school-code>]");
  process.exit(2);
}
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Set DIRECT_URL (the migrator) in .env or the environment.");
  process.exit(2);
}

const prisma = new PrismaClient({ datasourceUrl: url });
try {
  const schools = await prisma.tenant.findMany({
    where: args[0] ? { code: args[0].trim().toLowerCase() } : {},
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  if (schools.length === 0) {
    console.error(args[0] ? `No school with the code ${args[0]}.` : "There are no schools.");
    process.exit(1);
  }
  for (const school of schools) {
    const { teachers, idle } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${school.id}, true)`;
      const members = await tx.tenantMembership.findMany({
        where: { tenantId: school.id, role: "TEACHING_STAFF", deactivatedAt: null },
        select: { userId: true, user: { select: { name: true, email: true } } },
      });
      const records = await tx.staffRecord.findMany({
        where: { tenantId: school.id, archivedAt: null, userId: { in: members.map((m) => m.userId) } },
        select: { userId: true, _count: { select: { assignments: true, timetableSlots: true } } },
      });
      const assigned = new Set(records.filter((r) => r._count.assignments + r._count.timetableSlots > 0).map((r) => r.userId));
      return { teachers: members.length, idle: members.filter((m) => !assigned.has(m.userId)) };
    });
    if (teachers === 0) {
      console.log(`${school.code} (${school.name}): no active teaching staff.`);
    } else if (idle.length === 0) {
      console.log(`${school.code} (${school.name}): every active teaching staff member has at least one class arm.`);
    } else {
      console.log(`${school.code} (${school.name}): ${idle.length} of ${teachers} active teaching staff would see no class arm:`);
      for (const m of idle) console.log(`  - ${m.user.name ?? "(no name)"} <${m.user.email ?? "no email"}>`);
    }
  }
} finally {
  await prisma.$disconnect();
}
