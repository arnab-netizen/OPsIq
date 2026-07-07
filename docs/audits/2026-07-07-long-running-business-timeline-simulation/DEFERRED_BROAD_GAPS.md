# Deferred / Broad Gaps — Long-Running Business Timeline (PASS 47)

Recorded, not hidden. None block the classification.

## Deferred (intentional, scoped out)
1. **Persisted timeline state machine.** The 8-week evolution is driven in-memory by the pure driver; it is
   not persisted as a durable per-business timeline entity. This pass proves the decisions and the governed
   side-effects (memory rules, intake, fact-review, proof, audit) against real Postgres, which is sufficient
   for the coherence/memory/safety proof. A durable `BusinessTimeline` aggregate is a larger schema change,
   deferred.
2. **Full delegated-task FSM completion in the timeline.** Evidence-gating is proven with a real
   `ProofRequirement` + `Proof` + `submitProof`/`reviewProof` + `evaluateProofClearance`. Driving the whole
   `DelegatedTask` ASSIGNED→APPROVED_COMPLETE FSM per timeline event is heavier and is covered by existing
   execution DB suites; not duplicated here.
3. **Second archetype (SaaS-style internal business).** The driver is archetype-parameterised
   (`initialTimelineState(archetype)`), so a bounded SaaS timeline is a data-only addition. Left as a future
   pass to keep this one focused on the laundry archetype.

## Explicitly NOT done (standing loop boundaries — correct to exclude)
- No public SaaS, billing, Product Hunt, launch, paid promotion.
- No live integrations, Local Mode, LLM/NLP, autonomous browsing, or autonomous external action.
- No private owner data used; placeholders only, no PII.
- No fabricated money/ROI/profit/recovery/win-probability/owner time-saving.
- No public-readiness claim.

## Broad gaps noted for future passes
- Cross-module coherence under conflict (finance vs opportunity, recovery vs growth, public signal vs
  internal evidence) — this is exactly **PASS 48**, which follows.
- Owner cockpit live rendering of the timeline (a read surface) — out of scope for this simulation pass.
