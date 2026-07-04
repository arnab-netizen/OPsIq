# Real Business Simulation Report

**Test:** `src/__tests__/owner-mode/real-business-owner-loop.db.test.ts` · **Result:** 5/5 PASS ·
**Nature:** DB-backed, no mocks — every assertion is read back from PostgreSQL.

## Setting
"Sparkle Laundry" — an owner and one staff member in one workspace, a client contract engagement
("Acme Hotels — reduce rewash rate"). Real services: `assignDelegatedTask`, `intakeProofSubmission`
(with the EVID-01 precheck), `reviewProof`, `completeTask`, `archiveClient`,
`detectHighPriorityOverdueActions`, and the real `triggerReEvaluation` engine.

## Scenarios and results

1. **Staff without evidence cannot close work.** Owner delegates a proof-required task; an attempt to
   complete it with no accepted proof throws `TaskCompletionBlockedError` and writes an
   `OWNER_TASK_COMPLETION_BLOCKED` audit event. → Proof gate holds.

2. **Weak/forged proof is never mistaken for verified.** Staff submits a proof with a malformed
   `fileHash`. The precheck returns `POSSIBLE_TAMPER_RISK` and advances the proof to
   `NEEDS_HUMAN_REVIEW` (not `ACCEPTED`); completion remains blocked. → EVID-01 screening works
   end-to-end.

3. **Genuine proof + human acceptance clears the gate, with separation of duty.** Staff submits a
   well-formed proof → `AI_PRECHECK_PASSED`. The **staff** submitter is denied when trying to accept
   their own proof (separation of duty). The **owner** accepts it (human final acceptance — the AI
   never can). With an accepted, non-duplicate, fresh proof the task reaches `APPROVED_COMPLETE`.

4. **Major client loss triggers governed re-evaluation.** `archiveClient` archives the contract and
   runs the **real** re-evaluation engine, which writes a `CONDITION_CHANGED` audit event for the
   archived client (correlation-tagged major client loss).

5. **Owner non-compliance is detected and re-evaluated.** A critical recommendation's action is left
   overdue; `detectHighPriorityOverdueActions` raises a critical
   `ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE` and routes `owner_non_compliance` into re-evaluation
   (`CONDITION_CHANGED` on the engagement).

## Four-dimension coverage (CLAUDE.md product truth)
- **Consulting lifecycle** — engagement + recommendation + action progression.
- **Business condition** — re-evaluation writes `CONDITION_CHANGED` on client loss / non-compliance.
- **Intervention mode/phase** — re-evaluation engine evaluates and can shift them (exercised via the
  real engine run).
- **Human execution reality** — delegation, proof, separation of duty, owner non-compliance,
  key-person/major-client shocks.

## What this does and does not prove
It proves the **governance spine** an owner depends on: work cannot be closed without genuine,
human-accepted evidence; weak/forged/reused evidence is caught; and material shocks (client loss,
non-compliance) automatically re-evaluate the engagement. It does not exercise every module (finance,
marketing, wealth dashboards); those are compile- and route-tested but not in this behavioural loop.
