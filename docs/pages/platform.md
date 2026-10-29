# Platform console — Pages

The page of the platform administrator, who is not a member of any school. The API routes behind it are in [`../functions/platform.md`](../functions/platform.md).

## Platform console

| Route | File | Description |
| --- | --- | --- |
| `/platform` | `(app)/platform/page.tsx` | The platform administrator's console, inside the app shell but outside any school (no school code, no school data). A signed-out visitor goes to `/login` (`requirePageSession()`); `User.isPlatformAdmin` is then read from the database and anyone else gets the 403 view (`forbidden()`), the same as a stranger. An administrator without two-step verification sees a warning linking to `/account` instead of the panel; otherwise it renders `PlatformPanel`. The nav shows "Platform" only to platform administrators (`navFor(school, platform)`); the platform API enforces the same rules again. |
