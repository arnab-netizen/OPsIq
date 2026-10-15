# OBQ / controlled-beta onboarding — acceptance audit

Baseline: branch `claude/wizardly-dirac-4jk1ql`, started at `origin/main` `fe348999b9d6eccb3a4a82a5ee928b9b48ff5d48`, clean tree.
OBQ work was already in `main`; this audit validated current `main` (not an old SHA).
Environment: disposable local PostgreSQL 16 (loopback only), 186/186 migrations applied from empty. No remote database was touched
(the environment's `DATABASE_URL` points at a remote Neon endpoint; the repo's DB guard refused it and every run overrode it).

## `OBQ_COMPLETE` — exact code-level meaning

There is **no** stored "onboarding complete" flag. Completion is derived from persisted facts by one pure function,
`resolveFirstRunState` (`src/domain/owner-first-run/first-run-router.ts`), fed by `getFirstRunContext`
(`src/services/owner-first-run/first-run.service.ts`):

| State | Facts |
|---|---|
| `NEEDS_BUSINESS` | no active, non-fixture `OwnerBusiness` in the workspace |
| `NEEDS_EVIDENCE` | business exists, first-read sufficiency (revenue + ≥1 cost + cash; blank = unknown, 0 = known) not met, no diagnosis |
| `NEEDS_DIAGNOSIS` | sufficient evidence, no finance diagnosis cycle yet |
| `FIRST_RESULT` | a diagnosis cycle exists, no trusted interaction yet |
| `ESTABLISHED` | diagnosis exists **and** a trusted interaction exists (accepted/modified decision, evidence amendment v>1, or improvement request) |

**OBQ_COMPLETE ⇔ state ∈ {`FIRST_RESULT`, `ESTABLISHED`}** (business + sufficient evidence + a diagnosis on persisted rows).
`ESTABLISHED` additionally means the owner acted on the read. The Cockpit's "no business" condition (`businesses.length === 0`) is the
same fact as `hasBusiness`; sign-in landing, verification landing and the first-run page all call this one function, so no screen can
disagree with the backend. An established owner who revisits `/owner/first-run` sees their saved read (not setup) and a "Go to my Cockpit" link.

## Defects found and fixed

| # | Sev | Symptom | Root cause | Fix | Pinned by |
|---|---|---|---|---|---|
| 1 | P1 | Any unclassified 5xx on a wrapped route returned `prismaCode`, first line of the raw exception (constraint/table text), `errorName`, handler/service paths to the client | `canonical-route-enforcement` copied `safeDetails` into every error body | Technical fields only with the timing-safe diagnostic key; calm message + `correlationId` otherwise; detail stays in `[WRAPPER_FAILED]` log | `duplicate-period-logging.db.test.ts` (red→green) |
| 2 | P2 | `POST /api/auth/login` with bad JSON / missing password / unknown field → **500** and echoed internal `stage` | catch had no `ValidationError` branch | 400 with fixed wording; `stage` removed from body (kept in log) | `login-malformed-input-status-code.test.ts` |
| 3 | P2 | Business name containing NUL/control chars → signup **500** | length-only validation; Postgres rejects U+0000 | `NO_CONTROL_CHARACTERS` on signup, business create and update schemas | `signup-control-character-name.test.ts` |
| 4 | P2 | Snapshot API accepted any currency string and loose period dates (`2026-02-30`→Mar 2, `"1"`→2001, `+275760-09-13`→DB 500) | client-only guarantees | Strict calendar-valid `YYYY-MM-DD`/UTC-ISO, years 2000–2100; currency must equal the business's | `snapshot-boundary-validation.test.ts` |
| 5 | P2 | 4 of 5 concurrent diagnoses of one business failed | cycle `sequenceNumber` read outside the tx vs unique constraint | per-business advisory lock + sequence allocated inside the tx | `diagnosis-concurrency-and-scope.db.test.ts` (red→green) |
| 6 | P2 | Tenant A could exhaust tenant B's diagnosis rate-limit (429) by naming B's business id | limiter keyed on client id before ownership check | ownership (`getBusiness`) first; foreign id → 404, no budget spent | same file (red→green) |
| 7 | P3 | Simultaneous identical snapshot submits could surface a unique-constraint 500 | check-then-insert outside the tx | per-period advisory lock + in-tx re-check → the standard 409 | same file |
| 8 | P3 | `…_DETAIL` log lines carried raw Prisma messages (echo emails / business names) and tokens | `extractTechnicalDetails` logged raw message+stack | `scrubLogText` masks emails, URLs-with-credentials, bearer/`token=`/`password=`, long hex | `operator-error-log-scrub.test.ts` |
| 9 | ops | No preflight signal when outbound email is unconfigured (signup then reports success by design) | `RESEND_API_KEY` / `ALERT_FROM_EMAIL` absent from preflight | added as `EXTERNAL_RUNTIME_REQUIRED` warnings | deployment contract tests |
| 10 | test | `public-beta-obq-journey` "improve" scenario assumed a 2nd question always follows a skip; the product now truthfully stops ("nothing more to ask") | stale test precondition | helper extracted; skip test asserts the honest terminal state, add/edit target covered on the first question | journey spec |

