# POST-E1 NEXT-SLICE DECISION

**Mode:** analysis only — no implementation/code/gate/threshold/answer-key change.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.
**Not a Stage A pass claim.** Grounded in `POST_E1_ABSTENTION_ROOT_CAUSE_MATRIX.md`.

---

## 1. E2–E6 RANKED BY ACTUAL POST-E1 UNLOCK POTENTIAL (Round 1)

"Cases unlocked" = abstained cases that would become **safe proceeds**. Estimates
are bounded by the matrix: 41 placeholders are undiagnosable; 4 holds are
multi-domain; 1 true-insufficient.

| Slice | Cases likely unlocked (safe proceed) | Cases still abstained | Safety risk | Adversarial risk | Expected proceed gain | Tests required | Expand adversarial suite? |
|---|---|---|---|---|---|---|---|
| **E2** unit-economics/margin/pricing split | **0** (BLND-001/PD-001 economics are *positive* → advisory, not distress) | 49 | Low–Med (pricing/discount danger) | Med | **~0** | per-subtype triggers, positive-econ negatives | Yes (pricing-danger probe) |
| **E3** cash-runway/working-capital/debt split | **0** on Round 1 (no real liquidity/AR-AP/debt evidence present) | 49 | **High** (financing/insolvency actions) | Med | **~0** | liquidity/debt triggers, danger-path | Yes (financing-danger probe) |
| **E4** market/GTM/demand | **0–1** (could let RW-001 diagnose market, but RW-001 is multi-cause + monitor-hallucination → still held) | 48–49 | Med | **High** (HSW-01/07-type) | **~0** | market triggers, causation-vs-correlation | Yes (competitor/regulatory probes) |
| **E5** legal/governance/key-person/capex | **~1** (RW-005 → capex-risk with reversible stage-gate action; ADV-004 → key-person, may still hold) | ~48 | **High** (capex/legal/irreversible) | High | **~1 (best case)** | capex/key-person/legal triggers, danger+constraint | **Yes (mandatory)** |
| **E6** intervention-quality upgrade | **0 new proceeds** (raises *quality* of already-committed; pass-rate, not proceed-rate) | 49 | Med | Med | **0 proceed; +quality** | per-archetype specificity, quality re-score (B4 std) | No (re-uses suite) |

## 2. THE HONEST CONCLUSION

**No single E2–E6 slice produces a material safe-proceed gain on Round 1**, because
the proceed rate is gated by two things archetypes cannot fix:
1. **41/49 placeholder cases** — a **benchmark evidence-quality defect**. The fix
   is a richer Round 2 with real multi-field evidence, **not** more archetypes.
2. **4 multi-domain holds** — the gate correctly refuses single-archetype answers
   to multi-cause cases. Safe conversion needs **multi-domain synthesis** (primary
   vs secondary cause ranking), a capability larger and riskier than any one slice.

## 3. RECOMMENDATION

**Do NOT proceed to E2 as the next build.** Highest-ROI next work, in order:

1. **Benchmark evidence enrichment (Round 2)** — replace placeholder financial
   strings with real multi-field evidence. This unblocks ~41 cases for *any*
   diagnosis and is the true bottleneck. (Reproducible-scoring per B4 standard.)
2. **Multi-domain synthesis design** (root-cause analysis, separately authorized)
   — let the engine designate a primary cause and treat off-archetype adverse
   evidence as secondary, so genuinely multi-cause cases can be diagnosed without
   weakening the causal-challenge gate. This is what would safely convert the 4
   held commits.
3. **If an archetype slice must be next, choose E5** — best *correctness* ROI
   (covers RW-003/RW-005 strategic and ADV-004 key-person) and the only slice with
   a plausible ~1 safe-proceed gain (RW-005 via a reversible stage-gate action).
   **E5 has the highest safety risk** (capex/legal/irreversible) and **mandatorily
   requires expanding the adversarial probe suite** before/with implementation.

**Reject** E2/E3 as next: ~0 Round-1 unlock and they add danger surface (pricing,
financing) without proceed-gain. **E6** improves quality but not proceed-rate.

## 4. SAFETY POSTURE FOR WHATEVER IS CHOSEN
Any capability slice must keep the adversarial suite **10/10 caught, 2/2 controls**
with **no Round 1 case moving from abstain into an unsafe proceed**, and (E3/E4/E5)
must **expand** the adversarial suite with new danger probes for the new domains.
The safety gate stays frozen.

**Stage A remains BLOCKED.** Continue allowed for planning; the next *implementation*
(benchmark enrichment, multi-domain synthesis, or E5) requires explicit owner
authorization.
