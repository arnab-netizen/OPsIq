# OpsIQ Full Owner Cheat-Code Testing Matrix

## Required test categories

Each relevant implementation slice must include applicable tests from this matrix.

---

## 1. Business state tests

Must test:

1. Complete known data.
2. Partial missing data.
3. Unknown values remain unknown.
4. No hallucinated revenue/cash/customer facts.
5. Confidence lowering when inputs are missing.
6. Workspace isolation.
7. Auth restrictions.
8. Scenario fixture ingestion.

---

## 2. Wealth scoring tests

Must test:

1. High-quality scalable business.
2. Local profit business.
3. Survival cashflow business.
4. Owner-job disguised as business.
5. Dead-end business.
6. Trap business.
7. Missing-data confidence.
8. Rejected alternatives.
9. Opportunity cost comparison.
10. No guaranteed wealth language.

---

## 3. Financial governor tests

Must test:

1. Discount blocked when margin unsafe.
2. Hiring blocked when unaffordable.
3. Expansion blocked when current unit unstable.
4. Paid ads downgraded when tracking missing.
5. Equipment purchase blocked without payback.
6. Debt blocked without repayment capacity.
7. Owner withdrawal warning when cash unsafe.
8. Required bills prioritized.
9. Survival reserve protected.
10. Needs-more-data classification.

---

## 4. Business wisdom tests

Must test:

1. Playbook retrieval by problem type.
2. Playbook retrieval by business stage.
3. Playbook retrieval by industry.
4. Low-trust advice downgraded.
5. Guru advice rejected for high-risk recommendation.
6. Playbook converted to Work Package.
7. Applicable conditions checked.
8. Failure conditions included.
9. Stop/pivot criteria included.
10. Proof requirements included.

---

## 5. Next Best Move tests

Must test:

1. Highest-probability boring action beats exciting weak action.
2. Expansion rejected when scale gate fails.
3. Marketing rejected when finance gate fails.
4. Retention chosen when cheaper than acquisition.
5. Missing data triggers validation/experiment.
6. Rejected alternatives shown.
7. Financial review included.
8. Opportunity cost included.
9. Work Package generated.
10. Confidence disclosed.

---

## 6. Work Package tests

Must test:

1. Work Package generated from recommendation.
2. Prepared artifacts included.
3. Assignee included.
4. Deadline included.
5. Proof rules included.
6. Outcome metric included.
7. Completion criteria included.
8. Rejection criteria included.
9. Owner approval classification included.
10. Owner workload transfer score included.

---

## 7. Proof validation tests

Must test:

1. Missing proof rejected.
2. Empty notes rejected where notes required.
3. Wrong proof type rejected.
4. Unauthorized user rejected.
5. Manager cannot approve owner-only action.
6. Failed proof keeps action open.
7. Outcome claim without evidence rejected.
8. Audit trail recorded.
9. Reused proof warning where detectable.
10. Staff fake completion fails closed.

---

## 8. Outcome learning tests

Must test:

1. Worked outcome.
2. Likely contributed outcome.
3. Correlated-only outcome.
4. Failed outcome.
5. Harmful outcome.
6. Inconclusive outcome.
7. Failed playbook changes future recommendation.
8. Weak evidence does not create false learning.
9. Metric baseline required.
10. Measurement window required.

---

## 9. Owner workload transfer tests

Must test:

1. Artifacts prepared.
2. Tasks assigned.
3. Owner approvals minimized.
4. Owner manual tasks counted.
5. Owner minutes estimated.
6. Owner minutes saved estimated.
7. Feature increasing workload flagged.
8. Repetitive micro-actions thresholded.
9. Follow-up created automatically.
10. Measurement structure created automatically.

---

## 10. Startup Mode tests

Must test:

1. Limited-capital beginner.
2. Weak/hype business rejected.
3. Good candidate sent to validation, not launch.
4. Startup cost estimate.
5. Unit economics.
6. Break-even.
7. Customer validation script.
8. Competitor worksheet.
9. Vendor script.
10. Kill/pivot criteria.
11. Compliance confidence flag.
12. Validation Work Package.
13. Launch only after validation.

---

## 11. Domain hardening tests

For each domain, test:

1. Positive path.
2. Missing data path.
3. Unsafe path.
4. Owner approval path.
5. Proof failure path.
6. Fake completion path.
7. Financial risk path if applicable.
8. Owner workload transfer.
9. Outcome measurement.
10. Cross-domain conflict.

---

## 12. Full scenario simulations

Must run deterministic scenarios for:

1. Laundry/local service survival.
2. Laundry/local service growth.
3. Laundry second-branch temptation.
4. Beginner startup limited capital.
5. Startup idea trap.
6. Marketing waste.
7. Staff fake completion.
8. Manager bypass.
9. Cash crunch.
10. Complaint spike.
11. Dormant customer recovery.
12. B2B opportunity.
13. Vendor failure.
14. Equipment issue.
15. Owner reckless expansion.
16. Owner too many initiatives.
17. Weak business model pivot.
18. Strong business model scale readiness.
19. Compliance uncertainty.
20. Cross-domain conflict.

---

## 13. UI/E2E tests

Where UI is present, test:

1. Owner command center.
2. Business state view.
3. Wealth path view.
4. Next Best Move view.
5. Work Package view.
6. Approval/rejection.
7. Staff assigned action.
8. Proof submission.
9. Proof rejection.
10. Outcome review.
11. Startup validation workbench.
12. Startup launch workbench.
13. Domain outputs.
14. Workload transfer display.

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
