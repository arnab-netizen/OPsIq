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

### 4a. Route convergence (PR #586 amendment)

There may be many detailed data-entry tools, but one obvious low-effort first-input experience. `QuickFinancialPicture` is the ONE implementation and is hosted by both pre-first-read surfaces:

- **My Business** (`/owner/data`) — dominant before the first read.
- **Money** (`/owner/finance`, reachable directly from the sidebar) — when the selected business has no diagnosis yet **and** the canonical gate (`canRunFirstDiagnosis` from `/api/owner/onboarding`, the same value My Business reads) says the first read is not possible, Money shows the shared quick start first. The legacy "+ Add financial snapshot" / "Run finance diagnosis" controls are not shown; "Enter full financial detail instead" reveals the unchanged full snapshot form as a secondary option. Once first-read evidence exists (or a diagnosis exists), Money is the normal full view. An unreadable gate falls back to the normal view (no capability is withdrawn). On Money the completion callback reloads the page in place.
- **Owner home with no business** now says "Set up your first business" and links to `/owner/data` (it previously said "Start in Finance").
- **Help** separates the two: My Business = fastest first input; Money = full financial detail, saved snapshots and history.
- **Start Here** keeps its money step on `/owner/data`. Money stays in the sidebar.

**Existing incomplete snapshot.** The quick path never POSTs a duplicate period and never clones saved numbers. It reads the business's saved snapshot periods; a period that already holds a snapshot is disabled ("already saved"), the default moves to the first free period, and typing the same custom dates is refused inline. If a saved snapshot is still missing a critical fact, a notice says exactly what is missing, that the saved numbers are left as they are, and points to Guided setup (the existing path that amends that period) or a different period here. No new endpoint, no migration.

**Guided setup (`/owner/onboarding`) — shared core, honest extension.** Its `EssentialNumbersForm` no longer has its own definitions. The FOUR core Finance inputs come from the shared quick-entry domain (`QUICK_ENTRY_FIELDS`, `parseQuickAmount`, `assessQuickEntry`) and readiness from the canonical `evaluateFirstReadSufficiency`: the "See my first result" action is disabled — and its submit handler refuses — until revenue, one cost and cash in hand are **known** (a known 0 counts; blank is unknown), with the same missing-fact feedback as the quick path. Nothing is saved and no diagnosis runs on incomplete evidence. What Guided setup adds (`GUIDED_SETUP_EXTENSION=YES`): an optional **bank balance** written only to a Cashflow snapshot (idempotent / explicit warning on conflict, unchanged), and amend-on-409 for a same-period Finance snapshot through the governed amendment endpoint. Persistence orchestration therefore differs deliberately; the semantic contract is shared (`CORE_QUICK_INPUT_IMPLEMENTATIONS=1`). Bank balance never satisfies the cash requirement (`missingCriticalFinanceInputs` is unchanged).

### 4b. One meaning of "cash in hand"

`cashOnHand` on the Finance snapshot is **physical cash the business holds outside the bank (till, safe)**. Bank money is a separate fact (`bankBalance`, a Cashflow snapshot value that the Finance diagnosis *adds* to `cashOnHand` as total liquid funds — `metrics.ts`). Telling an owner to put "cash and bank" in `cashOnHand` would double-count once a real bank balance is recorded. The label/hint live once in `CASH_IN_HAND_COPY` (`quick-entry.ts`) — "Cash in hand: Physical cash the business holds outside the bank (till, safe). Don't include money in the bank. If there is none, enter 0." — and are used by the quick start, Money's full snapshot form and Guided setup; the CSV field label ("Cash in hand (not the bank)") and the missing-input label ("Cash in hand") follow. The separate bank field uses `BANK_BALANCE_COPY` ("Money in the bank … only there or only here — never both"). A regression test (`cash-on-hand-semantics.test.ts`) fails if an owner-facing `cashOnHand` label/hint includes the bank. Generic uses of "cash on hand" elsewhere (articles, calculators, runway explanations) are not the persistence field and were left alone. Consequence: an owner who only has bank money enters `0` for cash in hand and the bank figure separately in Guided setup/Cashflow.

