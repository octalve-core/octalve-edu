# Issues register — Octalve Edu

Every known or suspected problem, with severity, kind, where it is and how sure we are. Newest findings go on top of their severity group. Use `template.md` for the detail file when an issue needs more than a row (`ISS-NNNN-short-title.md` in this folder).

## Register
| ID | P | Type | Issue | Status | Live? | Evidence | Where | Found |
|---|---|---|---|---|---|---|---|---|
| ISS-0001 | P1 | Money / Concurrency | `receiptNo` derived from a count of successful payments inside the transaction; no unique constraint → duplicate receipt numbers under concurrency; manual payment accepts a client `receiptNo` | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Reproduced (25 concurrent payments gave 9 distinct numbers) | `src/lib/finance/service.ts` (`fulfillPayment`, `recordManualPayment`) | 2026-10-11 |
| ISS-0002 | P1 | Money | Paystack webhook returns 200 when fulfilment throws and leaves the event unprocessed → Paystack never retries, payment lost | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Read | `src/app/api/v1/webhooks/paystack/route.ts` | 2026-10-11 |
| ISS-0003 | P1 | Authorization / State machines | `results/transition` open to every `TEACHING_STAFF` for any result (no ownership/campus check); teacher can revert APPROVED→SUBMITTED; approver can approve own entries | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Reproduced (4 failing tests before the fix) | `src/app/api/v1/schools/[code]/academics/results/transition/route.ts`, `src/lib/results/rules.ts` | 2026-10-11 |
| ISS-0004 | P2 | Money / Security | Webhook secret falls back to the public string `test_mock_secret_key`; forged `charge.success` is accepted if `FORCE_MOCK_PAYSTACK=true` in production | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Read | webhook route, `src/lib/finance/paystack.ts` | 2026-10-11 |
| ISS-0005 | P2 | Availability | Invalid webhook deliveries still write `PaymentWebhookEvent` rows (unauthenticated writes); `evt_${Date.now()}` ids can collide | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Read | `processPaystackWebhook` | 2026-10-11 |
| ISS-0006 | P2 | Validation / Privacy | Manual-payment route returns raw `err.message` | Fixed on `claude/fix-phase-1-review-findings` (not merged) | unknown | Read | `.../finance/invoices/[id]/manual-payment/route.ts` | 2026-10-11 |
| ISS-0007 | P2 | Data integrity | `approvedByStaffId` / `enteredByStaffId` hold user ids and have no foreign key | Open | unknown | Read | `prisma/schema/results.prisma`, `src/lib/results/service.ts` | 2026-10-11 |
| ISS-0008 | P3 | Privacy | Public verification returns admission number + surname to any holder of the token | Open (maintainer decision) | unknown | Read | `src/lib/results/service.ts` (`verifyPublicCredential`) | 2026-10-11 |
| ISS-0009 | P1 | Process | PRs #13–#17 merged into each other's feature branches; `fork/master` stops at #12; no `dev` branch exists (ADR 0011) | Open | unknown | Read | git history | 2026-10-11 |
| ISS-0010 | P2 | Test gap | Phase 1.3–1.8 "all green" claims listed only unit/RLS/static gates; the full suite (1728 passed, 6 failed, 23 skipped) shows 6 e2e tests stale since 1.3/1.7 | Fixed on `claude/fix-phase-1-review-findings` (not merged): the full suite there is 1757 passed, 0 failed, 23 skipped (2026-10-11) | unknown | Read | task 0008 | 2026-10-11 |
| ISS-0012 | P2 | Test gap | `academics.spec` (x2, desktop + phone) and `shell.spec` (x2) expect pre-1.3/1.7 UI: four Academics sections and Settings as text | Fixed on `claude/fix-phase-1-review-findings` (not merged) | n/a | Reproduced (full suite) | `tests/e2e/academics.spec.ts:51,69`, `tests/e2e/shell.spec.ts:39,208` | 2026-10-11 |
| ISS-0011 | P3 | Process | Phase commits 1.3, 1.4, 1.5, 1.7 have one-line messages (ADR 0013); designs for some phases not committed first | Open | unknown | Read | git log | 2026-10-11 |
| ISS-0013 | P3 | Authorization | `GET academics/arms/[id]/attendance` and `GET people/students/[id]/attendance` do not hide another campus's arm / student from a teacher of a different campus (a roll call of another campus's arm names the arm; the history route returns the student). Found while adding campus administrators (they are scoped; teachers are not) | Open | unknown | Read (the campus-administrator test for the same routes failed first with 200 for another campus's student) | `src/lib/attendance/service.ts`, `.../people/students/[id]/attendance/route.ts` | 2026-10-11 |

## Priority scale
| P | Meaning | Examples |
|---|---|---|
| **P0** | Live harm now: data leaking, money lost or wrong, auth bypass on production | a public endpoint returning other people's data on prod |
| **P1** | Serious flaw that is exploitable or loses data once triggered, not known to be hit yet | cross-branch writes, duplicate receipt numbers, lost webhooks |
| **P2** | Real defect with limited blast radius, or a flaw that needs an unusual setup | raw error text returned, missing row cap |
| **P3** | Cleanup, docs drift, consistency | stale trackers, one-line commit messages |

"**Live?**" says whether the problem exists on production (`yes` / `no` / `unknown`). Nothing here has been checked against a production deployment, so it is `unknown` until someone confirms what is deployed.

**Evidence levels:** *Read* = found by reading code (not yet proved); *Reproduced* = a failing test or run exists; *Reported* = from a user/maintainer.

## Planned work that closes issues
- **Campus admins and a platform superadmin** (design answered 2026-10-11): closes the gap that an `ADMIN` is always school-wide and that nobody can create or suspend a school except through setup.
- **Audited support access** (maintainer wants it later): design before code; requirements recorded in the plan.

## Suspects not yet investigated
- Every other `schools/[code]` route added in 1.3–1.8 for role checks beyond tenant membership (campus scoping in attendance, timetable, announcements, settings).
- The step-up MFA flow in 1.7: whether every sensitive settings change really requires a fresh proof, and how long a proof lasts.
- Paystack: the shape of real renewal/refund events (only `charge.success` is handled), and `FORCE_MOCK_PAYSTACK` in any deployed env.
- Timetable conflict engine under concurrent edits (check-then-write without a lock?).
- Announcement targeting by role/campus/class arm: whether a user outside the audience can read it by id.
- Query plans at realistic row counts (the performance suite uses small data).

## Issue types to look for (the taxonomy — extend it when a new kind turns up)
| Type | What to look for in this app |
|---|---|
| **Authorization / IDOR** | a route with no `roles`; a role checked "somewhere" but not for *this* branch/campus/school; a default role when none is found; ids not checked against the caller's scope; 403 where 404 would hide existence |
| **Privacy / PII** | lists or details returning guardian phone/email, date of birth, admission numbers to roles that don't need them; PII in audit logs, errors or URLs; public endpoints returning more than needed |
| **Money / payments** | receipt or invoice numbers from counts; webhooks that lose or double-apply a payment; amounts as floats; client-supplied references; silent fallbacks to test keys |
| **Concurrency / data integrity** | check-then-write without a lock or conditional update; unique keys that cross a scope boundary; refusal after a write that commits (ADR 0002); counters read inside a transaction |
| **Validation / input** | unvalidated query strings (500s), unbounded arrays/bodies, bad dates (timezones), raw `err.message` returned to the client, free-text where an enum belongs |
| **State machines** | transitions open to the wrong role; no ownership/segregation of duties; locked/published data editable through a side path |
| **Availability / performance** | N+1 queries, unbounded lists, huge IN lists, missing indexes, slow transactions, rate-limit gaps on public routes |
| **Migrations / deployment** | non-additive migrations on live data, missing env validation, dev fallbacks reachable in production, reverse-proxy Host assumptions |
| **UX / accessibility** | tap targets < 44 px, focus not returning, announcements missing, axe violations, broken phone layouts, duplicate React keys |
| **Next.js 16 specifics** | `params`/`searchParams` are promises; `proxy.ts` (not middleware) sets the CSP nonce; caching defaults; default 404/error pages carry inline styles the CSP rejects; route handlers run the production build in tests |
| **CI and deploy** | gates not run in CI, env validation missing at startup, migrations applied after the code, reverse proxy must pass `Host`, secrets in the wrong place |
| **Docs drift** | trackers that disagree with git, "built" claims without a test, ADRs contradicted by code, stale handoffs |
| **Test gap** | a rule with no test that fails when it is broken; tests that pass because of a bug; "green" claims without the suite named |
| **Process / docs** | docs that say built when it isn't, stale trackers, merged-into-feature-branch stacks, commit messages without evidence |

## How this register is used
1. Add an issue the moment one is *suspected* — evidence level **Read** is fine; say so honestly. Never mark **Reproduced** without a failing test or run.
2. Keep the table sorted by priority, then date. Update status in place; never delete (use *Won't fix* / *Duplicate*).
3. Fixing is a normal task (design → test that fails first → fix → docs): link the issue from the task file, and set **Fixed** with the commit.
4. Add newly discovered *kinds* of issue to the taxonomy above, and note in the issue which earlier issue it resembles — a pattern found once usually exists elsewhere (the AlEemaan student-list leak was found by auditing for the attendance flaw).
5. Prioritise by priority, then by blast radius (money and personal data first), then by how cheap the fix is.
