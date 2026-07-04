# Minimum Required Code Policy

## Purpose

This policy prevents Claude from overbuilding, duplicating systems, or creating fragile abstractions while implementing the full Owner Mode system.

Minimum required code means the smallest complete implementation that satisfies the acceptance gates.

It does not mean partial implementation.

---

## Required behavior

Before adding code, Claude must inspect existing code for reusable:

1. Services.
2. Engines.
3. DB models.
4. API routes.
5. UI components.
6. Tests.
7. Fixtures.
8. Types.
9. Validation helpers.
10. Audit/proof systems.

Claude must extend existing systems where safe.

---

## Prohibited behavior

Do not:

1. Create duplicate engines.
2. Create parallel guided execution.
3. Create duplicate proof systems.
4. Create duplicate finance governors.
5. Create duplicate task systems.
6. Add general abstraction layers prematurely.
7. Add new dependencies without justification.
8. Add broad framework code for future integrations.
9. Build UI that is not needed for acceptance proof.
10. Change DB schema when existing models can support the requirement.
11. Rewrite working code instead of extending it.
12. Weaken tests to pass.
13. Hide gaps behind TODOs.
14. Create dead code.
15. Use mocks where real service/DB proof is required.

---

## Required justification for new code

Every new service/model/route/component must have:

1. Requirement it satisfies.
2. Existing alternatives checked.
3. Reason existing code could not be reused.
4. Tests covering it.
5. Whether it is core or supporting infrastructure.

---

## Required simplification audit

After each slice, answer:

1. Could this be done with less code?
2. Did any new abstraction replace a simple function unnecessarily?
3. Did any code duplicate existing behavior?
4. Did any code solve a future problem not needed now?
5. Did any new dependency become necessary?
6. Did the code preserve existing safety?
7. Is the code testable and deterministic?
8. Is any generated artifact hardcoded too narrowly?
9. Is any scoring fake or unsupported?
10. Is any acceptance gate only superficially satisfied?

If yes, simplify before moving on.

---

# BULLETPROOF HARDENING AMENDMENT — V2

This amendment supersedes any weaker wording above. If any earlier section conflicts with this amendment, this amendment wins.

## A. Anti-interpretation rule

Claude must not treat broad phrases such as “implement,” “prove,” “harden,” “complete,” “business wisdom,” “wealth acceleration,” “owner workload transfer,” or “domain ready” as satisfied by prose, stubs, placeholders, UI-only cards, static mock data, unchecked assumptions, or tests that do not exercise runtime behavior.

Every claim must be backed by one of these evidence types:

1. Source file path and exported function/class/component.
2. Database model/migration path where DB behavior is involved.
3. API route/service path where runtime behavior is involved.
4. UI path/component and Playwright/E2E proof where user-facing behavior is involved.
5. Test file path and exact command that passed.
6. Scenario file/fixture path and actual result.
7. Gap register entry with severity, owner impact, and closure proof.

No evidence = not complete.

## B. No fake completion rule

A phase, domain, service, or feature must not be marked complete if any of the following is true:

1. It only creates documentation.
2. It only creates types/interfaces without used runtime behavior.
3. It only creates seed data without a retrieval/application path.
4. It only creates tests for mocked logic while the real service path remains untested.
5. It only creates UI with no working service/API behind it.
6. It only creates backend logic with no owner-visible/use-case path where one is required.
7. It leaves TODO, FIXME, placeholder, dummy, sample-only, or “later” code in the critical path.
8. It leaves a critical/high gap open.
9. It leaves a medium gap without phase-bound owner-impact analysis and scheduled closure.
10. It creates owner advice without a Work Package where safe execution/preparation is possible.

## C. Full-version but small-slice rule

This is not an MVP. However, Claude must not attempt a giant unsafe rewrite. Full-version means every required module and domain must eventually pass its gates before Owner Mode is classified complete. Implementation must still proceed in small, reversible, tested slices using minimum required code.

Permitted classification after a slice:

1. `NOT_STARTED`
2. `INVENTORIED_ONLY`
3. `PARTIAL_RUNTIME_SLICE`
4. `RUNTIME_WIRED_NOT_FULLY_PROVEN`
5. `SCENARIO_PROVEN_PARTIAL_DOMAIN`
6. `DOMAIN_HARDENED`
7. `FULL_OWNER_MODE_PROVEN`

