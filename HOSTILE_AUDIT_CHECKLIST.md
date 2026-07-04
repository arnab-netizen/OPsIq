# Hostile Audit Checklist

Run this after every slice and phase.

## 1. Advisor-app loophole audit

Ask:

1. Is this only advice?
2. Is this only a dashboard?
3. Is this only a report?
4. Is this only a recommendation card?
5. Does the owner still need to figure out what to do?
6. Does the owner still need to write the script?
7. Does the owner still need to assign the task?
8. Does the owner still need to chase proof?
9. Does the owner still need to decide review timing?
10. If yes, why was workload not transferred?

Failure condition:

- If a material output remains passive advice when artifacts/tasks/proof could be prepared, the slice fails.

---

## 2. Owner workload audit

Ask:

1. Did this remove owner work or add owner work?
2. What exact owner task did OpsIQ take over?
3. What artifact did OpsIQ prepare?
4. What owner approval is still required?
5. Is that approval genuinely necessary?
6. Could it be handled under a pre-approved threshold?
7. Did OpsIQ create a task/script/checklist/tracker automatically?
8. Did OpsIQ define proof automatically?
9. Did OpsIQ set follow-up automatically?
10. Did OpsIQ prepare measurement automatically?

Failure condition:

- Any feature that increases owner workload without transferring work is incomplete.

---

## 3. Wealth-path audit

Ask:

1. Does this improve probability of survival/profit/growth/wealth?
2. Does it distinguish cashflow from scalable wealth?
3. Does it detect trap/dead-end/owner-job businesses?
4. Does it allow stop/pivot/sell/exit recommendations?
5. Does it include opportunity cost?
6. Does it include downside risk?
7. Does it include confidence?
8. Does it disclose missing data?
9. Does it avoid guaranteed wealth claims?
10. Does it choose high-probability boring actions over exciting weak actions?

Failure condition:

- If the feature optimizes activity but not risk-adjusted wealth probability, it fails.

---

## 4. Financial safety audit

Ask:

1. Can OpsIQ recommend spending without checking cash?
2. Can OpsIQ recommend discounts without checking margin?
3. Can OpsIQ recommend hiring without affordability check?
4. Can OpsIQ recommend expansion without stability check?
5. Can OpsIQ recommend paid marketing without ROI tracking?
6. Can OpsIQ recommend debt without repayment capacity?
7. Can OpsIQ optimize revenue while hurting profit?
8. Can OpsIQ ignore owner survival runway?
9. Can OpsIQ create fixed costs prematurely?
10. Can OpsIQ recommend vanity growth?

Failure condition:

- Any materially unsafe financial recommendation must be blocked, downgraded, or owner-approved with warning.

---

## 5. Anti-fake-work audit

Ask:

1. Can staff mark complete without proof?
2. Can staff upload irrelevant proof?
3. Can staff reuse proof?
4. Can wrong user complete task?
5. Can manager approve owner-only action?
6. Can outcome be claimed without metric?
7. Can task close after failed proof?
8. Can proof failure be hidden?
9. Can repeated proof failures avoid reliability penalty?
10. Can audit trail be bypassed?

Failure condition:

- Fake completion must fail closed.

---

## 6. Startup audit

Ask:

1. Does Startup Mode validate before launch?
2. Does it reject weak ideas?
3. Does it show capital insufficiency?
4. Does it calculate unit economics?
5. Does it calculate break-even?
6. Does it score risk-adjusted wealth potential?
7. Does it provide customer validation artifacts?
8. Does it include kill/pivot criteria?
9. Does it avoid hype?
10. Does it create Work Packages?

Failure condition:

- Generic startup plans without validation fail.

---

## 7. Domain hardening audit

Ask:

1. Does the domain plug into the core wealth loop?
2. Does it improve owner decision quality?
3. Does it reduce owner workload?
4. Does it prepare work?
5. Does it enforce proof?
6. Does it measure outcome?
7. Does it avoid duplicating engines?
8. Does it prevent obvious abuse?
9. Does it have realistic tests?
10. Does it have adversarial tests?

Failure condition:

- Feature-copying from benchmark apps without owner outcome improvement fails.

---

## 8. Minimum-code audit

Ask:

1. Was existing code reused?
2. Was a duplicate engine introduced?
3. Was a new dependency added unnecessarily?
4. Was a new abstraction added before need?
5. Was DB schema changed unnecessarily?
6. Was UI overbuilt?
7. Could the same acceptance gate be met with less code?
8. Were tests focused and deterministic?
9. Were future integrations overbuilt?
10. Was any existing safety weakened?

Failure condition:

- Overbuilt or duplicative code must be simplified before moving on.

---

## 9. No-gaps-left-behind audit

Ask:

1. Are there unresolved critical gaps?
2. Are there unresolved high gaps?
3. Were gaps documented with severity?
4. Were deferred items explicitly classified?
5. Is any current-phase requirement missing?
6. Did tests skip a required scenario?
7. Did docs overclaim?
8. Did implementation move ahead without closing known issue?
9. Did any acceptance gate remain unproven?
10. Is final classification honest?

Failure condition:

- Cannot move to next phase with unresolved critical/high gaps.

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
