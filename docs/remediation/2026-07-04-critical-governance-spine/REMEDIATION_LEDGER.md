# OpsIQ Critical Governance-Spine Remediation Ledger

Imported from docs/audits/2026-07-04-hostile-full-repo/EVIDENCE_LEDGER.json (42 findings).
Base main: 98762ba · Audit commit: 626052e · Remediation branch: claude/critical-governance-spine-remediation

Statuses: OPEN | IN_PROGRESS | FIXED_PENDING_TEST | CLOSED_PROVEN | DISPROVEN_WITH_EVIDENCE | BLOCKED_OWNER_DECISION_REQUIRED | BLOCKED_EXTERNAL_DEPENDENCY | DEFERRED_LOW_RISK_ONLY
Rule: no CRITICAL/HIGH may be DEFERRED_LOW_RISK_ONLY.

| ID | Sev | Class | Finding (short) | Status | Closure evidence |
|----|-----|-------|-----------------|--------|------------------|
| SEC-01 | CRITICAL | UNSAFE_OR_BYPASSABLE / FAKE_COMPLETE | resolveServerRole() unconditionally returns "admin" for EVERY authenticated user. This def… | CLOSED_PROVEN | sec-01-resolve-server-role.test.ts 7/7 |
| SEC-02 | CRITICAL | UNSAFE_OR_BYPASSABLE | Cross-tenant governed-decision write via POST /api/operator. Chain: (1) resolveServerRole=… | OPEN | |
| SEC-03 | HIGH | UNSAFE_OR_BYPASSABLE / PARTIAL | requireWorkspaceContext() returns workspaceId = session.user.id — a placeholder still wire… | OPEN | |
| SEC-04 | HIGH | UNSAFE_OR_BYPASSABLE (defense-in-depth absent) | The Prisma workspace-enforcement extension is INERT. WORKSPACE_OWNED_MODELS/GLOBAL_MODELS … | OPEN | |
| SEC-05 | MEDIUM | PARTIAL | Commit 3dd002f ('stop trusting client x-workspace-id') only partially applied. ~30 handler… | OPEN | |
| SEC-06 | MEDIUM | PARTIAL | Three incompatible role vocabularies coexist (admin/operator/viewer; system_admin/.../view… | OPEN | |
| IDEM-01 | CRITICAL | FAKE_COMPLETE | withIdempotency() in src/infra/idempotency.ts unconditionally runs the operation and retur… | OPEN | |
| AUDIT-01 | CRITICAL | UNSAFE_OR_BYPASSABLE | Only ONE mutation path (applyTaskTransition, delegated tasks) writes its audit event insid… | OPEN | |
| AUDIT-02 | HIGH | PARTIAL / STUB_OR_PLACEHOLDER | Audit logging is NOT centralized: 5 parallel mechanisms — infra/audit.emitAuditEvent (DB+h… | OPEN | |
| APPR-01 | HIGH | PARTIAL / UNSAFE_OR_BYPASSABLE | The >100000 approval-threshold workflow (canCompleteWithApprovalStatus/enforceApprovalRequ… | OPEN | |
| APPR-02 | HIGH | STUB_OR_PLACEHOLDER / UNSAFE | /api/override writes the override justification to a process-global in-memory array (overr… | OPEN | |
| CONC-01 | HIGH | UNSAFE_OR_BYPASSABLE | Core governed transitions are last-write-wins plain update({where:{id}}) with no version/s… | OPEN | |
| DEC-01 | HIGH | UNSAFE_OR_BYPASSABLE | Re-accept hole: validateDecisionForAcceptance allows status 'pending' OR 'in_progress' (hu… | OPEN | |
| OUT-01 | CRITICAL | FAKE_COMPLETE | Outcome 'success' is model-vs-model fabrication, not measured business metrics. accuracySc… | OPEN | |
| OUT-02 | CRITICAL | MISSING | The core product promise 're-evaluate when outcomes do NOT improve' is NOT wired. recordOu… | OPEN | |
| REEVAL-01 | HIGH | PARTIAL / MISSING | Of 9 CLAUDE.md mandatory adaptive triggers, 4 are wired (new critical evidence, unresolved… | OPEN | |
| SHOCK-01 | HIGH | STUB_OR_PLACEHOLDER | createShockEvent does NOT persist the ShockEvent (comment falsely claims 'model does not e… | OPEN | |
| EVID-01 | HIGH | DEAD_CODE_OR_UNREACHABLE / MISSING | The AI/deterministic anti-gaming precheck (runProofPrecheck/computeProofPrecheck) has ZERO… | OPEN | |
| GAME-01 | HIGH | UNSAFE_OR_BYPASSABLE | /api/owner/tasks/complete accepts client-supplied maxProofAgeDays (nullable). Passing null… | OPEN | |
| EVID-02 | MEDIUM | PARTIAL / MISLABELED | decision-evidence 'verified' is a passthrough boolean (verified: f.verified ?? false) — no… | OPEN | |
| AI-01 | HIGH | GENERIC_ADVICE_ENGINE | A canned generic-advice engine is LIVE on /api/diagnosis: BASE_RECOMMENDATIONS are 6 hardc… | OPEN | |
| AI-02 | HIGH | DEAD_CODE_OR_UNREACHABLE | The fine-grained abstention/danger/constraint safety gate (governance/abstention-engine.ts… | OPEN | |
| AI-03 | MEDIUM | PARTIAL | Per-recommendation proof linkage is dropped at persistence. The diagnosis carries exact ev… | OPEN | |
| BILL-01 | HIGH | UNSAFE_OR_BYPASSABLE | Subscription/rate-limit tier is read from a CLIENT-supplied x-tier header (actions/route.t… | OPEN | |
| BILL-02 | MEDIUM | PARTIAL | assertCapability selects currentPeriodEnd but never compares it to now(). A subscription l… | OPEN | |
| WEBHOOK-01 | HIGH | UNSAFE_OR_BYPASSABLE | The stripe webhook route does NOT await processing: handleWebhookEvent(event).then().catch… | OPEN | |
| WEBHOOK-02 | MEDIUM | FAKE_COMPLETE | The custom replay-timestamp check is theater: verifyWebhookSignature hardcodes timestamp =… | OPEN | |
| SCHEMA-01 | HIGH | PARTIAL / UNSAFE | Governed models carry NO direct workspaceId (scoped only indirectly via engagement_id): Ac… | OPEN | |
| SCHEMA-02 | HIGH | PARTIAL | 82 onDelete: Cascade in schema, including the Owner* governed-record tree (RecoveryFinding… | OPEN | |
| SCHEMA-03 | HIGH | UNSAFE / PARTIAL | Multiple models have a column named workspaceId whose FK points to ClientAccount, not Work… | OPEN | |
| SCHEMA-04 | HIGH | UNSAFE_OR_BYPASSABLE | Nearly every governed status is a free-form String (no enum/CHECK): Action.status, Subscri… | OPEN | |
| UI-01 | HIGH | MISLEADING / BROKEN | The primary nav landing /dashboard is a server component that fetches its OWN API by absol… | OPEN | |
| UI-02 | HIGH | COSMETIC / DEAD_END | Top-level /decisions ('Decision Inbox / Review, approve, and govern decisions') renders De… | OPEN | |
| UI-03 | HIGH | UNREACHABLE | The persistent sidebar (ui/shell/sidebar-nav.tsx NAV_ITEMS) has only 10 links; ~30 owner/o… | OPEN | |
| STUB-01 | MEDIUM | STUB_OR_PLACEHOLDER | engagements/[id]/experiments/[experimentId]/approve/route.ts uses 'Mock store for now - wo… | OPEN | |
| STUB-02 | MEDIUM | STUB_OR_PLACEHOLDER | api/public/engagements, /actions, /kpis return hardcoded mock arrays (mockEngagements/mock… | OPEN | |
| DEAD-01 | LOW | DEAD_CODE_OR_UNREACHABLE | Four large mock-data-generator components (execution-workspace-shell, portfolio-command-ce… | OPEN | |
| TEST-01 | HIGH | FAKE_COMPLETE (coverage false-confidence) | 97 test files live in src/__ignored_tests__/ and are globally excluded from vitest (vitest… | OPEN | |
| TEST-02 | HIGH | PARTIAL / UNSAFE | ci.yml runs a real DB suite with TEST_WITH_DB=true but EXCLUDES 23 quarantined files (52 f… | OPEN | |
| TEST-03 | MEDIUM | PARTIAL | The default `npm test` (no TEST_WITH_DB) additionally excludes all *.integration.test.ts (… | OPEN | |
| TEST-04 | HIGH | FAKE_COMPLETE | ACTIVE tests counted in the '13,994 passing' figure assert constants under governance-guar… | OPEN | |
| WRAP-01 | MEDIUM | PARTIAL | audit-wrapped-handlers reports 29 wrapped route files calling Response.json() directly ins… | OPEN | |

## Detailed remediation entries
(appended per-finding as work proceeds — see commit history + TEST_EVIDENCE_LEDGER.md)

### SEC-01 — always-admin authorization root — CLOSED_PROVEN
- **Root cause:** `src/services/auth/server-role.ts` `resolveServerRole()` returned the literal `"admin"` for any authenticated user.
- **Exploit:** every `resolveServerRole` consumer (run, override, operator, myday, scenario, entity, value, calibration, users/roles) treated all users as admin; `resolveApprovalGrant` in `/api/run` honored client `approvalFlag:true` for anyone.
- **Fix:** derive the effective legacy `UserRole` from the real `getPolicyContext()` (active membership + workspace-scoped role assignments) via the real capability layer: `APPROVAL_DECIDE`/`OVERRIDE_DECIDE` → admin; `ACTION_UPDATE`/`DECISION_CLOSE`/`RECOMMENDATION_CREATE` → operator; else viewer; no context → null (fail closed).
- **Test:** `src/__tests__/security/sec-01-resolve-server-role.test.ts` (7/7): null on no-membership, viewer for role-less member, admin only for approval-capable roles, no admin for analyst/client_team_member.
- **Remaining risk:** the legacy `access.ts` UserRole model still coexists with the RoleName model (SEC-06) — tracked; role now derived, not faked.
