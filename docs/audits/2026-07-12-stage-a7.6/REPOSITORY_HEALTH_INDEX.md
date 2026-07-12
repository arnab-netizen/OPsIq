# A7.6 Repository Health Index

**Date:** 2026-07-12  
**Scope:** Workspace isolation, auth patterns, audit integrity, state machine deduplication

---

## Health Scores by Dimension

| Dimension | Score | Assessment |
|-----------|-------|-----------|
| Workspace Isolation (canonical routes) | 100% | All withCanonicalEnforcement routes now use ctx.verifiedWorkspaceId |
| Workspace Isolation (legacy routes) | 0% | 14 deferred routes still read x-workspace-id header or broken context.ts |
| Actor Identity Integrity | 100% | All 7 actor-from-body violations fixed |
| Auth Pattern Uniformity | 78% | 274/353 routes use canonical pattern (274 + 39 + 40) |
| Audit Write Integrity | <50% | 2 competing writers + 20+ direct bypasses; canonical emitAuditEvent used in minority of writes |
| State Machine Deduplication | 0% | 9 independent implementations, none consolidated |
| Workspace Resolution Deduplication | 0% | 3 competing requireWorkspaceContext functions, 1 is broken and still used |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation Status |
|------|-----------|--------|------------------|
| Attacker forges x-workspace-id header to access another workspace's data | HIGH (for 14 deferred routes) | CRITICAL | Deferred behind I12 migration |
| context.ts::requireWorkspaceContext returning userId instead of workspaceId causes cross-tenant data leakage | HIGH (for 5 deferred callers) | CRITICAL | Deferred behind I12 + I20 |
| Audit log bypass allows undetected mutations | MEDIUM (for 20+ bypasses) | HIGH | Deferred behind I16 work |
| Divergent state machines cause invalid transition to pass in some code paths | LOW (transitions are restrictive) | MEDIUM | Deferred behind I13 work |
| New developer uses logAuditEvent or enforceWorkspaceScoping in new routes | MEDIUM (no deprecation markers) | HIGH | Deprecation markers recommended immediately |

---

## Progress Since A7.5

A7.5 (on unmerged branch) addressed: observability/summary, learning-privacy, learning-retention, learning-consent, learning-harm-events, audit-events.ts.

A7.6 (this branch, from main baseline) re-applies equivalent fixes and extends coverage:
- +3 new routes fixed (I1A: actions, findings, recommendations)
- +2 routes fixed (I1B: governance/alerts, observability/summary)  
- +7 routes fixed (I1C: all actor-from-body violations)
- +4 defect classes formally documented with prevention mechanisms
- +6 audit deliverables created
- INVARIANT_LEDGER.md created

---

## Immediate Recommended Actions (Before Next Feature Work)

1. Add `@deprecated` JSDoc to `src/services/workspace/context.ts::requireWorkspaceContext` to prevent new callers
2. Add `@deprecated` JSDoc to `src/services/audit/audit-log.ts::logAuditEvent`
3. Add `@deprecated` JSDoc to `src/lib/canonical-route-enforcement.ts::enforceWorkspaceScoping`
4. Add PR checklist item: "Does this route use withCanonicalEnforcement and read workspaceId from ctx.verifiedWorkspaceId?"
5. Prioritize DC-A7.6-I12 (auth pattern migration) as the enabler for all remaining deferred fixes
