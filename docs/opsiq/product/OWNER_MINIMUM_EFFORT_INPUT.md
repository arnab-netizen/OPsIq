# Owner minimum-effort input — time to first value

Status: implemented on branch `claude/owner-minimum-effort-input` (base `6c6c8f33`, PR #585 merge). No migration. No change to score formulas, thresholds, danger bands, confidence caps, canonical Owner Decision ranking, outcome learning, billing or portfolio ranking.

## 1. Product principle

OpsIQ asks for the **minimum evidence required for the next trustworthy decision** and does as much of the rest as it can itself. The owner must not have to understand OpsIQ's domains, the 20-category evidence model, or its import/manual-entry machinery to get a first result. All of that backend capability remains; it is simply no longer the owner's front door.

## 2. Canonical first-read sufficiency (one rule)

`src/domain/owner-finance/first-read-sufficiency.ts` — `FirstReadSufficiency`.

A first read is possible when, in a Finance snapshot, all three are **known**:

| Fact | Satisfied by |
| --- | --- |
| revenue | `revenue` |
| a cost | **any one** of `costOfGoodsOrServices`, `fixedCosts`, `variableCosts`, `rent`, `salaryPayroll`, `utilities` |
| cash | `cashOnHand` |

It does not restate this rule: it calls `missingCriticalFinanceInputs()` (`data-confidence.ts`) — the decision engine's own critical-evidence contract (its parameter type was narrowed to `CriticalFinanceFields`; behaviour is unchanged). `blank`/missing = unknown; `0` = known.

Consumers (all read the same value):

- onboarding — `computeOnboardingState` takes `firstRead`; `canRunFirstDiagnosis`, `confidenceBeforeDiagnosis` and the first-action copy derive from it; the state exposes `firstRead`;
- input guidance — `buildInputGuidance` (`canRunFirstDiagnosis`);
- My Business (`/owner/data`), Start Here (page + Home continuation card), Owner activation panel — via the `/api/owner/onboarding` payload's `canRunFirstDiagnosis` / `firstRead`;
- the Finance quick path and the first-read CTA — `QuickFinancialPicture` asks the same `evaluateFirstReadSufficiency` for the entered numbers.

`loadFirstReadSufficiency` (service) builds it from the real snapshots: the current effective (completed-period) snapshot, else the in-progress one — labelled `basis: "provisional"`, never promoted to completed evidence.

### Defect closed

`FIRST_DIAGNOSIS_GATE = ["revenue_sales","expenses","cash_debt"]` plus `rowsToSuppliedCategories()` (fixed costs / rent / utilities → `fixed_costs`; payroll → `payroll`) made onboarding say "incomplete" for revenue + fixed costs + cash, which Finance itself accepts. The gate was removed. Fixed costs are **not** relabelled as variable expenses; the category mapping is untouched and is now explanation-only.

## 3. Category vs field

The 20 categories are an *evidence taxonomy* (what kind of record). The first-read gate is *field-based* (which numbers the engine needs). `FIRST_READ_FACT_CATEGORIES` maps facts to categories **for explanation only**. `blocksFirstRead(category, firstRead)` flags a category as blocking only while the fact it explains is still missing — so with fixed costs known, "Expense records" is never shown as blocking. `UNIVERSAL_MINIMUM` stays as the *starter/profile* set that improves confidence; it does not unlock the read.

## 4. Primary quick path

`/owner/data` (My Business), existing business, no first read yet — one screen, `QuickFinancialPicture`:

- "Give OpsIQ a rough picture of the business." Estimates are fine; blank = don't know.
- Four numeric fields: Revenue, Fixed costs, Variable / direct costs, Cash available. Currency is the business's own (shown, never asked; a business with no currency is told to set it once — never silently defaulted).
- No narrative, no evidence reference, no category / domain / source selection, no `required` attribute anywhere.
- Reporting period: *Last month* (default, completed) · *This month so far* (provisional, labelled as such) · *Choose dates*. OpsIQ has no authoritative business timezone, so the month comes from the owner's device clock, and an option is offered only if the shared `evidencePeriodState` classifies it as its label says (so the last day of a month never mislabels a period).
- Live, truthful feedback from the canonical rule: "Still needed for a first read: one cost figure." Either cost field suffices; no fake total-cost field.
- One primary action, "Show my first read" — enabled only when the canonical rule is met (insufficient evidence is not saved by this path; the owner is told what is missing).
- Save → diagnose are orchestrated, not bypassed: `POST …/snapshots` then `POST …/diagnoses` (the same governed endpoints the Finance page uses), then route to `/owner/finance`. A synchronous in-flight guard blocks double submission. If the diagnosis fails after the save, the numbers stay saved, inputs lock, and "Try the first read again" re-runs **only** the diagnosis on the saved snapshot id — it cannot create a second snapshot. A period that already has a snapshot is reported as such (409), never retried.
- Secondary, collapsed: "Add more detail (optional)" and "Other ways to add information" (full money form, manual entry, CSV paste, guided setup).
- The component is mounted with `key={businessId}`; the draft is never persisted, so switching business discards it and nothing can leak across businesses.

Before the first read the 20-category catalog, missing-items list and readiness bar are **not rendered**.

## 5. Progressive evidence gathering

After a first read is possible, My Business says **"Enough for a first read"** and explicitly *"does not mean OpsIQ knows the whole business"*. It then asks **one** next question ("One thing would make this more reliable" — `nextBestUpload` from the existing onboarding infrastructure) and keeps the full missing list and category groups behind **"Add more detail"**. No "100% / complete / ready" claim is made from the financial picture alone.

## 6. Manual entry

The shared `note` was mandatory in all 10 sections. Now it is mandatory only for narrative sections (current issue, customer/quality, staff/SOP, owner workload, opportunity, vendor, missing data). For the three sections that carry a structured number (business snapshot, cash/cost, revenue) a number — including `0` — is sufficient without a note. PII detection, the non-negative rule and "at least one usable fact" are unchanged. Manual entry stays secondary; these sections remain context records (they do not satisfy the Finance first-read facts).

## 7. Returning owner

`RETURNING_OWNER_REUSE_REQUIRES_PROVENANCE_CHANGE=YES` — **deferred, not implemented.**
Snapshots are per-period rows. "Mostly the same" would create a new period's row whose values are last period's. `OwnerFinancialSnapshot` has no field recording "carried over from period X, confirmed unchanged" (only `notes`, free text, and amendment fields that describe edits to the *same* period). Without that, a copied value is indistinguishable from fresh observation, i.e. stale evidence silently becoming current. Candidate for a separately approved migration (e.g. `carriedFromSnapshotId` + `ownerConfirmedUnchangedAt`). For changed numbers within a period, the existing amendment flow (`amendFinancialSnapshot`) already applies.

## 8. Natural-language input

`NATURAL_LANGUAGE_INPUT_READY=NO` — not implemented. Exact blockers:

1. The only extraction task (`runIntakeExtract`, `INTAKE_EXTRACT`) is wired only into the consultant decision-intake route (`/api/decisions/intake`), not an owner route.
2. Its output is generic `candidateFacts {field, rawValue}`; there is no mapping to Finance snapshot fields, no unit normalisation ("6 lakh", "4.5 lakh"), and no owner-facing show-back / confirm / correct step feeding `createFinancialSnapshot`.
3. The real providers (`anthropic-provider`, `openai-provider`) are external third parties; there is no approved egress/consent policy for owner financial figures, and adding one is out of scope ("no new third party").
4. Persist-only-after-confirmation would need a new confirm contract. The first friction reduction deliberately does not depend on AI.

## 9. Business creation audit

Required by the backend: `name`, `businessType` (enum — drives the archetype's starter minimum and the Finance industry-template mapping), `currency` (snapshot currency consistency). `CreateBusinessPanel` asks exactly these three; optional metadata (location, operating model, b2b/b2c) is not asked. Deferring `businessType` was **not** done: the API requires it, the column is non-null, and any default would be a guessed business type affecting archetype/threshold behaviour. Candidate later, with tests proving no unsafe default.

## 10. Friction audit (code-derived; not user-measured)

Existing business, no snapshot, shortest legitimate path to a first diagnosis.

| Measure | BEFORE | AFTER |
| --- | --- | --- |
| Pages visited (from My Business) | 2 (`/owner/data` → `/owner/finance`) | 2 (`/owner/data` → `/owner/finance` shows the read); input happens on 1 screen |
| Clicks / actions | 4 (open Money link, "+ Add financial snapshot", "Save snapshot", "Run finance diagnosis") | 1 (plus typing) |
| Immediately visible inputs on first-input surface | 7 (2 dates, business model select, 4 numbers) behind a reveal button; 3 more disclosures | 4 numbers (period preselected; "Choose dates" collapsed) |
| Mandatory inputs | 5 (2 dates + revenue + a cost + cash) | 3 (revenue + a cost + cash) |
| Taxonomy / method choices before value | 4 peer entry methods + 4 category groups / 20 categories on My Business | 0 (secondary methods collapsed) |
| Save / diagnose actions | 2 separate | 1 combined |
| Narrative fields | 0 on Finance (but manual entry: note mandatory in 10/10) | 0 |
| Readiness contradiction | fixed-cost-only evidence still "incomplete" in onboarding | none — one rule |

`DESIGNED_INTERACTION_REDUCTION`, not `PROVEN_ABANDONMENT_REDUCTION`. Targets `OWNER_TARGET_TIME_TO_FIRST_INPUT <= 90 s` and `OWNER_TARGET_ROUTINE_UPDATE <= 30 s` are product targets, **not measured**.

## 11. Known limitations

- Period dates come from the device calendar (no authoritative business timezone).
- The Finance page still opens its full form behind "+ Add financial snapshot"; the quick path lives on My Business.
- A first-time owner whose evidence is incomplete cannot save a partial snapshot from the quick path (they get precise feedback, or use the full Finance form). Completing a partial snapshot in place would require the amendment flow.
- An owner whose cash exists only in a cash-flow record (no snapshot `cashOnHand`) is now told cash is still needed for the first read — Finance diagnosis reads `cashOnHand` from the snapshot.
- DB-backed suites and a real-browser run were not executed in this environment (no local PostgreSQL; the configured DB variables point at a remote database and were deliberately not used).

## 12. Real-world validation metrics (to measure with real owners)

Time from landing to first diagnosis; time to first input; number of fields touched; abandonment before first read; quick-path completion rate; diagnosis-retry rate after save; share of first reads on provisional vs completed periods; routine-update time when little changed.
