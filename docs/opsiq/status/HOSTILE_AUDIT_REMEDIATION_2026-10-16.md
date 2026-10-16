# Hostile production audit — remediation record (2026-10-16)

Audit verdict that triggered this work: `OWNER_BETA_BLOCKED_BY_P1` → `CB1_OWNER_001_READY=NO`, `CB1_EXPANSION_GATE=CLOSED`.
Starting SHA: `d641afc3a2222cd94663b77e7ee900ff40becfdb` (`origin/main`, clean tree). Branch: `claude/cool-goldberg-78h8yp`.

Status of this record: **engineering complete on the branch; NOT deployed; the production re-audit has NOT been run.**
Nothing here is evidence that any release-gate line passes in production. `CB1_OWNER_001_READY` stays `NO` until the
post-deployment focused re-audit (below) is run and passes.

Every defect was reproduced from the code path / a failing test before it was changed, and the auditor's severity and
root-cause guesses were re-derived. Where the auditor's reading did not hold, that is stated.

## Defect dispositions

| ID | Auditor | Reproduced? | Actual root cause | Severity (re-derived) | Owning layer | OBQ_REOPEN |
|----|---------|-------------|-------------------|-----------------------|--------------|------------|
| D1 stale Home action | P1 | Yes (code + DB test) | The returning-owner "Your next move" card only appended a caveat when the diagnosed snapshot was amended; it never asked whether the new read still supports the action. The canonical Home decision already treats a superseded snapshot as stale — only this card lacked it. | P1 | `owner-first-run/next-move` (service + card) | NO (see below) |
| D2 UNKNOWN scored as healthy | P1 | Yes (unit test: revenue UNKNOWN → raw risk 0 / opportunity 0 / health capped 75) | Scores are rule arithmetic over evidence present; with evidence UNKNOWN they still return numbers and every page printed them as scores. Cash UNKNOWN with everything else complete gave confidence 90 and would have counted as complete. | P1 | Presentation of finance (and sales/marketing/execution/cashflow/Home) scores; the numeric scores themselves are unchanged | NO (see below) |
| D9 partial leakage | P2 | Yes | `costLeakageRatioPct` sums only the ENTERED leakage components (a known subset — `sumPresent` is documented as "never a total") but was worded "…together are 5% of your sales" at 85/100 confidence. The metric name is a group total, so UNKNOWN components were silently treated as zero. | **Raised to P1** (violates the already-owned invariant "UNKNOWN is never zero"; is a release-gate line) | `domain/owner-finance` (metrics/opportunity rules/actions) | NO — owner-ratified (see below) |
| D3 invalid currency | P1 | Yes | `businessCreateSchema` accepted any 1–8 char string; 7 more snapshot schemas and 2 intake materialisation paths did the same; only first-run applied a (loose) regex. The dropdown was UI-only. | P1 | Generic write boundary (not OBQ) | NO |
| D4a profit/margin not shown | P1 | Yes | The engine derives profit/margin and the product tells the owner it "cannot calculate total profit or margin yet", but no owner surface ever displayed the result. No doc forbids showing it; the owner-facing promise implied it. | P1 (promise unfulfilled) | first read + Money page | NO |
| D4b Goals "0 period(s) with data" | P1 | Yes (5/6 new DB tests fail on `main`) | **Not the same defect as D4a.** Goals read only `owner_metric_snapshots` (founder-recovery results, written solely by the recovery route, with a stored `netProfit`). Finance snapshots live in `owner_financial_snapshots` and have no profit column. Nothing linked the two. | P1 | `owner-strategy/goal.service` | NO |

Not reproduced / reclassified:

- **Next-action consistency (P2):** one canonical policy exists — the owner-decision comparator. First read, Money's "local step"
  and Home's target are filters/presentations over it. On identical complete evidence all three agree in three scenarios
  (receivables-heavy, discount-leakage, thin-cash); this is now a contract test
  (`owner-spine/next-action-consistency.db.test.ts`). The audit's divergence is most plausibly caused by the stale card (D1) or by
  multi-period evidence (period scope, below). Not fixed beyond that because it did not reproduce; re-check in the re-audit.
