# Bulletproof Hostile Audit Report — OpsIQ Full Owner Cheat-Code Files

## Verdict

The original file set was strong but not bulletproof. It contained broad requirements that a model or contractor could satisfy superficially with documents, dashboards, stubs, provisional scores, or generic task creation. The V2 hardening closes those loopholes by requiring runtime evidence, source ledgers, score integrity, workload-transfer proof, no silent deferral, phase classifications, and minimum-code justification after every slice.

## Critical weaknesses found

| ID | Severity | Weakness | How Claude could exploit it | V2 fix |
|---|---|---|---|---|
| A-01 | Critical | Broad words like “complete,” “prove,” and “harden” were not evidence-bound enough. | Claim completion from prose/tests around mocks. | Evidence manifest and no-evidence/no-completion rule. |
| A-02 | Critical | “OpsIQ does workload” could be claimed without measured owner burden reduction. | Generate advice/checklists and call it workload transfer. | Owner workload proof rule requiring artifacts, tasks, follow-up, proof, minutes before/after. |
| A-03 | Critical | Wealth scores could become fake numeric theater. | Produce 0–100 scores without valid inputs or confidence. | Score integrity rule requiring inputs, missing data, formula/rubric, rejected alternatives, confidence. |
| A-04 | Critical | Business wisdom layer could ingest unsourced advice. | Seed guru-style or generic advice and treat it as proven. | Source and business-wisdom integrity rule; unsourced heuristics blocked from high-risk actions. |
| A-05 | Critical | Domain hardening could become feature-copying. | Benchmark apps and add features that do not improve owner wealth loop. | Runtime-first and full-loop domain gate amendment. |
| A-06 | High | “Full version” could trigger unsafe giant rewrite. | Rewrite huge portions, break repo, add abstractions. | Full-version but small-slice rule plus minimum-code enforcement. |
| A-07 | High | Deferrals were possible if described politely. | Move ahead with “later” items. | No silent deferral rule with gap register requirements. |
| A-08 | High | UI could be built without backend or backend without UI proof. | Create disconnected surfaces. | Runtime-first rule for full owner-facing path. |
| A-09 | High | Personal-use priority could be diluted by SaaS/product polish. | Work on public onboarding, billing, launch. | Personal-use priority rule. |
| A-10 | High | The system could become pro-growth bias. | Always recommend grow/scale/save business. | Stop/pivot/sell/exit honesty rule. |

## Remaining hard truths

1. No prompt can make success or wealth guaranteed. V2 forces probability/risk-adjusted language and evidence gates.
2. Full workload takeover requires integrations later. V2 forces internal/manual workload transfer now and honest classification until integrations exist.
3. Local compliance cannot be final without verified sources. V2 blocks unsourced compliance from high-risk execution.
4. Business wisdom cannot be “all advice.” V2 makes it curated, source-ranked, and evidence-weighted.
5. The project can still fail if Claude ignores files; V2 reduces this risk by requiring reports, evidence, gap entries, and phase classifications that are auditable.

## What changed in V2

Every markdown control file now includes a superseding Bulletproof Hardening Amendment covering:

1. Anti-interpretation rule.
2. No fake completion rule.
3. Full-version but small-slice rule.
4. Score integrity rule.
5. Owner workload proof rule.
6. Source and business-wisdom integrity rule.
7. No silent deferral rule.
8. Runtime-first rule.
9. Personal-use priority rule.
10. Minimum-code enforcement rule.
11. Stop/pivot/sell/exit honesty rule.

## Recommended usage

Use `CLAUDE_CONTINUE_BUILD_PROMPT.md` as the immediate Claude prompt. Tell Claude that V2 amendments supersede weaker earlier text and that every slice must cite evidence from the files listed in the prompt.

---

# Part 2 — Phase 28 Execution Audit (implementation, 2026-07-04)

The section above audits the control-file *design*. This section is the Phase 28
whole-repo hostile audit of the *implementation* on branch
`claude/owner-cheatcode-full-implementation`. Each check has a verdict + concrete
evidence (file paths + the command that produced the result). No claim is prose-only.

## Evidence base (commands run)

