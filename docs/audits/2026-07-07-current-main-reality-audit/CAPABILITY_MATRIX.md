# OpsIQ Product Capability Matrix — Current Main Reality Audit

- Branch: `claude/current-main-reality-audit-bqkz4q`
- HEAD: `a14fae15` — "Long running business timeline simulation (#179)" (even with `origin/main`)
- Date: 2026-07-07
- Method: static search + file read + config inspection (node_modules absent → dynamic gates deferred to CI)
- Scale: 174 Prisma models, 328 API routes, 69 pages, 53 Playwright specs, ~926 active unit tests, 91 quarantined.

Classification vocabulary: COMPLETE / PARTIAL / MISSING / DUPLICATED / STUBBED / UI_ONLY / BACKEND_ONLY / UNTESTED / UNKNOWN.

## Summary table

| # | Capability | Class | Persist | Audit | Owner gate | Unit tests | Browser E2E | Reuse/Extend/Avoid |
|---|---|---|---|---|---|---|---|---|
| 1 | Owner Mode | **COMPLETE** | Prisma | Y | Y | Y (heavy) | Y (06,09,12,14,16,17,43,46,47,48,50) | REUSE (spine) |
| 2 | Manual Entry / Intake | **COMPLETE** | Prisma | Y | Y | Y | Y (51,16,21) | REUSE/EXTEND |
| 3 | Diagnosis / Recommendation / Action | **PARTIAL** | Prisma | Y | Y | partial — core engine tests quarantined | thin (15) | REUSE; re-activate ignored tests |
| 4 | Evidence / Audit | **COMPLETE** | Prisma | core | n/a | Y | indirect | REUSE `emitAuditEvent` |
| 5 | Finance / Budget / Cash / Profit | **COMPLETE (DUPLICATED)** | Prisma | Y | Y | Y | Y (08,29,30) | REUSE; consolidate cash-safety |
| 6 | Staff / Operator Execution Proof | **COMPLETE** | Prisma | Y | Y | Y | Y (25,26,43,20) | REUSE |
| 7 | SOP / Training | **COMPLETE** | Prisma | Y | Y | Y | none (only via 44) | REUSE; add UI/E2E if needed |
| 8 | Customer Retention / Reactivation | **BACKEND_ONLY** | **in-memory Map** | **N** | route-only | Y | none | AVOID as-is / add persistence |
| 9 | Marketing ROI | **COMPLETE** | Prisma (5 models) | Y | n/a | Y (6 files) | incidental | REUSE (reference template) |
| 10 | Opportunity Finder / Wealth / External | **COMPLETE** | Prisma (3 models) | Y | Y | Y (heavy) | Y (45,47,48,49) | REUSE |
| 11 | Tender / Application Assistance | **PARTIAL** | reuses #10 | Y | Y | indirect | none | EXTEND #10; no parallel module |
| 12 | Startup Mode | **BACKEND_ONLY** | none (stateless) | N | n/a | 1 unit | none | EXTEND — wire UI to route |
| 13 | Pricing | **STUBBED** | **in-memory Map** | N | N (non-owner cap) | engine unit | none | AVOID / REBUILD |
| 14 | Vendor / Procurement | **BACKEND_ONLY** | Prisma (VendorRecord) | Y | implicit | db + scenario | none direct | EXTEND — expose route+UI |
| 15 | Compliance / Risk | **PARTIAL** | Prisma (OwnerComplianceItem) | Y | N | boundary only | none direct | EXTEND compliance; consolidate risk |
| 16 | Capacity / Bottleneck | **COMPLETE** | Prisma | Y | verify step | Y | indirect (06,09) | REUSE/EXTEND |
| 17 | Waste / Leakage | **PARTIAL** | Prisma (OperationalEvent) | Y | permission gate | Y | folded into ops | EXTEND (unify COPQ) |
| 18 | Local Mode | **PARTIAL/STUBBED** | Prisma (PrivateModeAccess) | partial | Y (service) | Y | 48 (shadow) | REUSE service; fix gate |
| 19 | LLM / NLP Governed Analysis | **COMPLETE** | AuditEvent mirror only | Y | advisory-only | Y (mock) | none | REUSE; add gated live smoke |
| 20 | Live Connectors | **PLACEHOLDER_ONLY** | Prisma (10 models) | consent models | browser-import DRAFT | contract only | none | AVOID "live" claim; build fetch+routes |
| 21 | Simulation | **DUPLICATED** | AuditEvent only | ANALYZE log | none | Y (10 packs) | Y (41,42) | EXTEND packs; /scenario is toy |
| 22 | Learning / Outcome Review | **COMPLETE** | Prisma (12+ models) | Y | Y (human review) | Y | Y (43,45,50) | REUSE |

## Per-capability detail

