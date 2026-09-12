# OpsIQ Owner Cheat-Code Module Requirements

# MODULE COMPLETION CONTRACT

Every module listed in this file must satisfy the full module lifecycle:

1. Requirement defined.
2. Existing implementation inspected.
3. Minimum implementation completed.
4. Runtime wiring completed.
5. Owner-facing or command-surface visibility completed where applicable.
6. Tests completed.
7. Adversarial tests completed.
8. Simulation completed where applicable.
9. E2E completed where applicable.
10. Hostile audit completed.
11. Evidence manifest completed.
12. Gap register updated.
13. Phase report updated.

A module that is implemented but not wired is not complete.

A module that is wired but not tested is not complete.

A module that is tested but not simulated is not complete.

A module that is simulated but not E2E-proven where applicable is not complete.

A module that is not hostile-audited is not complete.

## Required module dependency rule

Downstream modules must not be marked complete unless upstream modules are complete or formally blocked.

For example:

1. Startup Mode cannot be complete unless Wealth Scoring, Financial Governor, Work Package, Proof, Outcome, and Owner Workload Transfer are complete.
2. Domain Hardening cannot be complete unless the domain plugs into Business State, Wealth Path, Financial Governor, Workload Execution, Proof, Outcome, and Owner Command Center.
3. Owner Command Center cannot be complete unless it surfaces the full decision/action/proof/outcome loop.
4. Full Owner Mode cannot be complete unless Startup Mode, Domain Hardening, simulations, E2E, and hostile audit are complete.

## 1. Business State Service

Must produce a canonical business state with known, unknown, missing, and confidence fields.

Must not hallucinate.

Must feed all other engines.

---

## 2. Business Model Quality Service

Must score business model quality using structural wealth potential, not superficial attractiveness.

Must expose inputs, missing data, and confidence.

---

## 3. Wealth Path Classifier

Must classify each business/path as:

1. Survival cashflow business.
2. Local profit business.
3. Multi-unit scalable business.
4. Asset-light scalable service.
5. Technology/product business.
6. Marketplace/aggregator business.
7. Strategic stepping-stone.
8. Owner-dependent job disguised as business.
9. Dead-end business.
10. Trap business.

Must allow uncomfortable recommendations.

---

## 4. Risk-Adjusted Wealth Score Service

Must score major actions and paths using expected value, downside risk, scalability, owner workload, capital requirement, time to evidence, and exit/asset value potential.

Must not imply certainty.

---

## 5. Opportunity Cost Review Service

Must compare major recommendations against realistic alternatives.

Must identify rejected alternatives and why.

---

## 6. Capital Allocation Engine

Must allocate available capital across survival reserve, required bills, debt, reinvestment, experiments, marketing, hiring, equipment, expansion, owner draw, unsafe spending, and blocked spending.

Must protect cash safety.

---

## 7. Financial Governor

Must approve, downgrade, require approval, require more data, or block material actions.

Must review discounts, hiring, expansion, marketing, equipment, debt, and owner withdrawal.

---

## 8. Business Wisdom and Proven Playbook Service

Must store/retrieve structured playbooks.

Must rank by source quality and applicability.

Must convert knowledge into executable work.

Must reject guru/viral/unverified advice for high-risk decisions.

---

## 9. Diagnosis Service

Must identify problems, constraints, bottlenecks, risks, opportunities, and missing data.

Must separate symptoms from likely causes.

---

## 10. Next Best Move Service

Must rank candidate actions and select the highest-probability next action.

Must consider wealth score, financial governor, opportunity cost, business model quality, proof availability, owner workload, and confidence.

---

## 11. Workload Execution Engine

Must classify safe workload-transfer level.

Must implement levels 0, 1, 2, and 5 now.

Must design levels 3 and 4 for later integrations without blocking current work.

---

## 12. Work Package Generator

Must generate complete Work Packages with prepared artifacts.

No Work Package is complete without proof requirements and outcome measurement.

---

## 13. Guided Action Runner

Must convert Work Packages into executable guided actions with assignee, steps, deadline, proof, completion criteria, rejection criteria, and escalation.

---

## 14. Proof Validation Service

Must reject invalid, missing, unauthorized, incomplete, or fake proof where detectable.

Must preserve audit trail.

---

## 15. Outcome Learning Service

Must compare expected vs actual result.

Must classify causality confidence.

Must update future recommendations.

Must not over-learn from weak evidence.

---

## 16. Owner Workload Transfer Service

Must measure what work OpsIQ prepared, assigned, automated, or left to owner.

Must prevent features that increase owner burden without transfer.

---

## 17. Owner Discipline Guardrail

Must detect owner patterns that reduce wealth probability.

Must warn, downgrade, require override, or block where appropriate.

---

## 18. Controlled Experiment Service

Must turn uncertainty into small tests with cost cap, time cap, hypothesis, success metric, failure threshold, proof, and learning update.

---

## 19. Scale Readiness Gate

Must block premature scaling.

Must require proof of profitability, SOP adherence, manager reliability, quality, cash buffer, unit economics, and owner bottleneck reduction.

---

## 20. Startup Validation Workbench

Must validate before launch.

Must reject weak ideas.

Must generate validation Work Packages and artifacts.

---

## 21. Startup Launch Workbench

Must generate launch artifacts only after validation.

Must include SOPs, checklists, pricing, sales scripts, marketing calendar, vendor checklist, compliance confidence, proof, and review cadence.

---

## 22. Local Context and Compliance Confidence Gate

Must prevent hallucinated legal/tax/labor/compliance advice.

Must classify confidence and require professional review when needed.

---

## 23. Domain Hardening Layer

Each domain must plug into the full owner wealth loop.

Domains:

1. Finance.
2. Sales/customers.
3. Marketing/growth.
4. Operations/delivery/quality.
5. Workforce/training/accountability.
6. Compliance/risk/governance.
7. Strategy/expansion/scaling.

---

## 24. Owner Daily Command Center

Must show command decisions, prepared work, approvals, exceptions, proof failures, outcome reviews, capital allocation, and workload transferred.

Must not be a passive dashboard.

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
