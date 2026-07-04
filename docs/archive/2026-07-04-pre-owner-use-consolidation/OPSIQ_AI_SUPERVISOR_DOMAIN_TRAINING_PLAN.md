# OpsIQ AI Supervisor — Domain + Collective Behavioral Training Plan

> Behavioral training and validation of the existing AI Supervisor. **Not** model fine-tuning,
> **not** a parallel AI brain, **not** an LLM, **not** autonomous action. All work is additive tests
> + reports over the deterministic runtime merged in PR #60.

- **Branch:** `claude/ai-supervisor-domain-training-im14nm`
- **Base HEAD (post #60 merge):** `9bcac7a4659da4aedafef912de1bbfb08ccc17eb`
- **Supervisor decision seam under training:** `src/domain/owner-mode/supervisor-summary.ts`
  → `buildSupervisorSummary(SupervisorInput): SupervisorSummary` (pure; no DB / Date / AI).
- **Conflict engine consulted:** `src/behavioral-validation/whole-business/arbitration.ts`
  (`arbitrate()`, fixed priority order over 10 constraints).
- **Owner-view mapping mirrored:** `src/services/owner-mode/owner-whole-business-plan.service.ts`
  (runtime → `SupervisorInput`).
- **Dashboard surface:** `src/components/owner/SupervisorSummary.tsx` + browser spec
  `tests/browser/18-owner-supervisor-summary.spec.ts`.

## 0. What the supervisor must prove it can decide

1. which domains matter; 2. which modules to consult; 3. which outputs to accept;
4. which to reject; 5. which action is safe; 6. which is blocked; 7. when to ask for more data;
8. when to escalate to owner; 9. when to escalate to professional review; 10. when to stop/pause/reject;
11. how to explain the decision clearly on the dashboard.

The supervisor does **not** pick the dominant constraint (arbitration does). Training validates that,
given a domain/conflict/novel situation, the supervisor produces the correct **owner-facing disposition**:
action status, do/do-not, owner-vs-delegate, proof, reassessment, impact, confidence, ≤3 priorities — and
never reads "proceed" when it is not safe, never fabricates confidence, never escalates a non-dominant domain.

## 1. Constraint vocabulary (fixed priority order)

`compliance_block` → `proof_fraud_block` → `cash_survival` → `below_margin` → `capacity_feasibility`
→ `customer_quality` → `owner_workload` → `profitable_growth` → `efficiency_scaling` → `optimization`.

Emergency constraints (allow >3 priorities): `compliance_block`, `proof_fraud_block`, `cash_survival`.
High-risk-financial (force owner decision + stop-loss): `cash_survival`, `below_margin`, `profitable_growth`,
`efficiency_scaling`.

## 2. Domains to test (each maps to a binding constraint)

| # | Domain | Binding constraint (positive) | High-impact extras asserted |
|---|--------|-------------------------------|------------------------------|
| 1 | finance / cash | cash_survival | profit/cash impact, proof, reassessment, owner decision |
| 2 | budget / capital allocation | cash_survival | cash impact, owner decision |
| 3 | pricing / margin | below_margin | margin impact, do-not-do, owner decision |
| 4 | working capital | cash_survival | cash impact, reassessment |
| 5 | sales | profitable_growth | scale gate, owner decision |
| 6 | marketing | cash_survival (blocked spend) | do-not-do, cash impact |
| 7 | customer complaints / reputation | customer_quality | quality impact, proof |
| 8 | retention | customer_quality | quality impact |
| 9 | operations | capacity_feasibility | capacity impact, stop-loss |
| 10 | SOPs / checklists | capacity_feasibility | prepared work, proof |
| 11 | staff workload / fairness | owner_workload | staff/workload impact, delegation |
| 12 | staff training | capacity_feasibility | staff impact, prepared work |
| 13 | hiring / firing / resource | capacity_feasibility | staff impact, proof |
| 14 | equipment / capacity | capacity_feasibility | capacity impact, owner decision (if cash) |
| 15 | maintenance / downtime | capacity_feasibility | capacity impact, reassessment |
| 16 | vendor / supplier | customer_quality | quality impact, do-not-do |
| 17 | delivery / logistics | capacity_feasibility | capacity impact |
| 18 | B2B contracts / opportunities | below_margin | margin impact, owner decision, proof |
| 19 | proof / anti-gaming | proof_fraud_block | blocked, emergency, proof |
| 20 | compliance / professional review | compliance_block | blocked, professional-review boundary |
| 21 | owner workload | owner_workload | workload offload, delegation |
| 22 | approval memory | owner_workload | delegation, owner decision |
| 23 | remote owner | owner_workload | delegation, proof |
| 24 | multi-location | owner_workload | workload, scale gate |
| 25 | growth / scale | profitable_growth | scale-readiness gate, owner decision |
| 26 | shutdown / pivot / stop-loss | cash_survival | stop-loss, owner decision |
| 27 | cybersecurity / payment / data-loss | compliance_block | blocked, professional-review boundary |
| 28 | business continuity | compliance_block | blocked, reassessment |
| 29 | seasonality / weather / festival demand | capacity_feasibility | capacity impact, reassessment |
| 30 | exit / sale readiness | profitable_growth | scale gate, proof |

For **every** domain: (a) a **supervisor-positive** case (the domain is binding → correct summary/status),
and (b) a **supervisor-negative** case (the domain is assessed/real but a *different* constraint dominates →
the supervisor surfaces the dominant constraint, keeps the non-dominant domain as a known fact only, and does
**not** escalate it). High-impact, financial, staff, growth, and compliance domains assert their extra columns.

## 3. Collective (cross-domain) conflicts to test

Driven through the **real `arbitrate()`** so the supervisor consumes genuine conflict-resolution output
(winning recommendation + rejected alternatives + dominant constraint), then mapped to `SupervisorInput`.

| # | Conflict | Expected dominant | Source |
|---|----------|-------------------|--------|
| 1 | cash vs marketing | cash_survival | recipe `cash_vs_marketing` |
| 2 | cash vs hiring | cash_survival | constructed (hire blocked by cash) |
| 3 | cash vs equipment purchase | cash_survival | recipe `equipment_vs_runway` |
| 4 | cash vs expansion | cash_survival | recipe `expansion_vs_unit_economics` |
| 5 | sales growth vs margin | below_margin | recipe `sales_vs_margin` |
| 6 | customer quality vs acquisition | customer_quality | recipe `quality_vs_acquisition` |
| 7 | staff workload vs growth | capacity_feasibility | recipe `staff_vs_profit` |
| 8 | proof dispute vs operational completion | proof_fraud_block | recipe `remote_owner_vs_proof` |
| 9 | compliance vs revenue | compliance_block | recipe `compliance_vs_revenue` |
| 10 | owner workload vs owner control | owner_workload | recipe `owner_vs_control` |
| 11 | B2B contract revenue vs payment terms | cash_survival | recipe `contract_vs_working_capital` |
| 12 | vendor discount vs quality risk | customer_quality | recipe `vendor_savings_vs_reliability` |
| 13 | delivery speed vs cost/margin | below_margin | constructed (accept_contract below cost) |
| 14 | shutdown vs sunk-cost bias | cash_survival | recipe `shutdown_vs_sunk_cost` |
| 15 | multi-location growth vs owner attention | owner_workload | recipe `multi_location_vs_attention` |
| 16 | cyber/payment risk vs normal operations | compliance_block | constructed (complianceRisk) |
| 17 | discount campaign vs margin protection | cash_survival | recipe `discount_vs_retention` |
| 18 | hiring vs process improvement | capacity_feasibility | recipe `hiring_vs_process` |
| 19 | equipment purchase vs cash runway | cash_survival | recipe `equipment_vs_runway` |
| 20 | franchise/brand rules vs local opportunity | below_margin | recipe `franchise_rules_vs_local` |

Each conflict proves: conflict detected, losing option rejected + reason, dominant constraint selected,
do-not-do shown, owner-readable explanation, profit/cash/workload impact shown, action status correct,
proof/reassessment shown, ≤3 priorities (≤5 only in emergency).

## 4. New / unfamiliar situations

1. unfamiliar business category; 2. sparse data; 3. unusual contract; 4. sudden competitor action;
5. new local compliance uncertainty; 6. new equipment/process; 7. unusual staff/vendor behavior;
8. unexpected complaint pattern; 9. new growth opportunity; 10. external shock.

Required behavior asserted per case: novelty handled without fake certainty — lower confidence
(never high while a critical domain is missing), a specific data request, a safe immediate next step,
**no** high-risk autonomous action (high-risk ⇒ owner decision / blocked), owner or professional escalation
where needed, dashboard caution visible.

## 5. Dashboard supervisor proof

Component-level (jsdom) renders of representative domain + collective + novelty runtime summaries assert:
supervisor summary present; ≤3 priorities (≤5 emergency); main issue / why / do-now / do-not-do /
owner-decision / delegated / OpsIQ-prepared / proof / missing-data+assumptions / confidence / impact /
reassessment / action status all runtime-fed; no static fallback can pass (renders nothing when `found:false`
or `null`); mobile-bounded (responsive grid, no fixed wide widths); one primary action per priority;
advanced reasoning collapsed (`<details>`). Browser spec 18 (desktop + mobile) remains the end-to-end proof.

## 6. Existing coverage vs. gap

- **Covered already:** arbitration priority order (`arbitration.test.ts`), ≥100 collective conflict cases
  re-derived by arbitration (`collective-cases.test.ts`), whole-plan + collective scorer, generic supervisor
  ledger/status/impact (`supervisor-summary.test.ts`, 40 tests), component runtime-fed render
  (`owner-supervisor-summary.test.tsx`), browser spec 18.
- **Gap (this work):** the supervisor decision layer is **not** exercised per-domain, per-required-conflict,
  or on novel situations; the conflict→supervisor mapping is not asserted end-to-end; dashboard proof is not
  tied to domain/collective/novelty cases.

## 7. New cases needed (implementation slices)

- **Slice T1 — Domain training:** `src/__tests__/owner-mode/ai-supervisor/domain-training.test.ts`
  — 30 domains × {positive, negative} over `buildSupervisorSummary`, table-driven.
- **Slice T2 — Collective training:** `src/__tests__/owner-mode/ai-supervisor/collective-training.test.ts`
  — 20 required conflicts through real `arbitrate()` → `SupervisorInput` adapter → `buildSupervisorSummary`.
- **Slice T3 — Novelty training:** `src/__tests__/owner-mode/ai-supervisor/novelty-training.test.ts`
  — 10 unfamiliar/sparse/shock situations.
- **Slice T4 — Dashboard training:** `src/__tests__/components/supervisor-dashboard-training.test.tsx`
  — representative domain/collective/novelty summaries rendered, runtime-fed + no-fallback + mobile + ≤3.
- Shared adapter `arbitrationToSupervisorInput` lives inside T2 (test-only; mirrors the service mapping).

No production runtime, advisor, scorer, ratchet, arbitration, or policy code is modified. Tests assert the
**current** supervisor behavior is correct; any genuine defect surfaced is recorded in section G of the report
(no silent weakening of a gate to make a test pass).

## 8. DB / browser proof

- DB: existing owner-mode DB suites (`*.db.test.ts`) under `TEST_WITH_DB=true` confirm the supervisor view
  reads only real scoped rows (no cross-tenant leakage) — re-run as a no-regression gate, not re-authored.
- Browser/mobile: spec 18 (desktop + mobile) + owner lane 13–18 remain the browser proof; T4 is the
  jsdom-level dashboard proof that runs without a build.

## 9. No-regression gates (must stay green)

1. AI supervisor tests; 2. max-reliability ratchet + scorer negative controls; 3. owner-pilot / pilot-readiness;
4. DB owner-mode tests (`TEST_WITH_DB=true`); 5. Playwright specs 13–18; 6. source/privacy tests;
7. business-scope isolation tests; 8. learning-governance / adjudication tests.
**Baseline captured before any change:** tsc 0; AI supervisor 40; behavioral-validation 423 pass/10 skip;
pilot-readiness 86 pass/6 skip. Any regression blocks readiness. Gates are not weakened.

## 10. Reports

`OPSIQ_AI_SUPERVISOR_DOMAIN_TRAINING_REPORT.md` with branch / base+final HEAD / tree status / domains /
conflicts / novelty / dashboard / DB / browser / tests run / no-regression proof / final classification.
Classification `AI_SUPERVISOR_DOMAIN_COLLECTIVE_TRAINED` only if every required domain + conflict has
supervisor coverage, novelty is safe, dashboard stays clear, DB/browser pass, max-reliability + owner-pilot
stay green, and no unsafe / overconfident / autonomous / cross-tenant behavior appears.
