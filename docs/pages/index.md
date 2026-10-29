# Pages

Every page route in the app (`page.tsx` under `src/app/`) and the app-level files that wrap them (layouts, web manifest, icons, global styles), one file per part of the product.

| File | Covers |
| :--- | :--- |
| [`school-app.md`](./school-app.md) | The signed-in area under the `(app)` route group: the list of your schools, the account page, and every screen of one school under `/schools/[code]` |
| [`platform.md`](./platform.md) | The platform administrator's console (`/platform`) |
| [`public.md`](./public.md) | Pages reachable without a school (sign-in and recovery, invitations, email confirmation, the first-run set-up wizard, the landing and offline pages) and the app-level files |

See also [`../components/index.md`](../components/index.md) for what the pages render and [`../functions/index.md`](../functions/index.md) for the logic and the API routes behind them. Navigation (who sees which entry) is defined once in `src/components/shell/nav.ts`.

These tables are kept in step with the code: a file that is added, renamed or removed gets its row changed in the same change.
