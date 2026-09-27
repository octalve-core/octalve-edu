*Synced from the canonical Claude Docs PRD at https://claude.ai/artifact/W9AmZifbHByc9XxNtHCawP — that link is the source of truth if this file drifts.*

# Octalve Edu — Product Requirements Document

*2026-09-23 · Drafted with Rojitech-4*

## 1. Overview

Octalve Edu is a school management platform sold in **two editions built from one codebase**:

- **Solo** — a single school installs and runs it on its own infrastructure (self-hosted), pays a one-time or annual license, owns its data outright, no dependency on Octalve's servers.
- **SaaS** — multi-tenant, self-serve signup, subscription-billed, hosted by Octalve; any school can register and be running in minutes.

**Problem.** Most private schools in Nigeria/West Africa run admin (attendance, results, fees, communication) on paper registers, Excel, and WhatsApp. Existing school software is either too enterprise/expensive (PowerSchool-class), too generic, or assumes reliable connectivity and card payments that don't fit the local context (mobile money, bank transfer, intermittent bandwidth).

**Product.** A student information system (SIS) covering academic records, attendance, results/grading, and fee collection first, with communication, LMS, and operational modules (HR, library, transport) phased in. Same feature set, two delivery models, one codebase.

## 2. Goals & Success Metrics

**MVP goals**

- Ship a working Core SIS + Finance module usable end-to-end by a real pilot school within the build window (§12).
- Prove both delivery paths work from the same codebase: one Solo install running standalone, one SaaS tenant running multi-tenant, no forked code.
- Replace a school's existing paper/Excel/WhatsApp workflow for attendance, results, and fee collection.

**Success metrics (first 2 terms post-launch)**

| Metric | Target |
| --- | --- |
| Pilot schools onboarded (SaaS + Solo combined) | ≥ 5 |
| Time from signup to first class/student data entered (SaaS) | < 30 minutes |
| Fee payments processed through the platform | ≥ 70% of a pilot school's termly fees |
| Admin time spent on attendance/results entry | ≥ 50% reduction vs. paper/Excel (self-reported) |
| Solo installer: time from `docker compose up` to login screen | < 15 minutes |
| Cross-tenant data leakage incidents | 0 |

## 3. Target Users & Market

**Primary market (launch):** small-to-mid private K-12 schools in Nigeria/West Africa, 1–3 campuses, limited in-house IT. **Secondary (roadmap):** tertiary/higher-ed (semester/credit-unit structure) and vocational/tutorial centers (cohort-based, no traditional grade levels) — supported by a flexible academic-structure model from day one so these aren't bolt-ons later.

**Personas**

| Persona | Role | Core needs |
| --- | --- | --- |
| School Owner/Proprietor | Admin (SaaS or Solo) | Enrollment numbers, fee collection status, overall school health at a glance |
| Registrar/Bursar | Non-teaching staff | Student records, fee invoicing/payment tracking, results compilation |
| Teacher | Teaching staff | Attendance marking, gradebook/results entry, class lists, announcements |
| Other non-teaching staff | Non-teaching staff | Role-scoped access to their operational area only (e.g. accountant: finance module; librarian: library module) — not the full admin panel |
| Student | End user | View timetable, results, assignments |
| Parent | End user | View child's attendance, results, fee balance, pay fees, receive announcements |

## 4. Deployment Models

|  | Solo (self-hosted) | SaaS (multi-tenant) |
| --- | --- | --- |
| Hosting | School's own server/VPS | Octalve-hosted |
| Tenancy | Single tenant, no isolation logic active | Shared DB, `tenant_id` + Postgres row-level security |
| Onboarding | Run installer, one-time setup wizard | Self-serve signup at a shared URL, creates a new tenant |
| Billing | One-time or annual license key | Recurring subscription (Paystack/Flutterwave) |
| Updates | School pulls new version manually (or opts into a hosted-update service later) | Continuous deployment, all tenants on latest version |
| Data ownership | School has the database, full export anytime | Octalve custodian; school can export anytime (data portability is a hard requirement, not optional) |
| Support | Self-serve docs + paid support tier | Included support tiers by plan |

