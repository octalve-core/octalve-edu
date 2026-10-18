# 0010 — School type comes from the server, never from the browser or a school's administrator
Status: Accepted · Decided: by the maintainer · Recorded: 2026-10-08

## Context
`Tenant.schoolType` decides whether a school's periods are terms, semesters or cohorts. Changing it later would rename every period and can strand existing ones. There is no platform-level superadmin yet.

## Decision
`DEFAULT_SCHOOL_TYPE` (`K12` | `HIGHER_ED` | `VOCATIONAL`, default `K12`) is read on the server; the setup route passes it to the school it creates. The setup body is strict and refuses a `schoolType`. No route or screen lets a school's administrator change it. A wrong value stops setup with a message naming the allowed values. When a platform superadmin exists, a screen there writes the same column.

## Consequences
One deployment, one default type until a superadmin exists. The commit can be dropped without touching the people code.

## Enforced by
`unit` for the env reader; `integration/setup-school-type`; `api/setup`.

## Related
Plan decision P1 · `phases/phase-1.2-people.md`.

## Update (2026-10-13)
The platform superadmin this record waited for now exists (ADR 0016): a platform administrator changes a school's type from the Platform page, through `platform_set_school_type()` (refused once the school has an academic period; audited in the platform's own log). `DEFAULT_SCHOOL_TYPE` stays the default for the **first-run setup wizard only**; the wizard still does not ask. The maintainer accepted this reading on 2026-10-13. No decision here changed.
