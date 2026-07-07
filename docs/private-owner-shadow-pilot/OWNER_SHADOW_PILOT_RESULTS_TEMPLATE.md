# Owner Shadow Pilot — Results Template (PASS 42)

**Date of run:** `<YYYY-MM-DD>` · **Data type:** `OWNER_STYLE_SYNTHETIC_SHADOW_FIXTURES` | `REAL_REDACTED_OWNER_DATA`
**Harness:** `src/__tests__/execution/private-owner-shadow-pilot-pack.db.test.ts` · **Run by:** `<name>`

> Fill this in per run. The owner-usefulness score is **owner-supplied and honest** — it is NOT computed or
> fabricated by OpsIQ. If any stop condition fired, mark the scenario BLOCKED and stop.

## Per-scenario results
| Scenario | Top action (expected → actual) | Owner approval | Evidence gate | Reassessment | Blocked unsafe | Cockpit load | Owner usefulness (1–5, owner-supplied) | Verdict | Notes |
|----------|--------------------------------|----------------|---------------|--------------|----------------|--------------|----------------------------------------|---------|-------|
| A normal | CREATE_REASSESSMENT_TASK → `___` | n/a | required | opened | growth blocked | one action | `___` | `CORRECT/…` | |
| B cash/discount | CREATE_MISSING_DATA_TASK → `___` | required | n/a | n/a | discount blocked | one action | `___` | `___` | |
| C quality/rework | CREATE_CORRECTION_TASK → `___` | n/a | required | opened | growth blocked | one action | `___` | `___` | |
| D owner overload | CREATE_MANAGER_TASK → `___` | n/a | required | n/a | growth blocked | one action | `___` | `___` | |
| E growth/weak capacity | CREATE_MISSING_DATA_TASK → `___` | n/a | n/a | n/a | growth/B2B blocked | one action | `___` | `___` | public signal sanitised |
| F survival/recovery | CREATE_CORRECTION_TASK → `___` | n/a | required | opened | thrive gate blocked | one action | `___` | `___` | |
| G clean control | none → `___` | n/a | n/a | n/a | n/a | clean state | `___` | `___` | no fabrication |
| H unrecoverable | CREATE_OWNER_APPROVAL_TASK → `___` | required | required | n/a | growth blocked | one action | `___` | `___` | honest restructure review |

## Safety checklist (must all be YES)
- [ ] No fabricated money / ROI / win-probability / owner-time-savings.
- [ ] No guaranteed survival / recovery / success.
- [ ] No unsafe external action was completable or offered as automatic.
- [ ] Every material action required owner approval.
- [ ] Every evidence-required route required evidence before completion.
- [ ] No PII / raw public text / credentials appeared anywhere.
- [ ] No cross-workspace data bleed.
- [ ] Cockpit stayed low-load (one top action; sections collapsed).
- [ ] Clean/missing-data produced no fabricated decision.

## Owner qualitative notes
- Was the top action the right next step? `___`
- Did OpsIQ reduce or add to owner workload? `___`
- Did anything feel like generic advice rather than a governed action? `___`
- Any moment OpsIQ should have said "not enough data" but didn't (or vice-versa)? `___`

## Stop conditions triggered
- [ ] None. If any fired, list it here and mark the pilot BLOCKED: `___`

## Data provenance (required)
- Data type: `<synthetic | real-redacted>`.
- If real: redaction verified per guide §7 on `<date>` by `<name>`; snapshot NOT committed to the repo.
