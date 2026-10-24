# Final owner beta-readiness remediation

Status: **prepared on a branch, not merged, not deployed.** Base: `3a14b13ef06adf0f1f10f0b4009437f4c1275904` (production at the time of the audit).

```
SCHEMA_CHANGE_REQUIRED=NO
PRODUCTION_MIGRATION_REQUIRED=NO
OWNER_BETA_READY=NO            (decided only by a post-deploy hostile re-audit, never by this change)
CB1_OWNER_001_READY=NO
CB1_EXPANSION_GATE=CLOSED
```

This record does not rewrite any earlier audit record. It answers the final hostile production re-audit of `3a14b13e…`
(`P0_NEW=0`, `P1_NEW=1`, `P2_TRUST_BLOCKERS=5`; D9 persistence itself passed and is not reopened).

## Disposition

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| N1 | P1 | A saved Finance period (revenue UNKNOWN) could not be completed later: duplicate POST → 409 → generic "couldn't save", no edit control, Guided setup ⇄ My Business ⇄ Money loop | **FIXED** — UI/wiring; the governed amendment backend is reused |
| N2 | P2 | My Business said "revenue, a cost figure and cash" while cash was UNKNOWN | **FIXED** — copy derived from known/unknown facts, names the period |
| N3 | P2 | Home: main target "Recover margin from cost leakage" next to "No profit leak detected yet" | **FIXED** — the two readings are reconciled in one presentation function |
| N4 | P2 | Raw `bankBalance` in owner-facing missing-data text | **FIXED** — one shared owner-label mapping, applied at the resolver and every renderer |
| N5 | P2 | Four different "confidence" figures with overlapping words | **FIXED** — each concept has its own label; the metrics are not merged |
| N6 | P2 | Correct 400 validation reduced to "couldn't save… try again" | **FIXED** — field-level, safe, focused, values kept |
| N7 | P3 | Future-dated period accepted, then ignored | `N7_DISPOSITION=VALID_BY_DESIGN` (+ labelled in the UI) |
| N8 | P3 | "There is no business data yet" with saved costs/cash | `N8_DISPOSITION=FIX` (inside the N2 wording work) |

## N1 — root cause (traced before any design)

```
Money page → (no list of saved periods) → create form only
           → POST /api/owner/finance/businesses/:id/snapshots → duplicate business+period → ConflictError 409
           → page: classifyOperatorError → "We couldn't save this snapshot… Try saving again"
```

The backend was complete and is **reused unchanged in behaviour**:

* `POST /api/owner/finance/snapshots/:snapshotId/amend` (OWNER_MANAGE, workspace-bound) →
  `amendFinancialSnapshot`: row locked `FOR UPDATE`, the old row is **kept** and stamped `supersededById`, a new row with
  `version+1` is created (append-only), confidence and missing-critical-data are recomputed, an audit event records
  `changedFields` / `clearedFields`, omitted = keep, number = set, `null` = back to UNKNOWN, contradictions introduced by the merge are refused.
* The current-effective version is selected by `currentEffectiveFinancialSnapshotQuery` (one non-superseded, ended period).
* D9: `resolveAmendedLeakage` merges the three leakage components per component; a legacy combined figure is never split.

What was missing was the owner's way in, and a conflict the screen could act on. Changes:

1. **Server — machine-coded 409s** (`FinanceConflictError`, mirrors the Cashflow pattern): duplicate create →
   `FINANCE_PERIOD_EXISTS` + the existing snapshot id; amending a replaced version → `FINANCE_SNAPSHOT_SUPERSEDED` +
   the current id. Still a `ConflictError`/409; no behavioural change to the write paths, locks or audit.
2. **Money — "Your saved periods"** lists every current version (period, version, revenue / cash known or not, in-progress /
   future labels) with **Update this period**, including when no first read is possible yet (the audit dead end).
3. **`FinancePeriodEditor`** — prefilled "Recorded now: …"; blank = leave; `0` = known zero; **"I don't know this figure"** =
   `null` (UNKNOWN); only changed figures are sent; a "This will change" summary; reason picker (stored as provenance);
   optional reliability; saves through the amend route; 409-stale → "updated after you opened them, nothing was changed" +
   "Show the latest figures". Pure rules live in `domain/owner-finance/snapshot-amend-form.ts` (reuses the quick-entry parser).