Existing tests that pinned the old behaviour were updated to the corrected contract (p2b `errorName` leak assertion; r0 fake tx; owner-pilot fixture wrote USD onto an INR business; evidence-period reader registry re-classified for the new in-tx re-check).

## Correction loop (mandatory) — proven

`correction-loop-reasoning.db.test.ts`: revenue typed 5× too high (500000, valid) → read: *"OpsIQ can't point to a specific money problem… Improve data completeness"*.
Corrected to 100000 through the real correction service → v1 retained and superseded, v2 head; re-run read: **"Business is running at a net loss, −50%" → "Return the business to net profit"**.
The stale read is not re-presentable (head is the corrected snapshot); evidence quality does not upgrade to ACTUAL on its own.

## Time to trustworthy value

5.8 s machine time, signup submit → first Money read visible (375px, scripted: verification token minted in DB, password, business, evidence, read).
This excludes human typing/thinking and real email delivery; a human-paced TTTV has **not** been measured.

## Owner decisions applied (closeout) — UNKNOWN is a state, not a number

1. **Cash may be UNKNOWN** (`cash = number | UNKNOWN`). Cash is no longer a *critical* input (`missingCriticalFinanceInputs` = revenue + a cost).
   Unknown cash never blocks a first read, is stored as NULL (never 0), makes runway / cash-cover abstain (`liquidity.ts`), keeps the
   `FIN_LIQUIDITY_UNCONFIRMED` finding (the survival guard: UNKNOWN is neither safe nor dangerous), lowers confidence by 10
   (`UNKNOWN_CASH_CONFIDENCE_PENALTY`), and the first read states "What OpsIQ can't conclude yet" without asking for an estimate.
2. **Unknown cost components are never zero** (`cost-model.ts`). A group total is known only when every part is; total costs only when
   fixed AND variable totals are. fixed 20000 + variable UNKNOWN ⇒ `knownFixedCosts` 20000, total/profit/margin/runway/cash-cover/break-even UNKNOWN
   (fixed-cost burden, which only needs revenue + fixed, still works). An explicit 0 participates normally. Confidence −10 while costs are partial.
   Marketing spend remains a separately reported add-on (not a required component).
3. **Corrections may return evidence to UNKNOWN.** Amend schema accepts `null` (= UNKNOWN), the merge uses `incoming === undefined ? recorded : incoming`
   (never `??`), history is versioned, the new head is the current state, the diagnosis is re-run, `clearedFields` is audited, the no-op check treats
   clearing an already-unknown figure as nothing, and the form has an explicit "I don't know this figure" control per recorded figure.

Tests: `unknown-evidence-contract.test.ts` (22: cash 0/positive/unknown, six-case cost matrix, owner's example), `unknown-evidence.db.test.ts` (4 DB: first read with
unknown cash; partial costs; known→known, known→UNKNOWN, UNKNOWN→known and cash known→UNKNOWN→0, each re-evaluated, history kept, no silent restore),
`obq-unknown-evidence.spec.ts` (3 browser, 375px + desktop). 4/4 DB tests fail on the previous source.
Existing tests that pinned the rejected semantics were updated (Trinity pilot fixture now states confirmed-zero lines explicitly; fixtures that left delivery /
variable costs blank now state 0; sufficiency, liquidity, quick-entry, cash-profit-protection expectations).
Guided setup's separate "minimum data pack" (which still lists cash/debt) is a readiness measure, not OBQ completion and no longer gates the first read.

## Live email acceptance — `LIVE_EMAIL_ACCEPTANCE=USER_ACTION_REQUIRED`

