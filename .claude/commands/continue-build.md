# CONTINUE BUILD: Strict Autonomous Execution Loop

## SOURCE OF TRUTH
- **execution.md** is the only roadmap.
- **.claude/execution_state.json** is the only progress tracker.
- CLAUDE.md may contain helper notes only; it cannot override execution.md.
- Never ask what to do next unless execution.md is missing, unreadable, or internally contradictory.

## GLOBAL RULE
- One /continue-build run must complete exactly one highest-priority non-DB vertical slice, wiring correction, test correction, audit correction, or deployment-readiness correction.
- Do not stop after "next steps".
- Do not ask "Proceed?".
- Do not mark anything ACTIVE without runtime proof.
- Do not touch DB config unless the selected work is explicitly DB-related.
- DB-only failures must be classified DB_BLOCKED and skipped with proof.

## LOOP ORDER
Every run must execute:
1. Pull/sync current branch.
2. Read execution.md.
3. Read .claude/execution_state.json.
4. Scan repo for implemented systems, APIs, services, tests, routes, DTOs, auth, workspace enforcement, audit/events, exports, cache/storage paths, and workflow gates.
5. Select the highest-priority gap.
6. Implement/fix/wire exactly one vertical slice or correction.
7. Add/update tests proving the path.
8. Run available non-DB gates.
9. Update .claude/execution_state.json.
10. Commit.
11. Push.
12. Report only required fields.

## PRIORITY ORDER
Always choose work in this order:
1. unpushed commits
2. non-DB static errors
3. build/typecheck/test failures not caused by DB
4. implemented systems falsely marked ACTIVE
5. implemented systems with no production/API/service caller
6. missing auth/capability/workspace enforcement
7. missing DTO/output boundary or public/owner leakage risk
8. missing audit/event behavior on material operation
9. missing tests for wired systems
10. stale/contradictory execution_state classification
11. next incomplete non-DB slice from execution.md
12. full deployment-readiness hardening after all phases are implemented
13. improvement/enhancement recommendations after deployment-readiness audit

## ACTIVE CLASSIFICATION REQUIREMENTS
ACTIVE requires proof of:
- caller file
- caller function
- route/service/API entrypoint if user-facing
- input source
- validation path
- output consumer
- tenant/workspace enforcement
- auth/capability enforcement where applicable
- DTO/output boundary
- audit/event behavior where applicable
- failure behavior
- tests proving the path

If any proof is missing, classify as:
- WIRED_NOT_CALLED
- COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE
- PARKED
- DB_BLOCKED

Do not use ACTIVE.

## DEPLOYMENT READINESS REQUIREMENTS
When all execution.md phases are implemented, automatically run a final deployment-readiness audit before declaring complete:
- npm ci
- npx prisma validate
- npx tsc --noEmit
- npm run build
- npm test or available test command
- lint if available
- tenant isolation tests if available
- permission/capability tests if available
- DTO leakage tests if available
- audit/event tests if available
- quota/entitlement tests if available
- export safety tests if available
- replay/projection tests if available
- workflow/CI gate review
- env var checklist review
- deployment checklist review

If DATABASE_URL or DB access is unavailable:
- classify DB gates as DB_BLOCKED
- do not weaken code
- do not modify DB config
- continue all non-DB deployment readiness gates

## FINAL SYSTEM COMPLETION RULE
Do not declare FULLY_DEPLOYMENT_READY unless:
- every phase in execution.md is complete or honestly classified
- every implemented system has correct ACTIVE/WIRED/PARKED/DB_BLOCKED status
- every ACTIVE system has runtime caller proof
- all non-DB gates pass
- all DB blockers are explicitly isolated
- no known non-DB blocker remains
- execution_state is current
- branch is pushed

## FINAL IMPROVEMENT PASS
After all phases are implemented and deployment-readiness audit is complete, create an improvement report in .claude/final-improvement-report.md with:
- monetization gaps
- enterprise buyer objections
- UX/adoption gaps
- operational reliability gaps
- security/compliance gaps
- performance/scaling gaps
- support/admin gaps
- analytics/reporting gaps
- highest-ROI enhancements
- recommended next 10 build slices

Do not implement enhancements unless they are required to remove deployment blockers.

## REPORT FORMAT ONLY
Report:
- selected work
- phase/slice
- files changed
- wiring proof
- tests added/updated
- gates run
- classification changes
- DB_BLOCKED items
- non-DB blockers
- branch pushed
- next automatic target