4. **After a correction** the dashboard reloads; when the corrected period is the one the current read rests on, the
   canonical diagnosis is re-run on the **new** version (otherwise the owner is told the read is unchanged). Home, Money and
   Goals read the current-effective version through the existing selectors (proved in the DB test).
5. **Create form** — a duplicate period now says "You already have figures saved for this period… Update that period" with a
   button that opens the editor carrying what the owner typed. Quick start and My Business copy no longer point at Guided setup.
6. **D9** — the editor lets the owner amend one leakage component at a time (known → UNKNOWN, UNKNOWN → known, explicit 0).
   A legacy row states why the three must be restated together (the server enforces the same rule).

Not done on purpose: a duplicate POST is **not** silently turned into an amendment (explicit owner intent is preserved: the
owner chooses "Update that period").

## N2 / N8 — My Business and Home wording

* `FirstReadSufficiency.period` (the period of the snapshot the answer rests on) and `firstReadStatement()` build the
  sentence from `revenueKnown / costKnown / cashKnown`: never "given" for an UNKNOWN fact; cash UNKNOWN is stated with what it limits.
* N8: `There is no business data yet.` was shown whenever nothing had been *diagnosed*. It now reads `OpsIQ has no completed
  analysis of your figures yet.`, and the request is "Add or complete your business numbers…". (My Business already says
  what is saved: "already holds some saved numbers but still needs revenue".)

## N3 — root cause

Two readings share the word "leak". The **Profit-Leak Radar** (`profit-leak-radar.ts`) reads *activity* records (metric snapshot
discount amount, complaints, rework, capacity…) and returns a `DATA_INSUFFICIENT` placeholder when none exist — meaning "cannot
rate a leak". The **Finance cost-leakage finding** (`FIN_OPP_LEAKAGE_REDUCTION`, recommendation "Recover margin from cost
leakage") is measured from the saved *money* figures (discount + refunds + redone work + complaints). The card rendered the
placeholder as "No profit leak detected yet" regardless of the decision above it.

`presentProfitLeakCard(leak, decision)`: placeholder + a Finance cost-leak target in the decision → "Cost leakage found in your
Money figures" (points at the target; the radar's own "no clear signal" line is hidden); placeholder otherwise → "Not enough
activity data to rate profit leaks yet" (explicitly *not* a finding that nothing is leaking); a real radar finding is unchanged.
Neither statement is hidden; the distinction is named.

## N4 — one mapping

`domain/owner-spine/owner-field-labels.ts`: explicit labels for the canonical keys (`bankBalance` → "bank balance",
`cashOnHand`/`cashInHand` → "cash in hand", `refundReworkCost`, …), a generic camelCase/snake_case → words fallback, and
`ownerSafeText` for free text (also bare `null`/`undefined`). Applied in `resolveOwnerDecision` (missing information), the
cockpit, Supervisor summary, Process-intelligence panel, Adjudication queue and Money. A static test fails any
`src/components/owner` renderer that joins a raw `missingData` list.

## N5 — confidence concepts (inventory and labels)

| Concept | Measures | Owner label | Where |
|---|---|---|---|
| `DATA_COMPLETENESS` | share of the information OpsIQ looks for that was supplied (`dataConfidenceScore`, 0–100) | **Data completeness: Low (50/100)** | Money (answer-first + scores), first read, Guided setup, other domain pages, Home badge |
| `FINDING_STRENGTH` | how directly the figures entered support one finding (0–1 → 0–100) | **Finding strength: High (100/100)** | finding cards |
| `TARGET_CONFIDENCE` | how sure OpsIQ is that the elected main target is right to do first (arbitration level, capped by completeness) | **Confidence in this main target: Moderate** | Home decision card |
| `GOAL_FORECAST` | reliability of the projected path to a goal (HIGH/MEDIUM/LOW) | **Forecast confidence: Moderate** | Goals |
| assessment evidence | evidence level behind the whole-business assessment | **Assessment evidence: limited** | Home assessment summary |
| plan analysis | the supervisor plan analysis' own rating | **Plan analysis confidence: medium** | Supervisor summary |

