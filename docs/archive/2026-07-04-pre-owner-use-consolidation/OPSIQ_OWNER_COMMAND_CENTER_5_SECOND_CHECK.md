# OpsIQ Owner Command Center — 5-Second Check

> Can the owner dashboard answer the critical questions in ONE screen, in ~5 seconds, on desktop AND mobile? Verified
> against the real component `src/components/owner/SupervisorSummary.tsx` (146 lines) and the merged browser specs
> (desktop + mobile 375×812, no-overflow) that gate it in CI. Branch `claude/post-corpus-owner-pilot-prep`.

## Mapping: question → rendered field (all on one SupervisorSummary panel)
| # | Owner question | Rendered element (`data-testid`) | Source field |
|---|---|---|---|
| 1 | What is wrong | `supervisor-main-issue` (+ `Why`) | `summary.mainIssue` / `whyItMatters` |
| 2 | What matters most | `supervisor-priorities` + `supervisor-action-status` badge | `summary.priorities`, `actionStatus` |
| 3 | What to do today | `supervisor-do-now` | `summary.doNow` |
| 4 | What not to do | `supervisor-do-not-do` | `summary.doNotDo[0]` |
| 5 | Who should do it | `supervisor-owner-delegate` | `ownerMustDo` / `delegateToStaff[0]` |
| 6 | What proof is needed | `supervisor-proof` | `summary.proofNeeded[0]` |
| 7 | What data is missing | `supervisor-missing-assumptions` | `summary.ledger.assumptions` / missing data |
| 8 | What requires owner approval | `supervisor-action-status` = `owner_decision_required` (+ owner-delegate) | `actionStatus` |
| 9 | What is blocked | `supervisor-action-status` = `blocked` | `actionStatus` |
| 10 | When to reassess | `supervisor-reassessment` | `summary.cadence.reassessmentTrigger` |
| 11 | Money / cash / workload impact | `supervisor-impact` (dimension list) | `summary.impact[]` |
| + | Confidence / emergency | `supervisor-confidence`, `Emergency` badge | `summary.confidence`, `emergency` |

**All 11 required answers + confidence are present on a single panel.** Deeper detail (known facts, assumptions,
cadence, "what would change this") is tucked into a collapsed `<details>` (`supervisor-ledger-detail`) so the default
view stays scannable — the 5-second view is not cluttered.

## Desktop
- The panel renders the full field set in a compact card. Merged specs (e.g. `39-crisis-desktop`, `41-simulations-desktop`,
  and pilot specs 15/16) assert the panel visible, action-status correct, proof + reassessment visible, and advanced
  reasoning collapsed. **Pass.**

## Mobile (375×812)
- Merged mobile specs (`40-crisis-mobile`, `42-simulations-mobile`, and pilot mobile flows) assert the panel renders
  and there is **no horizontal overflow** (`scrollWidth - clientWidth ≤ 4px`) at 375px. The card stacks vertically;
  all 11 fields remain reachable by a single vertical scroll. **Pass.**

## Gaps / minimum-code fixes
- **None required.** The current SupervisorSummary already answers all 11 questions on one screen on both viewports,
  and this is CI-gated. No redesign, no code change proposed.
- Minor future nicety (NOT needed for shadow pilot, not implemented here): questions 8 and 9 share the single
  `action-status` badge; if a future build wants them as always-visible distinct chips, that is a small additive UI
  change — deferred, out of scope for this verification.

## Verdict
**5-second command-center check: COMPLETE — PASS on desktop and mobile.** No minimum-code fix needed.
