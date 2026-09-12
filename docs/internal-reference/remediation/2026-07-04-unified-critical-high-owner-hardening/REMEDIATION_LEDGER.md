# Unified Remediation Ledger

Imports every hostile-audit finding (42) + owner-hardening gaps (14) = 56 rows. See EVIDENCE_LEDGER.json for the machine-readable per-finding {source, severity, unified_status, evidence}.

## Closed with DB-backed proof on this unified branch
| ID | Source | Proof |
|----|--------|-------|
| SEC-01 | audit | sec-01-resolve-server-role 7/7 |
| SEC-02 | audit | sec-02-operator-cross-tenant-write.db 5/5 |
| SEC-04 / GAP-TEN-01 | audit/hardening | sec-04-db-tenant-backstop.db 4/4 (117-model backstop; hardening's narrower UsageEvent variant subsumed) |
| IDEM-01 | audit | idem-01-durable-idempotency.db 3/3 (+223 svc) |
| AUDIT-01 (operator+decision) | audit | audit-01-atomic-audit.db 2/2; dec-01 audit atomic |
| GAP-AUDIT-01 (blocked-decision) | hardening | reimplemented atomic + drift fix |
| GAP-AUDIT-02 (addItems) | hardening | audit-02-additems-atomic.db 2/2 |
| OUT-02 | audit | out-01-02-outcome-reeval.db 3/3 |
| BILL-01 | audit | bill-01-server-side-tier.db 3/3 |
| DEC-01 | audit | dec-01-reaccept.db 2/2 |
| GAME-01 | audit | game-01-proof-freshness 3/3 |
| GAP-OVR-01 / APPR-02 | hardening | ported operator-override.db (durable OverrideRecord) |
| GAP-TEN-03 | hardening | ported billing-route.test |
| GAP-EVIDENCE-DRIFT-01 | hardening | ported evidence-repair.db |
| TEST-02 | audit | route-scanner 4/4 + phase-i10 5/5, blocking |
| UI-02 | audit | /decisions → real inbox |

## Partial / decision-required / external-blocked
| ID | Status | Doc |
|----|--------|-----|
| OUT-01 | FIXED_PENDING_TEST (labeled + schema-drift fixed) | — |
| UI-01 | FIXED_PENDING_TEST (cookie fix; browser E2E external-blocked) | UI_E2E_PROOF_OR_BLOCKER_REPORT |
| AUDIT-01 (lifecycle paths), CONC-01 (reject/outcome-verify) | IN_PROGRESS | — |
| DEC-EVID-01 | PARTIALLY_CLOSED (canonical decision made; bundle wiring OPEN) | DEC_EVID_01 |
| DEC-TEN-01 / SCHEMA-01/03 / CM-TEN-02 | BLOCKED_OWNER_DECISION_REQUIRED (migration) | DEC_TEN_01 |
| DEC-BILL-01/02 | NOT_STARTED (public-SaaS blocker) | DEC_BILL_01_02 |
| DEC-PII-01 | BLOCKED_OWNER_DECISION_REQUIRED | DEC_PII_01 |
| CM-SEC-02 / WRAP-01 | OPEN (must itemize) | CM_SEC_02 |
| UI-E2E | UI_E2E_UNPROVEN | UI_E2E_PROOF_OR_BLOCKER_REPORT |

## Remaining OPEN HIGH (tracked, not deferred-as-low-risk)
APPR-01, REEVAL-01, SHOCK-01, EVID-01, AI-01, AI-02, WEBHOOK-01, SCHEMA-02, UI-03, TEST-01. Plus MEDIUM/LOW per EVIDENCE_LEDGER.json.
