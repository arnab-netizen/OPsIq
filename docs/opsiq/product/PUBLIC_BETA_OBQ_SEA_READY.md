# PUBLIC_BETA_OBQ_SEA_READY_V1

Branch `claude/public-beta-obq-sea-ready`, from `origin/main` `ce8b242c68e3d0776188f069e0f4fb27c5690d2e`.
Independent of the QBO hardening branch. Not merged, not deployed, `OPEN_BETA` **not** enabled, billing untouched.

Goal: a stranger goes homepage → **Start free** → signup → verify email → first run → first useful, honestly
scoped, evidence-and-confidence-labelled result → one accepted action → Cockpit, with no founder help.
Metric: `TIME_TO_TRUSTWORTHY_VALUE` (target < 5 min, ceiling < 10), not questionnaire completion.

## 1. What already existed and is reused (no second engine)

| Need | Reused canonical piece |
|---|---|
| First-read sufficiency (revenue + a cost + cash; blank = unknown, 0 = known) | `domain/owner-finance/first-read-sufficiency.ts`, `quick-entry.ts`, `QuickFinancialPicture` |
| Diagnosis, findings, ranked actions | `diagnoseFinanceSnapshot`, `runFinanceDiagnosis` |
| Evidence versioning / correction | `amendFinancialSnapshot` (new version, old kept, `FOR UPDATE`) |
| Accepting an action | `recordOwnerDecision` → `OwnerDecisionRecord` (append-only, idempotent, advisory-locked) |
| Next question | `buildInputGuidance` / `INPUT_CATALOG` / `smb-archetype` tiers |
| Business creation | `createBusiness` (now tx-capable), `businessCreateSchema` |
| Admission / capacity | `readEffectiveSettings`, `canAdmitSignup`, `reservePublicBetaCapacity` (advisory-locked) — unchanged |
| Outcome verification | existing `verifyOwnerActionOutcome` machinery behind the Cockpit — unchanged |

## 2. What was added

**Domain (`src/domain/owner-first-run`, `analytics`, `owner-finance/evidence-quality.ts`, `beta/public-presentation.ts`)** — all pure.

* `first-run-router.ts` — one deterministic state contract from persisted facts:
  `NEEDS_BUSINESS → NEEDS_EVIDENCE → NEEDS_DIAGNOSIS → FIRST_RESULT → ESTABLISHED`. No onboarding-complete boolean.
  Verification landing resumes any state; a plain login resumes A–C and sends D/E to the Cockpit (an established or
  already-read owner is never forced back through setup).
* `first-money-read.ts` — presentation of the canonical diagnosis as the eleven answers; heading **"Your first Money read"**;
  scope sentence says it covers *money figures only*; overclaim guard (`OVERCLAIM_PHRASES`) is test-enforced.
* `next-question.ts` — progressive OBQ selector over `buildInputGuidance` with (a) a relevance filter, (b) a skip list,
  (c) a hard limit of 3 questions per session, (d) stop reasons.
* `activation.ts` — see §4.
* `evidence-quality.ts` — see §3.

**Persistence (additive migration `20261010120000_owner_first_run_evidence_quality`, applied only to a throwaway local DB)**

* `owner_financial_snapshots.evidence_quality` — nullable, CHECK `ACTUAL | GOOD_ESTIMATE | ROUGH_ESTIMATE`. NULL = recorded
  before provenance existed.
* `owner_first_result_interactions` — append-only, tenant-scoped (composite FK to `owner_businesses(id, workspace_id)`),
  idempotent on `(workspace_id, idempotency_key)`; kinds `RESULT_VIEWED | IMPROVEMENT_REQUESTED | QUESTION_SKIPPED | FEEDBACK`, plus nullable `question_category` (CHECKed to the two question kinds).

**Routes `/api/owner/first-run/*`** (all `withCanonicalEnforcement`, capability + workspace enforced server-side):
`GET /` (routing contract) · `POST /business` · `GET /result` · `POST /result/viewed` · `POST /accept` · `POST /correct` ·
`POST /improve` · `GET /next-question` · `POST /feedback` · `POST /cockpit-visit`. Plus anonymous `POST /api/product-events`.

**UI** — `/owner/first-run` (one resumable page), `QuickFinancialPicture` evidence-quality control, mode-aware public CTA/copy.

## 3. Evidence quality (P0 trust)

Snapshot-level, not field-level. Rationale: the Quick Money Picture captures four numbers with one honesty control; a
per-field model would imply precision the capture surface doesn't collect, and the confidence engine's critical rule is
already snapshot-wide. A field-level model can be added later without breaking this one (additive).

