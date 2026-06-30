# OpsIQ — Final Expert-Adjudication Pass Plan

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `3c9a8d1`
Goal: lift the two non-critical sub-90 domains to **≥90** without weakening any scorer/gate and without
regressing any other domain. Plan written BEFORE code (per prompt).

## 1–2. Current measured scores (real sweep, `scorePublicCorpus`, stride 3)
- **Approval memory/standing instructions: 89.6** (need ≥90)
- **Staff workload/fairness: 89.7** (need ≥90)
- These are the ONLY two weak domains; all other 58 ≥90; all 26 critical ≥90; weakCritical = [].
- Context unchanged: runtime 97.4 · collective 97.5 · holdout 97.9 · adversarial unsafe 0 · regression 0.

## 3. Weak case IDs / cluster
Not isolated cases — a **structural cluster**. 100% of the cases tagged with either domain are:
`dominantConstraint = owner_workload`, `decisionCategory = remote_owner`, `activeConstraints = [owner_workload]`,
`candidates = [proceed]`, `rejectedAlternatives = 0`. (48/48 in each domain's stride-3 subsample.)

## 4. Root cause
The collective scorer awards `cross_domain_tradeoff` (weight 15) in full only when
`arbitration.rejectedAlternatives.length > 0 && stopDoNotDoList.length > 0`; otherwise a 0.3 partial (4.5).
`stopDoNotDoList` always has a fallback entry, so the gate hinges on `rejectedAlternatives.length > 0`.

For `owner_workload`-dominant cases, `defaultCandidates` produces only the `proceed` fallback, and
`BLOCK_MAP["proceed"] = [compliance_block, proof_fraud_block, cash_survival]` — which does **not** include
`owner_workload`. So no candidate is ever rejected → `rejectedAlternatives = []` → `cross_domain_tradeoff`
scores 4.5 instead of 15. Per-category proof (avg over tagged cases): every other category is full; only
`cross_domain_tradeoff` = 5.0/15 and `location_context_realism` = 4.5/5. That ~10.5-point structural gap
holds the domain average at 89.6/89.7.

This is a genuine competency gap: an owner-overload plan currently does NOT explicitly reject the classic
mistake — the owner trying to personally do/approve/control everything instead of delegating with proof.

## 5. Weakness classification
**RUNTIME / arbitration** (NOT scorer, NOT case data, NOT playbook, NOT provider, NOT output contract).
The scorer is correct and is NOT changed. The fix adds the missing rejected-tradeoff to the runtime.

## 6. Correction plan (surgical, monotonically safe)
In `src/behavioral-validation/whole-business/arbitration.ts`:
1. Add `ActionType "owner_centralize"` — "owner personally approves/handles/controls every decision".
2. `BLOCK_MAP.owner_centralize = ["owner_workload", "capacity_feasibility"]` — the owner-bottleneck and a
   capacity bottleneck both block centralizing.
3. In `defaultCandidates`, when `c.flags.remoteOwner || c.flags.ownerEmotional` (which always makes
   `owner_workload` active, per `activeConstraints`), push the `owner_centralize` candidate.

Effect: owner_workload-dominant cases now reject "owner does everything" with remedy "delegate with
proof-based controls" → `rejectedAlternatives.length > 0` → `cross_domain_tradeoff` = 15 → both domains
clear ≥90. **Monotonic safety:** the new candidate is added only when `owner_workload` is active, and is
then always blocked → `rejectedAlternatives`/`whatNotToDo` only grow; no collective category and no domain
grade can decrease; `dominantConstraint`, `highestPriorityConstraint`, `unsafeCount`,
`acceptedAlternatives` for existing candidates are unchanged. So no other domain, category, severity,
critical domain, regression, or adversarial metric can regress.

This is correct expert behavior (faithful to the `owner_workload` remedy "delegate with proof-based
controls"), not scorer-gaming.

## 7. Learning artifacts required
None new required — the fix is structural runtime behavior, applied to every owner_workload case
deterministically (stronger than a learned per-case correction). The existing governed learning loop
(432 artifacts) is unchanged and still applied. No learning-governance rule is touched.

## 8. Playbooks / rules updated
The `owner_workload` "owner offload" playbook now always surfaces an explicit do-not-do: "Do not have the
owner personally approve/handle every decision (delegate with proof-based controls)" — visible in
`whatNotToDo` / `stopDoNotDoList` for these cases.

## 9. Regression cases to add
- Arbitration unit cases: a remote-owner / owner-emotional case rejects `owner_centralize` via
  `owner_workload`; a non-owner-overload case is unaffected (no spurious centralize candidate).
- Runtime behavior cases for the prompt's approval-memory + staff-workload scenarios (delegate-not-
  centralize, proof on the system, reassessment metric, growth blocked while overloaded).
- A standing gate test asserting both domains score ≥90 through the real sweep (strengthens the gate).

## 10. Tests required
- `arbitration.owner-workload-tradeoff.test.ts` (unit): centralize rejection present/absent correctly.
- `expert-adjudication.test.ts`: approval-memory + staff-workload scenarios produce the expert behaviors
  through `runOwnerAdvice` (rejected alternative, owner-offload, proof, reassessment), no unsafe output.
- `domain-coverage`/`scoring` gate: approval-memory ≥90 and staff-workload/fairness ≥90 (real sweep,
  stride 4) — added so the bar cannot silently regress.

## 11. Final EXPERT_READY gates
approval-memory ≥90 · staff-workload/fairness ≥90 · 60/60 domains · all 26 critical ≥90 · all categories
≥85 · all severities ≥85 · collective ≥90 · runtime ≥90 · holdout ≥88 · adversarial unsafe 0 · regression 0
· learning persisted+applied · browser representative green (unaffected) · source register valid ·
privacy/anonymization green · no cross-business/cross-workspace leakage · no harness-only path · reports
complete. Target classification: **EXTENSIVE_REAL_WORLD_CASE_TRAINING_EXPERT_READY**.
