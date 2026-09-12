# Shadow Pilot — Stop Conditions (PASS 41)

**Date:** 2026-07-07

If any stop condition occurs, the pilot is **BLOCKED** until the underlying defect is fixed and re-proven.
A stop condition is not a "note for later" — it halts the pilot immediately.

| # | Stop condition | Why it halts the pilot | Detection surface |
|---|----------------|------------------------|-------------------|
| 1 | Sensitive data leak | any PII / raw customer text / credential visible in a response or the cockpit | redaction check + PASS 39 rawTextHidden/piiStripped refines + tests |
| 2 | Cross-workspace data leak | data from workspace B appears when acting as workspace A | workspace-scoped reads + `owner-*-read.db.test.ts` isolation assertions |
| 3 | Unsafe action exposed | an external/unsafe action becomes completable or is offered as automatic | `BLOCK_UNSAFE_ACTION` / `NON_COMPLETABLE_ROUTES` regression |
| 4 | Fake financial / recovery claim | fabricated money/ROI/win-probability or guaranteed recovery/survival/success | recovery + public-signal Zod refines + no-overload forbidden-copy tests |
| 5 | Owner cockpit overload | >1 top action, >3 reason bullets, >2 primary, >3 secondary, or a default-expanded section | PASS 40 no-overload assertions |
| 6 | Wrong top action in a severe crisis | in a survival case the top action is not the survival/cash-protection action | scenario F expectation vs actual |
| 7 | Hallucinated data | OpsIQ invents a value/decision not present in the supplied snapshot | clean/missing-data control (scenario G) → must be NONE / missing-data |
| 8 | CI / test failure | any required gate (tsc, governance, lint ratchet, LANE_B DB sim, build) fails | CI |
| 9 | Redaction failure | fixture/data fails the redaction verification checklist | `SHADOW_PILOT_DATA_REDACTION_GUIDE.md` §7 |
| 10 | Unapproved live integration attempt | any code path attempts a live external fetch/connector | frozen-scope guard; no live IO in read services |
| 11 | Any attempt to contact customer / vendor / staff | any outreach is performed or auto-offered | scope boundary; no outreach path exists |
| 12 | Any attempt to submit tender / spend / discount / contract | any money-moving or contractual external action | `BLOCK_UNSAFE_ACTION`; no such action path exists |

## On a stop condition
1. Halt the pilot for that scenario (verdict `BLOCKED`).
2. Record the condition + evidence in the pilot results and the evaluation matrix.
3. Do not proceed to further scenarios that depend on the same defect until fixed.
4. Fixing requires a source change + re-proof (its own governed pass), not a doc edit.