Both editions ship from the **same codebase** (§7) — a `DEPLOYMENT_MODE=solo|saas` flag controls whether multi-tenant routing/signup/RLS tenant-scoping is active; it does not fork the code.

## 5. MVP Scope — Core SIS + Finance

**Core SIS**

- School setup: academic structure (terms/semesters/cohorts — configurable per school type), classes/sections, subjects; for SaaS, includes choosing the school's tenant code/URL (§7)
- Student records: enrollment, profile, guardian linkage, class assignment
- Year-end rollover: promote/repeat/withdraw/mark-alumni at term or session end; whether rollover runs automatically or needs admin confirmation is a per-school toggle in Settings (§14)
- Staff records: two staff categories — teaching staff (subject/class assignment, gradebook access) and non-teaching staff (accountant, librarian, admin support, security, etc.), each with role-scoped permissions rather than one generic "staff" role. A staff record does not require a login account — admin can add someone to the register (e.g. a security guard or a support staff HR wants tracked) without provisioning system access; a user account is a separate, optional step per staff record
- Attendance: daily/per-period marking by teacher, admin overview, absence trends
- Results/gradebook: score entry by subject/teacher, term result compilation, report card generation (PDF), configurable grading scale (WAEC/NECO-style for K-12, GPA/CGPA-ready structure for higher-ed)
- Result approval workflow: an explicit state machine, not a binary flag — `DRAFT → SUBMITTED → APPROVED → PUBLISHED → LOCKED`. After SUBMITTED, the teacher cannot directly edit the score; a reopen requires authorization + reason. After PUBLISHED/LOCKED, a correction requires admin role, a mandatory reason, and produces an immutable audit entry (before/after/actor/time) — never a silent overwrite. Whether the approval step is required at all is a per-school Settings toggle (§14), but the state machine itself, and the lock's immutability, are not optional
- Timetable: class/subject schedule, teacher view, student/parent view
- Announcements: school-wide or class-scoped notices
- Role-based portals: Admin, Teacher, Student, Parent
- Class capacity/streaming: manual class/arm assignment in MVP; the Settings panel (§14) already exposes this as a toggle, ready to switch on auto-assignment-on-capacity once that logic ships

**Finance**

- Fee structure setup: per term or per session, configurable per school (some schools bill termly, others session-wide)
- Invoicing: auto-generate termly invoices per student
- Payment collection: Paystack/Flutterwave integration (card, bank transfer, USSD)
- Installments: parents can pay an invoice in partial installments, not just in full — payments are tracked against the invoice rather than the invoice being a single pay/unpaid transaction
- Payment tracking: balance per student, receipts, payment history
- Admin finance dashboard: collections vs. outstanding, per-class/term breakdown
- Fee reminders: automated due-date reminders via email + WhatsApp click-to-chat link (no full messaging system needed); on/off and timing configurable in Settings (§14)
- Sibling discounts/scholarships/waivers: manual bursar override (amount edit, logged in the audit trail) by default, with an optional multi-step approval workflow — which mode is active is a Settings choice (§14)
- Payment-gateway and SMS cost bearer: configurable per school — absorbed by the school or passed to the parent (§14)

**Security**

- MFA (TOTP-based) required for Admin, Bursar/Finance, and any teaching-staff account with grade-write access — not just admin/finance; a compromised teacher account is a direct path to grade tampering, not only a data-exposure risk
- Automated backups for Solo installs: a scheduled DB backup job ships with the installer itself, not just documentation

**Explicitly out of MVP** (see §6): SMS/push messaging, LMS/assignments-beyond-results, HR/payroll, library, transport, native mobile apps.

## 6. Phased Roadmap

