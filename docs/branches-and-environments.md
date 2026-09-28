# Branches & Environments

The branch names below don't map to environments the way they
conventionally would once they exist — written down now, before any of
them do, so the convention doesn't have to be reverse-engineered from
CI config later.

| Branch | Environment | Notes |
| :--- | :--- | :--- |
| `dev` | Integration | Feature PRs land here first. |
| `main` | **Staging** | Tested here; not customer-facing. |
| `prod` | **Live production** | Serves real traffic once there is any. |

This is the decision from the PRD's CI/CD discussion (`docs/PRD.md` §7),
recorded here rather than only in chat history. The flow: a feature PR
merges into `dev`; a periodic "promote `dev` to `main`" PR moves that
accumulated work into staging for testing; a change only reaches real
users once it's separately merged into `prod`.

## Actual state right now (2026-09-28)

Not yet true — recorded so this file doesn't silently drift into fiction:

- The repo has exactly one branch, `master`, no `dev`/`main`/`prod` split
  yet, and no remote configured (`git remote -v` is empty).
- No CI/CD pipeline exists. No deploy target (Vercel or otherwise) is
  wired up.
- `master` will need to be renamed/restructured into the three branches
  above before this convention is real, not just documented. That's a
  Phase 0.5-or-later infrastructure task, not done yet — tracked here so
  it isn't lost, same reasoning as the rest of this project's
  development-history docs.

Update this file the day that restructuring actually happens, including
whatever the equivalent of "`prod` was N commits behind `main`" turns out
to be once there's real deploy history to report.
