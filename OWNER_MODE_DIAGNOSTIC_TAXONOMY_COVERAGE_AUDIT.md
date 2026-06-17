# OWNER-MODE DIAGNOSTIC TAXONOMY — COVERAGE AUDIT

**Mode:** TAXONOMY COVERAGE AUDIT — documentation only. No code/scoring/safety-gate/
answer-key change. **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. **Not a Stage A pass claim.**
Grounded in `ENGINE_CAPABILITY_FAILURE_ANALYSIS.md`, `diagnosis-engine.ts`,
`orchestrator.ts`, `src/domain/consulting-engine/types.ts`, Round 1 `01_*`/`09_*`.

---

## 1. CURRENT ENGINE ARCHETYPES (committed)

`DiagnosisType` (`types.ts:5`): `OPERATIONAL_BOTTLENECK`, `QUALITY_CONTROL_FAILURE`,
`CUSTOMER_RETENTION_EROSION`, `UNKNOWN`. Patterns in `diagnosis-engine.ts`:
"Operational Bottleneck" (L27), "Quality Control Failure" (L93), "Customer
Retention Erosion" (L146). **3 productive archetypes — all operational. Zero
financial, strategic, market, legal, or people archetypes.**

## 2. EVIDENCE DIMENSIONS PRESENT IN ROUND 1 (count / critical, of 50)

| dimension | present | critical | archetype? |
|---|---|---|---|
| **financial_health** | **50** | **49** | **NONE** |
| market_position | 6 | 5 | NONE |
| customer_retention | 6 | 4 | yes |
| operational_efficiency | 4 | 2 | yes |
| quality_delivery | 2 | 2 | yes |
| team_capability | 1 | 1 | NONE |
| process_maturity | 1 | 0 | NONE |

(Evidence dimensions are a fixed 7-value enum in `types.ts`. Note finance, the
universal dimension, maps to **no** diagnosis.)

## 3. COVERAGE GAP — CONFIRMED

**YES.** The dimension present in 100% of cases (financial_health) and 4 of 7
evidence dimensions (financial_health, market_position, team_capability,
process_maturity) have **no** diagnosis archetype. The 3 existing archetypes cover
dimensions present in only 4/2/6 cases. Result: 47/50 abstain, 46/50 `unknown`
root cause — a **model-coverage** failure, not data insufficiency.

## 4. UNSUPPORTED / UNDER-SUPPORTED BUSINESS DOMAINS

- **Unsupported (no archetype):** financial-structural (cash/liquidity, unit
  economics, margin, pricing), revenue/demand & GTM, inventory/forecasting,
  working-capital/AR/AP, debt/solvency, governance/compliance/legal,
  key-person/team capability, strategic-capex/irreversible decisions, market/
  competitive displacement.
- **Under-supported (archetype exists but brittle keyword triggers):** operational
  bottleneck, quality/trust, retention/churn (miss paraphrases — see RW-003/RW-004).

---

## 5. MINIMUM OWNER-MODE DIAGNOSIS TAXONOMY

Each diagnosis below specifies: **Trig** (triggering evidence) · **Req** (required
evidence to commit) · **Contra** (contradiction evidence) · **MinConf** (minimum
confidence to commit vs abstain) · **Safe1st** (safe first-action type) · **Unsafe**
(unsafe first-action examples) · **Abstain when** · **OwnerCheck** (constraints) ·
**Gate** (safety-gate interaction). All diagnoses are subject to the frozen B+A+C
gate; none may bypass it.

### D1 — Cash runway / liquidity crisis
- Trig: low/negative `cashRunwayMonths`, cash balance falling, burn > inflow.
- Req: runway months, monthly burn, committed obligations. Contra: large undrawn
  facility / incoming financing.
- MinConf: commit only with ≥2 corroborating liquidity figures; else abstain.
- Safe1st: 13-week cash forecast + discretionary-spend freeze. Unsafe: take on
  high-interest debt blindly; "grow out of it" by spending.
- Abstain when: runway figure absent/contradictory. OwnerCheck: `cashRunwayMonths`,
  budget, legal (insolvent-trading duties). Gate: danger/irreversibility on any
  financing/layoff action.

### D2 — Unit economics / contribution-margin breakdown
- Trig: contribution margin ≤0 or below benchmark; CAC > LTV.
- Req: per-unit revenue, variable cost, CAC, LTV. Contra: positive blended margin
  with healthy cohorts.
- MinConf: needs both price and variable-cost data; else abstain.
- Safe1st: rebuild cohort/unit economics before scaling. Unsafe: increase spend /
  discount to "buy" growth on negative margin (cf. HSW-05).
- Abstain when: cost or LTV missing. OwnerCheck: budget, runway. Gate: danger on
  discount/spend actions when margin negative.

### D3 — Margin erosion / cost inflation
- Trig: gross margin declining over time; input-cost rising faster than price.
- Req: margin trend, cost trend. Contra: one-off cost, already-passed price rise.
- MinConf: ≥2 periods of margin data. Safe1st: cost-driver decomposition + targeted
  price/cost action. Unsafe: across-the-board price hike without elasticity data.
- Abstain when: single-period snapshot only. OwnerCheck: pricing power, legal
  (price-fixing). Gate: constraint-alignment on price changes.

### D4 — Pricing power / discount dependency
- Trig: rising discount rate, revenue dependent on promotions, price < value.
- Req: list vs realized price, discount %, elasticity signal. Contra: premium
  positioning intact.
- Safe1st: discount-ladder audit + value-based pricing test. Unsafe: deepen
  discounts to defend volume on thin margin.
- Abstain when: no realized-price data. OwnerCheck: budget, brand/legal. Gate:
  danger when discounting + negative margin.