| Phase | Modules | Notes |
| --- | --- | --- |
| MVP | Core SIS + Finance | §5 |
| Phase 2 — Communication | SMS/email/push notifications, staff↔parent messaging, bulk announcements | Highest-requested addition after finance in similar markets |
| Phase 3 — LMS | Assignments, learning materials, online quizzes, gradebook integration beyond results entry |  |
| Phase 4 — Operations | HR/payroll, library management, transport/routes, inventory, NEMIS/government reporting integration | Lower urgency for typical private school pilot |
| Phase 5 — Expansion | Native mobile apps (iOS/Android), higher-ed-specific (course registration, credit units), vocational-specific (certifications, short-cohort billing), custom domains/white-labeling | Depends on which market segment gains traction first |

Each phase is a tier-manifest bucket (§7) — phases map cleanly onto sellable Core/Pro/Premium editions rather than being a separate versioning scheme.

Admissions pipeline (application → entrance test → offer → waitlist → enrolled) is deferred past MVP — pilot schools already have their students. To keep it easily integrable later, MVP's "add student" flow is built as its own distinct step (not entangled with enrollment logic elsewhere), so a future admissions pipeline can feed into it as a new entry point rather than requiring a rework.

All per-school workflow toggles introduced above (result approval, rollover automation, class auto-assignment, billing cycle, fee reminders, discount workflow, cost bearer) live in one place — see §14 Configurability & Settings.

## 7. Technical Architecture

**Stack:** Next.js (App Router) full-stack — one app, not a separate backend service. Its route handlers are designed and treated like a proper REST API surface (not ad hoc UI-coupled endpoints): versioned paths, pagination, filtering, consistent response shape (§ below). TypeScript, Prisma + PostgreSQL, Tailwind. Existing separate JWT/Django-style backend is retired; this is a clean-slate rebuild, current prototype UI kept only as reference.

**Technology stack:**

| Layer | Technology | Why |
| --- | --- | --- |
| Frontend/UI | Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui (Radix primitives) | Matches the existing prototype's dependencies; no reason to switch |
| Forms & validation | React Hook Form + Zod | Same Zod schemas double as API request validation and the OpenAPI source of truth (below) |
| Server state | TanStack Query | Natural client for the paginated/filtered REST API conventions above |
| Client state | Zustand | Already in the prototype; fine for local UI state alongside TanStack Query |
| Database & ORM | PostgreSQL + Prisma, RLS via `forTenant()` | Tenant isolation enforced at the database (§ above) |
| Auth | Auth.js (NextAuth v5) + Prisma adapter, **database sessions** (not JWT) | Database-backed sessions make server-side revocation trivial — delete the row — closing the session-revocation gap the security audit flagged; JWT sessions are stateless and hard to revoke |
| MFA | `otplib` (TOTP) | Auth.js has no built-in MFA |
| API docs | `zod-openapi` generating OpenAPI from the same Zod schemas, served via Scalar/Swagger UI | Docs can't drift from what's actually validated |
| Background jobs | BullMQ + Redis | Powers fee reminders, year-end rollover, scheduled backups, retention jobs; chosen over hosted-cron specifically because Solo installs need this to work with no external SaaS dependency — both are just more Docker Compose services |
| File storage | S3-compatible: AWS S3/Cloudflare R2 (SaaS), MinIO (Solo) | Same S3 API on both editions, so upload code never forks |
| Upload scanning | ClamAV | Malware scanning for LMS/admissions uploads, self-hostable in Docker |
| Payments | Paystack + Flutterwave SDKs, server-to-server verification | Per §5/§9's payment-integrity requirements |
| Email | Resend or Postmark | Fee receipts, DSAR responses |
| SMS/WhatsApp | Termii or similar Nigeria-focused provider, WhatsApp Business API | Per §5's fee-reminder and §9's NCC-compliance requirements |
| Testing | Vitest (unit/integration) + Playwright (e2e) | Matches the `ims` project's existing setup; dedicated cross-tenant/IDOR negative-test suite is mandatory, not optional |
| CI/CD security gates | `gitleaks` (secrets), Dependabot/Snyk (SCA), Semgrep (SAST), Trivy (container scanning) | Closes the security audit's CI/CD-gate finding — Critical/High findings block deploy |
| Observability | Sentry (SaaS only, PII-redacted), skip by default for Solo | Per the audit's log-redaction requirement |
| Rate limiting | `@upstash/ratelimit` or a Redis token-bucket (reuses the BullMQ Redis instance) | Required on auth, result-check, and payment endpoints (§7) |
| Infra | Docker for everything — same images power SaaS deployment and the Solo `docker-compose.yml` installer | One build pipeline, not two |
| Reverse proxy (Solo) | Caddy | Automatic HTTPS with near-zero config — friendlier for non-specialist school IT than nginx+certbot; answers the audit's Solo-hardening finding |
| Hosting (SaaS) | Self-managed Postgres + app on a VPS in AWS af-south-1 (Cape Town), or a managed Postgres (Neon/Supabase) if faster-to-ship outweighs the data-residency argument | af-south-1 is the closest major cloud region to Nigeria — the more defensible answer if NDPC ever asks about residency (§9) |