### 1. Owner Mode — COMPLETE
- Domain `src/domain/owner-mode/*` (~90 files), services `src/services/owner-mode/*` (~45 files incl. `owner-action-gate.service.ts`, `owner-approval-resolution.service.ts`, `material-gate-registry.ts`).
- API: large `src/app/api/owner/*` tree. UI: `src/app/(authenticated)/owner/*` (cockpit, now, home, adjudication, execution, trust, wealth, portfolio, process-intelligence, recovery).
- Models: `OwnerBusiness`, `OwnerApprovalMemory`, `OwnerStandingInstruction`, `OwnerSelfEvaluation`, `OwnerAttentionEvent`, `OwnerMetricSnapshot`, `OwnerActionOutcome`, `OwnerReassessmentEvent`.
- Risk: surface sprawl → large regression blast radius. **REUSE as spine; do not add parallel owner subsystems.**

### 2. Manual Entry / Intake — COMPLETE
- `src/services/owner-mode/owner-manual-entry.service.ts` (real Prisma persist + PII fail-closed 422), `src/services/owner-intake/*`, `src/services/file-intake/persist-file-intake.service.ts`.
- API `src/app/api/owner/manual-entry/route.ts`, `src/app/api/owner/intake/*`. UI `owner/manual-entry`, `owner/intake`. Spec `51-owner-manual-entry`.
- Risk: single-parser choke point, `as unknown as` enum coercion. **REUSE/EXTEND the parser.**

### 3. Diagnosis / Recommendation / Action — PARTIAL
- `src/services/diagnosis.ts` orchestrator; `src/services/diagnostic-core/{archetype,bottleneck,maturity,root-cause}-engine.ts`; `src/services/recommendation/*`; `action-lifecycle.ts`.
- **Gap:** `src/__ignored_tests__/services/diagnostic-core/__tests__/*-engine.test.ts` (4 engine test files) are quarantined → core inference untested in CI. E2E thin.
- **REUSE; re-activate the ignored diagnostic-core tests before extending.**

### 4. Evidence / Audit — COMPLETE
- `src/services/evidence.ts` (idempotency + optimistic lock + audit), `audit-trail.ts`, `event-emitter.ts`, `audit-event-hash-chain-validator.ts`, `event-numbering-validator.ts`. Infra `@/infra/audit`.
- Two audit entrypoints (`@/infra/audit` vs `src/services/audit/log.ts`) — divergence risk. **REUSE `emitAuditEvent`; avoid the duplicate path.**

### 5. Finance / Budget / Cash / Profit — COMPLETE (DUPLICATED)
- Three near-identical stacks: `src/services/owner-finance/*`, `owner-cashflow/*`, `owner-budget/*` (each snapshot→diagnosis→action→verification). Models: `OwnerFinancialSnapshot`, `OwnerCashflowSnapshot/Cycle/...`, `BudgetPeriod/Line/Authority/Override`.
- Specs `08,29,30`. Risk: cash-safety drift across 3 stacks. **REUSE; consolidate cash-safety gates rather than add a 4th.**

### 6. Staff / Operator Execution Proof — COMPLETE
- `src/services/execution/{proof-intake,proof,proof-precheck}.service.ts`, `proof-risk-adjudication.service.ts`, `src/services/operator/*`. `/api/proof/{submit,review,dispute}` closes self-certification (server derives contract/actor). Specs `25,26,43,20`.
- **REUSE `intakeProofSubmission`; never accept client-supplied requirement/actor.**

### 7. SOP / Training — COMPLETE (no dedicated E2E)
- `src/domain/owner-sop/*`, `src/services/owner-sop/*`, `src/services/owner-mode/{sop-document,staff-training}.service.ts`. Models `OwnerSopDocument`, `OwnerSopCycle/...`, `OwnerStaffSkill`, `OwnerTrainingRecommendation`.
- No `tests/browser` SOP spec; no dedicated `/owner/sop` page. **REUSE backend; add SOP page/E2E if productized.**

### 8. Customer Retention / Reactivation — BACKEND_ONLY (weakest)
- `src/services/growth/retention-engine.ts` uses `static metricsStore`/`churnStore` **Map** (verified). No `Retention`/`Churn` Prisma model, no `emitAuditEvent`, no UI, no E2E.
- **AVOID reuse as-is; add Prisma models + audit before any owner-facing retention feature.**

### 9. Marketing ROI — COMPLETE
- `src/domain/owner-marketing/*` (ROI bands in `metrics.ts`), `src/services/owner-marketing/*` (audit), 5 Prisma models, 6 test files, UI 479-line page. **REUSE as reference vertical template.**

### 10. Opportunity / Wealth / External — COMPLETE
- `src/domain/owner-mode/external-opportunity-*`, `src/domain/owner-portfolio/*`, services + `/api/owner/opportunities/*`, `wealth-path`, `portfolio/*`. Models `ExternalOpportunitySignal`, `OpportunityValidationOutcome`, `OpportunityExecutionTask`. Spec `45`. Owner-approval on tender intake; explicit no-scrape/no-auto-submit boundary. **REUSE.**

### 11. Tender / Application Assistance — PARTIAL
- Sub-mode of #10: `external-opportunity-intake.ts` types `GOVERNMENT_TENDER`, `PUBLIC_PROCUREMENT_NOTICE`, `GRANT_OR_SCHEME_SIGNAL`; screening + go/no-go only. No proposal drafting, no auto-submit (explicitly disclaimed). **EXTEND #10 if drafting wanted; no parallel module.**

