# OWNER MODE AI TRIAL READINESS REPORT (Phase AI-20)

Date: 2026-06-24
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Scope: **Owner Mode governed AI copilot only.** No public AI, no autonomous agents, no connectors, no public SaaS.
Companion: `OWNER_MODE_AI_READINESS_AUDIT.md` (Phase A), `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`, `CURRENT_WORKFLOW_STATE.md`.

> Honest by mandate. No live-AI readiness is claimed without a live provider. No forbidden classification is used.

---

## 1. Executive verdict

The governed AI copilot **safety foundation is built and mock-tested end-to-end** with zero cost and no API key: a provider-agnostic boundary, a workspace-scoped context builder, schema-validated structured outputs, a post-AI guardrail validator with the full reject taxonomy, prompt-injection defense, an auditable call ledger, a task registry encoding the governance invariants, and a scored evaluation harness. A real **OpenAI adapter** is implemented behind the port (fetch-based, fail-closed) but **cannot be live-proven without `OPENAI_API_KEY`**.

- **AI track classification: `AI_MOCK_GUARDRAIL_TESTED`.**
- **Live AI: `BLOCKED_NO_AI_PROVIDER`** (no `OPENAI_API_KEY`; AI-17 live smoke + the live parts of AI-19 cannot run — and must not be faked).
- **Deterministic Owner Mode (separate track): `OWNER_INTERNAL_BETA`** (unchanged; CI green, DB+security proof, scored benchmark).

## 2. Deterministic Owner Mode status
`OWNER_INTERNAL_BETA` — CI fully green (DB-backed suite passes on `postgres:16`), §13 security DB negatives pass, scored SMB benchmark met all Alpha/Beta gates. See the reliability report.

## 3. AI Owner Mode status
`AI_MOCK_GUARDRAIL_TESTED`. Architecture + guardrails proven on the mock track (6 AI test files / 50 tests). No live AI exercised.

## 4. AI provider / config status
- Provider boundary: PRESENT (`src/services/ai/provider.ts`) with `UnavailableAiProvider` (default) + deterministic `MockAiProvider`.
- First live adapter: PRESENT (`src/services/ai/openai-provider.ts`, OpenAI, fetch-based, no SDK dep) — **provider-agnostic; OpenAI specifics isolated to that file**.
- Config: `OPENAI_API_KEY` **absent** → adapter returns `AI_UNAVAILABLE` (fail-closed). Live disabled.

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
`BLOCKED_WITH_EVIDENCE` — live smoke **attempted with a real key (2026-06-24), not faked, and could not complete because of an environment network-policy denial**, NOT a key or code defect.

- A gated live-smoke suite exists (`src/__tests__/services/ai/openai-live-smoke.test.ts`): real OpenAI calls only under `RUN_LIVE_AI=true` + `OPENAI_API_KEY` (synthetic data only; asserts the ledger never contains the key); skips cleanly otherwise.
- With a key supplied, the suite *ran* (no longer skipped) but **every live call returned `AI_UNAVAILABLE`**. Root cause (proven by `curl -v` via the proxy): the agent proxy returns `HTTP/1.1 403 Forbidden` to `CONNECT api.openai.com:443` — `api.openai.com` is **not on this environment's egress allowlist** (an organization network-policy denial; the README says to report 403/407 policy denials, not bypass them).
- Therefore **no live OpenAI call succeeded** → `AI_LIVE_SMOKE_TESTED` is NOT claimed. The adapter behaved correctly and **fail-closed** (`AI_UNAVAILABLE`, never fabricated). The key could not even be validated (the 403 occurs at the proxy *before* the request reaches OpenAI).
- Runtime note: Node's built-in `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` (Node ≥22.21) + `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`; even with those set the host stays denied here, so this is infrastructure, not code.
- **Security:** the key was shared in plaintext chat → it is exposed and must be **rotated/revoked**. It was never written to a file, committed, or logged; the ledger stores hashes only.

## 15. DB dependency status
The AI mock foundation needs **no DB** (in-memory ledger). Persisting the ledger + `AIProposalSandbox` approval flow is DB-gated; the deterministic DB path is already green in CI when needed.

## 16. Cost / latency / retry policy
Encoded per task in `task-registry.ts` (model tier, temperature 0 for decision tasks, max tokens, timeout, retries) and honoured by the OpenAI adapter (timeout via AbortController, bounded retries, fail-closed). No cost incurred until a key is set.

## 17. Manual fallback if AI unavailable
Always safe: every task's provider-unavailable / invalid / guardrail-rejected path returns `output: null` and the owner proceeds on the **deterministic** Owner Mode path (which is `OWNER_INTERNAL_BETA`). AI is strictly additive.

## 18. Owner trial go / no-go with AI
- **GO** for an AI-assisted trial **in mock/guardrail mode** (no live model) — the governed pipeline + deterministic path are proven.
- **NO-GO** for a **live-AI** trial until: `OPENAI_API_KEY` is provided; AI-17 live smoke passes on non-sensitive sample data; and the full AI-19 owner-flow acceptance is run live. Until then live AI stays disabled (fail-closed).
- **NO-GO** (out of scope) for any public-AI / autonomous / public-SaaS classification.

## 19. AI-19 acceptance scenario coverage (mock)
Mock-proven now: workspace-scoped context (fail-closed), missing-question generation, schema + hallucinated-evidence + injection rejection, advisory diagnosis-review (cannot finalize), advisory action red-team, outcome-review (cannot self-verify), AI-unavailable fallback, ledger records every call. **Requires live AI:** the end-to-end owner→messy-note→extract→confirm→live-review→approve→execute→outcome flow with a real model (steps gated by `OPENAI_API_KEY`).

## 20. Remaining blockers + exact next steps
1. **Network egress to `api.openai.com` is denied by this environment's proxy policy (CONNECT 403).** This is the actual live-AI blocker (a key was provided). Clear it by EITHER (a) allowlisting `api.openai.com` in the environment's network policy, OR (b) running the gated live smoke in an environment WITH OpenAI egress (a CI runner / dev machine with the key as a secret + `NODE_USE_ENV_PROXY=1` + `NODE_EXTRA_CA_CERTS` if proxied). Then:
2. Run **AI-17 live smoke** on non-sensitive sample data (missing-question, diagnosis-review, action red-team, provider-failure fallback). Record model/latency/tokens/validator results.
2a. **Rotate the exposed key** (it was shared in plaintext chat).
3. Implement deferred task runners (AI-7/11/12/14/15) as needed (same governed pattern).
4. Run **AI-19** owner-flow acceptance live; persist the ledger via AuditEvent if a DB-backed AI trial is wanted.
5. Re-classify toward `AI_LIVE_SMOKE_TESTED` → `AI_OWNER_TRIAL_READY_WITH_RESTRICTIONS` only with live evidence.

---

### Hostile audit (AI track)
- *Fake?* No live AI exists, so nothing AI-generated is presented as real; the adapter is fail-closed and the validator is advisory-until-accepted. *Overbuilt?* Generic orchestrator keeps each task minimal; deferred tasks not padded. *Leak?* Context builder is fail-closed on workspace scope; ledger stores hashes not raw/secrets. *Bypass owner approval / mutate state / verify outcome / unsafe learning?* Structurally impossible — registry `stateMutation: "none"`, schema advisory markers, validator rejects approval/verify directives. *Public SaaS touched?* No. *Live proof missing?* Yes — by design, gated on the key.
