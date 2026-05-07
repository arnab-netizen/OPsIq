# OPERATING RULES - OPsIQ Execution Framework

**Effective**: Post Phase 0 Support Hardening (commit 2bfe4cc)  
**Scope**: All development work on phase/0-runtime-verification-fix and main  
**Authority**: Derived from execution.md and Phase 0 Determinism Contracts

---

## CORE PRINCIPLES

### 1. Reuse Before Create
- Search codebase before writing new code
- Check contracts layer (src/contracts/index.ts) first
- Check test factories (src/__tests__/test-factories.ts) before inline mocks
- Check existing services before creating new ones
- Reuse existing error types, patterns, helpers
- Violation: Any duplicated type definition, service, factory, or helper

### 2. No Duplicates
- **Canonical imports only**: import from @/contracts, never inline definitions
- **Single source of truth**: VarianceResult, ServiceErrorType, ServiceResult<T> defined once
- **No contract drift**: Types in src/contracts/index.ts are immutable, not replicated elsewhere
- **Export re-exports only**: Domain modules (outcome/audit.ts, outcome/quickwin.ts) re-export from @/contracts
- **Test factories are mandatory**: All test contract objects created via test-factories.ts, never inline objects
- Violation: Any type/interface/enum defined in two places

### 3. ACTIVE Requires Runtime Proof
- "ACTIVE" status in execution_state.json only if:
  - Code is wired into execution path (not just created)
  - Tests pass demonstrating functionality
  - Runtime reachable (can be executed, not placeholder)
  - Integration complete (not orphaned modules)
- "IMPLEMENTED" without integration tests = PARKED
- "CREATED" without wiring = PARKED
- Violation: Marking code ACTIVE without demonstrating execution

### 4. Unwired = PARKED
- Code that exists but is not called from any live path is PARKED
- Examples:
  - Services with zero callers: PARKED
  - Features behind disabled flags: PARKED
  - Test utilities with zero usage: PARKED
  - Database migrations not deployed: PARKED
- Status in execution_state.json must reflect parked state
- Document WHY it's parked (awaiting feature flag, awaiting dependent service, etc.)
- Violation: Listing code as ACTIVE when no execution path reaches it

### 5. Fail Closed on Uncertainty
- When unsure: default to safest behavior
- When permission ambiguous: assume NO
- When error handling uncertain: return error, never assume success
- When type shape unknown: use strictest type (no unknown/any)
- When deployment safety uncertain: abort startup (startup-verification.sh model)
- Violation: Optimistic defaults, silent failures, permissive type assumptions

### 6. Preserve Deterministic Behavior
- All services must be deterministic (same input → same output, always)
- All tests must be deterministic (no flaky tests, no random data without seed)
- All error handling must be deterministic (canonical error types only)
- All idempotency keys must be deterministic (derived from operation+actor+workspace+requestId)
- Audit trails must be deterministic (timestamp, requestId, actorId all recorded)
- Violation: Non-deterministic behavior, race conditions, timing-dependent tests

### 7. Preserve Phase 0 Compatibility
- Phase 0 is FROZEN: 27/27 tests passing, 9/9 gates passing
- No modifications to Phase 0 code paths
- All new code must be additive only
- No refactoring of Phase 0 services
- No changes to Phase 0 test behavior
- No API changes visible to Phase 0 callers
- Violation: Any breaking change to Phase 0 implementation or contracts

### 8. No Infra Polishing Unless execution.md Explicitly Requires
- Don't reformat logs for "readability"
- Don't refactor error handling for "consistency" (unless execution.md says so)
- Don't add "helpful" logging
- Don't optimize "inefficient" query patterns
- Don't rename variables for clarity
- Don't reorganize code for aesthetics
- **Exception**: execution.md explicitly demands infra change
- Violation: Any "nice to have" infrastructure work not in execution.md

### 9. Prioritize Operational Intelligence Engines
- Operational Intelligence Engines (OIE) are the primary value stream
- OIE components: Phase 0 (System Truth), Phase 1-4 (Evidence/Outcome/Contradiction), Phase 10+ (Learning)
- Infrastructure (contracts, tests, CI) exists to enable OIE, not as end goal
- Never build infrastructure without corresponding OIE component
- Violation: Creating infra with no OIE consumer (orphaned modules, premature abstractions)

### 10. Smallest Deployable Vertical Slice
- All work must be in **smallest independently deployable pieces**
- Each phase = one complete feature end-to-end
- Each commit = stable, deployable state
- Never commit half-finished features
- Never commit "groundwork" without the feature it enables
- Violation: Multi-phase work in single commit, unfinished features, groundwork-only PRs

### 11. Runtime Reachable Only
- Code exists only if runtime can reach it
- Database migrations only if running (not pending)
- Endpoints only if router can invoke them
- Services only if caller path exists
- Tests only if test runner can execute them
- Violation: Dead code, unreachable paths, orphaned implementations

### 12. Deterministic Tests Required
- All tests must use deterministic inputs (no randomness)
- All tests must use test factories (no inline mocks)
- All tests must have consistent assertions
- All tests must pass locally and in CI
- All tests must verify observable behavior, not implementation
- Violation: Flaky tests, non-deterministic fixtures, implementation-specific assertions

