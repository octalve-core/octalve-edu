# 0051: A failed sign-in in a test says so, instead of showing up later as a 401

- **Period / Focus:** 2026-11-12 (the one unexplained failure left over from task 0046's regression)
- **Status:** Built and tested; PR into `dev`
- **Priority:** Low
- **Assignee:** Claude
- **Target Branch / PR:** `claude/octalve-login-token-guard` / PR into `dev`
- **Started:** 2026-11-12

> **How to tick:** change `[ ]` to `[x]`. The table shows the characters, not a clickable box.

---

## 1. Objective

Make a test whose sign-in did not produce a session fail at the sign-in, with a message that says so, and not several calls later with a bare `401`.

## 2. Context

- Task 0046's regression had one failure that passed alone straight afterwards: `tests/api/program-completion.spec.ts:104`, "the other school's administrator got 401 where 403 or 404 is expected". It happened while four test lanes shared one database server, and the cause was not found.
- Reading it now: `beforeAll` signs six people in with `loginAs`, which returns `token: null` when the login does not set a session cookie (it does not throw), and then builds each cookie with `cookieHeader(<that>.token!)`. The `!` is a TypeScript assertion only; at run time `null` becomes the cookie `…=null`, which the API answers with 401 on the first protected call. The failing person was `adminB`, the last of the six.
- It is NOT the per-address login limit (the test helper gives every request its own address, `uniqueIp()`) and NOT a database error being turned into a 401 (`resolveToken` does not catch, so a database error is a 500). It IS consistent with the login for `adminB` having failed (for example a 500 from the login endpoint while the database was out of connections, as other tests in that run reported), but that login's response was never logged, so the cause stays **unproven**.
- The pattern is everywhere: `cookieHeader(` is called 138 times in 88 spec files, 117 of them with a `!` on the token (counted on the committed tree with `git grep`; an earlier draft of this file said 112, which was wrong), so any failed sign-in in any of them shows up later as a 401.

## 3. Decisions

- **D1. `cookieHeader` throws when it is given no token** (`null`, `undefined` or an empty string), with a message that names the cause: the sign-in that should have produced it did not. Its parameter type admits `null` and `undefined`, so the existing `token!` call sites keep compiling and now fail where the sign-in failed.
- **D2. No test changes** beyond one new unit spec for the helper. A test that passes a deliberate token string (`"old-session"`, an attacker-chosen value) is unaffected; none passes an empty one (checked: no call with `""`, `''`, `null` or `undefined`).
- **D3. The whole unit, API and integration projects are run** on a fresh lane, because 88 files use the helper.

## 4. Work breakdown

- [x] Design (this file).
- [x] The guard in `tests/support/http.ts`; a unit spec for it.
- [x] Mutation check; unit, API and integration projects pass.
- [x] Docs: tracker.

## 5. Not in this task

- Finding why that one login failed (no log of it exists).
- Changing `loginAs` to throw (some specs test failed logins and read `token: null` on purpose).

## 6. Build record and tests

**Built on** `claude/octalve-login-token-guard` (off `dev` `f11872e`). Changed: `tests/support/http.ts` (`cookieHeader` takes `string | null | undefined` and throws when the token is empty). New: `tests/unit/cookie-header-guard.spec.ts` (3 tests) and this file. No application code, no `schema.prisma`, no migration.

**The tests.** Three: it builds `name=token` under the default or a given cookie name; it throws, with a message that says the sign-in set no session cookie, for `null`, `undefined` and `""`; a deliberate made-up token string such as `"old-session"` is not refused (some specs send one on purpose).

**Mutation check (run alone, lane 1).** The guard's condition changed to `if (false as boolean)`: **1 failed, 2 passed**; the failing test is the "throws" one (`expect(...).toThrow(...)` received nothing). The original restored: **3 passed**.

**Regression.** The whole unit, integration and API projects on lane 1 (the lane's database already on the baseline migration; the three browser-spec runs of the post-squash check, task 0052, were using lanes 2 and 3 at the same time): **3,634 passed, 0 failed, no retries** (15.1 minutes): setup 1, unit 1,217, integration 695, API 1,721. That is the proof for D2 and D3: the 88 spec files that call the helper all still get a real token.

**Browser specs that call the helper.** Two of the 46 e2e files import it and call `cookieHeader`: `tests/e2e/users.spec.ts` and `tests/e2e/question-bank-questions.spec.ts` (the other 44 and the `https` project do not). Run on this branch, lane 1, desktop and phone projects: **41 passed, 0 failed** (2.7 minutes). (My first commit message said no browser spec imports the helper; that was wrong, found with `grep` right after, and the message was corrected before the PR.)

**Static gates:** `tsc --noEmit` clean; `eslint` clean on the two files; Prettier `--check` clean on the changed files; `verify_catalogs` clean.

**What it does and does not prove.** A failed sign-in in any spec now stops at the sign-in with a message that names the cause; if the 401 of task 0046's regression comes back, the failure will say that the login did not give a token. It does not say WHY the login failed, and it does not show that the original failure was a failed login: that cause stays unproven (nothing was logged at the time). `loginAs` still returns `token: null` without throwing, on purpose (some specs test failed sign-ins).
