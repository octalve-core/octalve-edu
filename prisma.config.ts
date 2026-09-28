import { defineConfig } from "prisma/config";

// A prisma.config.ts file present opts the CLI OUT of its old auto-.env-load
// behavior (package.json + prisma/schema.prisma mode did this implicitly) —
// load it ourselves via Node's native loader (Node 20.6+, no dotenv dep).
try {
  process.loadEnvFile(".env");
} catch {
  // .env absent (e.g. CI providing real env vars directly) — not fatal.
}

// Points the Prisma CLI at the split schema folder (prisma/schema/*.prisma —
// see prisma/schema/schema.prisma's header for why it's split this way).
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
  },
});
