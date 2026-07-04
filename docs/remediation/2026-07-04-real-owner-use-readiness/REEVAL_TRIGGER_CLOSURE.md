# REEVAL-01 — Mandatory Adaptive Trigger Closure

**Status:** CLOSED_PROVEN · **Commits:** `43a3e75b`, `9a367391` ·
**Tests:** `reeval-01-remaining-triggers.db.test.ts`, `real-business-owner-loop.db.test.ts`

CLAUDE.md requires every significant change to route into governed re-evaluation of the
BusinessConditionProfile, InterventionMode, InterventionPhase, recommendation/action priority, review
cadence, and health status. The re-evaluation engine (`services/re-evaluation.ts › triggerReEvaluation`)
was real, but three of the nine mandatory `SignificantChangeType` triggers had **no runtime caller**.

## Trigger → caller map (all 9 now wired)

| SignificantChangeType | Real caller | Correlation key |
|-----------------------|-------------|-----------------|
| `new_critical_evidence` | evidence validation path (pre-existing) | evidence id |
| `kpi_deterioration` | `escalation.ts › detectKPIDeteriorationPattern` (**wired** `43a3e75b`) | `kpi-deterioration:<eng>:<kpiIds>` |
| `unresolved_critical_blocker` | blocker services (pre-existing) | blocker id |
| `failed_implementation` | outcome path (pre-existing) | outcome id |
| `shock_event` | shock service (pre-existing / `f2df27fd`) | shock id |
| `scope_change` | engagement scope path (pre-existing) | scope id |
| `owner_non_compliance` | `escalation.ts › detectHighPriorityOverdueActions` (**wired** `9a367391`) | `owner-non-compliance:<eng>:<actionIds>` |
| `major_client_loss` | `client-account.ts › archiveClient` (**wired** `9a367391`) | `major-client-loss:<client>:<eng>` |
| `key_employee_loss` | employee lifecycle path (pre-existing) | member id |

## Guarantees
- Each new trigger is **correlation-idempotent** (the engine dedupes on `re-eval:<correlationId>:<ws>`
  via the DB idempotency record), so a repeated detection does not double-run re-evaluation.
- `owner_non_compliance` fires only for **critical** overdue actions (an overdue open action whose
  linked Recommendation has `priority = critical`), computed with no invented columns.
- `major_client_loss` iterates the archived client's **active** engagements (excludes
  completed/cancelled/archived) and routes each into re-evaluation.

## Proof
- Unit-scoped DB test drives `archiveClient` and asserts `major_client_loss` fired for the active
  engagement.
- The real-business simulation runs the **actual engine** (no mock) for both `major_client_loss`
  (client archive) and `owner_non_compliance` (overdue critical action) and reads back the resulting
  `CONDITION_CHANGED` audit events.
