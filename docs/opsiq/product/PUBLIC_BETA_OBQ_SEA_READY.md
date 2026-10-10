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
  idempotent on `(workspace_id, idempotency_key)`; kinds `RESULT_VIEWED | IMPROVEMENT_REQUESTED | FEEDBACK`.

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
| `GOOD_ESTIMATE` | A good estimate | −10, capped at 84 | can't read HIGH |
| `ROUGH_ESTIMATE` | A rough guess | −25, capped at 59 | can't read MEDIUM |
| NULL (legacy) | not shown | none (existing rows keep their stored score) | none |

Stored in its own column, never in `notes`. Shown on the first result with its plain-language explanation.
In first-run the owner must choose one before a read is made (one tap). Elsewhere it is optional and an unanswered
control is *omitted* (stored as unspecified — never defaulted to actual). Correcting evidence may change the quality.

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
| `first_result_action_accepted`, `first_result_corrected`, `first_result_improvement_requested` | the three result actions |
| `first_trusted_decision_interaction` | activation derivation (once) |
| `cockpit_reached` (once), `returning_owner` (≤ once/UTC day, after activation day) | cockpit visit |
| `outcome_verification_started`, `outcome_verified` | **see Known limitations** |

Query example (funnel): `SELECT event_name, count(*) FROM audit_events WHERE event_name LIKE 'product.%' GROUP BY 1;`

## 6. Public beta, capacity, remote control

* The production setting is **not** changed. Under `INVITE_ONLY` (and CLOSED/WAITLIST/unknown) every surface keeps the
  current wording and the request-access flow. Under `OPEN_BETA` the CTA becomes **Start free → /signup** and
  invite-only wording is replaced where it would contradict. The server remains the only admission authority.
* Admission mode and capacity live in `platform_settings` (DB-authoritative once bootstrapped). Capacity is enforced by an
  advisory-locked reservation inside the signup transaction; the admin update takes the same lock. Nothing here was changed.
* **Kill switch:** Administration → Beta programme (`/admin/beta-programme`, API `/api/admin/platform-settings`) → set
  admission mode **CLOSED** (or WAITLIST). Takes effect on the next request; the signup route re-checks it, the homepage
  and static pages fall back to request-access wording, no deploy needed. Capacity can be lowered to just above current usage.
* **Recommended rollout:** `OPEN_BETA` at capacity **10** → watch → **25** → watch → **50** (capacity is configuration, not code;
  hard ceiling 1000). Advance only when the previous stage shows: ≥ 60 % of verified owners reach a first result, median
  `timeToFirstValueSeconds` < 600, no P0/P1 in `signup.refused_*`/errors, and feedback is not dominated by `NOT_USEFUL`.
* Pre-flight before the owner leaves: confirm an email provider is configured in production (verification emails are
  best-effort and silently skipped without one), `NEXT_PUBLIC_APP_URL` is correct, `/admin/beta-programme` works from a phone,
  and the admission mode row exists (bootstrap).

## 7. Known limitations (stated, not hidden)

1. `outcome_verification_started` / `outcome_verified` are defined in the vocabulary but **not yet emitted** from the
   existing verification service (changing that governed machinery was out of scope for this slice).
2. Goals: the audit found goals do not influence canonical priority at all (display-only), so the optional prompt links to the
   existing goal page rather than creating a goal inline; REVENUE/PROFIT are the only supported families.
3. The first Money read is deliberately finance-only. The Cockpit's canonical decision may rank a different item (e.g. a
   compliance blocker) first — that is correct and unchanged.
4. Legal pages (`/terms`, `/privacy`, `/beta`) switch only their descriptive "invite-only" phrases under OPEN_BETA; policy
   version strings are **unchanged**. If counsel treats that as a material change, bump the versions and re-consent.
5. The remote test database in this environment was never touched; migration and DB tests ran against a throwaway local
   Postgres. The migration has **not** been applied to any shared database.
