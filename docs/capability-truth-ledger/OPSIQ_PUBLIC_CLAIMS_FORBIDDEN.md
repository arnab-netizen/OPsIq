# OpsIQ — FORBIDDEN Public Claims

**Date:** 2026-07-07 · Truth-control audit (PASS 34).

These 20 claims are **forbidden** in any marketing, demo, sales, investor, or
website context. Each is either unsupported by repo evidence, or actively
contradicted by the code's own governance. A claim is forbidden if OpsIQ cannot
prove it with source + tests + CI + audit evidence today.

| # | Forbidden claim | Why it is forbidden |
|---|-----------------|---------------------|
| 1 | "OpsIQ saved/turned around a real business." | No verified real-world outcome data exists. All proof is synthetic fixtures. |
| 2 | "OpsIQ increased revenue / profit by X% / £X." | OpsIQ fabricates no money; it computes no real revenue/profit figure. |
| 3 | "OpsIQ guarantees your business will survive / recover." | Survival/recovery engines explicitly refuse to guarantee outcomes; unrecoverable stays unrecoverable. |
| 4 | "OpsIQ has an X% success / win probability." | No probability is computed or validated anywhere. |
| 5 | "OpsIQ saves owners X hours per week." | Workload reduction surfaces burden but does not measure real time saved. |
| 6 | "OpsIQ uses AI to understand your business." | No live LLM write-path is active; decisions are deterministic rules. |
| 7 | "OpsIQ automatically fixes your problems." | OpsIQ proposes governed corrections; humans execute. Nothing auto-executes. |
| 8 | "OpsIQ contacts your customers / sends messages for you." | External action is prohibited (`external_action_prohibited`). |
| 9 | "OpsIQ submits tenders / makes purchases / applies discounts for you." | All such actions are blocked as unsafe; owner-approval only. |
| 10 | "OpsIQ manages your staff / payroll / disciplining / firing." | Staff issues route to training/coaching only; no discipline/payroll/HR automation. |
| 11 | "OpsIQ gives you legal / regulatory / tax advice." | compliance-boundary blocks legal/regulatory automation; no legal engine exists. |
| 12 | "OpsIQ is a fully autonomous business operator / agent." | Autonomy is capped at draft/advise + owner approval by policy. |
| 13 | "OpsIQ's recommendations are proven to improve outcomes." | Effectiveness attribution refuses to claim improvement without a verified executed correction; no real outcome proof exists. |
| 14 | "OpsIQ learns and self-improves on its own." | controlled-learning gates every candidate behind privacy/harm/rollback + owner governance. |
| 15 | "OpsIQ detects all fraud / gaming / bad proof." | Anti-gaming screens known tamper/reuse patterns only; no completeness claim. |
| 16 | "OpsIQ is production-ready / enterprise-ready / owner-usable today." | 0 of 35 assessed capabilities are surfaced in an owner-visible UI. Backend + CI only. |
| 17 | "Owners are using OpsIQ to run their businesses." | No live owner deployment exists; no owner-visible UI surface. |
| 18 | "OpsIQ integrates with your accounting / POS / bank / CRM." | No live external connectors are wired. |
| 19 | "Every OpsIQ capability is continuously tested in CI." | 10 DB simulations exist on disk but are NOT wired into the required lane; 4 assessed modules are unit-only. |
| 20 | "OpsIQ can scale your business / tells you when to scale." | Every engine blocks scale-before-validation; it explicitly refuses ready-to-scale. |

## Rule
If a claim is not on OPSIQ_PUBLIC_CLAIMS_ALLOWED.md and cannot be backed by named
repo evidence, treat it as forbidden by default. When unsure, mark
`CLAIM_RESTRICTED` and do not publish.
