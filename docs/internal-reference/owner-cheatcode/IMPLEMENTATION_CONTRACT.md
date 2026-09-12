# OpsIQ Full Owner Cheat-Code Implementation Contract

# IMPLEMENTATION CONTRACT — NON-COMPLIANCE PREVENTION

Claude must not interpret implementation as code-only.

Implementation means:

1. Code.
2. Runtime wiring.
3. Owner-facing usability where applicable.
4. Tests.
5. Simulations.
6. E2E.
7. Hostile audit.
8. Documentation.
9. Evidence.
10. Gap closure.

Claude must not end a run with required work still pending unless blocked.

## Continuing obligation

After every commit, Claude must ask internally:

1. Are all authorized phases complete?
2. Are all critical/high gaps closed?
3. Are all simulations complete?
4. Is E2E complete?
5. Is hostile audit complete?
6. Is final classification justified?

If any answer is no, Claude must continue.

## Hard blocker declaration

If Claude stops due to blocker, it must provide:

1. Blocker title.
2. Blocker type.
3. Exact phase blocked.
4. Exact requirement blocked.
5. Evidence of why Claude cannot resolve it.
6. Owner action required.
7. What was completed before blocker.
8. What remains after blocker.
9. Risk of continuing without resolution.

Without this, blocker status is invalid.

## Purpose

This contract prevents OpsIQ from becoming a passive advisor, dashboard, report generator, or task list.

OpsIQ must become a personal-use business command-and-control system that improves the owner’s probability of success and wealth by doing and preparing work, enforcing execution, protecting cash, validating decisions, and learning from outcomes.

---

## Product truth

OpsIQ cannot guarantee wealth.

OpsIQ must never imply guaranteed success.

OpsIQ must maximize probability by:

1. Selecting higher-expected-value paths.
2. Rejecting trap businesses and weak strategies.
3. Protecting downside.
4. Allocating capital rationally.
5. Reducing owner workload.
6. Forcing proof-backed execution.
7. Learning from evidence.

---

## Full-version requirement

This build is not an MVP.

The implementation may be sliced for safety, but the target is the full personal-use system.

No phase can be skipped.

No critical/high gap can be knowingly carried forward without being documented, classified, and given a closure requirement.

---

## Minimum-code requirement

Claude must use the minimum required code.

Minimum required code means:

1. Reuse existing code first.
2. Extend existing services before adding new services.
3. Extend existing DB models before adding new models where safe.
4. Avoid new dependencies unless necessary.
5. Avoid speculative abstractions.
6. Avoid duplicate engines.
7. Avoid building future integration infrastructure before manual/internal paths are proven.
8. Avoid UI overbuild; add only what is needed to prove owner use.
9. Prefer deterministic service logic and tests.
10. Prefer simple explicit data structures over generalized frameworks until repeated need is proven.

Minimum code does not mean incomplete code.

It means the smallest complete implementation that satisfies acceptance gates.

---

## No advisor-app loophole

OpsIQ must not stop at:

1. Advice.
2. Recommendations.
3. Reports.
4. Charts.
5. Dashboards.
6. Generic plans.
7. Generic SOP text.
8. Generic business tips.
9. Passive playbook display.
10. Task lists without prepared artifacts and proof.

Every material recommendation must become:

1. A Work Package, or
2. A blocked action with reasons, or
3. A validation experiment if evidence is insufficient.

---

## Workload-transfer contract

For every material recommendation, OpsIQ must first attempt to handle the workload itself.

OpsIQ should do or prepare:

1. Analysis.
2. Prioritization.
3. Financial review.
4. Opportunity cost review.
5. Capital allocation review.
6. Playbook selection.
7. Scripts.
8. SOPs.
9. Checklists.
10. Calculators.
11. Trackers.
12. Staff instructions.
13. Customer messages.
14. Vendor messages.
15. Campaign briefs.
16. Validation worksheets.
17. Training plans.
18. Task assignment.
19. Proof requirements.
20. Follow-up schedule.
21. Outcome measurement.
22. Learning update.

The owner should handle:

1. Goals.
2. Constraints.
3. Approval thresholds.
4. High-risk decisions.
5. Exception judgment.
6. Final approval where required.
7. Legal/professional confirmation where necessary.

---

## Wealth-acceleration contract

OpsIQ must include:

1. Wealth Path Classifier.
2. Business Model Quality Score.
3. Risk-Adjusted Wealth Score.
4. Opportunity Cost Review.
5. Capital Allocation Engine.
6. Controlled Experiment System.
7. Scale Readiness Gate.
8. Owner Discipline Guardrail.
9. Causality-Aware Outcome Learning.
10. Startup Validation before Startup Launch.

OpsIQ must be allowed to recommend:

1. Continue.
2. Stabilize.
3. Improve.
4. Pause.
5. Validate.
6. Pivot.
7. Scale.
8. Sell.
9. Exit.
10. Stop investing.

OpsIQ must not assume every business or idea deserves growth capital.

---

## Proof contract

Every action must define:

1. Required proof.
2. Proof type.
3. Completion criteria.
4. Rejection criteria.
5. Authorized completer.
6. Review date.
7. Outcome metric.
8. Escalation rule.

OpsIQ must reject fake or incomplete work.

---

## Completion contract

A phase is complete only when:

1. Implementation exists.
2. Tests exist.
3. Hostile audit passed.
4. Required documentation updated.
5. Owner workload transfer is measured where applicable.
6. No critical/high gaps remain.
7. Existing system safety is preserved.
8. Final status is honest.

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
