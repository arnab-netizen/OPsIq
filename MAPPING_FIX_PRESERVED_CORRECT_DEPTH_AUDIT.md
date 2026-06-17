# MAPPING FIX — PHASE 4 PRESERVED CORRECT REGRESSION DEPTH AUDIT

**Date:** 2026-06-17  
**Source:** ALL21_POST_FIX_TRACE.json (final committed code)

For each preserved-correct case: winner, margin of victory, whether new patterns (9/10/11) introduced competing candidates, fragility assessment.

---

| Case | GT / Winner | WinConf | Runner-up | Margin | New pattern fired? | Fragility |
|---|---|---|---|---|---|---|
| BLND-007 | go_to_market_misalignment | 38 | trust_quality_crisis | **4** | NO | NARROW (pre-existing GTM/TQC/DFM market-retention cluster; not caused by fix) |
| RW-018 | unit_economics_breakdown | 50 | operational_bottleneck | 5 | NO | LOW (UEB/OB co-rank from shared str-10 financial+op pattern; pre-existing) |
| RW-020 | unit_economics_breakdown | 50 | operational_bottleneck | 5 | NO | LOW (same shared-pattern co-rank) |
| PD-011 | unit_economics_breakdown | 50 | operational_bottleneck | 5 | NO | LOW (same) |
| PD-013 | operational_bottleneck | 50 | demand_forecasting_mismatch | 5 | YES (Pattern 11, str3) | LOW — Pattern 11 REINFORCES the correct OB answer |
| PD-015 | unit_economics_breakdown | 50 | operational_bottleneck | 5 | NO | LOW (same shared-pattern co-rank) |
| PD-017 | demand_forecasting_mismatch | 50 | operational_bottleneck | 5 | YES (Pattern 11, str2) | LOW — DFM still won; Pattern 11 only made OB the runner-up |
| SYN-011 | trust_quality_crisis | 65 | customer_retention_erosion | 19 | YES (Pattern 11, str2) | NONE — robust margin |

## ANALYSIS

### Did new patterns nearly cause a regression?
**NO.** New Pattern 11 (`operational_efficiency-bottleneck-pattern`) fired on 3 preserved-correct cases (PD-013, PD-017, SYN-011):
- **PD-013 (OB correct):** Pattern 11 *reinforced* the correct answer. Beneficial.
- **PD-017 (DFM correct):** Pattern 11 added OB as runner-up (margin 5). DFM still won. No regression, but it raised OB's competitiveness from "absent" to "runner-up".
- **SYN-011 (TQC correct):** Pattern 11 added a low-strength OB candidate; TQC won by 19. No effect.

Patterns 9 (pricing) and 10 (demand+financial) did NOT fire on any preserved-correct case — confirming their triggers are specific enough to avoid the 8 protected cases.

### Margin-narrowing assessment
- The 5-point UEB-vs-OB margins (RW-018/020, PD-011/015) are the **pre-existing structural co-ranking** of the shared `financial_health-operational_efficiency` pattern (both UEB and OB are in its potentialRootCauses). The mapping fix did **not** create these; they predate it.
- BLND-007's 4-point margin (GTM vs TQC) is likewise pre-existing and not touched by any new pattern.
- No preserved-correct margin was narrowed *by the mapping fix* to the point of fragility. The closest new-pattern interaction (PD-017, Pattern 11 raising OB to runner-up at margin 5) did not threaten the win.

## RISK REGISTER

| Risk | Severity | Note |
|---|---|---|
| Pattern 11 fires broadly (any operational_efficiency dim, validator ≥0.4) and adds OB candidates widely | LOW–MEDIUM | Currently never overtakes a correct winner, but increases OB prevalence as runner-up. Could threaten a future UEB/DFM case with a thin margin. Monitor. |
| BLND-007 margin = 4 (pre-existing) | LOW | Not introduced by fix; flagged for awareness only. |

## CONCLUSION

**No preserved-correct case regressed or became fragile due to the mapping fix.** Pattern 11's broad firing is the only watch-item: it raises OB to runner-up in several cases but never wins incorrectly. Recorded as a low–medium generalization risk (see PHASE 7).
