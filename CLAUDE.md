# OpsIQ repository rules for Claude Code

You are working inside the OpsIQ repository.

## Product truth
OpsIQ is a governed business intervention and consulting operating system.
It must model all four dimensions at all times:
1. consulting lifecycle stage
2. business condition
3. intervention mode and intervention phase
4. human execution reality

If any implementation drops one of those four dimensions, it is incorrect.

## Hard rules
- No TODOs, placeholders, stubs, or fake implementations.
- No business logic in UI components.
- No permission logic in pages or components. Use centralized policy checks.
- No state-transition logic in pages or components. Use centralized services/policies.
- No silent mutation of approved, issued, validated, or locked records.
- No collapsing distinct entities for convenience.
- No destructive deletes for governed records unless explicitly justified and restricted.
- All meaningful mutations must emit audit events.
- All write paths must validate input.
- All protected actions must enforce authorization server-side.
- All critical mutations must be idempotent or protected against duplicate submission.
- Use concurrency-safe update patterns for governed records where relevant.
- Keep internal-only vs client-visible classification in mind for sensitive records.

## Mandatory adaptive rule
Every significant change must route into governed re-evaluation of:
- BusinessConditionProfile
- InterventionMode
- InterventionPhase
- recommendation and action priority
- review cadence
- health status where applicable

Examples:
- new critical evidence
- KPI deterioration
- unresolved critical blocker
- failed implementation
- shock event
- scope change
- owner non-compliance on critical action
- major client loss
- key employee loss

## Technical defaults
- TypeScript
- Next.js App Router or existing repo equivalent
- Prisma + PostgreSQL or existing repo equivalent
- Zod or existing schema validation layer
- Centralized audit event helper
- Centralized policy/capability layer
- Structured folders: domain, services, policies, infra, ui


## Ambiguity resolution rule
- If a slice says "where relevant", treat it as required unless the slice has no such surface at all.
- If a slice says "if used", inspect the existing repo and follow the existing pattern rather than inventing a second pattern.
- If a slice says "groundwork", implement the minimum concrete schema/service/interface needed so later modules do not require rewrites.
- If something is genuinely impossible in the current slice without violating scope, do not guess; state the limitation explicitly in section G.

## Human-factors safety
Model only business-operational human variables:
- owner bottlenecking
- follow-through risk
- resistance to change
- communication breakdown
- morale fragility
- management capability
- key-person dependency
- accountability weakness

Do not model mental-health diagnosis, personality diagnosis, or pseudo-psychology.

## PR Cost Control and Root-Cause Closure

**MANDATORY — applies to all future commits and PRs.**

Full policy: `docs/opsiq-governance/PR_COST_AND_ROOT_CAUSE_POLICY.md`

Ten rules (enforced):

1. **PR_BUDGET_GATE**: Run `npx vitest run <affected-test>` locally before any CI push.
2. **Root-cause diagnosis before fix**: Write the root cause (what, why, how many instances) before touching code.
3. **Batch all instances**: Search the full codebase for every instance of the root cause before fixing any one of them.
4. **Close the root cause, not the symptom**: Fix passes only when no other file can produce the same failure by the same mechanism.
5. **No scope creep in fix commits**: Fix commits contain only the root-cause fix. Nothing else.
6. **Local lint + type check before push**: `npm run lint` and `npx tsc --noEmit` must both exit clean.
7. **One PR per root-cause class**: Do not mix unrelated root causes in a single PR.
8. **No fix-on-fix commits**: If a fix introduces a new failure, revert → rediagnose → push corrected fix.
9. **Commit message states root cause and local verification**: Must include defect class and "ran vitest run X, Y/Y pass".
10. **No new phase until previous phase CI is green on main**: Resolve all CI failures before starting new feature work.

## Response format
When asked to implement a slice, return exactly:
A. Files created
B. Files changed
C. Schema changes
D. Backend logic implemented
E. Frontend logic implemented
F. Acceptance criteria checklist
G. Known limitations
H. Manual verification steps
I. Trigger map
J. Failure modes covered
K. Events emitted
L. Automated tests added

Keep answers concise and factual.