**Liquidity truth contract (A1).** Total liquid funds = cash in hand + bank balance, and it is a fact only when **both** are known (`src/domain/owner-finance/liquidity.ts`, `resolveLiquidity`). A known 0 is a fact; an absent value is unknown and never becomes 0. Runway (`cashRunwayDays`), days of costs (`cashDaysOfCosts`), the survival state/risk score, the Budget forecast starting cash, the budget mode's reserve/free-cash and the working-capital free-cash all use this one basis. When the bank balance is unknown, runway and days of costs abstain (null) and Finance raises `FIN_LIQUIDITY_UNCONFIRMED` ("Add your bank balance to confirm how long your cash will last" — a medium-severity evidence request, never a survival main target); cash in hand of 0 is **not** reported as zero liquidity. The bank balance remains optional on the first screen and is not a critical field (`missingCriticalFinanceInputs`, first-read sufficiency and confidence scoring are unchanged). The usable bank balance is the latest Cashflow snapshot ending at or before the Finance period end and no more than `BANK_BALANCE_FRESHNESS_DAYS` (45) before it; future-dated, stale or absent values are unknown. That one rule (`selectUsableBankBalance`, loaded once by `loadUsableBankBalance`) replaces two hand-copied 45-day literals. Historical meaning: before #586 the Money full form said "Cash and bank balance", so older Finance snapshots may already contain bank money. No semantic marker is stored (`HISTORICAL_CASH_SEMANTIC_VERSIONING=ABSENT`), so meaning is resolved from stored provenance only: the cutover is the production deployment-complete instant of #586 (`PHYSICAL_CASH_SEMANTICS_EFFECTIVE_FROM` = 2026-10-04T15:29:07Z; the merge at 15:27:23Z is not the cutover), and the amendment chain (`version`, `supersededById`, `changedFields`, `createdAt`) carries it forward. An original snapshot created before the cutover is `LEGACY_AMBIGUOUS` (`cashOnHand` used as entered, bank never added); one created after is `PHYSICAL_ONLY`. An amendment inherits its predecessor's meaning unless, on or after the cutover, it explicitly replaced `cashOnHand` with a different value (so copying an old combined value forward because an unrelated field was amended can no longer be mistaken for physical cash). Dangling, branched or cyclic lineage fails closed to `LEGACY_AMBIGUOUS`. The resolution is workspace/business scoped (`resolveFinancialSnapshotCashSemantics`) and applied before bank enrichment in one place (`loadFinanceEngineInput`), used by the diagnosis and by Budget. Residual limit: re-entering the identical number under the new copy is indistinguishable from not touching it, so it stays legacy (a safe under-count, never a double count).

**Budget and liquidity.** Budget offensive posture requires complete liquidity: when total liquid funds is not fully known the mode cannot be GROW or SCALE (it is held in STABILIZE with the reason "Confirm the bank balance before OpsIQ clears growth or scale spending", and `bankBalance` is listed as missing evidence), the existing defensive-mode allocation barrier defers offensive spend, and no EMERGENCY, reserve breach or short runway is invented from the unknown. `/owner/budget` shows no 7/30/90-day figures, reserve check or scenario amounts until liquidity is complete; it says "Bank balance is not recorded, so OpsIQ cannot yet show a complete cash forecast" and links to the Cashflow page.

**The 35-day owner-context window** (`owner-context-derivation.ts`, `owner-db-providers.ts`) is generic evidence staleness against *now* (it also governs margin and other domains), not the Finance bank-balance compatibility rule (45 days against the Finance period end); the two answer different questions and stay distinct (`OWNER_CONTEXT_35_DAY_RULE=INTENTIONAL_GENERIC`). What was wrong there was unknown becoming 0 (`cashInHand ?? 0`, `bankBalance ?? 0`): total cash on a Cashflow row now requires both parts (`cashflowTotalCash`), otherwise it is unknown and no `cash_negative` flag or zero-cash number is produced.

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
- Money and My Business share the quick path; the full snapshot form stays available behind "Enter full financial detail instead" (pre-first-read) or "+ Add financial snapshot" (after).
- Guided setup keeps its own presentation, bank-balance (Cashflow) step and amend-on-409, but shares the core field semantics and the canonical gate (see 4a).
- A first-time owner whose evidence is incomplete cannot save a partial snapshot from the quick path (they get precise feedback, or use the full Finance form). Completing a partial snapshot in place would require the amendment flow.
- An owner whose cash exists only in a cash-flow record (no snapshot `cashOnHand`) is now told cash is still needed for the first read — Finance diagnosis reads `cashOnHand` from the snapshot.
- Real-browser evidence was captured against a local throwaway Postgres and `next dev` (not the Vercel preview, which needs credentials not available here); screenshots show the Next.js dev indicator overlay, which is not part of the product.

## 12. Real-world validation metrics (to measure with real owners)

Time from landing to first diagnosis; time to first input; number of fields touched; abandonment before first read; quick-path completion rate; diagnosis-retry rate after save; share of first reads on provisional vs completed periods; routine-update time when little changed.

## 13. Real-browser acceptance (PR #586 amendment)

`tests/browser/owner-minimum-effort-first-input.spec.ts` — real Chromium, local loopback Postgres only (same safety guard as the other owner browser specs), screenshots in `docs/opsiq/evidence/owner-minimum-effort-input/`.

- Desktop 1440: owner empty state → My Business; four visible fields; optional detail collapsed; no category wall; default period "Last month"; partial entry names the missing fact; fixed-only, variable-only and known-zero become eligible; invalid number is an inline error; fast double click creates exactly one snapshot and a diagnosis and lands on Money; sidebar → Money for a no-data business shows the same quick start with the full form secondary.
- Mobile 390 (touch, 2× DPR): no horizontal scroll at any step; all four inputs inside the viewport, single column, stacked; labels ≥ 12 px; period radios usable; provisional note, inline error and partial feedback do not overflow; optional disclosure usable; CTA fully visible; full journey completes without zoom.

Final-amendment additions to the browser spec: the new cash copy is asserted on My Business, Money (quick and full-detail form) and Guided setup at both widths; Guided setup (desktop 1440 and mobile 390) is exercised blank → partial (revenue+cash, cost+cash, bank-only all blocked) → known-zero cash → first result, and the database shows one Finance snapshot, the bank balance in Cashflow, and `cash_on_hand` unchanged by the bank figure.