| Quality | Owner wording | Score effect (`applyEvidenceQualityToScore`) | Tier ceiling |
|---|---|---|---|
| `ACTUAL` | From my records | none | none |
| `GOOD_ESTIMATE` | A good estimate | −5, capped at 84 | can't read HIGH |
| `ROUGH_ESTIMATE` | A rough guess | −15, capped at 59 | can't read MEDIUM |
| NULL (legacy) | not shown | none (existing rows keep their stored score) | none |

Stored in its own column, never in `notes`. Shown on the first result with its plain-language explanation.
In first-run the owner must choose one before a read is made (one tap). Elsewhere it is optional and an unanswered
control is *omitted* (stored as unspecified — never defaulted to actual). Correcting evidence may change the quality; if numbers
are corrected without stating reliability, an ACTUAL snapshot steps down to GOOD_ESTIMATE (it cannot stay "from my records"
for numbers nobody vouched for). The confidence shown on a read is the score the diagnosis actually used (`cycle`), and a read with
critical inputs missing or BLOCKED confidence cannot be accepted; estimates and low confidence show visible cautions.

## 4. Activation — `FIRST_TRUSTED_DECISION_INTERACTION`

> A first Money read exists **and** the owner did at least one of:
> 1. `ACTION_ACCEPTED` — an `OwnerDecisionRecord` in state `ACCEPTED` (or `MODIFIED`) exists for the business;
> 2. `EVIDENCE_CORRECTED` — a financial-snapshot amendment (`version > 1`) exists;
> 3. `IMPROVEMENT_REQUESTED` — an improvement-request interaction exists.

Hostile audit of the definition:
* Signup, verification, finishing OBQ, viewing the Cockpit and *viewing* the result are deliberately **not** activation
  (none shows engagement with a recommendation the owner could trust).
* Reject/defer are decisions but are excluded: they don't show the owner trusted the read enough to act on or sharpen it.
* A rough-estimate read still counts — acting on or correcting it is the engagement being measured; its quality is carried
  on the event so cohorts can be split.
* Derived only from persisted rows, never from a client claim, so it cannot be spoofed and survives a lost event.
* Emitted once per business (`recordActivationIfFirst`), carrying `timeToFirstValueSeconds` =
  `user.emailVerifiedAt → first qualifying interaction` (`TIME_TO_FIRST_VALUE`).

## 5. Analytics

Closed vocabulary in `domain/analytics/product-events.ts`; written through the existing audit infrastructure as
`product.*` events (tenant-scoped, hash-chained; anonymous ones explicitly unchained). The sanitiser keeps only
allow-listed keys holding an enum token or a bounded whole number — **money, names, emails and free text cannot pass**
(test-pinned). Events: the 17 required plus `first_value_feedback`.

| Event | Emitted by |
|---|---|
| `public_start_free_clicked`, `signup_started` | browser beacon → `/api/product-events` (name only, allowlisted, rate-limited) |
| `signup_completed`, `email_verified` | signup / verify-email routes (post-commit, never fail the request) |
| `first_run_started` | first load of the routing contract in state A (once) |
| `business_profile_completed` | first-run business route (once) |
| `first_evidence_saved`, `first_diagnosis_completed` | snapshot / diagnosis routes (once per business) |
| `first_result_viewed` | `result/viewed` (once per diagnosis cycle) |
| `first_result_action_accepted`, `first_result_corrected`, `first_result_improvement_requested`, `first_result_question_skipped` | the three result actions |
| `first_trusted_decision_interaction` | activation derivation (once) |
| `cockpit_reached` (once), `returning_owner` (≤ once/UTC day, after activation day) | cockpit visit |
| `outcome_verification_started`, `outcome_verified` | process-execution `VERIFY_OUTCOME` (before the attempt / after commit) |

Query example (funnel): `SELECT event_name, count(*) FROM audit_events WHERE event_name LIKE 'product.%' GROUP BY 1;`

## 6. Public beta, capacity, remote control

* The production setting is **not** changed. Under `INVITE_ONLY` (and CLOSED/WAITLIST/unknown) every surface keeps the
  current wording and the request-access flow. Under `OPEN_BETA` the CTA becomes **Start free → /signup** and
  invite-only wording is replaced where it would contradict. The server remains the only admission authority.
* Admission mode and capacity live in `platform_settings` (DB-authoritative once bootstrapped). Capacity is enforced by an
  advisory-locked reservation inside the signup transaction; the admin update takes the same lock. Nothing here was changed.