The 0–100 concepts share the existing 4-step scale and thresholds (85/60/30) so the format reads coherently; **no metric was
merged or recomputed**, and no two concepts share a label. Not changed: the Budget page's working-capital *evidence level*
(VERIFIED/…), a provenance tier rather than a score, and Trust-page explainability labels.

## N6 — validation messages

The server is unchanged and still validates every write. `presentSnapshotFormError` maps `400 + fieldErrors` to a form line
("Nothing was saved… correct below. Your entries are still here.") plus a message under each field, focuses the topmost
offending field, opens the collapsed section containing it, and never echoes an unknown path, schema phrase or 5xx body. The six
contradictions (repeat > total customers; overdue > total receivables; overdue > total payables; fixed-cost parts > fixed
costs; B2C + B2B > revenue; reversed dates) are tested end to end with the **real create schema** generating the server's rejection.

## N7 — disposition: VALID_BY_DESIGN

Every read already treats a period that has not started as "not evidence" (`evidencePeriodState`, current-diagnosis-cycle.ts;
Home tells the owner "figures entered for a period that has not started yet are not used"). Snapshots may be entered ahead of time
(planning), but are never current evidence. The only gap was that Money did not say so: saved periods now carry "Starts in the
future — kept on record but not used until the period begins" (and in-progress ones "treated as provisional"). A test pins the label
rule to `evidencePeriodState` so they cannot drift. No validation change.

## Governance notes

* No schema change, no migration, no change to D9 storage, QBO, billing, Clarity, admission mode, CB1 or any production data.
* All writes remain server-validated, authorised (OWNER_MANAGE + verified workspace), versioned and audited; the UI holds no
  business rule (rules are in `src/domain`).
* Known limitation: Home and Goals read the corrected version through the existing current-effective selectors; a corrected
  period that is not the latest does not trigger a new diagnosis (the owner is told the read is unchanged).

## Verification

* **Browser acceptance** (`tests/browser/50-final-owner-beta-readiness.spec.ts`, real production build, real disposable Postgres,
  owner e2e seed): 14/14. N1 create-incomplete → duplicate offered as update → complete → reload; D9 known → one component UNKNOWN →
  explicit 0, each surviving a reload (DB check: six versions, five superseded, history intact, `NULL` vs `0` distinct); N2 My Business
  names September 2026 and says cash is not entered; N3 Home shows the main target "Recover margin from cost leakage" **and** the card
  "Cost leakage found in your Money figures"; N4 no raw identifiers (opened-`details`, `innerText`); N5 `Data completeness:` /
  `Finding strength:` / `Confidence in this main target:`; N6 all six contradictions with the specific reason, `aria-invalid`, focus and values kept.
  The browser run found two things unit tests had not: a Home card that said "no leak" while the real decision's stand-in carried a
  different code (now covered by the real-decision assertion), and that the diagnosis re-run is limited to 10 an hour — a rate-limited
  re-run now says so instead of inviting another attempt.
* **Hostile review** (separate read-only pass) — no P0, no UNKNOWN/zero corruption, history, tenancy and stale-form paths SAFE. Fixed
  from it: `DATA_COMPLETENESS` text no longer claims to ignore reliability (the score is lowered for estimates); the legacy-leakage
  rule now matches the server (any row without the component marker, with or without a combined figure — an owner could otherwise be
  stranded); a PERIOD_EXISTS with an id not in the loaded list keeps the form and says to reload; the profit-leak pointer says
  "above" only when the leak is the main target; the "I don't know" checkboxes carry the field name for assistive technology.
* **Known limitations (not fixed here, P3 unless noted)**: the Money list and editor show `cashOnHand` as recorded — rows from before
  the #586 cash-semantics change may mean "cash and bank" (the diagnosis resolves this through the lineage; the list does not carry it);
  a retried amend whose first response was lost reads "updated after you opened them" although the change was saved; if the saved-period
  list refreshes while the editor is open, the editor closes without a message; the 409 body text carries snapshot ids (never shown);
  `ownerSafeText` rewrites any lowerCamel word in the free text it is applied to (applied only to system missing-information text).
