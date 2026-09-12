# Shadow Pilot — Scope and Boundaries (PASS 41)

**Date:** 2026-07-07

## What the shadow pilot IS
A **non-live**, controlled evaluation of whether OpsIQ helps the owner make better *governed* decisions using
real business context, run over **anonymized, manually-supplied or fixture-controlled** data snapshots through
the canonical `/owner/cockpit` path. OpsIQ **routes, gates, and verifies**; the owner remains the decision-maker;
the actual business implementation stays **manual and owner-controlled**.

## Hard boundaries (all enforced by existing source, not just policy)
1. **Non-live.** No live integrations, no CRM/email/bank ingestion, no real-time feeds. Endpoints read only
   already-persisted, workspace-scoped records (`getOwnerNowView`, `getOwnerRecoveryStatus`,
   `getOwnerPublicSignals`, `getPersistedProcessTasks`).
2. **No external actions.** The system never contacts a customer, submits a tender, spends, discounts, signs,
   or moves money. Unsafe routes surface as `BLOCK_UNSAFE_ACTION` / `MONITOR_ONLY` and are non-completable
   (`NON_COMPLETABLE_ROUTES` / `NON_ACTIONABLE_ROUTES` in `process-execution-bridge.service.ts`).
3. **No customer contact.** No outreach of any kind is performed or offered as an automated action.
4. **No staff discipline / payroll / legal action.** No firing, disciplining, payroll, or legal automation;
   no negligence/fraud/blame language is produced.
5. **No money movement.** No spend/discount/contract is executed by OpsIQ.
6. **No tender submission.** Opportunities are surfaced read-only; submission remains blocked.
7. **No live integrations.** No connectors, no LLM/NLP, no autonomous browsing.
8. **No guaranteed outcome.** Recovery status carries a mandatory "Recovery is not guaranteed" statement;
   no guaranteed survival/recovery/success/profit/ROI/win-probability is produced.
9. **No legal/financial/professional advice claim.** OpsIQ produces governed operational routing, not advice.
10. **Owner remains decision-maker.** Material actions require `OWNER_APPROVAL_REQUIRED` and are authorized by
    verified capability (`actorRole === "owner"` derived from `verifiedCapabilities`, never from the client).
11. **OpsIQ routes / gates / verifies.** Every recommendation resolves to exactly one of: governed task,
    owner approval, missing-data request, evidence request, reassessment, monitor-only reason, blocked unsafe
    action.
12. **Implementation stays manual.** OpsIQ's completion is *evidence-gated*; it records that the owner did the
    work with proof — it does not perform the work.

## Frozen scope (unchanged by this loop — not built, not implied)
Public SaaS, billing, Product Hunt, launch readiness, integrations, Local Mode, enterprise/compliance, live
connectors, LLM/NLP, autonomous external action, staff/customer/vendor outreach, tender submission, production
operation of a real business. All remain **FROZEN**.

## Data boundary
Only owner's own / owner-authorized / anonymized data (see `SHADOW_PILOT_DATA_REQUIREMENTS.md` and
`SHADOW_PILOT_DATA_REDACTION_GUIDE.md`). No third-party private data without permission. Data minimized;
sensitive data redacted or excluded; missing data → honest missing-data request, never fabrication.

## Who does what
- **Owner:** supplies anonymized snapshots; reviews the one top action; approves/delegates/requests
  missing-data where safe; supplies real-world evidence refs; performs the real work manually; records a
  usefulness score.
- **OpsIQ:** derives the governed top action + why; routes to a `ProcessExecutionTask`; enforces approval and
  evidence gates; opens reassessment on completion; surfaces recovery/outside-signal context read-only; keeps
  the cockpit low-load; blocks unsafe actions.