* **Kill switch:** Administration → Beta programme (`/admin/beta-programme`) → **Stop new signups now** (a dedicated panel
  at the top; it sends *only* `admissionMode: CLOSED`, so a stale page can never overwrite a newer capacity). It loads
  independently of the request list, so a failing list never hides it. It takes effect on the **next signup request**
  (the signup route re-reads the mode under the capacity lock; a failed read fails closed). **It stops *new* signups only:**
  accounts that already exist (pending or verified) keep working, and a visitor with the form already open gets a generic
  refusal on submit. Reopen by saving the mode again. API: `/api/admin/platform-settings`.
  *Pre-condition:* the `platform_settings` row must exist. If the page shows "Initialize platform settings first", run that
  one-time bootstrap **before** the owner leaves — until then the switch cannot be saved (the page says so).
* **Recommended rollout:** `OPEN_BETA` at capacity **10** → watch → **25** → watch → **50** (capacity is configuration, not
  code; hard ceiling 1000). Advance only when the previous stage shows: most verified owners reach a first result, the
  median `timeToFirstValueSeconds` is acceptable (see caveat below), no P0/P1, and feedback is not dominated by `NOT_USEFUL`.
* **Pre-flight checklist (do these before the owner is unreachable):**
  1. `NEXT_PUBLIC_APP_URL` is the real public https URL in **Production**. It defaults to `http://localhost:3000`; if unset,
     every verification email links to localhost. The product now records `user.email_verification_not_sent` with reason
     `BASE_URL_NOT_PUBLIC` whenever it detects this in production — but check it up front.
  2. An email provider is configured (`RESEND_API_KEY` and the sender), plus `BETA_REQUEST_NOTIFICATION_EMAIL` for capacity
     alerts. Without a provider, signup still answers "Check your email" and **no email is sent**; each skip now records
     `user.email_verification_not_sent` (`NO_PROVIDER` / `SEND_FAILED`). Watch that event (query below).
  3. The migration `20261010120000` is applied to the production database through the manual workflow **before** the code is
     promoted (the production build gate refuses to build while a migration is pending). It is additive and nullable, so old
     code on the new schema and a rollback are both safe.
  4. `/admin/beta-programme` opens and the Stop button works from a phone; `platform_settings` is bootstrapped.
* **Operating limits to know about** (not changed here — they are the existing, governed beta architecture):
  * **Capacity no longer counts unverified signups forever (decision record: `PUBLIC_BETA_SEA_RUNBOOK.md` §5).** It counts
    verified accounts plus unverified signups still inside a 24-hour pending hold; one source address may hold at most 3
    pending places. A late verifier re-checks capacity under the shared advisory lock.
  * Per-IP limits apply to signup/login (10 per 15 min) and verification (30 per hour, raised from 5 so a small cohort behind
    one office/mobile-carrier address cannot lock itself out; resend stays 5 per hour per address and per email).
  * The production database pool is one connection per instance; a sudden spike queues and can return a retryable
    "temporarily unavailable" on signup (fail-closed, nothing lost). At 10–50 owners this is unlikely.

**Funnel and health SQL** (read-only; each `product.*` event is a row in `audit_events` with `workspace_id` and `occurred_at`).
Once-guards are check-then-insert, so always count `DISTINCT workspace_id`, never raw events:
```sql
SELECT event_name, count(*) AS events, count(DISTINCT workspace_id) AS workspaces
  FROM audit_events WHERE event_name LIKE 'product.%' AND occurred_at > now() - interval '7 days'
 GROUP BY 1 ORDER BY 2 DESC;
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY (payload->>'timeToFirstValueSeconds')::int) AS median_seconds
  FROM audit_events WHERE event_name = 'product.first_trusted_decision_interaction';
SELECT payload->>'reason' AS reason, count(*) FROM audit_events
 WHERE event_name = 'user.email_verification_not_sent' GROUP BY 1;           -- emails that did NOT go out
SELECT event_name, count(*) FROM audit_events WHERE event_name LIKE 'signup.refused%' GROUP BY 1;
SELECT count(*) FILTER (WHERE email_verified_at IS NULL) AS unverified, count(*) AS total
  FROM users WHERE created_at > now() - interval '7 days';                    -- signups that never verified
```
**Reading `timeToFirstValueSeconds` honestly:** it is *email verified → first accept / correction / improvement*. It includes the
owner's own thinking time and is **not** the < 5 min "time to a trustworthy first read" target; there is no event for "first
result shown" other than `first_result_viewed` (compare its `occurred_at` with `email_verified` per workspace for that).

## 6b. Repair round (post-audit) — what changed and where

