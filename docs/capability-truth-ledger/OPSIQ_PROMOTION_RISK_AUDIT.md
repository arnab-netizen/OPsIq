# OpsIQ — Promotion Risk Audit

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

The specific ways OpsIQ could be **over-promoted**, ranked by risk, with the
mitigation. "Risk" = likelihood a well-meaning demo/marketing statement crosses
from true into false.

| Risk | Over-promotion pattern | Severity | Mitigation |
|------|------------------------|----------|------------|
| R1 | Presenting synthetic simulations as real customer outcomes | **Critical** | Every artifact labels data synthetic; demo guide forces the "synthetic, no real business" line. |
| R2 | Saying "AI-powered" / "AI understands your business" | **Critical** | No live LLM path (evidence in ledger). Use "deterministic governed engine". |
| R3 | Implying autonomous action ("OpsIQ handles it for you") | **Critical** | Restrictions doc + forbidden claims #7–#12; always state human-in-the-loop. |
| R4 | Quoting money/ROI/time-saved/win-probability | **Critical** | Forbidden claims #2, #4, #5; no such number is computed. |
| R5 | "Production-ready / owners are using it" | **High** | 0/35 capabilities are owner-visible UI; no live deployment. Forbidden #16, #17. |
| R6 | "Every capability is continuously tested" | **High** | 10 DB sims unwired from required lane; 4 modules unit-only. Forbidden #19. |
| R7 | "Guarantees survival/recovery/success" | **High** | Engines refuse guarantees; forbidden #3. |
| R8 | "Integrates with your bank/POS/CRM" | **High** | No connectors wired. Forbidden #18. |
| R9 | "Manages staff / gives legal advice" | **High** | compliance-boundary + training-only routing. Forbidden #10, #11. |
| R10 | Over-claiming completeness of fraud/gaming detection | **Medium** | Anti-gaming screens known patterns only. Forbidden #15. |
| R11 | Implying the recovery/growth engine will scale a business | **Medium** | Scale-before-validation blocked everywhere. Forbidden #20. |
| R12 | Presenting backend proof as an owner product | **Medium** | Positioning statement fixes OpsIQ as a governed engine, backend-proven. |

## The single highest-leverage control
Before ANY external statement, run OPSIQ_CLAIMS_REVIEW_CHECKLIST.md. If a claim
is not on the ALLOWED list and cannot cite repo evidence, it is FORBIDDEN by
default — mark it `CLAIM_RESTRICTED` and stop.

## Residual risk accepted
Even truthful "demonstrated in tests and CI" claims can be misheard as real-world
results. The demo guide's mandatory spoken disclaimers exist specifically to
close that gap; they are not optional.
