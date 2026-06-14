# Continue Post-Owner Build: Execution Protocol

## Source of Truth
- **execution_post_owner_mode.md** is the only roadmap for Phase A (DB verification) and Phase B (future modules B01-B26)
- No assumptions about prior status reports
- Repository evidence wins over documentation
- Also obey sections 37 and 38 of execution_post_owner_mode.md; these hostile hardening addenda override weaker instructions

## Mandatory Sequence Every Run

1. **Inspect repo state** (git status, branch, commit)
2. **Read execution_post_owner_mode.md in full** (sections 0-38)
3. **Run repository reality scan** (find execution files, status files, check package.json)
4. **Import previous execution** (locate and read execution.md or OWNER_MODE_STATUS_REPORT.md)
5. **Run Phase A DB verification** (unless freshly passed on current commit)
   - Discover DB env configuration (local or GitHub secrets)
   - Run safe DB connectivity and migration checks
   - Run DB-backed integration tests where safe
   - Verify current Owner Mode modules M01-M15 against database
   - Verify previous modules with DB where applicable
   - Classify DB readiness and any blockers
6. **If Phase A has P0/P1 DB defects:** Fix the smallest highest-priority current/previous module slice, then re-run Phase A gates
7. **If Phase A gates pass** (or PHASE_A_PASSED_WITH_NONCRITICAL_DB_BLOCKERS): Check PHASE_B_START_GATE
8. **If PHASE_B_START_GATE passes:** Implement one smallest Phase B slice (B01-B26 in order)
9. **For each Phase B slice:**
   - Run targeted unit/integration tests
   - Run DB tests where required and safe
   - Update POST_OWNER_MODE_STATUS_REPORT.md
   - Output SLICE_CLOSEOUT with status
   - Commit and push (no assumptions about DB safety — use TEST_DATABASE_URL for writes)
10. **End with required status**

## Non-Negotiable Rules
- No assumptions about prior execution state
- No broad rewrites of current/previous modules
- No false COMPLETE without repo evidence
- No printing or exposing secrets
- No weakening tests to pass gates
- No skipping DB-required verification without explicit DB_BLOCKED evidence
- No starting Phase B until Phase A gates pass per section 38.1 rules
- No future module may start before prerequisites pass (section 38.14)

## Output Format (End of Run)

```
NEXT_RUN_READY: /continue-post-owner-build
```

or (if blocked):

```
BLOCKED_NEXT_RUN_NOT_SAFE:
  reason:
  exact_command_failed:
  exact_error_summary:
  human_action_required:
```
