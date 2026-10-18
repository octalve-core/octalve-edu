# 0015 — `dev` is development, `master` is staging, `prod` is production

Status: Accepted
Decided by: the maintainer · Date: 2026-10-11
Recorded: 2026-10-11
Supersedes: ADR 0011 (the branch roles and the "prod is reserved" clause; its rules on approval, blocked merges and comprehensive messages stand)

## Context

ADR 0011 created `dev`, `master` and `prod` but left the role of `master` open and `prod` untouched. On 2026-10-11 the maintainer created `dev` and `prod` on octalve-core and its fork (octalve-core is where development now happens; the fork is merged from core after Phase 3), made `dev` the default branch on GitHub, and defined the flow.

## Decision

- **`dev`** is where all development lands (the default branch). The AI may push feature branches, open PRs and merge into `dev` after the gate (typecheck → lint → format:check → build → tests).
- **`master` is the staging branch.** A PR `dev` → `master` is merged only after the maintainer approves that specific PR in the session.
- **`prod` is production.** A PR `master` → `prod` is merged only after the maintainer approves that specific PR. Nothing is pushed straight to `master` or `prod`. Migrations run before the code that needs them (and are additive).
- A blocked merge is reported to the maintainer, never worked around.

## Alternatives Considered

- **`dev` → `prod` directly at release, `master` a plain mirror:** rejected by the maintainer; staging is what `master` is for.
- **Keep `master` as the default branch:** rejected; PRs would default to the wrong base.

## Consequences

- Every open PR must be retargeted to `dev`; stacked PRs merge in order.
- Branch protection on `master` and `prod` (required review, no direct pushes) is recommended and is a GitHub setting the AI does not change.
- **Revisit if:** a hotfix path straight to `prod` is needed, or staging gets its own environment.

## Enforced by

Review only (GitHub branch protection once the maintainer turns it on).

## Binds

- `docs/adr/README.md`