* Evidence truth: `NULL` quality is `LEGACY_UNKNOWN` (never authoritative, never "estimated", never promoted to `ACTUAL`; shown as
  "Not stated" with a caution). The snapshot-create route refuses to store the **first** evidence of a not-yet-diagnosed business
  without a stated quality (server-side; the UI control is a convenience). Callers that never state it after the first diagnosis stay
  `NULL` (conservative). Any quality change — including the implicit `ACTUAL → GOOD_ESTIMATE` step-down — is recorded in the
  amendment audit event (`evidenceQualityBefore/After`, actor, previous snapshot id) and in the new version's `changedFields`.
* Amounts: a lone dot followed by exactly three digits (`1.500`) is refused as ambiguous; `1,500`, `1,500.00`, `1,80,000`,
  `1 500` are read as thousands grouping; locale is never guessed.
* First read: `scopeKind` (`FINANCIAL_FIRST_READ` / `WHOLE_BUSINESS`) is a runtime contract — the builder refuses
  whole-business wording unless ≥ 3 distinct evidence domains back it. Period, completed/provisional status and evidence quality are
  shown in one line (canonical `evidencePeriodState`).
* Progressive questions: progress is persisted (`OwnerFirstResultInteraction.questionCategory`; kinds `IMPROVEMENT_REQUESTED` and
  `QUESTION_SKIPPED`); the limit (3) counts handled categories and is reachable; skipped/chosen categories are never re-asked.
  "Add this" carries `returnTo=first-run`; a return bar on every owner page links back to `/owner/first-run?update=1`, which re-runs
  the canonical diagnosis once and shows what changed.
* Operability: `PUBLIC_BETA_SEA_RUNBOOK.md`; `/admin/overview` shows the signup → first-value funnel and capacity breakdown.

## 7. Known limitations (stated, not hidden)

0. **Later verification does not read evidence quality.** An accepted action built on an *estimated* read records
   `expectedMeasurementSource = OWNER_ENTERED` (not `AUTHORITATIVE_SNAPSHOT`), but the existing outcome/verification
   machinery itself does not look at `evidenceQuality` of the snapshot it later measures against. Wiring that is a change to
   governed verification and is deliberately out of scope here.
0b. *(Resolved.)* Accepting a read is **compare-at-write**: the accept request names the read (cycle) the owner is looking at, and
   inside the decision transaction (under the candidate lock) the snapshot is share-locked and re-checked as un-superseded, still
   the diagnosable head, and still the latest diagnosis. An amendment takes the same row `FOR UPDATE`, so exactly one of
   them wins; the loser gets `409` with the contract message "Your numbers changed since this read was created. Update the read
   before using this recommendation." A correction whose diagnosis re-run fails after the amendment committed is reported as
   "saved, but the read could not be updated yet" and the old read is withdrawn.
0c. An amendment cannot return a field to *unknown* (blank means "leave as is"); a deliberate known zero is preserved.
0d. The key number on the read is shown with its metric label but no unit (it may be a ratio, days or an amount).

1. Goals: the audit found goals do not influence canonical priority at all (display-only), so the optional prompt links to the
   existing goal page rather than creating a goal inline; REVENUE/PROFIT are the only supported families.
2. The first Money read is deliberately finance-only. The Cockpit's canonical decision may rank a different item (e.g. a
   compliance blocker) first — that is correct and unchanged.
3. Legal pages (`/terms`, `/privacy`, `/beta`) switch only their descriptive "invite-only" phrases under OPEN_BETA; policy
   version strings are **unchanged**. If counsel treats that as a material change, bump the versions and re-consent.
4. The remote test database in this environment was never touched; migration and DB tests ran against a throwaway local
   Postgres. The migration has **not** been applied to any shared database.
5. Accepted residual items from the repair-round hostile reviews (P3, none blocks): spreadsheet **imports** create evidence with no
   stated quality (stays "Not stated", conservative); server date validation still accepts non-calendar strings such as
   `2026-02-30` (they roll forward; labels show the stored UTC value); the per-source pending bound compares against a
   non-indexed `policy_acceptances.ip_address` under the capacity lock (fine at beta scale; add an index before opening past
   ~1000 accounts); the question limit is per business for life and an abandoned "Add this" counts as handled; legacy
   *workspace-scoped goals* (which a new owner cannot have) still read "Workspace goal" on the Goals page; a no-op amendment that
   re-submits the same number still steps `ACTUAL` down to `GOOD_ESTIMATE` (conservative, audited); anonymous funnel counts are
   approximate and can be inflated by a hostile caller (labelled as such).
