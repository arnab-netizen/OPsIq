# Dynamic Budget — Final Hostile Audit + Simulation Suite

An adversarial, deterministic end-to-end audit of the whole Dynamic Budget (Owner Mode)
module. Each scenario is an **attempt to break** a governance / safety / tenancy / adaptive
invariant through the **real service paths** (no mocks, no skips), and asserts the system
holds. If a scenario failed it would be a genuine defect — none are weakened to pass.

Owner Mode only. No source changes in this slice — it is a verification suite over the
already-merged Dynamic Budget surface (Slices 1–6). Gate 10 / `execution.md` / billing /
stripe untouched. **Not OWNER_MODE_READY.**

## Attack surfaces & scenarios

All scenarios live in `src/__tests__/services/owner-budget/dynamic-budget-hostile-audit.db.test.ts`
(`[db]`-gated, 20 cases, deterministic — no clock/random dependence).

### Tenancy isolation
- **H1** — a foreign workspace cannot read another workspace's budget plan (`getBusiness` guard throws).
- **H2** — a foreign workspace cannot mutate another workspace's budget action; the action stays unchanged.
- **H3** — working-capital items do not leak across workspaces (foreign `list` throws, no rows visible).

### Idempotency / replay
- **H4** — replaying the same reassessment `triggerEventId` creates no duplicate reassessment row.
- **H5** — three concurrent identical reassessments collapse to a single reassessment row and exactly one current snapshot (concurrency-safe unique guard).
- **H6** — cross-module signal routing is idempotent per reassessment: no signal type is routed twice.

### Governance hard-blocks
- **H7** — an owner override over an **unverified vendor bank** is refused; no override persisted.
- **H8** — an owner override breaching the **statutory reserve** is refused.
- **H9** — an owner override forcing an **unlawful employee action** is refused.
- **H10** — completing a budget action **without evidence** is refused (no fake completion, no outcome recorded).
- **H11** — an **illegal authority transition** (NORMAL → RESTORED) is refused; no authority row written.

### Adaptive truth (the system must react to reality)
- **H12** — a large committed payroll obligation flips **GROW → a defensive mode** and blocks the prior growth spend (`decisionType: BLOCK`).
- **H13** — an **over-threshold** discretionary spend cannot `AUTO_LOG`; it requires owner approval.
- **H14** — an **emergency cannot bypass vendor bank-change** verification (decision stays `HOLD`).
- **H15** — a recommendation that **already failed** is **blocked** on repeat (outcome-learning disposition `block`), not blindly repeated.

### Data integrity
- **H16** — completing with **no impact data** lowers **DATA** confidence (`UNVERIFIED` / `lower_data`), not the recommendation.
- **H17** — an **unknown archetype metric type** is rejected (no silent accept); no metric row written.
- **H18** — with **no finance snapshot**, guidance is cautious (`DATA_INSUFFICIENT` / unverified-or-partial, or no plan) — never a fabricated confident plan.

### Audit / advisory wiring
- **H19** — meaningful mutations emit audit events (spend recorded + reassessed present) — no silent mutation.
- **H20** — signal routing is **advisory**: a reassessment that emits financial signals still completes and persists exactly one current plan snapshot even when finance re-diagnosis cannot run (no finance snapshot) — routing degrades safely and never fails the reassessment.

## Result

| Metric | Value |
|---|---|
| Hostile scenarios | **20 / 20 pass** |
| owner-budget + services regression | **252 / 252 pass** |
| `tsc --noEmit` | 0 errors |
| `lint:ratchet` | PASS (no new debt) |
| Schema / migration changes | none |
| Source changes | none (verification-only slice) |

## Honest scope (what this audit does and does not prove)

- **Proven (headless / DB):** workspace isolation, reassessment idempotency + concurrency
  safety, override hard-blocks, evidence-gated completion, authority-transition legality,
  adaptive mode flips, spend-governance thresholds, outcome-learning block-on-repeat,
  data-confidence honesty, archetype input validation, audit emission, and advisory
  cross-module routing.
- **Not covered here (out of scope / pre-existing):** Browser/E2E UI flows, public-SaaS /
  billing / Gate 10 / stripe paths, and live external data feeds (POS/gateway/bank
  reconciliation). These remain explicitly unproven and are **not** claimed.

## Classification

`DYNAMIC_BUDGET_OWNER_PILOT_READY_HEADLESS` — the Dynamic Budget module withstands a
deterministic hostile audit across tenancy, idempotency, governance, adaptive truth, data
integrity, and audit/advisory wiring, proven end-to-end through the real DB service paths.
This is **pilot-ready in a headless context only**. **Not OWNER_MODE_READY** (no Browser/E2E
proof, no live external feeds, public-SaaS surfaces out of scope).