- **End date before start date (P2):** all 8 snapshot schemas already refuse it (reproduced as rejected). Unprotected pairs were on
  vendor contracts, resource pools and ops workload/capacity snapshots — fixed. `growth/offers` has the same gap but the file has
  pre-existing lint errors that the ratchet blocks on, and it is off the first-owner journey: logged below, not changed.

## Contracts established

- **Score availability** (`domain/owner-spine/score-availability.ts`): WITHHELD when a critical input (revenue or any cost) is
  UNKNOWN or confidence is BLOCKED (<30) — no number is shown; PARTIAL when below HIGH (<85) or a conclusion was withheld
  (cash / a cost half UNKNOWN) — numbers shown with the explicit limitation, and a risk/opportunity of 0 is worded "None found so
  far", never "0/100"; FULL otherwise. Chosen from the existing tier contract ("BLOCKED: should not be acted upon") and the
  invariant UNKNOWN ≠ healthy — not for convenience. Explicit numeric 0 stays a known value. The server decides for Money; Cash flow,
  Sales, Marketing, Operations, Execution and Home apply the same function to the confidence/critical-gap data they already carry.
  *NO KNOWN RISK is not KNOWN LOW RISK.*
- **Cost leakage** is a lower bound while any component is UNKNOWN: "At least X%", names what is missing, confidence is scaled by
  coverage (0.5 + 0.5 × known/4 — a stated heuristic, not calibrated), and the same wording is applied at read time and in the finding
  card. All four entered (even 0) → plain total wording.
- **Next move validity** (`CURRENT | STALE | SUPERSEDED | NEEDS_REASSESSMENT`): only CURRENT may be presented as "Your next move".
  Changed evidence + no read on the new figures → NEEDS_REASSESSMENT; changed + read no longer raises the accepted finding →
  SUPERSEDED (the audited scenario); changed + still raised → STALE (decided on older numbers; re-confirm). The decision record is
  never touched (history kept). Finance decisions only.
- **Usable goal period** (`periodMetricValue`): a completed, current (un-amended) Finance snapshot in the goal currency whose net
  profit is DERIVABLE by the finance cost model (an explicit 0 cost counts; an UNKNOWN cost half does not). Recovery results fill only
  periods Finance lacks; a period is never counted twice; other-currency rows are counted as excluded, never converted.
- **Currency**: `domain/founder-recovery/currency.ts` is the single supported set (17 ISO codes = the union of the two lists that
  previously existed). Input is trimmed and upper-cased then must be a member; the service also refuses. UI dropdowns are built from it.
- **Confidence vocabulary** (`domain/owner-spine/confidence-vocabulary.ts`): High ≥85, Moderate ≥60, Low ≥30, Too low to rely on <30 —
  the pre-existing finance tier thresholds, now defined once. Findings, Money and the first read use the same words for the same number.
  The canonical owner decision keeps its own 75/50/25 levels (it scores the arbitration of a recommendation, a different quantity);
  this is a known remaining difference, not an equivalence claim.
- **Profit position**: KNOWN (amount + exact two-decimal margin; 25,000 / 80,000 = 31.25%) or UNKNOWN with the reason; never partial.
- **Period scope**: the Money page now states which period a reading is based on and that other periods are kept but not combined
  (the evidence-selection contract forbids merging); "still missing" is labelled for that period.
- **Relational validation**: part ≤ whole checks on Finance create, amend and the amended snapshot's merged values; each error names
  the field that is too large. UNKNOWN is never a contradiction. Only relationships the model defines as part-of-whole are checked
  (customers/repeat, total/overdue receivables and payables, rent+payroll+utilities/fixed costs, B2C+B2B/revenue); cost of goods vs
  variable costs is deliberately not checked (COGS is a gross-margin input, an explicit variableCosts is the profit total). An
  amendment is refused only for a contradiction it introduces, so records entered before the checks stay correctable.

## OBQ freeze determinations

