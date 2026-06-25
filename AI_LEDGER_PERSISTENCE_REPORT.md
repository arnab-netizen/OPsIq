# AI Ledger Persistence — Slice Report

Date: 2026-06-25
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Classification: **AI_LEDGER_PERSISTED_AND_RUNTIME_WIRED**

## Objective
Persist the governed AI call ledger/audit records durably (previously in-memory) using
existing repo mechanisms with minimum code surface, then wire the persistence sink at the
runtime composition root — without changing AI decision authority.

## Durable target & decision
**`AuditEvent`** (table `audit_events`). **No schema change. No new table.**

Why existing audit storage was sufficient:
- `AuditEvent.payload` (`Json`) holds the full structured per-call record; `workspaceId`
  (indexed) gives isolation; `eventName` (indexed) and `correlationId` (indexed, plain
  string — holds the non-UUID `aiCallId`) give queryability; `visibility="internal"` keeps
  rows owner/admin/internal-only; `occurredAt` is the timestamp.
- `auditEvent` is registered as a workspace-owned model, so the Prisma workspace-enforcement
  middleware requires `workspaceId` on writes and is fail-closed on unscoped reads.
- The copilot's own header already named this path ("persist via the existing audit event
  mechanisms").
- No append-only DELETE/UPDATE trigger exists on `audit_events` (those are on
  `canonical_events`), and `logAuditEvent` never sets `previousHash`, so AI rows cannot break
  any hash chain.
- `AIProposalSandbox` was unfit (requires a `recommendationId` + approval semantics, not
  per-call telemetry); `CanonicalEvent` is the per-aggregate event stream (eventNumber /
  idempotency) — wrong fit. `AuditEvent` is the smallest safe target.

> Note: persistence writes `AuditEvent` rows **directly** (real columns only). It deliberately
> does not reuse `logAuditEvent`, which writes phantom `before`/`after` columns that do not
> exist on the table (a pre-existing inconsistency, out of this slice's scope).

## Persisted fields (per accepted/rejected call)
`ai_call_id`, `workspace_id`, `business_id`, `task_type`, `risk_level`, `model_provider`,
`model_name`, `prompt_version`, `schema_version`, `input_context_hash`, `source_ids`,
`output_hash`, `validator_result` (schema stage), `guardrail_result` (guardrail stage),
`accepted_or_rejected`, `latency_ms`, `retry_count`, `created_at`; and when applicable/available:
`decision_id` / `action_id` / `outcome_id`, `token_usage`, `cost_estimate`, `failure_reason`.

References and hashes only — never API keys, raw model output, or raw business content.

## Runtime wiring
- Composition root: `src/instrumentation.ts` → `register()` (Next.js server startup,
  `NEXT_RUNTIME === "nodejs"` only; never Edge; never run by vitest).
- It calls `registerAiLedgerPersistence()` (in `ledger-persistence.ts`), which registers the
  audit-event sink on the copilot via `setAiCallLedgerSink(createAuditEventLedgerSink())`.
- Wrapped fail-open so a wiring hiccup never blocks server boot.
- Governed AI tasks currently have **no other production caller** (the AI trial has not
  started); the sink makes every future governed call persist automatically.

## Safety properties
- **AI authority unchanged:** AI remains advisory. Persistence is a downstream audit *mirror*
  invoked from `record()`; it cannot approve, verify, mutate state, or create learning, and the
  recorded output was already adjudicated by the validator/guardrails upstream.
- **Fail-safe for AI:** the sink never throws into the advisory path; `record()` wraps the sink
  call, and the async sink swallows persistence errors.
- **Observable failures:** persistence failures (including a fail-closed secret-scan rejection)
  are logged via the governed `logger.error` channel.
- **Fail-closed for secrets:** `assertNoSecrets` (OpenAI/Bearer/PEM/AWS patterns) runs before
  every write; a secret-bearing payload is blocked from storage.
- **Workspace isolation:** writes carry `workspaceId`; reads (`getPersistedAiCallLedger`,
  `countPersistedAiCalls`) are always workspace-scoped and reject an empty workspace.
- **Internal only:** rows are `visibility="internal"`, `actorType="system"`; no operator/client
  read path, no route, no UI.

## Verification
- CI `build-and-test (20.x)` on `postgres:16` (`TEST_WITH_DB=true`): **green** — run
  `28137086017`, job `83326180042`, commit `04d3489` (the 3 `[db]` ledger tests + 8 unit tests
  pass; `[db]` round-trip first proven green locally on real PostgreSQL).
- `tsc --noEmit`: 0 errors.
- Keyless AI suite: 74 passed / 10 skipped (live + `[db]`), incl. the runtime-wiring test.
- Owner-mode regression subset: 1850 passed (36 files).
- `governance:scan`: no new errors. eslint: 0 errors on changed files.

## Files
Created: `src/services/ai/ledger-persistence.ts`,
`src/__tests__/services/ai/ledger-persistence.test.ts`,
`src/__tests__/services/ai/ledger-persistence.db.test.ts`,
`src/__tests__/services/ai/ledger-runtime.test.ts`, this report.
Changed: `src/services/ai/copilot.ts` (ledger entry fields + sink + `hasAiCallLedgerSink`),
`src/services/ai/ledger-persistence.ts` (registration + governed-logger sink),
`src/instrumentation.ts` (register sink at startup),
`src/domain/constants/audit-events.ts` (`AI_CALL_RECORDED`).

## Out of scope (untouched)
Public SaaS, billing, Product Hunt, pricing, onboarding, launch/marketing pages, dashboard UI,
external integrations, AI decision authority, DB schema/migrations.

## Remaining before real owner-data trial
The persistence + runtime wiring are complete. The real owner-data trial itself is a separate,
not-yet-started step (no production flow invokes the governed AI tasks yet); starting it is
outside this slice.