### 12. Startup Mode — BACKEND_ONLY
- `src/services/owner-strategy/startup.service.ts` (`validateStartupSession`, read-only, no persist/audit), `/api/owner/startup-validate` (OWNER_VIEW). No UI caller, no E2E. (`/api/startup` and `StartupStatus` are infra boot probes, unrelated.) **EXTEND — wire a UI page.**

### 13. Pricing — STUBBED
- `src/services/growth/pricing-engine.ts` `static tiersStore = new Map` (verified). Route `/api/growth/pricing-tiers` uses legacy `withEnforcementFull` + `ENGAGEMENT_UPDATE` (not an OWNER_* cap) + manual `x-workspace-id`. No `PriceTier` model, no UI, no audit. **AVOID/REBUILD with Prisma + canonical enforcement + audit.**

### 14. Vendor / Procurement — BACKEND_ONLY
- `src/domain/owner-budget/vendor-control.ts` (Section-20 risk flags), `src/services/owner-budget/vendor.service.ts` (`vendorRecord.create` + audit ×3), model `VendorRecord`. **No API route, no UI** — only reachable via budget service. **EXTEND — expose owner route + UI.**

### 15. Compliance / Risk — PARTIAL
- `src/services/owner-mode/compliance.service.ts` (`ownerComplianceItem.create` + audit), `/api/owner/compliance` (canonical, OWNER_MANAGE/VIEW, Zod). No UI, only a boundary test. "Risk" is fragmented across marketing risk-rules, vendor-control, harm-guardrails, portfolio risks, proof-risk — no unified owner risk model. **EXTEND compliance (UI + route/db tests); CONSOLIDATE risk.**

### 16. Capacity / Bottleneck — COMPLETE
- `src/domain/execution/capacity-ceiling.ts`, `src/services/owner-operations/{capacity-snapshot,employee-workload-snapshot,owner-workload-snapshot}.service.ts`, `/api/diagnosis/bottleneck` (idempotency-key). Models `OwnerCapacitySnapshot`, `OwnerWorkloadSnapshot`, `OwnerEmployeeWorkloadSnapshot`. No capacity-named spec. **REUSE/EXTEND.**

### 17. Waste / Leakage — PARTIAL
- Split across `src/domain/execution/{quality-economics(COPQ),lean-guardrail,false-lean-detector,complaint-rework}.ts` + `complaint-rework.service.ts`, `/api/complaint-rework`. Spine model `OperationalEvent`; no `Waste`/`Leakage` table or dashboard. **EXTEND — unify under an explicit leakage surface.**

### 18. Local Mode — PARTIAL / STUBBED
- Real: `src/services/private-mode/role-access.service.ts` (Prisma grant/revoke + owner approval), model `PrivateModeAccess`. Stub: `src/middleware/private-mode-gate.ts` trusts `x-user-id`/`x-private-mode-role` headers (verified "placeholder"). No true offline/LOCAL_ONLY runtime; "offline" is only `src/domain/remote-operations/offline-integrity.ts` logic. **REUSE service; fix/replace the gate before use.**

### 19. LLM / NLP Governed — COMPLETE (advisory-only)
- Provider port `src/services/ai/provider.ts`; live adapter `openai-provider.ts` (real fetch, key-gated, fail-closed AI_UNAVAILABLE). Governance in `copilot.ts` (schema validate + guardrail + `advisoryOnly: literal(true)` + ledger→AuditEvent). Live smoke skip-gated (`RUN_LIVE_AI`), manual workflow `ai-live-smoke.yml`. No `AiCallLedger` model. **REUSE; add keyed live smoke in a gated pipeline.**

### 20. Live Connectors — PLACEHOLDER_ONLY
- `src/services/external-systems/*` + 10 Prisma models (`ExternalProvider/Connection/OAuthToken/SyncJob/RawRecord/FieldMapping/DataLineage/ConnectionConsent`, `BrowserImportSession/Event/Consent`). **Every network op throws "not implemented" (verified); token "encryption" is base64 (verified); no connector API routes.** Real auth-URL/PKCE builder exists. **AVOID any "live connector" claim; EXTEND with real fetch + callback routes + real crypto.**

### 21. Simulation — DUPLICATED
- (a) `/scenario` runtime: `src/services/scenario/engine.ts` `runScenario()` ~15-line revenue/cost delta, fixed 0.8 confidence — toy. (b) `src/domain/scenarios/*` fixture packs seeded and asserted by specs `41,42` — internal test data exercising the decision runtime, not a simulator. No `Scenario`/`Simulation` Prisma model. **EXTEND (b) into a real engine; `/scenario` is near-throwaway.**

### 22. Learning / Outcome Review — COMPLETE
- 12 `controlled-learning-*.service.ts` (Prisma, workspace-scoped, APPROVED/REJECTED/DEFERRED), outcome stack `src/services/outcome*/*`, self-evaluation loop (`/api/owner/self-evaluation` → do-not-repeat + reassessment). 12+ Prisma models incl. `ControlledLearningCandidateAuditEntry`. Human review + consent + admission gates. Specs `43,45,50`. **REUSE.**
