# Commercial Credibility Audit — OpsIQ / Rebilix

Would OpsIQ be credible to a real paying business owner? Classification per item:
STRONG / ADEQUATE / WEAK / MISSING / BLOCKED. WEAK/MISSING items that materially
hurt credibility are cross-referenced to the gap register.

| # | Dimension | Class | Evidence / note |
|---|---|---|---|
| 1 | Time to first useful output | ADEQUATE | Signup → onboarding → `/api/run` diagnosis is a short path; onboarding pages exist (`quick-start`, `owner/onboarding`). Not timed E2E in a browser this audit. |
| 2 | Clarity of diagnosis | ADEQUATE | Diagnosis orchestrator + operator items produce problem/action/impact/confidence with baseline metrics. |
| 3 | Clarity of next action | STRONG | Owner command center + Next-Best-Move + priorities strip; now reachable Wealth Command Center (GAP-WIRE-01). |
| 4 | Specificity of Work Packages | ADEQUATE | Work Package composer produces kind/assignee/steps/proof requirement; delegated-task Proof FSM makes them executable + provable. |
| 5 | Trustworthiness of scores | ADEQUATE | Scores carry confidence + provisional flags + missing-inputs; dashboards surface inputs. Some composed scores (risk-adjusted) are heuristic. |
| 6 | Proof/audit credibility | STRONG (delegated-task) / WEAK (legacy Evidence) | Proof FSM resists reuse/stale/duplicate/fake with SoD + transactional audit. Legacy `Evidence` service is runtime-broken (GAP-EVIDENCE-DRIFT-01). |
| 7 | Financial safety credibility | ADEQUATE (was WEAK) | Real runway/cash gate exists; high-impact approval bypass fixed (GAP-FIN-01); `/api/override` client-trust still open (GAP-PROOF-02). |
| 8 | Staff accountability / fake-work resistance | STRONG | Proof FSM blocks completion without accepted, fresh, non-duplicate proof; performer ≠ approver. |
| 9 | Realistic startup guidance | ADEQUATE | Validation-first startup mode (shortlist, rejection reasons, kill/pivot criteria). Now reachable via Wealth page; still not routed into governed re-eval (GAP-WIRE-02 note). |
| 10 | Realistic growth guidance | ADEQUATE | Growth engines exist and are workspace-scoped; capacity/margin gating present in owner-budget path. |
| 11 | Ability to say no / stop / pivot / exit | STRONG | Guardrails block negative-impact/high-impact; startup kill/pivot criteria; cash-safety gate fail-closed. |
| 12 | Evidence quality | ADEQUATE | Hash/duplicate/staleness controls on the proof path. |
| 13 | Local-context honesty | ADEQUATE | Legal/jurisdiction boundary docs + tests exist (`local-legal-professional-boundary`), abstention gates. Not exhaustively re-audited. |
| 14 | Dashboard usefulness | ADEQUATE | Owner surfaces render inputs + confidence, not bare scores. |
| 15 | Support burden | ADEQUATE | Support diagnostics + smoke scripts exist; error governance sanitizes operator messages. |
| 16 | Onboarding burden | ADEQUATE | Guided onboarding shells; demo seed script. |
| 17 | Owner workload reduction | STRONG | Owner-workload-transfer scoring (minutes saved) + Work Package transfer to staff. |
| 18 | Differentiation from generic ChatGPT | STRONG | Governed state machine, proof enforcement, audit chain, workspace tenancy — not a chat wrapper. |
| 19 | Differentiation from dedicated apps | ADEQUATE | Cross-domain governed re-evaluation is the differentiator; not feature-count framing. |
| 20 | Willingness-to-pay logic | ADEQUATE | Ties advice to enforced execution + proof + financial safety; billing/entitlement scaffolding present (out of Owner-Mode scope). |

## Verdict
Owner Mode is commercially **credible for its defined scope** and materially stronger after this audit's fixes (reachable wealth surface, closed financial-approval bypass, closed cross-tenant header leaks). The credibility drags that remain are: the runtime-broken legacy Evidence service (looks like a feature, 500s in practice), the `/api/override` client-trust gap, and the documentation contradictions (now banner-corrected for the two worst offenders). None of the remaining items is a live tenant data leak; the live tenant control is the route layer, which is solid.
