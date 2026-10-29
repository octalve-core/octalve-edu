# Platform console — Components

`src/components/platform/`: the screen of the platform administrator. Its API routes are in [`../functions/platform.md`](../functions/platform.md).

## `src/components/platform/`

The platform administrator's console, rendered by the `/platform` page.

| File | Description |
| --- | --- |
| `PlatformPanel.tsx` | Client component, no props. Loads `/api/v1/platform/schools`, `/api/v1/platform/audit?limit=20` and `/api/v1/platform/support/grants`; shows each school's type, created date, member, student and campus counts, Active or Suspended, and a "No administrator" badge. Dialogs (each posts the administrator's password as `password`): create a school, suspend (reason up to 500 characters), reinstate, change type, invite a first administrator (only when the administrator count is 0), open a support view (only for a school with a live grant that is not suspended; success does a full page load of `/schools/<code>`). History shows the last 20 platform actions. |
