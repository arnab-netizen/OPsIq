# OpsIQ — Maximum Reliability Expert Climb Plan

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `aa012a4` · Rung: `MAX_RELIABILITY_CORE_READY`.
Goal: lift the 10 non-critical near-95 domains to **≥95** without regression or weakening, to reach
`MAX_RELIABILITY_EXPERT_READY`. Plan before fix code (diagnosis below is read-only measurement, not the fix).

## 1–4. The 10 domains, current score, weak category, root cause (measured per-category, stride 5)
| Domain | Score | Lost category | Dominant constraint of its cases | rejectedAlternatives |
|---|---|---|---|---|
| Customer complaints/reputation | 92.4 | cross_domain_tradeoff (−7.5) | customer_quality (87) + capacity (29) | empty for the 87 quality cases |
| Customer retention | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Customer service | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Reputation/social-media crisis | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| SOPs | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Checklists | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Process improvement | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Staff training | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Delivery/logistics | 90.0 | cross_domain_tradeoff (−10) | customer_quality | empty |
| Brand/franchise constraints | 94.7 | cross_domain_tradeoff (−5) | customer_quality (29) + compliance (29) | empty for the 29 quality cases |

**Single shared root cause (measured, not guessed):** for `customer_quality`-dominant cases, `defaultCandidates`
emits only the `proceed` fallback, and `BLOCK_MAP["proceed"]` does not include `customer_quality`, so no
candidate is rejected → the collective scorer's `cross_domain_tradeoff` (weight 15) scores the 0.3 partial
(4.5) instead of 15. Every other collective category is full. This is the SAME structural gap that held
approval-memory + staff-workload at ~89.5 (fixed there via the `owner_centralize` candidate).

## 5. Where the fix belongs
**Arbitration candidate** (runtime), NOT scorer/case/gold. The scorer is correct and unchanged. OpsIQ should
explicitly reject the classic "grow / spend on acquisition while quality/complaints are unresolved" mistake —
which is the `customer_quality` remedy verbatim ("Fix quality/complaints before spending on acquisition or
cutting service capacity"). Currently that rejected tradeoff is missing for quality-dominant cases.

## 6. Planned correction
In `arbitration.ts` `defaultCandidates`: when the `customer_quality` activation condition holds
(`c.flags.capacityRisk || /complaint|rework|quality|missing|late delivery|defect/.test(caseText)`), push a
tempting candidate `{ action: "Spend on acquisition/marketing to grow while complaints/quality are
unresolved", type: "spend_marketing" }`. `spend_marketing` is already blocked by `customer_quality`, so it is
always rejected when added → `rejectedAlternatives`/`whatNotToDo` gain the explicit tradeoff →
`cross_domain_tradeoff` becomes full → the quality-dominant clusters rise from 90–92 to ~100. Dedupe
`defaultCandidates` by `type` so a case that already had a `spend_marketing` candidate (e.g. cash-dominant)
keeps exactly one (no behaviour change there).

**Monotonic safety:** the candidate is added only when `customer_quality` is active and is then always
blocked (spend_marketing ∈ blocked-by customer_quality), so `rejectedAlternatives`/`whatNotToDo` only grow;
no collective category, domain grade, dominant constraint, `highestPriorityConstraint`, regression, or
adversarial metric can decrease. Dedup-by-type is a no-op for all existing single-type candidate sets.

## 7. Tests required
- Arbitration unit: a customer_quality (complaints/rework) case rejects the new `spend_marketing` tradeoff
  via `customer_quality`; a non-quality case does not fabricate it; dedupe keeps one spend candidate.
- Strengthen the scoring gate: assert **every** domain ≥95 (not just ≥90) via the real sweep, and
  `nearThreshold(<95)` domains == [] — locking the bar.
- Existing arbitration / whole-business / public-cases / max-reliability suites stay green (no regression).

## 8. Regression risk
Low/again monotonic — same class of fix already proven safe (owner_centralize). Risk: dedup could drop a
needed candidate — mitigated by keeping the FIRST of each type (existing behaviour) and only ever ADDING a
new type for quality cases. Browser: the whole-business card surfaces do-not-do/arbitration which only gains
an item; re-run `13`+`14` to confirm.

## 9. Final expert classification gates
All 60 domains ≥95 (or justified) · all ASSURED_EXPERT_READY · collective types ≥90 · no weak segment ·
0 unresolved high-risk · runtime ≥90 · collective ≥90 · holdout ≥88 · unsafe 0 · regression 0 · all
assurance suites green · ratchet green · browser 17/17 · DB isolation green · no leakage · no harness-only ·
reports complete → `MAX_RELIABILITY_EXPERT_READY`.
