# Controlled Beta Cohort 1 (CB1) — evidence system and operating procedure

Status: implemented on branch `feat/cb1-cohort-evidence` (not merged / not deployed until the owner authorizes an exact SHA).
Scope: operate and observe the first 3–5 genuine small/service-business owners. This is **not** a QA exercise and **not**
evidence of product-market fit. OBQ is closed and frozen; nothing here modifies it.

The controlling question: **does OpsIQ create trusted, actionable value for a real business owner?**

## 1. What already existed (reused — no schema, no new processor)

| Need | Existing surface |
|---|---|
| Invitation + admission control | `BetaRequest` (status/`invitedAt`), `/admin/beta-programme`, invite + resend email, `PlatformSetting` (INVITE_ONLY, capacity) |
| Signup, verification, password, first run | `User.createdAt`, `User.emailVerifiedAt`, product events `password_set`, `first_run_started` |
| OBQ / first finding / first read | product events `first_evidence_saved`, `first_diagnosis_completed`, `first_result_viewed` |
| Evidence correction | product event `first_result_corrected`; finance cycles re-run (new cycle) |
| First finding + recommendation + confidence | `OwnerFinanceCycle` / `OwnerFinanceAction` (code + confidence only are read) |
| Accept / reject / defer (in product) | `OwnerDecisionRecord` (ACCEPTED/REJECTED/DEFERRED/MODIFIED) |
| In-product usefulness | `OwnerFirstResultInteraction` FEEDBACK (USEFUL / PARTLY_USEFUL / NOT_USEFUL + reason) |
| Owner-reported outcome | `OwnerActionOutcome.outcomeStatus` (self-reported) |
| Return visit | product event `returning_owner` (once per UTC day for an established owner) |
| Aggregate funnel | `journey-funnel.service` (counts only; no per-owner view) |
| Fixture isolation | `OwnerBusiness.isFixtureBusiness` |
| Privacy contract for events | `sanitiseProductEventProps` (allow-listed enums/ints only) |

## 2. Genuine gaps (and only these were built)

1. **No per-owner view.** The funnel is aggregate. → `/admin/beta-cohort` + `GET /api/admin/beta-cohort`.
2. **No place for human-established evidence** (understanding, trust, real-world action, T+7, outcome, severity,
   feedback) and **no cohort membership**. → an append-only evidence ledger.
3. **No T+7 scheduling.** → derived from the owner's stated action date (no outbound reminders — see §8).
4. **No expansion gate.** → computed, starts CLOSED.

**Storage: no Prisma schema change, no migration.** Operator-entered evidence is stored as append-only, platform-level
audit events (`beta_cohort.owner_assigned`, `beta_cohort.evidence_recorded`) with `workspaceId = null` and
`visibility = internal`, keyed by the `BetaRequest` id — the same pattern the beta-invite lifecycle already uses.
Because the rows carry no workspace id, **no tenant-scoped audit read can ever return them**: an owner cannot see
cohort data about themselves or anyone else. Automatic milestones are **derived live** and never copied, so they cannot
drift. The only cohort-specific identifiers stored are: beta request id, cohort id, owner code (e.g. `CB1-001`), kind.
**No email, no name, no financial value** is stored in the ledger.

New code: `src/domain/beta-cohort/evidence.ts` (pure model), `src/services/beta-cohort/cohort-evidence.service.ts`,
three admin routes under `/api/admin/beta-cohort`, the `/admin/beta-cohort` page, a sidebar link, two audit event names.
Access: `BETA_PROGRAM_MANAGE` (no policy change; `SYSTEM_ADMIN` and `ADMINISTRATION_OPERATOR` carry it;
`BETA_REQUEST_OPERATOR` and every owner/consultant role do not — pinned by test).

## 3. Telemetry versus evidence (the rule everything else follows)

| Observed automatically (telemetry) — proves only this | It does **not** prove |
|---|---|
| Page/first read viewed | the owner **understood** it |
| In-product "accept" / decision record | the owner **did anything** in the world |
| In-product "Useful" rating | the owner **trusts** it enough to act |
| Owner-reported outcome in product | the outcome was **independently verified** |
| Return visit | the owner **found value** |
| A correction was saved | the correction **fixed** the conclusion |

