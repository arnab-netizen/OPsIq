# Pilot-Blocker Ledger (continuation)

| Blocker | Status | Proof / Doc |
|---------|--------|-------------|
| DEC-TEN-01 / SCHEMA-01/03 (ClientAccount/LeadRecord anchor) | **CLOSED_PROVEN** (nullable transitional + service fail-closed; backfill-to-NOT-NULL = owner step) | dec-ten-01-client-lead-anchor.db 2/2; DEC_TEN_01_FINAL |
| SHOCK-01 (shock persistence) | **CLOSED_PROVEN** | shock-01-persist.db 1/1 |
| REEVAL-01 (adaptive triggers) | **MOSTLY_CLOSED** (7/9 wired incl new kpi_deterioration; 2 low-freq OPEN) | REEVAL_SHOCK_EVIDENCE_CLOSURE_REPORT |
| GAP-AUDIT-01 / GAP-AUDIT-02 (blocked-decision/addItems atomic) | **CLOSED_PROVEN** | audit-02-additems-atomic.db 2/2 |
| AUDIT-01 remaining (reject/lifecycle/outcome-verify) | **IN_PROGRESS** (3 low-freq post-commit paths OPEN) | AUDIT_01_REMAINING_PATHS_REPORT |
| DEC-EVID-01 (bundle wiring) | **OPEN** (decision recorded; wiring not implemented) | DEC_EVID_01_BUNDLE_WIRING_REPORT |
| EVID-01 (tamper/relevance precheck) | **PARTIALLY_CLOSED** (drift+freshness closed; precheck OPEN) | REEVAL_SHOCK_EVIDENCE_CLOSURE_REPORT |
| WEBHOOK-01 | **NOT_PILOT_BLOCKING** (signature/dedup safe); fire-and-forget = PUBLIC_SAAS blocker | WEBHOOK_01_REPORT |
| CM-SEC-02 (32 findings) | **OPEN** (must itemize; register not on this base) | CM_SEC_02_ERROR_FINDINGS_REVIEW |
| DEC-BILL-01/02 | **NOT_STARTED — PUBLIC_SAAS blocker** | DEC_BILL doc |
| DEC-PII-01 | **BLOCKED_OWNER_DECISION — PUBLIC_SAAS blocker** | DEC_PII doc |
| UI / browser E2E | **UI_E2E_UNPROVEN — external-blocked** | UI_E2E_PROOF_OR_BLOCKER_REPORT |
