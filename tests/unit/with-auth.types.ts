// Compile-time check, enforced by `pnpm typecheck` (tsc) — not a runtime test.
// If `roles`/`permissions` ever become accepted again without §0.5.2's tenant
// resolution, the @ts-expect-error lines below stop erroring and `tsc` fails
// with "Unused '@ts-expect-error' directive", which is the point.
import { withAuth } from "@/lib/auth/with-auth";

const handler = async () => new Response("ok");

// @ts-expect-error `roles` is `never` until §0.5.2
withAuth(handler, { roles: ["ADMIN"] });

// @ts-expect-error `permissions` is `never` until §0.5.2
withAuth(handler, { permissions: ["students:read"] });

withAuth(handler); // the supported call shape still compiles