**API conventions:** every route handler follows the same shape, so it behaves like a standalone API even though it lives in the Next.js app:

- **Versioned paths:** `/api/v1/...`, so a breaking change gets a new version instead of breaking existing clients (including the mobile app in §6 Phase 5).
- **Consistent envelope:** every response is `{ data, meta, error }` — never a bare array or ad hoc shape — so client code and generated docs don't special-case endpoints.
- **Pagination, endpoint-dependent:** offset (`page`/`limit`) for small, stable lists (classes, subjects, staff roster); cursor-based for high-churn lists (attendance logs, payment history, audit trail) where offset pagination would skip/duplicate rows under concurrent writes.
- **Filtering/sorting:** consistent query-param conventions (e.g. `?filter[status]=active&sort=-created_at`) across all list endpoints, not invented per-endpoint.
- **OpenAPI docs generated from Zod:** request/response validation is defined once with Zod (already used in the prototype), and the OpenAPI spec is generated from those schemas — docs can't drift from what the API actually validates.

**Multi-tenancy (SaaS):** shared database, shared schema, every tenant-scoped row carries `tenant_id`. Isolation enforced at the database via Postgres Row-Level Security, not just application-layer filtering — a `forTenant(tenantId)` Prisma client extension wraps every query in a transaction that sets `SET LOCAL app.tenant_id` before running it, so RLS policies scope reads/writes even under a pooled connection. This is the same pattern already proven in the `ims` project (`lib/server/tenant-prisma.ts`). Tenant resolution happens in middleware from the URL (`/schools/[code]/...`, already scaffolded in the prototype).

**Tenant trust boundary (critical):** RLS only protects the tenant ID it's given — it is not itself an authorization check on where that ID came from. The tenant code in the URL (`/schools/[code]/...`) must never be trusted directly: before `SET LOCAL app.tenant_id` runs, the request must resolve the authenticated user's session, confirm that user actually holds active membership in the requested tenant, and only then set the session variable from that verified membership — not from the raw route parameter. Required flow: `authenticated user → verified tenant membership → SET LOCAL app.tenant_id → RLS`. Automated tests must cover changing the URL's `[code]` to a different, unauthorized tenant on every endpoint, not just spot checks.

**URL scheme:** the tenant-scoped URL (`/schools/[code]/...`) remains the real, bookmarkable, security-relevant address — nothing above changes. On top of it, a short front-door route (`/dashboard`, `/list/students`, etc., no code) exists for everyday use: after login, a user belonging to exactly one tenant (the common case) is silently redirected into their scoped URL, so in practice they never see or type a school code. A user belonging to more than one tenant sees a school picker instead of a guess. This is a routing convenience layered on the same session-verification logic above, not a change to how tenant trust is established.

