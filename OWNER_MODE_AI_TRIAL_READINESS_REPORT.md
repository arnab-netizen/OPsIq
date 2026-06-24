# OWNER MODE AI TRIAL READINESS REPORT (Phase AI-20)

Date: 2026-06-24
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Scope: **Owner Mode governed AI copilot only.** No public AI, no autonomous agents, no connectors, no public SaaS.
Companion: `OWNER_MODE_AI_READINESS_AUDIT.md` (Phase A), `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`, `CURRENT_WORKFLOW_STATE.md`.

> Honest by mandate. No live-AI readiness is claimed without a live provider. No forbidden classification is used.

---

## 1. Executive verdict

The governed AI copilot **safety foundation is built and mock-tested end-to-end**, and the live path is now **proven against a real OpenAI model**: a provider-agnostic boundary, a workspace-scoped context builder, schema-validated structured outputs, a post-AI guardrail validator with the full reject taxonomy, prompt-injection defense, an auditable call ledger, a task registry encoding the governance invariants, and a scored evaluation harness. The **OpenAI adapter** (fetch-based, fail-closed) ran the AI-17 live smoke on a GitHub runner with the owner-supplied key and passed all cases on synthetic data.

- **AI track classification: `AI_LIVE_SMOKE_TESTED`.**
- **Live AI: PASSED** — AI-17 live smoke ran real OpenAI calls on a GitHub runner (synthetic data only) and all 6 tests passed (workflow run #3, 2026-06-24). Not faked. The live parts of AI-19 (full owner-flow acceptance) remain before any trial-ready-with-AI claim.
- **Deterministic Owner Mode (separate track): `OWNER_INTERNAL_BETA`** (unchanged; CI green, DB+security proof, scored benchmark).

## 2. Deterministic Owner Mode status
`OWNER_INTERNAL_BETA` — CI fully green (DB-backed suite passes on `postgres:16`), §13 security DB negatives pass, scored SMB benchmark met all Alpha/Beta gates. See the reliability report.

## 3. AI Owner Mode status
`AI_LIVE_SMOKE_TESTED`. Architecture + guardrails proven on the mock track (6 AI test files / 50 tests) AND on the live track — the AI-17 gated live smoke executed real OpenAI calls (synthetic data) and passed 6/6 on a GitHub runner. Full live owner-flow acceptance (AI-19) not yet run.

## 4. AI provider / config status
- Provider boundary: PRESENT (`src/services/ai/provider.ts`) with `UnavailableAiProvider` (default) + deterministic `MockAiProvider`.
- First live adapter: PRESENT (`src/services/ai/openai-provider.ts`, OpenAI, fetch-based, no SDK dep) — **provider-agnostic; OpenAI specifics isolated to that file**.
- Config: `OPENAI_API_KEY` set as a **GitHub Actions repo secret** (not in the dev container). Live AI runs only via the gated `ai-live-smoke.yml` workflow on a runner; locally/keyless the adapter still returns `AI_UNAVAILABLE` (fail-closed).

## 5. Required AI external connections
**Exactly one, owner-supplied:** an OpenAI API key (`OPENAI_API_KEY`). No other external connection. Data-privacy note: business context enters prompts — use an account/config with no-training/retention controls; the context builder already minimises + source-classifies + fences untrusted data.

## 6. Required env vars / secrets
- `OPENAI_API_KEY` (required for live smoke / live trial; never logged — the ledger stores hashes, not raw content/secrets).
- Optional later: `AI_MODEL_CHEAP` / `AI_MODEL_STRONG` overrides (defaults gpt-4o-mini / gpt-4o), timeout/retry knobs (currently per-task in the registry).

## 7. AI task classes implemented
| Task | Phase | Status |
|---|---|---|
| MISSING_QUESTION_GENERATION | AI-1/AI-8 | IMPLEMENTED + mock-tested |
| DIAGNOSIS_REVIEW | AI-9 | IMPLEMENTED + mock-tested (advisory; cannot finalize) |
| OWNER_PROPOSED_ACTION_REDTEAM | AI-10 | IMPLEMENTED + mock-tested (advisory classification) |
| OUTCOME_REVIEW | AI-13 | IMPLEMENTED + mock-tested (cannot self-verify) |
| (all 14 classes) | AI-2 | DECLARED in the task registry with risk/approval/audit policy |

## 8. AI task classes deferred
`INTAKE_EXTRACT` (AI-7), `EVIDENCE_SUMMARY`, `SCENARIO_EXPLAIN` (AI-11), `EXECUTION_COACH` (AI-12), `OPERATOR_CHECKLIST`, `CUSTOMER_MESSAGE_DRAFT`, `KNOWLEDGE_NOTE_DRAFT` (AI-14), `OWNER_BRIEFING` (AI-15), `AI_EVALUATION`. These follow the SAME governed pattern (schema + scannable-field extractor → `runGovernedAiTask`); they add breadth, not new safety properties, and are deferred rather than padded. Each is registered (risk/approval/audit) in `task-registry.ts`.

## 9. Guardrails implemented
`src/services/ai/validator.ts` — reject taxonomy enforced + tested: `REJECTED_SCHEMA_INVALID`, `REJECTED_HALLUCINATED_EVIDENCE`, `REJECTED_POLICY_VIOLATION`, `REJECTED_CONFIDENCE_OVERCLAIM`, `REJECTED_UNAUTHORIZED_ACTION`, `REJECTED_WORKSPACE_SCOPE`, `REJECTED_PROMPT_INJECTION`, `REJECTED_UNSUPPORTED_NUMBERS`, `AI_UNAVAILABLE`. AI output is advisory-until-accepted and can never bypass deterministic gates, approve, verify, mutate state, or create learning (enforced by schema markers + registry `stateMutation: "none"`).

## 10. Prompt-injection defense status
PRESENT + tested (AI-3): the 5 canonical attacks (approve / mark-verified / delete-audit / cross-workspace / unsafe-reassurance) are rejected when obeyed; clean output is accepted even when the hostile string is present only in untrusted DATA. A real gap was found+fixed here (the verify-directive regex).

## 11. AI context / retrieval policy status
PRESENT (`context-builder.ts` + `task-registry.ts`): workspace/business/task-scoped, fail-closed cross-workspace guard (reuses SEC-007/008), untrusted-data labelling, closed allowed-evidence-id set, per-task allowed/forbidden input kinds. No unrelated-workspace data can enter a context.

## 12. AI observability ledger status
PRESENT (in-memory, `copilot.ts`): every call recorded with task/risk/model/provider/prompt-version/schema-version/validator-result/accepted/latency/tokens/retries/failure + an output **hash** (never raw content, never secrets). DB persistence (via existing AuditEvent / AIProposalSandbox) is a follow-on when the DB-backed AI path is wired.

## 13. AI eval harness status
PRESENT + passing (AI-18, `eval-harness.ts`): scored coverage across `MOCK_AI_TESTED` / `GUARDRAIL_TESTED` / `PROMPT_INJECTION_TESTED` — 100% on the mock track.

## 14. Live AI test status
`PASSED` — the AI-17 gated live smoke ran **real OpenAI calls on a GitHub runner** (synthetic data only) and **all 6 tests passed**. Not faked.

- Run: workflow **AI Live Smoke (manual, gated)** run #3 (`d8a565d`, 2026-06-24), job `ai-live-smoke` green. The smoke step env shows `RUN_LIVE_AI: true` and `OPENAI_API_KEY: ***` (GitHub-masked) — the gate was active and the key present.
- Result: `Test Files 1 passed (1)`, `Tests 6 passed (6)`. Real network latencies confirm live calls (a skip would be 0 ms): MISSING_QUESTION_GENERATION **1284 ms** (model `gpt-4o-mini`), DIAGNOSIS_REVIEW **403 ms** (model `gpt-4o`). The other live cases (OWNER_PROPOSED_ACTION_REDTEAM, prompt-injection-not-obeyed, provider-failure fail-closed) and the always-on gating guard all passed.
- Governance proven live: DIAGNOSIS_REVIEW kept `requiresOwnerApproval: true`; the red-team returned an advisory classification, never an approval; the injection embedded in untrusted DATA was not obeyed; a bad-baseURL provider failed closed to `AI_UNAVAILABLE`. The `ledgerHasNoSecret()` assertion passed — the call ledger contained no `sk-` substring and no key.
- Why on a runner, not here: this dev container cannot reach `api.openai.com` (the agent proxy returns `CONNECT … 403`, an org egress-policy denial — reported, not bypassed). GitHub-hosted runners have OpenAI egress, so the gated workflow is the supported live path. The same gating means the suite skips cleanly (never fakes) anywhere the key/flag is absent.
- **Security:** a key was earlier shared in plaintext chat → that key is exposed and must be **rotated/revoked**; the live run used the repo Actions secret. No key was ever written to a file, committed, or logged; the ledger stores hashes only.

## 15. DB dependency status
The AI mock foundation needs **no DB** (in-memory ledger). Persisting the ledger + `AIProposalSandbox` approval flow is DB-gated; the deterministic DB path is already green in CI when needed.

## 16. Cost / latency / retry policy
Encoded per task in `task-registry.ts` (model tier, temperature 0 for decision tasks, max tokens, timeout, retries) and honoured by the OpenAI adapter (timeout via AbortController, bounded retries, fail-closed). No cost incurred until a key is set.

## 17. Manual fallback if AI unavailable
Always safe: every task's provider-unavailable / invalid / guardrail-rejected path returns `output: null` and the owner proceeds on the **deterministic** Owner Mode path (which is `OWNER_INTERNAL_BETA`). AI is strictly additive.

## 18. Owner trial go / no-go with AI
- **GO** for an AI-assisted trial **in mock/guardrail mode** (no live model) — the governed pipeline + deterministic path are proven.
- **AI-17 live smoke: DONE** (`OPENAI_API_KEY` provided as a repo secret; live smoke passed 6/6 on synthetic data). Live AI is proven at the smoke level.
- **NO-GO** for a full **live-AI owner trial** until the AI-19 end-to-end owner-flow acceptance is run live and the ledger is DB-persisted. Outside the gated workflow, live AI stays disabled (fail-closed).
- **NO-GO** (out of scope) for any public-AI / autonomous / public-SaaS classification.

## 19. AI-19 acceptance scenario coverage (mock)
Mock-proven now: workspace-scoped context (fail-closed), missing-question generation, schema + hallucinated-evidence + injection rejection, advisory diagnosis-review (cannot finalize), advisory action red-team, outcome-review (cannot self-verify), AI-unavailable fallback, ledger records every call. **Requires live AI:** the end-to-end owner→messy-note→extract→confirm→live-review→approve→execute→outcome flow with a real model (steps gated by `OPENAI_API_KEY`).

## 20. Remaining blockers + exact next steps
0. ✅ **DONE — egress + AI-17 live smoke.** `api.openai.com` egress is denied in the dev container (CONNECT 403), so the gated live smoke was run on a **GitHub runner** via `.github/workflows/ai-live-smoke.yml` (dispatched against the feature branch). All 6 cases passed on synthetic data (run #3, 2026-06-24).
1. **Rotate the exposed key** (one was shared in plaintext chat earlier). The live run used the repo Actions secret; the chat-exposed key must be revoked regardless.
2. Implement deferred task runners (AI-7/11/12/14/15) as needed (same governed pattern).
3. Run **AI-19** owner-flow acceptance live (owner→messy-note→extract→confirm→live-review→approve→execute→outcome); persist the ledger via `AuditEvent`/`AIProposalSandbox` if a DB-backed AI trial is wanted.
4. Land the AI module on `main` (or merge PR #33 / a focused subset) so the workflow runs from the default branch directly, and so the deterministic+AI tracks share one trunk.
5. Re-classify `AI_LIVE_SMOKE_TESTED` → `AI_OWNER_TRIAL_READY_WITH_RESTRICTIONS` only after AI-19 live acceptance + ledger persistence.

---

### Hostile audit (AI track)
- *Fake?* Live AI is now real but stays advisory — output is advisory-until-accepted, the adapter is fail-closed, and nothing AI-generated finalizes a decision. *Overbuilt?* Generic orchestrator keeps each task minimal; deferred tasks not padded. *Leak?* Context builder is fail-closed on workspace scope; ledger stores hashes not raw/secrets (asserted live — no `sk-` in the ledger). *Bypass owner approval / mutate state / verify outcome / unsafe learning?* Structurally impossible — registry `stateMutation: "none"`, schema advisory markers, validator rejects approval/verify directives; the live run confirmed `requiresOwnerApproval` stayed true and injection was not obeyed. *Public SaaS touched?* No. *Live proof?* Present — AI-17 smoke passed 6/6 against real OpenAI on synthetic data. *Full live owner-flow (AI-19)?* Not yet — correctly not claimed.