### 13. No Cosmetic Refactors
- Don't reorganize code "for clarity"
- Don't rename variables for "better names"
- Don't reformat code for "consistency"
- Don't split files for "modularity"
- Changes must provide execution value, not aesthetic value
- Exception: execution.md explicitly requires it
- Violation: Any change made purely for code quality improvement

### 14. No Speculative Abstractions
- Don't create "maybe useful" base classes
- Don't design for "possible future features"
- Don't build "flexible" patterns that enable nothing yet
- Don't create interfaces for "future implementations"
- Create only what is needed now
- Violation: "In case we need X later", "This makes it flexible", "This is more maintainable"

### 15. No Fake Completion Claims
- Don't claim phase COMPLETE if not fully tested and integrated
- Don't claim feature ACTIVE if not wired into execution path
- Don't claim infrastructure READY if not verified in CI
- Don't claim migration DEPLOYED if not confirmed in target DB
- Only claim completion after runtime verification
- Violation: Premature status updates, unverified completion claims

### 16. No Dead Code
- Delete code with zero callers
- Delete branches that are never taken
- Delete flags that are always true/false
- Delete tests for deleted features
- Dead code is a liability, not a resource
- Keep code only if: actively called, or explicitly preserved per execution.md
- Violation: Unreachable code, disabled features, orphaned modules

### 17. Update execution_state.json After Every Phase
- After completing each phase:
  1. Document phase completion status
  2. List files created/modified
  3. Record verification results (tests, gates, gates)
  4. Update phase_status (PARTIAL, COMPLETE, or blocked reason)
  5. Note any new parked/blocked work
  6. Record commit hash and date
- execution_state.json is the source of truth for current state
- Violation: Stale execution_state.json, undocumented phases

### 18. Commit After Every Stable Milestone
- Commit criteria:
  1. All new tests passing
  2. All CI gates passing
  3. Phase work complete (not mid-phase)
  4. Code is additive or fixes a clear bug
  5. No breaking changes to Phase 0
- Commit messages must:
  1. State what changed (imperative: "Add X", "Fix Y", "Update Z")
  2. Explain why it matters (business value, not implementation details)
  3. List files changed (critical items first)
  4. Include link to session
- One logical change per commit (revert each commit independently)
- Violation: Work-in-progress commits, commits without passing tests, commits with unrelated changes

---

## ENFORCEMENT CHECKPOINTS

### Before Coding
- [ ] execution.md rule applies to this work?
- [ ] Code already exists in codebase (search before writing)?
- [ ] Smallest slice identified (not multi-phase work)?
- [ ] Runtime path clear (not speculative)?

### Before Committing
- [ ] All tests passing (npm test)?
- [ ] All CI gates passing (build, typecheck, prisma validate)?
- [ ] No Phase 0 changes?
- [ ] Code is additive (no refactors, no cosmetic changes)?
- [ ] execution_state.json updated?
- [ ] Commit message complete (what, why, files, session)?

### Before PR
- [ ] Phase work complete (not mid-phase)?
- [ ] No breaking changes?
- [ ] BRANCH_PROTECTION.md followed (CODEOWNERS review needed)?
- [ ] Contract immutability enforced (if touching contracts)?

---

## DECISION TREE

```
Does execution.md explicitly require this work?
├─ NO → Question authority: is this work necessary?
│       ├─ NO → Don't do it
│       └─ YES → Get it in execution.md first
└─ YES → Proceed

Is the code already in codebase?
├─ YES → Reuse it
└─ NO → Create smallest piece needed

Is the code wired into runtime?
├─ NO → Mark as PARKED, document why
└─ YES → Test it, commit it

Are all tests passing?
├─ NO → Fix failures, don't commit
└─ YES → Update execution_state.json, commit

Is Phase 0 affected?
├─ YES → Abort, Phase 0 is frozen
└─ NO → Continue
```

---

## RED FLAGS (Stop & Reconsider)

🚨 "This makes the code cleaner"  
→ Cosmetic work. Not allowed unless execution.md says so.

🚨 "This will be useful later"  
→ Speculative. Build only what's needed now.

🚨 "I'll complete this in the next phase"  
→ Incomplete work. Don't commit mid-phase.

🚨 "This is just groundwork"  
→ Dead code. Don't create infrastructure without the feature.

🚨 "We should redesign this"  
→ Refactor scope creep. execution.md must explicitly require it.

🚨 "I'll wire this up later"  
→ Don't create unwired code. Delay until wiring is ready.

🚨 "This makes it flexible"  
→ Speculative abstraction. Create what's needed, not what might be.

🚨 "All tests passing locally"  
→ Not enough. Also verify CI gates, Phase 0 compatibility.

---

## REFERENCE

- execution.md: Source of truth for product phases and requirements
- BRANCH_PROTECTION.md: GitHub rules, CODEOWNERS, PR process
- PRODUCTION_READINESS.md: Deployment procedures, rollback criteria
- src/contracts/index.ts: Canonical contract layer (immutable)
- src/__tests__/test-factories.ts: Test factory functions (mandatory)
- .github/workflows/contract-immutability.yml: CI enforcement
- startup-verification.sh: Deployment safety checklist