**Tenant code selection (SaaS signup):** auto-suggested by slugifying the school's registered name ("Bright Future Academy" → `bright-future-academy`), shown to the school as their address (`octalve.app/schools/bright-future-academy`) and editable before confirming. Validated against three rules at signup: uniqueness (with a suggested variant on collision, not just an error), a reserved-word blocklist (must not collide with the app's own top-level routes — `dashboard`, `admin`, `api`, `settings`, `list`, etc. — or impersonate the platform/a real brand), and a format restriction (lowercase letters/numbers/hyphens only, length-capped). For MVP, the code is fixed at creation and changeable only via a support request, not self-service — acceptable given the front-door redirect already hides the code from most users' daily experience; self-service renaming with a redirect grace period is a reasonable Phase 2+ addition if schools actually ask for it. Solo installs never generate or see a code at all (§ above).

**Solo install:** `DEPLOYMENT_MODE=solo` disables tenant resolution/multi-school signup; the app runs as if there's exactly one tenant. Same schema, same code paths, RLS policies simply scope to the one tenant that exists. Because there's only ever one tenant, Solo never engages the `/schools/[code]/...` layer or its redirect/picker logic at all — the short front-door routes (`/dashboard`, `/list/students`, ...) are Solo's *only* URL shape, and login lands directly on the user's role dashboard with no tenant-selection step, since there's nothing to select between. The `tenant_id`/RLS plumbing is still present under the hood (same schema, same codebase) — it's just trivially satisfied by a tenants table with exactly one row, which is also what keeps a Solo install's data shaped identically to one SaaS tenant's, feeding directly into the Solo↔SaaS migration tooling below.

**Packaging — one codebase, multiple sellable exports:** reuse the `ims` project's proven pattern:

- `tier-manifest.json` — single source of truth for which folders/files belong to which bucket (`shared` / `core` / `pro` / `premium`, additive: pro ⊃ core, premium ⊃ pro).
- `eslint.tier-boundaries.mjs` — import-boundary lint rule that fails the build if a `core` file imports from `pro`/`premium`, so tier separation can't silently rot.
- `scripts/export-tier.ts` — copies the manifest's buckets into a stripped, standalone export per tier (`pnpm export:core`, `export:pro`, `export:premium`); each export is verified by installing and typechecking it standalone, not just trusted.
- This maps directly onto §6's phases: Core = MVP (SIS+Finance), Pro = +Comms/LMS, Premium = +Operations. The `DEPLOYMENT_MODE` axis (solo/saas) is orthogonal to the tier axis — a Solo customer can still buy Core, Pro, or Premium.

**Solo installer:** two supported paths (per your answer) — (1) Docker Compose one-click installer (`docker-compose.yml` + setup script, app+Postgres containers, works on any VPS) as the recommended default, and (3) a traditional non-Docker installer (Node.js + Postgres installed directly) for schools/IT environments that can't or won't run containers.

**Auth:** NextAuth (or equivalent) with role-based access (admin, teaching staff, non-teaching staff sub-roles, student, parent), JWT session, refresh flow — same shape as the current prototype's `authHelpers`/`axiosInstance`, rebuilt against the new backend instead of an external API.

**Staff records vs. staff accounts:** every staff member (teaching or non-teaching) gets a staff record, but not every staff record needs a login account — e.g. a security guard tracked for HR purposes may never need system access. Account creation is a separate, optional action on top of a staff record, and a non-teaching staff account is scoped to only the module(s) their role covers (finance, library, etc.), never the full admin panel by default.

**Multi-campus:** a school can have several physical branches under one entity (distinct from multi-tenancy, which is separate schools). Modeled as a `campus_id` layer inside a tenant, not a second tenant — built into the schema in MVP (nullable FK on students/staff/classes/attendance/invoices) even though branch-management UI can ship later. Owner/admin roles are scoped to the whole tenant (see all campuses); a campus-level role (e.g. branch principal/bursar) is scoped to one `campus_id` — the same RLS/permission mechanism as tenant scoping, just one layer narrower. A holding-company-style owner with genuinely separate schools (different brand/fees/no combined reporting desired) is out of scope for this — that's just separate tenant accounts, no special modeling needed.

