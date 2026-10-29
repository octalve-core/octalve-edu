# Functions

Every non-component logic file in the app: the libraries under `src/lib/`, the request proxy under `src/`, and every API route under `src/app/api/v1/`, one file per part of the product plus a shared file for logic used across all of them.

| File | Covers |
| :--- | :--- |
| [`school-app.md`](./school-app.md) | Services, rules and API routes scoped to one school (`/api/v1/schools/[code]/...`): academics, attendance, results, certificates, higher education, timetable, people, coursework, announcements, communication, finance, members, settings and support grants |
| [`platform.md`](./platform.md) | The platform administrator's guard, service and API routes |
| [`public.md`](./public.md) | The API routes with no school in the URL: sign-in, account security, invitations, first-run set-up and public verification |
| [`shared.md`](./shared.md) | `src/lib/auth/` (sessions, passwords, two-step verification, rate limiting, CSRF, `withAuth`), `src/lib/tenant/` (the verified tenant and row-level security), `src/lib/api/`, email, the CSP, the dispatch queue, the database client and the request proxy |

See also [`../components/index.md`](../components/index.md) for the components these files back. Every API route also has an entry (and a reason) in the allowlists of `tests/unit/route-role-guard.spec.ts` and, for school GET routes, `tests/unit/route-area-guard.spec.ts`.

These tables are kept in step with the code: a file that is added, renamed or removed gets its row changed in the same change.
