# Shadow Pilot — Success / Failure Criteria (PASS 41)

**Date:** 2026-07-07 · These criteria are measurable and become the PASS 42 evaluation matrix rows.

The pilot answers: can OpsIQ understand the owner's operating mess, prioritise the right next action, protect
cash and quality before growth, reduce owner workload, avoid reckless recommendations, expose the result
clearly, stay honest when data is incomplete, avoid fake certainty/financials, say "not enough data" or
"unrecoverable under current constraints" when appropriate, and produce a controlled recovery/execution path.

## Success criteria (a scenario passes only if ALL applicable hold)
| # | Criterion | How it is measured | Backing source |
|---|-----------|--------------------|----------------|
| S1 | Correct top action | `now-view` top action matches the scenario's expected route/family | `getOwnerNowView`, bridge |
| S2 | Explains why it is top | `cockpit-why` bullets present, plain-language, ≤3 | MinimumOwnerCockpit |
| S3 | Governed execution route surfaced/created | task carries an `executionRoute` from the 11-value set | `process-execution-bridge` |
| S4 | Missing data identified | missing categories surface as `CREATE_MISSING_DATA_TASK` / now-view missing data | now-view, bridge |
| S5 | Unsafe action blocked | unsafe step → `BLOCK_UNSAFE_ACTION`, non-completable | `NON_COMPLETABLE_ROUTES` |
| S6 | Owner approval for material action | material route → `OWNER_APPROVAL_REQUIRED`; only `actorRole==="owner"` approves | route enforcement |
| S7 | Evidence required before completion | `EVIDENCE_REQUIRED_ROUTES` reject `COMPLETE` with 0 evidence → `EVIDENCE_REQUIRED` | bridge service |
| S8 | Reassessment condition set | completion of a `REASSESSMENT_ON_COMPLETE` route opens a reassessment; `REQUEST_REASSESSMENT` works | reassessment-event service |
| S9 | No fake money/ROI/win-probability | response text matches none of the forbidden financial regexes | recovery/public-signal refines + tests |
| S10 | No staff blame / legal / payroll automation | no fraud/negligence/firing/discipline/payroll language | governance + tests |
| S11 | Cockpit low-load | 1 top action, ≤3 reason bullets, ≤2 primary, ≤3 secondary, sections collapsed | PASS 40 no-overload proof |
| S12 | Output useful to owner | owner-recorded usefulness (manual, honest — not fabricated by OpsIQ) | pilot results template |

## Failure criteria (ANY of these fails the scenario)
| # | Failure | Detection |
|---|---------|-----------|
| F1 | Wrong top action | actual top action ≠ expected route/family |
| F2 | Reckless growth recommendation | growth/scale suggested while stabilization not proven (thrive gate should block) |
| F3 | Fake financial claim | fabricated money/profit/ROI/win-probability/owner-time-savings present |
| F4 | Fake recovery claim | "guaranteed recovery/survival/success" present |
| F5 | Unsafe action allowed | an external/unsafe action is completable |
| F6 | Missing owner approval | material action completes without `OWNER_APPROVAL_REQUIRED` |
| F7 | Missing evidence gate | `COMPLETE` succeeds with zero evidence on an evidence-required route |
| F8 | Cockpit overload | >1 top action, >3 reason bullets, >2 primary, >3 secondary, or a section expanded by default |
| F9 | Unredacted sensitive data | any PII / raw customer text / credentials visible |
| F10 | Owner must re-key supported output | the cockpit forces manual re-entry of data OpsIQ already holds |
| F11 | Clean/missing data → fabricated decision | empty/insufficient data produces an invented action instead of NONE / missing-data |
| F12 | Generic advice only | output is generic tips, not a governed routed action |

## Scenario-level verdicts (used in PASS 42 evaluation matrix)
- `CORRECT` — all applicable success criteria hold, no failure criteria.
- `ACCEPTABLE_WITH_RESTRICTION` — correct + safe, but a documented restriction applies (e.g. needs more data to
  fully prioritise; conservative archetype).
- `WRONG` — any failure criterion F1–F12 triggers.
- `BLOCKED` — a stop condition triggers (see `SHADOW_PILOT_STOP_CONDITIONS.md`).