**Solo ↔ SaaS migration:** designed for now, not deferred — both editions share one schema (above), so migration is an export from one Postgres database and import into the other, scoped by `tenant_id`. A `pnpm migrate:solo-to-saas` / `migrate:saas-to-solo` tooling pair (mirroring the `ims` project's `export-tier.ts` pattern) ships alongside the installer rather than being built ad hoc later.

**Repo layout:** the project lives alongside the `ims` project as a sibling under the same parent folder (`.../CODEC/OCTALVE/`), so shared conventions and tooling (tier-manifest pattern, CI scripts) can be reused directly rather than reinvented.

**Environments & branching:** three environment tiers, each its own database/deployment, mirroring the `ims` project's proven setup:

- `dev` — Development environment, auto-deployed on push, used for day-to-day feature work.
- `main` — Staging environment, merge target for feature branches once ready for QA/pilot-school review.
- `prod` — Production environment, promoted from `main` only, what real schools run on.

**CI/CD:** GitHub Actions pipelines gated by branch — lint, typecheck, and test on every PR; auto-deploy to Development on merge to `dev`; auto-deploy to Staging on merge to `main`; deploy to Production on promotion to `prod` (tag or PR), with migrations (`prisma migrate deploy`) run as part of that pipeline, not by hand.

## 8. Monetization & Entitlements

**Launch model:** freemium + paid add-ons — free core SIS (enough to run a school's basic records/attendance), paid modules for Finance/Comms/LMS/Operations as they ship (§6).

**Built to change later without re-architecture:** pricing model lives behind an entitlements abstraction, not hardcoded in the app:

- A `plan`/`entitlement` table per tenant (SaaS) or license key (Solo) records which modules/tiers are active — features check entitlements, never a hardcoded plan name.
- Billing sits behind a provider interface (Paystack/Flutterwave first) so the *pricing model* (freemium→per-student, or flat tiers) is a change to plan definitions and billing-webhook logic, not to feature code.
- This means: start with freemium+add-ons now, and later introduce per-student/month or flat Basic/Pro/Enterprise tiers by redefining plans/entitlements — the module code itself doesn't change.

**Solo licensing:** one-time or annual license key validated locally (no phone-home dependency required for core function, per self-hosting expectations), tied to a tier export (§7).

## 9. Compliance, Region & Payments

**Primary region:** Nigeria/West Africa at launch.

- **Payments:** Paystack and Flutterwave (card, bank transfer, USSD) — fits local payment behavior better than card-only gateways.
- **Currency:** NGN default, multi-currency-ready data model (avoid hardcoding NGN into schema) so West Africa expansion (Ghana, etc.) doesn't require a rewrite.
- **Privacy/data protection:** design to the **Nigeria Data Protection Act 2023 (NDPA)**, plus the NDPC's General Application and Implementation Directive (GAID) 2025 — not the older NDPR, which NDPA has superseded. Covers: documented lawful basis and verified guardian consent for children's data, data-subject rights (access/rectification/erasure/portability) with a defined response SLA, breach notification to the NDPC, data residency/cross-border transfer safeguards for SaaS hosting, and an assessment of whether Octalve or a given school must register as a Data Controller/Processor of Major Importance (DCPMI).
- **Academic structure:** 3-term calendar and WAEC/NECO-style result formats supported out of the box for K-12; semester/credit-unit structure for higher-ed (§3/§5).

**Data retention & erasure policy (decided, not deferred):** when a student withdraws or graduates, academic records (results, attendance history) are retained for a defined period (default: 7 years, configurable) to support transcript/reference requests, then anonymized rather than hard-deleted where retention supports a legitimate school interest; personal contact data (guardian phone/email) is deleted or anonymized on request per NDPA 2023 data-subject rights, except where a record must be kept for legal/exam-body purposes. This is documented and shown to schools/parents at signup, not left implicit.

**Future markets:** architecture should not block adding a FERPA (US) or GDPR (EU) compliance posture later — flagged as a phase 5+ consideration, not built now.

## 10. Non-Functional Requirements

- **Security:** RLS-enforced tenant isolation (§7), encrypted secrets/credentials, audit log for sensitive actions (result changes, fee waivers), regular backups (critical for Solo installs — backup guidance ships with the installer).
- **Security baseline:** OWASP ASVS (Application Security Verification Standard) is the formal release-verification standard, not an informal "be careful" — at minimum an ASVS Level 2 control set for authenticated school-facing functionality, with stronger controls on admin, payment, and grade-write operations. A security review against this baseline (§12) is a release gate before any pilot school's real data goes live, not a nice-to-have.
- **Performance & connectivity:** must tolerate low/intermittent bandwidth — lightweight pages, optimistic UI, resilient offline-to-online sync for attendance/results entry where feasible.
- **Localization:** English default; i18n-ready structure (don't hardcode English strings) for future local-language support.
- **Accessibility:** usable on low-end Android devices and small screens, since parents/teachers will often be mobile-only.
- **Availability (SaaS):** target uptime and RTO/RPO to be set once hosting provider is chosen; not required for MVP but schema/backups should not block adding it later.
- **Web-only for MVP:** responsive, PWA-installable web app; no native app build in MVP (§6 Phase 5).

## 11. Risks, Assumptions & Open Questions

**Risks**

- Two-person team + AI-assisted build: scope discipline is the main risk — the phased roadmap (§6) exists specifically to keep MVP from creeping toward the full suite.
- RLS misconfiguration is a cross-tenant data leak, not just a bug — the `ims` project's own notes flag this as something to verify by testing, not assume from code review alone.
- Payment gateway reliability/downtime (Paystack/Flutterwave) directly blocks fee collection, a core value prop.
- Onboarding friction: schools' existing data is in Excel/paper — import tooling is not in MVP scope today but will be a real adoption blocker if skipped too long.
- Local competition: established Nigerian school software already has market presence; differentiation needs to be concrete (Solo+SaaS flexibility, pricing, UX) not assumed.

**Assumptions**

- Pilot schools are reachable for direct feedback during MVP build (needed to validate §2's metrics).
- Paystack/Flutterwave sandbox access is available during development.

**Open questions (need answers before/soon after build starts)**

- [ ] Exact MVP pricing figures for both freemium tier and paid add-ons
- [ ] Who are the first 1–2 pilot schools, and can they be secured before MVP is done?
- [ ] Does SaaS signup need school KYC/verification (e.g. CAC registration) before going live, or open self-serve?
- [ ] Data export format/guarantee for Solo customers who later want to leave
- [ ] Update mechanism for Solo installs — fully manual, or an optional hosted-update channel?

## 12. Milestones & Rough Timeline

For a 2-person + AI-assisted team, lean and sequential rather than parallel workstreams:

| Milestone | Scope | Est. |
| --- | --- | --- |
| M0 — Foundation | Next.js+Prisma+Postgres skeleton, auth/roles, RLS `forTenant()` pattern, tier-manifest skeleton | 3–4 weeks |
| M1 — Core SIS | School/class/student/staff setup, attendance, results/gradebook, timetable, announcements | 6–8 weeks |
| M2 — Finance | Fee structure, invoicing, Paystack/Flutterwave payment collection, finance dashboard | 4 weeks |
| M3 — Solo packaging | Docker Compose installer + traditional installer, `export:core` verified standalone | 2–3 weeks |
| M4 — SaaS self-serve | Multi-tenant signup, `/schools/[code]` routing live, subscription billing wired to entitlements | 3–4 weeks |
| M5 — Pilot & iterate | Onboard first pilot schools (Solo + SaaS), fix real-world issues | Ongoing |

Rough total to first pilot-ready release: **~4–5 months** at this pace. This is a planning estimate, not a commitment — re-baseline after M1.

## 13. Competitive Landscape (Nigeria)

| Player | Model | Notes |
| --- | --- | --- |
| EDVES | SaaS, AI-powered | Market leader, 2,300+ schools; NERDC/WAEC/BECE/UTME-aligned content, fee automation, NEMIS reporting — the incumbent to beat |
| SAFSIMS | SaaS | Strong on fee/finance workflows, custom payment items, auto-invoicing to parents |
| SchoolShell | SaaS | Online fee payment focus, general SIS |
| Excel Mind | SaaS | Positions as affordable, "locally optimized" for private/public schools |
| Smart School Software | **Self-hosted, pay-once license** | Directly analogous to our Solo edition — proof the self-hosted model has real demand in this market |
| SchoolOS Cloud | SaaS, mobile-first | Built around Android phones teachers already own; tiered pricing ~₦150–300/student band |
| SchoolBanks | SaaS | Fee collection via bank integrations |
| Gradely | LMS/tutoring, freemium | ₦6,000/mo consumer plans + per-student annual fee for schools; 500+ schools; strong on curriculum-aligned assessment content, not primarily an SIS |
| uLesson | Consumer learning app | WAEC/JAMB prep focus, not a school-facing SIS/ERP |

**Takeaways for positioning:**

- Nearly every serious competitor is SaaS-only; **Smart School Software is the only notable self-hosted/pay-once player** — offering both Solo and SaaS from one codebase (§4) is a genuine differentiator, not a hypothetical one.
- EDVES's AI/curriculum-content angle and Gradely's LMS/assessment angle are both content-heavy plays; our MVP (§5) deliberately competes on core SIS + Finance execution first, leaving curriculum-content depth to a later phase rather than trying to match EDVES on day one.
- Fee collection via Paystack/Flutterwave (§9) is table stakes here, not a differentiator — SAFSIMS/SchoolShell/SchoolBanks all already do it well.

## 14. Configurability & School Settings

Every per-school workflow decision introduced in §5–§9 is a toggle in one centralized, easily-discoverable admin Settings screen — not scattered across modules or hardcoded. This is a cross-cutting requirement, not a single feature.

| Setting | Options | Where it applies |
| --- | --- | --- |
| Result approval | Required before parents see results / Not required | §5 Core SIS |
| Year-end rollover | Automatic / Admin-confirmed | §5 Core SIS |
| Class auto-assignment | Manual (MVP default) / Auto-assign on capacity (future) | §5 Core SIS |
| Billing cycle | Per term / Per session | §5 Finance |
| Fee reminders | On/off, timing | §5 Finance |
| Discount/waiver workflow | Manual override / Approval workflow | §5 Finance |
| Payment-gateway & SMS cost bearer | School absorbs / Passed to parent | §5 Finance |
| Multi-campus | Single campus / Multi-campus | §7 Architecture |

**Design implication:** these aren't ad hoc per-module config screens — they're entries in one settings data model (distinct from, but following the same principle as, the plan/entitlement table in §8: behavior driven by data, not hardcoded), surfaced through a single Settings area in the admin UI so a school owner doesn't need to hunt across five screens to find how their school is configured.

**Security-sensitive settings require step-up auth (critical):** toggles that weaken a control — disabling result approval, disabling MFA, changing the discount-approval mode, granting a non-teaching role broader access — are not plain settings writes. Changing one requires re-authentication (step-up MFA) at the moment of change, produces an immutable audit entry (actor, before/after value, timestamp), and ships with a secure default (approval required, MFA on) that a school must deliberately weaken, never the reverse. A compromised admin session should not be able to silently turn off the controls this PRD requires.
