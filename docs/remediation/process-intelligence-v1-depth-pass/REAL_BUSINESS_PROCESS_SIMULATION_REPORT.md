# Real-Business Process Intelligence — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Jobs pass through proof/review (accepted proofs `p1–p3`
reviewed by the manager). Repeated quality **complaints** and **rework** land on that accepted work; the
manager leaves two HIGH **escalations** unacknowledged past due. DB-backed
(`process-intelligence-simulation.db.test.ts`, `TEST_WITH_DB=true`). **2/2 pass.**

## Flow + result
| Step | Result |
|---|---|
| 3 accepted washes reviewed by the manager | baseline of accepted work |
| 2 quality complaints + 3 rework events on accepted proof (active/overdue) | drives `QUALITY_FAILURE_LOOP` / `REWORK_LOOP` linked to the operational-event ids |
| Manager ignores 2 escalations past due | drives `ESCALATION_RESPONSE_BREAKDOWN` (manager id + escalation ids `esc1`, `esc2`) |
| `getOwnerNowView(wsL)` | `processIntelligence.topFinding` = a real high-value breakdown (not DATA_INSUFFICIENT), with a specific correction, a related SLO, and the required approval level |
| Evidence | at least one finding links real operational-event or escalation ids; the escalation finding names the manager + both escalation ids |
| Safety | no fabricated financial impact, no fraud/negligence label, no hidden score |
| Clean workspace | `processIntelligence.topFinding = DATA_INSUFFICIENT`; no `wsL` evidence id leaks in |

## Interpretation for the owner
"Instead of a pile of separate flags, OpsIQ now tells me the ONE place my process is breaking today —
'quality is failing on accepted work' or 'your manager isn't answering escalations' — and shows me the
exact complaints, rework, or escalations behind it, which profit leak/constraint it maps to, and one
specific fix (tighten the acceptance checklist; reassign the escalations). It never invents a rupee
figure, never calls anyone a fraud, and keeps no secret staff score. A clean shop shows nothing invented."

## Browser E2E
Untouched this pass; status unchanged.