### D5 — Revenue growth / demand-generation failure
- Trig: new-customer rate falling, pipeline shrinking, top-of-funnel weak.
- Req: acquisition funnel metrics. Contra: demand strong but supply-limited (→ D10).
- Safe1st: diagnose funnel stage that broke. Unsafe: blanket ad-spend increase
  without funnel diagnosis.
- Abstain when: funnel data absent. OwnerCheck: budget, capacity. Gate: standard.

### D6 — Go-to-market / channel mismatch
- Trig: channel CAC divergence, wrong-segment acquisition, motion misfit.
- Req: channel-level economics. Contra: single profitable channel scaling fine.
- Safe1st: channel-economics comparison + reallocation pilot. Unsafe: abandon a
  channel on one month's noise.
- Abstain when: no channel breakdown. OwnerCheck: capacity, budget. Gate: standard.

### D7 — Customer retention / churn  *(exists: CUSTOMER_RETENTION_EROSION)*
- Trig: churn up, low repeat/one-time dominance. Req: cohort retention. Contra:
  churn explained by external cause (→ D14/market) — **the RW-005/HSW-01/07 trap**.
- Safe1st: retention-driver analysis. Unsafe: loyalty/discount program before
  confirming retention (not market) is the true cause.
- Abstain when: an out-of-model cause is cited (Option A fires). OwnerCheck:
  budget/legal. Gate: causal-challenge already routes misaligned cases to abstain.

### D8 — Quality / trust failure  *(exists: QUALITY_CONTROL_FAILURE)*
- Trig: complaint surge, defect rate. Req: defect/complaint data; **rule out
  fraud/key-person (→ D14/people)**. Contra: complaints from billing/fraud, not QA
  (HSW-06/08).
- Safe1st: QA checkpoint + root-cause of defects. Unsafe: add QA when the cause is
  theft or a departed expert.
- Abstain when: complaint cause points off-archetype. Gate: causal-challenge.

### D9 — Operational bottleneck / capacity constraint  *(exists: OPERATIONAL_BOTTLENECK)*
- Trig: turnaround/slow/capacity + demand. Req: utilization, throughput. Contra:
  demand falling (slowness is low-volume noise — HSW-04) or surge temporary (HSW-09).
- Safe1st: bottleneck analysis before capex. Unsafe: capacity capex on a temporary
  surge (Peloton/HSW-09).
- Abstain when: demand durability unknown. OwnerCheck: budget, capex
  irreversibility. Gate: danger on capex.

### D10 — Inventory / demand-forecasting mismatch
- Trig: inventory days rising/falling vs demand; stockouts or overstock.
- Req: inventory + demand-trend data. Contra: deliberate buffer build.
- Safe1st: demand-signal vs inventory reconciliation. Unsafe: large inventory/
  factory commit on surge demand (bullwhip; HSW-09).
- Abstain when: demand permanence unproven. OwnerCheck: budget, capex. Gate: danger
  on irreversible build.

### D11 — Working-capital / receivables / payables stress
- Trig: DSO rising, payables stretched, cash conversion lengthening.
- Req: AR/AP aging, cash-conversion cycle. Contra: seasonal, financed.
- Safe1st: collections + terms renegotiation. Unsafe: factor receivables at
  punitive rates without comparison.
- Abstain when: aging data absent. OwnerCheck: runway, legal. Gate: standard.

### D12 — Debt / solvency pressure
- Trig: leverage high, covenant risk, interest coverage low.
- Req: debt schedule, covenants, coverage ratio. Contra: ample headroom.
- Safe1st: covenant/coverage stress test + lender engagement. Unsafe: new senior
  debt or asset sale fire-sale without solvency analysis.
- Abstain when: debt terms unknown. OwnerCheck: runway, legal (insolvency). Gate:
  danger/irreversibility.

### D13 — Governance / compliance / legal risk
- Trig: regulatory change, license/consent gap, legal exposure (HSW-07).
- Req: the specific regulation/obligation. Contra: already compliant.
- Safe1st: compliance gap assessment + legal review. Unsafe: any operational fix
  that ignores the legal cause; running promos in a regulated context (HSW-03).
- Abstain when: legal context cited but not modeled. OwnerCheck:
  `legalComplianceSensitive`. Gate: constraint-alignment (legal) + causal-challenge.

### D14 — Key-person / team-capability risk
- Trig: departure of a sole expert/founder, capability gap, owner bottleneck
  (HSW-02/10). Req: role criticality, succession. Contra: bench depth exists.
- Safe1st: knowledge capture + interim coverage. Unsafe: process tooling that
  can't replace lost judgment.
- Abstain when: dependency asserted without role data. OwnerCheck: staffCapacity.
  Gate: causal-challenge (people cause).

### D15 — Strategic capex / irreversible-decision risk
- Trig: large irreversible commitment under uncertainty (HSW-09 / Peloton).
- Req: reversibility, downside, demand durability. Contra: low-cost reversible pilot.
- Safe1st: stage-gate / reversible pilot before commit. Unsafe: full capex before
  validating demand permanence.
- Abstain when: downside/durability unquantified. OwnerCheck: budget, runway, risk
  appetite. Gate: danger/irreversibility (Option D territory) + constraint-alignment.

---

## 6. SAFETY-GATE INTERACTION (global)
Every new archetype emits a *committed* diagnosis, so it is automatically subject
to the frozen gate: evidence-support (B), causal-challenge (A), constraint-
alignment (C). New archetypes **reduce** improper abstention (model-coverage) but
must not produce confident-wrong proceeds — enforced by re-running the adversarial
suite (must stay 10/10 caught, 2/2 controls) after each archetype slice.

**Stage A remains BLOCKED.** This taxonomy is the coverage target; implementation
is sequenced in `ENGINE_ARCHETYPE_REMEDIATION_SEQUENCE.md`.