Understanding, trust, real-world action and outcome are **only** recorded by a human as evidence, start `UNKNOWN`, and
are never inferred from the left column. `UNKNOWN` is never coerced to NO / 0 / false anywhere (pinned by tests). The
table's telemetry columns are labelled "In-product …" and sit apart from the evidence columns.

## 4. Fields (smallest representation)

Automatic (derived live): cohort/owner code, beta request id, invitation date, signup, email verification, first
finding, first read viewed (= OBQ completion point), first finding code + recommendation code + confidence, evidence
corrected (count) and whether the top recommendation changed after correction, in-product decision, in-product
usefulness, owner-reported outcome, return visits.

Evidence (operator-entered, append-only, latest statement wins, full history kept): understanding / trust
(`YES|PARTIAL|NO|UNKNOWN`), would-take-action, real-world action (`DONE|NOT_DONE|UNKNOWN`, with the date the owner
acted, required for DONE), what looks wrong, owner feedback, issues (severity `P0|P1|P2`, category, trust-blocker flag,
resolution), the T+7 follow-up (§7), outcome (`PROVED|PARTIAL|FAILED|UNKNOWN`), causal basis. Free text is bounded and
emails/URLs/token-like strings are redacted before storage; the page warns never to type financial figures.

## 5. TIME_TO_FIRST_TRUSTED_VALUE — exact definition

Measured from the owner's **verified-email moment** (fallback: password set, then first-run start — the earliest
authenticated-entry instrumentation that exists) to the first moment **all** hold:

1. a concrete finding/recommendation exists (first diagnosis completed);
2. the owner was shown it, i.e. had the chance to correct the evidence (first result viewed);
3. the owner indicated they **understand** it — `understanding = YES` (PARTIAL does not count);
4. the owner has **not rejected it as obviously wrong** — `trust ≠ NO`. `UNKNOWN` trust counts as *not rejected* and is
   reported as "not explicit": this is a floor, not proof of trust. A later `NO` marks it **withdrawn** without erasing
   when it was first reached.

The moment is the latest of (statement time, finding time, viewed time). "Dashboard loaded" is never used. The
operator may record *when the owner said it* (`observedAt`, never in the future); otherwise recording time is used.

## 6. Operating procedure

**Before inviting** (one-time, operator with `BETA_PROGRAM_MANAGE`): production admission mode must be **`INVITE_ONLY`** (check
`GET /api/auth/beta-status` returns `"admissionMode":"INVITE_ONLY"`; set it in `/admin/beta-programme`); capacity ≥ cohort size;
the invitation email path is working (verification, reset and invitation emails have delivered in production). Do **not** open
public signup. `INVITE_ONLY` also keeps the table honest: the cohort view joins an owner's account to their invitation by
email, and in that mode signup only accepts the invited address, so an owner cannot appear as "invited, no account" while
actually having signed up under a different address. Existing QA/acceptance accounts are never counted unless explicitly
assigned, and an assignment of kind `QA_MECHANICS` is never counted.

1. **Invite.** In `/admin/beta-programme` invite the owner's request (existing flow). In `/admin/beta-cohort` assign the
   invited request to the next owner code (`CB1-001`, `CB1-002`, …) with kind `REAL_OWNER`. Mechanics checks use kind
   `QA_MECHANICS` (never counted). Internal `@opsiq.solutions` addresses cannot be `REAL_OWNER`. Assignment is immutable.
2. **Observe.** The table fills in automatically: signed up → verified → first read viewed → in-product decision →
   corrections → return. "Next step" tells you what to do. If an owner stalls before the first read, contact them and
   log what blocked them as an issue (category `ACCESS_OR_SIGNUP` / `WORKFLOW_FRICTION`).
3. **Collect feedback** (short, 5 questions, in person/call/message — not a survey): after the owner has seen the first
   finding: (1) do you understand what OpsIQ is telling you? (2) accurate enough to act on? (3) what, if anything, looks
   wrong? (4) would you take the recommended action? Later: (5) did you actually take it (and when)? Record each answer
   as an `OBSERVATION` — `OWNER_STATED` if they said it, `OPERATOR_OBSERVED` if you watched it. Record only what was said;
   leave a field unstated rather than guessing.