- `tsc --noEmit` → **0 errors** (whole repo).
- `eslint` on all new/changed source → **clean**.
- `governance:scan:auth` → **all routes comply**; `governance:scan:strict` → **no NEW findings** (32 pre-existing frozen); `audit:wrapped-handlers:ratchet` → **no new violations**.
- Phase 26 simulation `src/__tests__/owner-strategy/wealth-loop-simulation.test.ts` → **12 scenarios green**.
- Phase 27 E2E, DB-backed real PostgreSQL `command-center.db.test.ts` + `wealth-path.db.test.ts` → **6 green** (local Postgres 16, 99 migrations applied).
- Prove-existing FOUND engines (guided-execution, proof.service, outcome-tracking, full-loop-validation, outcome-causality, compliance ×2) → **213 green**; scale-readiness `c1-c3` → **20 green**; DB (proof.service, execution-persistence.db, task-assignment.db, owner-strategy services.db) → **28 green**.
- Broad regression (owner-strategy + owner-budget + integration + margin-safety + FOUND engines) → **444 green / 32 `[db]`**.

## Explicit hostile checks

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | No advisor-app loophole | **PASS** | `work-package.ts::generateWorkPackage` yields prepared artifacts + assignee + proof; command-center `nextBestMove` always resolves to DO_THIS/CHOOSE_ALTERNATIVE/VALIDATE_FIRST/BLOCKED with a Work Package where safe (sim 1–3). |
| 2 | No fake score theater | **PASS** | Scores expose inputs/missing/confidence/rubric; provisional/low-data → `blocksHighRiskExecution` (`wealth-path.test.ts`, `risk-adjusted-wealth.test.ts`). |
| 3 | No generic business wisdom | **PASS** | `business-wisdom.ts` A/B/C/D tiers; Tier-C/D + UNSOURCED blocked from high-risk; guru red flags strip influence (`business-wisdom.test.ts`, 16). |
| 4 | No owner-workload increase disguised as automation | **PASS** | Work Package `ownerWorkload` + command-center `ownerWorkloadTransfer` (minutes before/after, pctReduced); minutesAfter < minutesBefore asserted. |
| 5 | No duplicate engines | **PASS** | Reuses clamps + `scales.ts` + existing spend-governance/capital-allocation/cash-safety/proof/causality/scale/compliance; command-center is composition-only. |
| 6 | No silent deferrals | **PASS** | Every deferral is a gap-register entry; GAP-001..009 all closed. |
| 7 | No unregistered critical/high gaps | **PASS** | `GAP_REGISTER.md` — no open critical/high. |
| 8 | No unsafe financial recommendations | **PASS** | Sim 5/6/10/11 + `phase4-financial-governor-wealth-loop.test.ts`: unsafe spend/discount/hiring/expansion/vanity blocked; cash safety overrides attractive growth. |
| 9 | No compliance hallucination | **PASS** | `evaluateComplianceGate` fails closed (sim 9 + `r9-r27`/`r31-simulations`). |
| 10 | No fake proof acceptance | **PASS** | `detectFakeCompletion`/`verifyCompletion` (sim 4 + `proof.service.test.ts` DB). |
| 11 | No UI-only proof | **PASS** | Loop proven at service/domain + DB, not screenshots. |
| 12 | No test-only proof | **PASS** | Real routes `GET /api/owner/wealth-path`, `/api/owner/wealth-command-center` (canonically enforced) over persisted data; DB E2E. |
| 13 | No mock-only proof | **PASS** | DB tests run against real PostgreSQL (adapter-pg, 99 migrations); no service mocks in the E2E path. |
| 14 | No overclaiming FULL_OWNER_MODE_PROVEN | **PASS** | Classification set honestly below; FULL_OWNER_MODE_PROVEN NOT claimed. |

## Honest final classification

**`SCENARIO_PROVEN` across the owner wealth loop, advancing toward `DOMAIN_HARDENED`.**
The full loop is proven end-to-end at runtime (service + DB E2E) with a green
simulation suite and prove-existing evidence for the FOUND engines.

**NOT `FULL_OWNER_MODE_PROVEN`.** Remaining before that standard:
1. Individually run each per-domain phase gate for Phases 18–19, 21–23 (engines are FOUND and pass their own suites; not each re-proven against the new loop).
2. Expand the simulation suite to all 20 `execution.md` Phase-26 scenarios (11 critical ones green).
3. A UI/Playwright owner-journey E2E (loop proven at service+DB level, not the browser).
4. A full whole-repo test-suite + final CI audit with DB.

No critical/high gap is open. None of the above is a hard blocker — it is scoped, enumerable proof-breadth work.