Not performed, and **not** marked PASS. The audit environment has no production provider credentials (`RESEND_API_KEY` unset), no production URL
configured, and outbound production hosts are blocked by the sandbox proxy (HTTP 403 on CONNECT). Sending a message through a different tool would not
exercise OpsIQ's own signup → provider → link flow, so it was not substituted.

Safe browser steps for the owner (record only PASS/FAIL per line; do not paste the address, link, token or any key anywhere):
1. Pre-check: `npm run deployment:preflight` against the production environment shows `RESEND_API_KEY` and `ALERT_FROM_EMAIL` as set, and `NEXT_PUBLIC_APP_URL` is the intended OpsIQ production domain (not localhost or a preview URL).
2. Use a mailbox you control, with an address never used before (e.g. a `+tag` alias). Ensure admission mode allows signup (OPEN_BETA or an invite).
3. In a private browser window open the production site → Start free → enter that address and a business name → submit. Expect "Check your email".
4. In the mailbox: the message arrives (check spam). Confirm the From address/domain is the OpsIQ sender, the subject is "Verify your OpsIQ account", and the link host is the production domain.
5. Open the link → click "Verify my email" (a page load alone verifies nothing) → choose a password and accept the policies → you land on `/owner/first-run`.
6. Sign out, sign in with the new password → OBQ is reachable. Re-open the same link: it must be refused (single use).
7. Password reset: Sign in → "Forgot your password" → submit the same address → email arrives from the same sender → the link host is the production domain → the reset page loads.
Mark `LIVE_VERIFICATION_EMAIL=PASS` only when steps 3–7 are observed. If step 4 never arrives, check the operator signal `EMAIL_VERIFICATION_NOT_SENT` (reasons NO_PROVIDER / SEND_FAILED / BASE_URL_NOT_PUBLIC) in the admin audit view.

## Known limitations (not fixed; each stated with impact)

1. **Real email transport is unverified** — see the live-email section above (USER_ACTION_REQUIRED). Token redemption, single-use, expiry, GET-safety, unverified-login-block are proven; delivery through Resend with a verified sender domain is not. Signup is best-effort by design and records `EMAIL_VERIFICATION_NOT_SENT`.
2. ~~Cash cannot be left unknown~~ — RESOLVED by owner decision 1 (above). Previously: cash could not be left unknown to obtain the first read (sufficiency = revenue + a cost + cash). The owner must type a number — mitigated by the mandatory reliability control (rough guess caps confidence), but an owner who truly does not know cash is nudged to estimate. Needs a product decision (provisional read without cash); not changed (it would alter the accepted sufficiency contract).
3. ~~One cost half treated as zero~~ — RESOLVED by owner decision 2. Previously: one cost half was accepted as "enough"; the other is treated as 0 in net profit / margin (fixed-only: revenue 100000, fixed 20000 → netMargin 80, health 72, risk 0, confidence 45/LOW). Pinned as intentional by the Trinity pilot fixture and `metrics.test.ts`; no owner surface displays derived net profit/health for it and the first read leads with liquidity/data-quality. Changing it breaks 14 accepted tests — owner decision required.
4. Auth abuse hardening not changed: rate limits key on raw `x-forwarded-for`; `login:<email>` bucket lets anyone lock a victim out for 15 min; passwords have no max length (bcrypt truncates at 72 bytes); session tokens stored plaintext; logout redirects even if the POST fails.
5. `POST /api/owner/finance/actions/[id]/verify` (Cockpit, after OBQ) has no duplicate-submit guard and its audit is not in the same transaction.
6. `assignedTo` on finance actions is not checked against workspace membership; no request-body size cap on write routes.
7. ~~Amending cannot return a figure to unknown~~ — RESOLVED by owner decision 3.
8. 10 test files (59 tests) fail identically on pristine `main` and on this branch (workflow-validation, runtime-proof rp1/rp2, p2a, phase-i10-*, phase-i runtime-discipline, demo-permission backfill, decision-carry-over, signup-schema-contract cleanup). They are unrelated to this change but mean the repository suite is **not** fully green. Full serial run on this branch (fresh DB): 1777 files passed / 11 failed, 38986 tests passed / 60 failed — the 11th is `phase-d/admin-operability-db`, which passes on a DB with ≤23 workspaces and fails at 219 (its list assertion is volume-dependent), i.e. an order artefact, not a regression.
9. `npm run lint` fails repo-wide (2196 errors, ratchet baseline 2344): the repository's gate is the ratchet, which passes; all files touched here lint at 0 errors.