Claude must not use vague classifications such as “mostly done,” “ready,” “complete enough,” “implemented,” or “should work.”

## D. Score integrity rule

Any score, ranking, classifier, or recommendation must expose:

1. Inputs used.
2. Missing inputs.
3. Assumptions, if any.
4. Confidence.
5. Data source.
6. Calculation or deterministic scoring rubric.
7. Reason rejected alternatives lost.
8. What new evidence would change the result.

If the score is based mainly on defaults or missing data, it must be labeled `PROVISIONAL_LOW_CONFIDENCE` and must not trigger high-risk execution.

## E. Owner workload proof rule

OpsIQ must prove workload transfer with concrete artifacts and system actions. A statement that workload was reduced is invalid unless it lists:

1. Owner task avoided.
2. Artifact OpsIQ generated.
3. Task OpsIQ created or assigned.
4. Follow-up OpsIQ scheduled or prepared.
5. Proof OpsIQ required.
6. Decision still required from owner and why it could not be safely automated.
7. Estimated owner minutes before.
8. Estimated owner minutes after.
9. Whether owner burden increased, decreased, or merely shifted.

## F. Source and business-wisdom integrity rule

Business wisdom, regulations, benchmarks, local market facts, competitor claims, and “tried and tested” advice must not be treated as truth unless source quality is recorded.

For each external knowledge item, record:

1. Source title/name.
2. Source type.
3. URL or citation reference if available.
4. Retrieval/access date where applicable.
5. Source quality tier.
6. Jurisdiction/industry/stage applicability.
7. Known limitations.
8. Whether it is universal principle, local rule, benchmark, case pattern, or unverified tactic.
9. Whether it is allowed to influence high-risk recommendations.

If no source is available, classify the item as `UNSOURCED_HEURISTIC` and block it from high-risk, legal, tax, hiring/firing, debt, expansion, or compliance-sensitive actions.

## G. No silent deferral rule

Claude may defer work only by creating a gap register entry containing:

1. Exact missing requirement.
2. Severity.
3. Owner/business risk if deferred.
4. Why it cannot be completed now.
5. Whether safe progress can continue.
6. Phase by which it must be closed.
7. Test/evidence required for closure.

Unregistered deferral is prohibited.

## H. Runtime-first rule

For any owner-facing feature, completion requires the full path unless explicitly classified as non-UI infrastructure:

1. Data/model or deterministic input fixture.
2. Service logic.
3. Financial/risk gate where applicable.
4. Work Package/proof/outcome hooks where applicable.
5. API/server action where applicable.
6. UI or command-center surface where applicable.
7. Unit/service tests.
8. DB tests if persistent.
9. E2E test if user-facing critical path.

## I. Personal-use priority rule

Because OpsIQ is for personal use until proven, personal Owner Mode business usefulness outranks public-product polish. Do not build subscription, billing, multi-tenant commercialization polish, marketing pages, Product Hunt assets, public onboarding, enterprise sales features, or generalized SaaS features while any Owner Mode required phase is incomplete.

## J. Minimum-code enforcement rule

Before adding a new model, service, dependency, route, component, or abstraction, Claude must document why existing code cannot be reused. If equivalent capability exists, extending it is mandatory unless extension would create greater risk.

Each slice report must include a “minimum-code justification” listing:

1. New files added.
2. Existing files modified.
3. Why each new file was necessary.
4. Why no smaller change would satisfy the gate.
5. Dependencies added, or explicit statement that none were added.

## K. Stop/pivot/sell/exit honesty rule

OpsIQ must not assume the owner should continue, grow, or scale a business. For every strategic path, OpsIQ must be able to recommend:

1. Continue.
2. Stabilize.
3. Validate.
4. Pivot.
5. Pause.
6. Sell.
7. Exit.
8. Stop investing.
9. Use only as cashflow.
10. Redirect capital/time to a higher-probability path.

If the current business is a poor wealth vehicle, OpsIQ must say so directly with evidence and safer next actions.
