# OpsIQ Business-Reality Corpus — Final Audit (Step 8) — Plan

> Step 8 (capstone) of the Business Reality Corpus execution chain. A READ-ONLY, hostile, aggregate audit over the
> WHOLE corpus produced by Steps 1–7. It proves the corpus is complete, unique, schema/source/privacy-clean,
> safety-invariant, and — critically — HONESTLY COUNTED. Committed BEFORE implementation, per the chain's plan-first
> rule. No new scenarios, no schema change, no engine change: this step only reads and cross-checks what already exists.

## 1. Branch & base
- Branch: `claude/business-reality-corpus-final-audit`
- Base: `main` @ the Sequential Simulations merge (#75, `0dcb1001`). Confirmed present before branching.

## 2. What the audit reads (the whole corpus)
- **9 business-reality single-scenario packs** (`businessRealityScenarioSchema`): unknown_ood 110 · staff_proof 120 ·
  daily_operations 300 · finance_cash 120 · weekly 150 · growth 150 · customer_vendor_market 100 ·
  local_legal_boundary 100 · ugly_tail_risk_crisis 150 = **1300 counted**.
- **Chaos baseline** (`chaos-corpus`): 165 counted + 15 independent-gold = **180 replayed**.
- **Sequential simulations** (`business-simulation-pack`): 50 sims / 427 events.
- **10 source registers** (`sourceRecordSchema`), one per pack + chaos + sims.

## 3. Honest accounting (the audit's central finding — verified before writing the plan)
Measured directly from the code (not from any prior report):
- Business-reality counted-for-readiness: **1300** (0 synthetic, 0 live-data-backed, 301 high-risk, 97 independent-gold).
- Chaos counted-for-readiness: **165**; chaos independent-gold: **15**.
- **True counted-for-readiness single scenarios: 1300 + 165 = 1465.**
- **True proven single scenarios (counted + chaos independent-gold): 1465 + 15 = 1480.**
- Sequential simulations: **50 sims / 427 events** (counted separately; a different artifact shape).
- All 1465 single-scenario `scenarioId`s are unique across every pack + chaos.

The coverage matrix currently labels **1480** as "counted single scenarios". That figure equals the PROVEN total
(1300 + 180), which conflates the 15 chaos independent-gold cases (proven, not counted-for-readiness) with the 1465
counted-for-readiness scenarios. The audit will REPORT both figures precisely and CORRECT the matrix label to
"1465 counted-for-readiness + 15 independent-gold = 1480 proven" — an honesty correction, not a volume change. No
scenario is added or removed.

## 4. Audit checks (read-only; a single aggregate vitest, no DB, no browser)
`src/__tests__/scenarios/business-reality-corpus-audit.test.ts`:
1. **Counts** — each pack's exact count; business-reality total 1300; chaos counted 165 + gold 15; sims 50 / 427
   events; true counted-for-readiness 1465; true proven 1480.
2. **Cross-pack uniqueness** — all 1465 single-scenario `scenarioId`s unique across the 9 packs + chaos (no collision);
   all 50 `simulationId`s unique; all sim `eventId`s unique.
3. **Schema validity** — every business-reality scenario passes `businessRealityScenarioSchema`; every simulation
   passes `businessSimulationSchema`.
4. **Bookkeeping honesty** — every business-reality scenario `countedForReadiness=true`, `synthetic=false`,
   `liveDataBacked=false`; every simulation `countedForReadiness=true`, `synthetic=false`, `liveDataBacked=false`.
5. **Source + privacy** — every scenario/sim `sourceRefs` resolves to a real source in the aggregated registers; every
   source passes `sourceRecordSchema`, has `privacyRisk` low/medium, and carries no PII (`findPII` clean on
   title/citation/factsUsed).
6. **Action-status coverage** — all five statuses present across the business-reality corpus (measured:
   need_more_data 390 · owner_decision_required 348 · blocked 213 · cautious_proceed 212 · proceed 137).
7. **Aggregate safety invariants** — NO high-risk and NO professional-review-required scenario has a proceed/cautious
   `expectedActionStatus`; NO scenario is live-data-backed; simulation safety (no owner-gated/boundary/missing-data/
   gamed event proceeds; owner-away holds; extreme block/owner dominant) holds corpus-wide.
8. **Proof-lane presence** — every pack has its DB + desktop/mobile CI workflow file on disk (the per-pack lanes that
   already DB-proved + browser-proved each pack); the audit lists them. The final audit does NOT re-run 1465 DB seeds
   (each pack already proved its own in CI) — it verifies corpus-wide coherence + honest accounting.
9. **Ledger** — writes `OPSIQ_BUSINESS_REALITY_CORPUS_FINAL_AUDIT.run.json` (per-pack counts, totals, uniqueness,
   safety counters all 0, status distribution, source count).

## 5. CI workflow
`corpus-final-audit.yml` — one additive lane running the aggregate audit test (no DB/browser needed; it is a static
read-only aggregate). Does NOT modify any existing workflow.

## 6. Coverage matrix + report
- Correct the matrix's cumulative label to the honest breakdown (1465 counted-for-readiness + 15 independent-gold =
  1480 proven; 50 sims / 427 events separate). No count fabricated; the correction only relabels.
- `OPSIQ_BUSINESS_REALITY_CORPUS_FINAL_AUDIT_REPORT.md` — the A–L capstone report with the true, evidence-backed
  composition and every audit result.

## 7. Hard rules honoured
No new scenarios, no schema change, no engine change, no weakened gate, no lowered threshold, no deleted test, no
fabricated volume. The audit is purely additive (one test + one workflow + report + an honesty correction to the
matrix). Every claim is measured from the code, not copied from a prior report.

## 8. What this audit does NOT claim
- It does **not** re-prove live outcome/profit (the corpus is expected-only; sims are `liveDataBacked=false`).
- It does **not** re-run the per-pack DB/browser proofs (those are each pack's own CI lanes) — it audits corpus-wide
  coherence + honest accounting.
- It does **not** make OpsIQ autonomous or promote any learning to a global brain.

## 9. Merge gate & classification
Merge only when: the aggregate audit is green in CI, ALL prior lanes green (no regression), ratchet unchanged, and a
final read-only hostile re-read passes. Classification target on merge: `BUSINESS_REALITY_KNOWN_TO_UNKNOWN_READY`.
