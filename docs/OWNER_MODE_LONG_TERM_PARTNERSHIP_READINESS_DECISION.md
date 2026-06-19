# Owner Mode — Long-Term Partnership Readiness Decision

**Date:** 2026-06-19  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Commit:** d11495ad  
**Decision author:** Governed post-blocker repeat validation  

---

## Evidence Base

### Blockers resolved

| Blocker | Description | Commit |
|---------|-------------|--------|
| BLOCKER-1 | `hasBlockingContradiction()` dead branch — contradictions never blocked | 67a1867d |
| BLOCKER-2 | Caller-controlled `eligibilityStatus` — DB status bypassed | a81a9656 |
| BLOCKER-3 | No review gate before admission — unreviewed candidates admitted | a81a9656 |
| HIGH-6 | No CRITICAL harm circuit breaker on admission | a81a9656 |
| HIGH-1 | No audit trail on 11 controlled-learning services | d11495ad |

### Test gate summary

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | CLEAN |
| `npx prisma validate` | VALID |
| Owner-mode domain tests (34 files, 1812 tests) | ALL PASS |
| Owner API route tests (13 files, 168 tests) | ALL PASS |
| LANE_B (DB, postgres:16, commit a7358b2e) | PASS |
| 30-scenario adversarial simulation | 28/30 PASS |
| Unsafe proceed count | 0 |
| Cross-tenant leakage count | 0 |
| Audit missing count | 0 |

### Remaining gaps

| Item | Severity | Description |
|------|----------|-------------|
| HIGH-3 | MEDIUM | `outcomeWindowElapsed` caller-controlled — no server-side enforcement |
| HIGH-4 | MEDIUM | No harm-to-rollout circuit breaker |
| HIGH-5 | MEDIUM | Rollout does not require regression result |
| SCENARIO-29 | LOW | `admittedBy=""` not validated |

---

## Readiness Assessment

### What is working correctly

1. **Core safety gate**: Diagnosis contradiction blocking is active (BLOCKER-1 fixed).
2. **Eligibility enforcement**: DB eligibilityStatus is authoritative — caller cannot inject a status (BLOCKER-2/3 fixed).
3. **Review prerequisite**: No admission without an APPROVED review (BLOCKER-3 fixed).
4. **Critical harm blocking**: Admission blocked on unmitigated CRITICAL harm (HIGH-6 fixed).
5. **Audit trail**: All 11 controlled-learning services emit best-effort audit entries (HIGH-1 fixed).
6. **Workspace isolation**: assertWorkspaceScopedQuery enforced at all service entry points; DB queries always include workspaceId predicate.
7. **Evidence origin filtering**: Forbidden origins (AI-generated, synthetic, public_unverified, etc.) blocked before any DB write.
8. **Input validation**: All write paths validate required fields, enum memberships, and numeric ranges.
9. **Idempotency guards**: Duplicate admission and duplicate rejection both detected and blocked.
10. **Non-repudiation**: Every material mutation writes a workspace-scoped audit entry with actor, action, and detail.

### What is incomplete

1. **HIGH-3**: An adversarial caller could set `outcomeWindowElapsed=true` without the outcome window having actually elapsed, inflating a candidate's eligibility score. This requires server-side timestamp comparison against the candidate's `createdAt` or a known outcome window length.

2. **HIGH-4**: A candidate with an open CRITICAL harm event could still receive a new rollout flag. The harm circuit breaker only covers admission, not rollout. This means a harmful deployment could be re-staged.

3. **HIGH-5**: A candidate can be rolled out without any regression test result on record. This skips the regression verification step entirely.

These three gaps collectively mean the full governance chain (eligible → reviewed → admitted → regression-verified → rolled out safely) has incomplete enforcement in the rollout phase. The admission phase is safe; the rollout phase trusts the caller.

---

## Decision

**OWNER_MODE_READY_FOR_INTERNAL_TRIAL_ONLY**

### Rationale

**Approved for internal trial because:**
- All hard blockers are resolved. No dangerous path admits unverified, AI-generated, synthetic, or cross-tenant candidates.
- The admission safety gate is fully governed: eligibility (DB-authoritative) + review prerequisite + CRITICAL harm blocker + audit trail.
- The diagnosis engine is protected from automatic mutation (no unsafe proceed path).
- Workspace isolation is enforced at every service boundary.
- 1812 domain tests + 168 API route tests pass. LANE_B DB migration passes.
- 30-scenario adversarial simulation: 0 unsafe admits, 0 cross-tenant leakages, 0 audit gaps on material mutations.

**Not approved for real-business-owner use yet because:**
- HIGH-3 (`outcomeWindowElapsed`) allows caller manipulation of eligibility calculation.
- HIGH-4 (no harm-to-rollout circuit breaker) allows rollout of a candidate with open critical harm.
- HIGH-5 (no regression prerequisite for rollout) allows deployment without verification.

These three gaps mean the rollout phase lacks the same governance rigor as the admission phase. A real business owner could be exposed to an unsafe rollout that bypassed regression and harm checks.

**Not yet approved for public SaaS because:**
- HIGH-3/4/5 are unresolved.
- `admittedBy` empty string gap (SCENARIO-29) is unresolved.
- No end-to-end API integration test with a real DB has been run covering the full chain from Phase 29 to Phase 35 in a single coordinated test run.
- No external security review of the controlled-learning API surface has been conducted.

---

## Path to OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE

Fix these items in order:

1. **HIGH-3**: Enforce `outcomeWindowElapsed` server-side using a timestamp comparison. Remove the caller-controlled boolean from the eligibility evaluation path or validate it against DB state.

2. **HIGH-4**: Add a harm circuit breaker to `setRolloutFlag`: if an unmitigated CRITICAL harm event exists for the candidate in the workspace, block the rollout and emit `ROLLOUT_BLOCKED_CRITICAL_HARM`.

3. **HIGH-5**: Add a regression prerequisite check to `setRolloutFlag`: require that at least one `controlledLearningRegressionResult` with verdict=PASS exists for the candidate before rollout is allowed.

4. **SCENARIO-29**: Add `if (!input.admittedBy || !input.admittedBy.trim()) violations.push("admittedBy is required");` to `admitCandidate`.

After these four fixes:
- Re-run 30+ adversarial scenarios.
- Re-run full test suite.
- Run LANE_B if schema changes are introduced.
- If all pass with 0 unsafe proceeds: upgrade decision to `OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE`.

---

## Path to OWNER_MODE_READY_FOR_PUBLIC_SAAS

After REAL_BUSINESS_OWNER_USE is achieved:
- External security review of controlled-learning API surface.
- Rate limiting and abuse controls on learning admission endpoint.
- End-to-end integration test covering Phase 29–35 in a single DB transaction.
- Review cadence enforcement and escalation path verified.
- Privacy controls (GDPR/deletion) verified end-to-end.

---

## Final Decision

```
OWNER_MODE_READY_FOR_INTERNAL_TRIAL_ONLY
```

Date confirmed: 2026-06-19  
Commit: d11495ad  
Branch: claude/cool-ptolemy-dxrpm7  
