# Deferred / Broad Gaps (PASS 37)

## Delivered
A read-only, OWNER-gated `GET /api/owner/recovery-status` that projects the proven
PASS 32 survival planner + PASS 33 recovery milestone machine into a governed,
fail-closed owner summary, surfaced as a **collapsed, low-load** "Recovery status"
section in `/owner/cockpit`. No new recovery logic, no mutation, no fabricated money,
no guaranteed recovery.

## Deferred beyond PASS 37
1. **Persisted PASS 33 milestone outcomes.** The read path passes no milestone
   outcomes (none are persisted yet), so it conservatively reports crisis/in-progress
   with gates BLOCKED and never claims stabilization/thrive from unverified data. A
   future pass could persist governed recovery-milestone outcomes (executed +
   evidence + reassessment) so the read path can honestly show proven progress —
   still evidence-gated, still owner-approved.
2. **Actionable recovery from the cockpit.** The section is read-only; acting on a
   recovery step is done via the existing top-action bridge. Wiring recovery
   milestones directly to `applyProcessExecutionAction` (with the PASS 33 no-skip /
   evidence / reassessment gates) is a later pass.
3. **Richer crisis derivation.** The conservative signal→pressure mapping uses a
   small set of now-view signals (cash / quality / operational / workload). Adding
   customer / staff / legal-tender derivation is a follow-up; today those default to
   NONE (no fabrication).
4. **Per-business scoping.** Linked tasks are workspace-scoped (the persisted task
   layer carries no businessId); per-business filtering is deferred.

## Explicitly out of scope (frozen — not built, not implied)
Public SaaS, billing, Product Hunt / launch readiness, live integrations/connectors,
Local Mode, enterprise/compliance, autonomous browsing/external action, LLM/NLP,
private owner shadow pilot, marketing/landing/pricing.

## Honest limitation
The DB test proves the real read path + workspace isolation + clean=NONE +
no-fabrication + fail-closed. The full crisis→stabilization/thrive/regression/
unrecoverable projection matrix is proven by the pure unit suite (deterministic), not
re-seeded through the heavy live-signal pipeline in the DB test — this is an explicit,
honest split, not a coverage gap.
