# AUDIT-01 — High-Risk Mutation Audit Path Enumeration

Classification of governed mutation paths and their audit durability on the unified branch.

| Path | Class | Atomic/fail-closed? | Evidence |
|------|-------|---------------------|----------|
| operator updateItem | HIGH_RISK_MUST_AUDIT_ATOMIC | YES (tx) | audit-01-atomic-audit.db |
| operator applyOverride | HIGH_RISK | YES (tx) | audit-01-atomic-audit.db |
| operator addItems | HIGH_RISK | YES (tx) | audit-02-additems-atomic.db |
| operator addBlockedDecision | HIGH_RISK | YES (tx) | GAP-AUDIT-01 commit |
| decision acceptDecision | HIGH_RISK | YES (tx, guarded updateMany) | dec-01-reaccept.db |
| operator override (recordOperatorOverride) | HIGH_RISK | YES (tx, durable OverrideRecord) | operator-override.db (ported) |
| shock event createShockEvent | HIGH_RISK | YES (tx) | shock-01-persist.db |
| ClientAccount/LeadRecord create | MEDIUM (post-commit awaited) | audit awaited post-commit (not swallowed) | dec-ten-01 (create succeeds + audited) |
| decision rejectDecision | HIGH_RISK | **post-commit, awaited (not atomic)** — OPEN | tracked |
| decision-lifecycle transitionDecisionState | HIGH_RISK | **post-commit, .catch swallow** — OPEN | tracked |
| approveOutcomeVerification | HIGH_RISK | **post-commit, not guarded** — OPEN (CONC-01) | tracked |
| budget/finance recordSpendEntry, owner-finance action | MEDIUM | post-commit awaited | acceptable-for-pilot |

## Remaining OPEN (still post-commit / swallowed)
- `rejectDecision`, `transitionDecisionState`, `approveOutcomeVerification`. The transactional
  `emitAuditEvent(tx)` capability + guarded-updateMany pattern are established; converting these three
  is the remaining work. They are lower-frequency than the accept/complete paths already closed.

**Status: AUDIT-01 IN_PROGRESS — the highest-frequency governed writes (operator create/update/override,
decision accept, shock, blocked-decision) are atomic/proven; 3 lower-frequency transition paths remain
post-commit and are tracked. Not a hard pilot blocker (audit failure surfaces as a request error on the
awaited ones), but not fully CLOSED.**
