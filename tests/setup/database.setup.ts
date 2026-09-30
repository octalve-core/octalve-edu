import { execFileSync } from "node:child_process";
import { test as setup } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_NAME, TEST_DATABASE_URL } from "../support/env";
import { db, resetDatabase } from "../support/db";

// Runs once, first, before any suite that needs a database (the other projects
// depend on this one). Creates the *_test database if it doesn't exist yet,
// applies every migration to it exactly as production would (`migrate deploy`,
// never `db push`), and empties it.
setup("test database is created, migrated and empty", async () => {
  setup.setTimeout(120_000);

  if (!/^[A-Za-z0-9_]+$/.test(TEST_DATABASE_NAME)) {
    throw new Error(`Unsafe test database name: ${TEST_DATABASE_NAME}`);
  }

  const maintenanceUrl = new URL(TEST_DATABASE_URL);
  maintenanceUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
  try {
    const exists = await admin.$queryRaw<{ one: number }[]>`
      SELECT 1 AS one FROM pg_database WHERE datname = ${TEST_DATABASE_NAME}`;
    if (exists.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  await resetDatabase();
  await db.$disconnect();
});