None of the four reopen criteria (real-user defect, security, regulatory, controlled-beta evidence) is satisfied: the audit used a QA
workspace. OBQ is therefore **not reopened** by this work.

- D1 and D2 violate semantic invariants OBQ owns (stale evidence must not support a current conclusion; UNKNOWN must not read as safe).
  The owning layers are respectively the returning-owner next-move module and the *presentation* of scores; the canonical decision and
  the numeric scoring/OBQ stale-read contract were not modified.
- **D9 — owner-ratified:** `D9_SEVERITY=P1`, `D9_FIX=KEEP`, `OBQ_REOPEN=NO`. The change enforces the already-frozen invariant
  `UNKNOWN != 0`: the shared finance leakage metric could present a partial known sum as a complete group total. Correcting it to
  an explicit lower bound with missing-component disclosure and reduced confidence is contract-conformance, not OBQ feature
  expansion. The change is additive (coverage flag, finding wording/confidence, rationale text; no threshold, weight or persisted
  value changed) and is not to be broadened. Acceptance (all proven by tests in `owner-finance/leakage-partial.test.ts`): complete
  components keep the true aggregate, plain wording and normal confidence; partial components are a lower bound with the missing
  components named and confidence reduced; all UNKNOWN yields no aggregate and no finding; an explicit 0 stays a known zero.
  Differential proof that complete-data diagnoses do not change: five complete-data scenarios (healthy, leaky, loss, all-zeros,
  receivables-heavy) produce byte-identical metrics, findings, actions and scores on pristine `main` and on the branch.
- Whether `owner-first-run/next-move.*` is inside the OBQ freeze boundary remains for the owner to confirm; it was changed as a
  defect fix to a presentation/service module and `OBQ_REOPEN=NO` stands for D1.

## Existing QA residue — `QA Second Co (abc1)`

No data was touched. There is **no supported mechanism to correct a business currency**: `businessUpdateSchema`/`updateBusiness` have
no currency field, there is no admin route and no backfill script; the only governed operations are archive (`PATCH isActive:false`,
which would hide the business) and the SYSTEM_ADMIN read-only fixture listing. A correction would have to follow
`docs/opsiq-governance/PRODUCTION_FIXTURE_BACKFILL_PLAN.md` (explicit written owner authorization naming the row id, a gated one-time
script — never raw SQL, one audit event per row with previous/new value, single field, no deletes). Recommendation: **leave the
workspace intact** as regression evidence (this fix prevents new occurrences; reads of the existing row are unaffected, and Goals
already refuses to be created against it). Residue left as found: the business, five finance cycles, three snapshots, one accepted
decision, one goal, two strategy scenarios, one startup session.

## Logged out of scope (not changed)

- Startup Mode redesign; Sales/Operations empty-state feature creation; QBO, Paddle, billing, open beta, public acquisition, visual polish.
- `src/app/api/growth/offers/route.ts`: `validFrom`/`validUntil` has no end-after-start check; file has pre-existing `no-explicit-any`
  lint errors that the lint ratchet blocks on. Fix together with its lint cleanup.
- Canonical decision confidence thresholds (75/50/25) differ from the evidence-strength vocabulary (85/60/30).
- The older `/owner` landing page (`profile.overallHealthScore` etc.) and the Strategy page's "attractiveness/upside" scores still
  print raw numbers; the landing page already shows "not measured yet" for absent domains. Same score-availability rule not yet applied.
- Local test infrastructure: ungated `signup-control-character-name.db.test.ts` requires a database even in a non-DB run.

## Required before any gate line can be claimed

Deploy, then run the focused hostile re-audit against the same scenarios and record:
`D1_STALE_HOME_ACTION`, `D2_UNKNOWN_SCORING`, `D3_CURRENCY_VALIDATION`, `D4_PROFIT_GOALS_PATH`, `D9_PARTIAL_LEAKAGE_SEMANTICS`
(all must PASS, no new P0/P1), then re-check confidence consistency, next-action consistency, cross-field validation, period
semantics and owner-visible backend language. `CB1_OWNER_001_READY` and `OWNER_BETA_READY*` are decided only by that run.
