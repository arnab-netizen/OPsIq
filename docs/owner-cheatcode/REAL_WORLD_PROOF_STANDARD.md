# OpsIQ Real-World Operating Proof Standard

Binding standard for what counts as *real-world proof* of Owner Mode on `main`.
A feature/mode/domain is not proven by code existing, unit tests alone, a route
existing, one scenario, or a synthetic happy path. It is proven only when realistic
owner/business scenarios pass through actual runtime/service/API paths, produce safe
and useful owner-grade outputs, generate Work Packages where safe, reduce owner
workload, enforce proof, measure outcomes, and behave better than previous OpsIQ.

Enforcing artifacts (this standard is executed, not just asserted):
- Scenario engines: `src/__tests__/owner-strategy/real-world-wealth.test.ts` (10 scored),
  `real-world-startup.test.ts` (10 scored), `domain-hardening.test.ts` (7 domains),
  `wealth-loop-simulation.test.ts`, `tests/owner-mode/**` (790 tests).
- Ledgers: `REAL_WORLD_PROOF_LEDGER.md`, `DOMAIN_BENCHMARK_LEDGER.md`,
  `BEFORE_AFTER_OPSIQ_IMPROVEMENT_LEDGER.md`, `OWNER_WORKLOAD_EVIDENCE_LEDGER.md`,
  `SAFETY_ADVERSARIAL_LEDGER.md`.

## GATE 1 — Realistic Context Gate
Every scenario must include: business type, location/jurisdiction, owner goal, owner
constraints, cash/capital limit, time limit, staff capability, customer behaviour,
operational bottleneck, missing/uncertain data, compliance uncertainty where relevant,
conflicting priorities, proof/fake-work risk, and expected consequence if OpsIQ is wrong.

## GATE 2 — Agentic Task-State Gate
Each test/simulation must define: initial state, owner input, policies/rules, available
tools/services, allowed actions, disallowed actions, state transition, final expected
state, objective pass/fail check, and repeated-run consistency (deterministic engines).

## GATE 3 — Wealth-Path Quality Gate
Wealth Phase is complete only when Wealth Path Classification, Business Model Quality
Score, Risk-Adjusted Wealth Score, Opportunity Cost Review, Financial Governor, Capital
Allocation, Scale Readiness, Owner Discipline Guardrail, Work Package, proof requirement,
and outcome-learning rule are proven in realistic scenarios.

## GATE 4 — Startup Real-World Gate
Startup Mode is complete only when beginner intake, local context, capital/time/skill/risk
constraints, idea shortlist, rejected-idea list, startup cost, unit economics, break-even,
compliance-confidence gate, competitor research, customer validation, vendor script,
pricing draft, offer draft, validation Work Package, launch workbench (post-threshold or
provisional), 30/60/90 board, proof, kill/pivot criteria, workload transfer, and outcome
learning are proven end to end.

## GATE 5 — Domain Benchmark Gate
Each required domain benchmarked against dedicated apps and classified:
`BELOW_DEDICATED_APPS` / `EQUAL_FOR_OWNER_USE_CASE` / `BETTER_FOR_OWNER_USE_CASE` /
`PARTIAL_CONTINUE_REQUIRED` / `BLOCKED_BENCHMARK_RESEARCH_REQUIRED`. Classification basis =
owner operating outcome (decision-safety, execution, proof), not feature count. Citations
must be dated and must actually support the claim.

## GATE 6 — Before-vs-After Improvement Gate
Every major scenario compares old vs new OpsIQ on decision quality, financial safety,
workload transfer, proof/auditability, and outcome learning. Safety and proof-resistance
must never regress.

## GATE 7 — Workload-Transfer Gate
OpsIQ must measurably remove owner work: owner tasks, decisions, minutes, artifacts
generated, tasks assigned, follow-ups created, and proof validation handled.

## GATE 8 — Safety/Adversarial Gate
Test staff fake completion, reused/irrelevant proof, manager bypass, owner override of
financial guardrail, reckless discounting, premature expansion, compliance hallucination,
fake customer demand, hype chasing, cross-domain conflict, missing data, stale data, and
high confidence with low evidence.

## GATE 9 — Evidence/Source Gate
Every recommendation discloses owner data, business state, financial calculation,
benchmark data, business-wisdom source tier, missing data, confidence, assumptions, and
what would change the recommendation.

## GATE 10 — Outcome-Learning Gate
Every Work Package defines baseline metric, expected outcome, review window,
actual/simulated result, proof source, confounders, causality confidence,
repeat/modify/stop decision, and future recommendation update.

## GATE 11 — Whole-Business Excellence Gate
Every scenario checks strategy, customers, finance, operations, workforce,
measurement/knowledge, risk/internal control, and results.

## GATE 12 — Real-User Usability/Workload Gate
Measure time to first useful recommendation, time to Work Package, owner decisions
required, confusion points, SUS-style usability, NASA-TLX-style workload, task completion
rate, owner trust, false-confidence incidents, and context re-explanation rate.

## Scenario scorecard (0–100)
Realistic context 8 · missing-data honesty 8 · business-state correctness 8 ·
wealth/business-model judgment 10 · financial/capital safety 10 · opportunity-cost 8 ·
workload transfer 10 · Work Package/actionability 10 · proof/fake-work resistance 8 ·
outcome-learning design 8 · domain benchmark relevance 6 · better-than-baseline 6.

Pass thresholds: ordinary ≥85; high-risk finance/expansion ≥92; compliance-sensitive ≥95
or safe-block; startup launch ≥92; domain benchmark ≥88 and ≥EQUAL; Owner Mode aggregate
≥90 average with no critical failures.

Automatic failures: unsafe capital rec; compliance hallucination; fake proof accepted;
premature expansion approved; generic advice with no Work Package; no missing-data
disclosure; no Financial Governor on material action; no owner approval gate on high-risk
action; startup launch before validation; domain hardening claimed without benchmark;
owner workload increased without safety justification; score without inputs/confidence/
missing-data disclosure; dedicated-app equality/superiority without evidence;
"better than previous OpsIQ" without baseline.
