import { z } from "zod";
import { ok } from "@/lib/api/envelope";
import { validate } from "@/lib/api/validate";
import { withAuth } from "@/lib/auth/with-auth";
import { platformGuard } from "@/lib/platform/guard";
import { listAudit } from "@/lib/platform/service";

// GET /api/v1/platform/audit?limit=50                                                    (plan C5, ADR 0016)
// The platform's own history, newest first (what was done to which school, by whom, and why). It holds no school's data.
const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });

const read = validate({ query }, async (_req, auth: { userId: string }, _ctx: unknown, { query: q }) =>
  ok({ entries: await listAudit(auth.userId, q.limit) }),
);

export const GET = withAuth(async (req, auth, ctx) => (await platformGuard(auth)) ?? read(req, auth, ctx));