4. **Classify issues** when anything is wrong; one `ISSUE` entry each, resolved by an `ISSUE_RESOLUTION` entry (§8 rules).
5. **T+7.** When the owner reports the action `DONE` with a date, the table schedules T+7 (action date + 7 days) and
   shows NOT_DUE → DUE → OVERDUE. At T+7 record the follow-up (§7). Owners who did not act are still asked once, and the
   answer recorded (`NOT_DONE` is evidence too).
6. **Decide the outcome** only from the follow-up (§7). Never from telemetry.

## 7. T+7 follow-up protocol

Record, in one `FOLLOW_UP_T7` entry: action actually taken (`DONE|NOT_DONE|UNKNOWN`); recommendation still relevant
(`YES|NO|UNKNOWN`); measurable business signal changed (`YES|NO|UNKNOWN`, with a description — no figures — when YES);
owner's view of usefulness; whether OpsIQ should change its conclusion; outcome; **causal basis**.

Correlation versus causation is explicit and never inferred: `causalBasis` defaults to `NOT_ESTABLISHED`;
`CORRELATION_ONLY` means the signal moved after the action with other explanations not ruled out; `CAUSAL_EVIDENCE`
requires notes saying what rules out other explanations. The system **refuses** to record `PROVED` unless the action was
done, a measurable signal change is described, and a causal basis at least `CORRELATION_ONLY` is stated (`PARTIAL`
likewise requires the action done). When evidence is thin the correct outcome is `UNKNOWN` or `PARTIAL`.

## 8. Severity and the expansion gate

- **P0** — data leak; tenant-isolation failure; destructive corruption; owner cannot safely access their account;
  recommendation could cause severe financial/operational harm.
- **P1** — a real owner cannot complete the core journey; verification/login blocks a genuine user; diagnosis materially
  wrong from product logic; correction fails to update conclusions; recommendation contradicts the supplied evidence;
  owner loses work/data.
- **P2** — major confusion; owner cannot understand a finding; owner does not trust a finding because the
  evidence/rationale is unclear; significant friction; broken follow-up/evidence capture. Tick **trust blocker** when the
  issue stops the owner trusting or understanding a finding.

Classify against the OBQ freeze rules **before** touching OBQ: only a real-user defect, security defect,
regulatory/compliance requirement or controlled-beta evidence reopens it, and a P2 never reopens it automatically.

**Expansion gate — always starts CLOSED** and opens only when, counting genuine owners only (kind `REAL_OWNER`, with an
account, not a fixture business): at least 3 genuine owners; no open P0; no open P1; no open P2 trust blocker; and
`REAL_OWNER_SIGNUP`, `REAL_OWNER_OBQ`, `REAL_OWNER_FIRST_VALUE`, `REAL_OWNER_UNDERSTANDING` each proven for ≥ 3 owners
(understanding = an explicit `YES`), `REAL_OWNER_ACTION` observed for ≥ 1 owner (explicit `DONE`), `RETURN_USAGE`
observed for ≥ 1 owner. QA mechanics checks, fixture businesses and invited-but-not-signed-up owners are shown but never
counted. Three to five owners are not a statistic: the gate means "no known trust/comprehension blocker", not
product-market fit.

## 9. Automation: what is and is not automated

Automated (derived live, read-only): signup, verification, first finding/read, corrections, whether the recommendation
changed after a correction, in-product decision/usefulness/outcome, return visits, T+7 due/overdue status.
**Never** automated: understanding, trust, real-world action, outcome, severity — they require explicit evidence.
No outbound reminders are sent (no new processor, no new email path): the table's T+7 column and "Next step" are the
reminder; the operator checks it daily while the cohort is live.

## 10. Privacy

First-party storage only; no third-party analytics and no new processors. The ledger holds ids, enums and bounded,
redacted free text — never an email, a name or a financial value. The API returns finding/recommendation **codes** and a
confidence number, never titles or amounts, and only a masked email hint (`a***@e***.com`) for not-yet-assigned
invitations. Evidence rows are `internal` and carry no workspace id.

## 11. Limits (stated, not hidden)

- Operator-entered evidence is only as good as the operator's note-taking; `source` records who said it.
- The first-run recommendation is read from the Money (finance) diagnosis, the only domain first run produces.
- A cohort view reads at most 50 owners and 5,000 ledger entries; far beyond CB1's size, and it is a read bound, not a write limit.
- Operator access today requires `SYSTEM_ADMIN` (or provisioning `ADMINISTRATION_OPERATOR`, which no production identity holds).
