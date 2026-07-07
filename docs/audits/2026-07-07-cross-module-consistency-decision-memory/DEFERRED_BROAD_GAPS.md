# Deferred / Broad Gaps — Cross-Module Consistency + Decision Memory (PASS 48)

Recorded, not hidden. None block the classification.

## Deferred (intentional, scoped out)
1. **Full DB-persisted recommendation-promotion path** (`enforceDoNotRepeatForPromotion`). This pass proves
   decision memory via the persisted `ownerDoNotRepeatRule` store + `evaluateDoNotRepeat` + audit event.
   Driving the whole consulting `Recommendation`→`Finding`→`Engagement` promotion graph is heavier and is
   already covered by existing owner-mode gate suites; not duplicated here.
2. **Live cockpit rendering of the coherence view.** The single-top-action + grouped-secondaries coherence
   is proven at the domain level (`explainOwnerCockpitDecision`). Wiring an owner-page render test is a UI
   surface, out of scope for this consistency pass.
3. **DB-backed cash-safety gate (`enforceOwnerActionGates` cash path).** Finance-overrides-growth is proven
   through the survival ladder + progression engine + `evaluateCashSafetyGate`'s callers. The full
   `ownerFinanceCycle`/`ownerCashflowCycle` persistence path is exercised by existing owner-finance suites.

## Explicitly NOT done (standing loop boundaries — correct to exclude)
- No public SaaS, billing, Product Hunt, launch, paid promotion.
- No live integrations, Local Mode, LLM/NLP, autonomous browsing, or autonomous external action.
- No private owner data; synthetic placeholders only, no PII.
- No fabricated money/ROI/profit/win-probability.
- No public-readiness claim.

## Broad gaps noted for future passes
- A durable per-business "decision journal" aggregate that persists the whole conflict-resolution history
  (this pass proves the rules and the memory store; a persisted timeline aggregate is a larger schema change).
- Cross-archetype coherence sweep (housekeeping / property / franchise / saas / tender / b2b) — the engines
  are archetype-parameterised; a broader sweep is a data-only future addition.
