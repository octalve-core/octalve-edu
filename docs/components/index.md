# Components

Every component in the app: the folders under `src/components/` and the two forms colocated with their page under `src/app/`, one file per part of the product plus a shared file for building blocks used everywhere.

| File | Covers |
| :--- | :--- |
| [`school-app.md`](./school-app.md) | The screens of one school: academics, results, timetable, people, coursework, announcements, communication, finance, users, settings and support access |
| [`platform.md`](./platform.md) | `src/components/platform/`: the platform administrator's console |
| [`public.md`](./public.md) | `src/components/auth/` and the sign-in and set-up forms: sign-in, recovery, invitations, two-step verification, sessions and the account page |
| [`shared.md`](./shared.md) | `ui/` (form and layout primitives), `shell/` (app shell and navigation), `pwa/`, `dev/` and `tools/` (the quick-tools drawer) |

See also [`../functions/index.md`](../functions/index.md) for the non-component logic these components call, and [`../pages/index.md`](../pages/index.md) for the pages that render them.

These tables are kept in step with the code: a file that is added, renamed or removed gets its row changed in the same change.
