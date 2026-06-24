# OWNER MODE AI READINESS AUDIT (Phase A)

Date: 2026-06-23
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm` · Commit: `a2db09e`
Scope: **Owner Mode only.** Public SaaS / billing / public AI chat = OUT OF SCOPE, not touched.
Type: **audit only** (no AI code, no provider, no connectors implemented).

Companion: `OWNER_MODE_TRIAL_READINESS_AUDIT.md`, `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`, `OWNER_MODE_DECISION_OS_ARCHITECTURE.md`, `CURRENT_WORKFLOW_STATE.md`.

---

## 1. Executive verdict

OpsIQ today is a **fully deterministic** Owner Mode engine. There is **no AI provider, no LLM call, no prompt, no AI output schema, and no AI execution pipeline** anywhere in the codebase. Every `LLM`/`ai` reference in `src/` is either a "no LLM" purity comment or a **guard that rejects AI as authority**.

However, the repo is **not hostile to AI** — it already contains a deliberate, deterministic **AI-governance skeleton** built in anticipation of a governed copilot: an AI observability trace, model/prompt/ruleset/eval versioning, a governed `AIProposalSandbox` DB model, and hard guards (`AI_IS_NOT_A_VERIFIER`, `/llm_output/` evidence rejection, source classification). What is missing is the **AI execution layer** (provider boundary, prompts, structured-output schemas, post-AI validator, context builder, calls, evals).

**AI track classification: `AI_ARCHITECTURE_READY_PROVIDER_MISSING`** (governance skeleton present; execution pipeline + provider absent).
**Live AI: `BLOCKED_NO_AI_PROVIDER`** — requires an owner decision on provider + an API key (cost/privacy/vendor choice).
**Deterministic track is unchanged: `OWNER_INTERNAL_ALPHA` (conditional)** — the two trial blockers from the trial-readiness audit still stand (DB proof; `intake-adapter` gstBasis).

The two tracks must stay separate: a deterministic-only trial can run with manual inputs; an AI-assisted trial cannot until a provider is wired and guardrail/live tests pass.

---

## 2. Evidence (what was searched, what was found)

| Search | Result |
|---|---|
| AI SDK deps (`openai`/`anthropic`/`gemini`/`langchain`/`ai-sdk`/…) in package.json | **NONE** |
| AI provider env vars in `.env.example` / staging | **NONE** |
| `openai`/`anthropic`/`gemini`/`.chat.completions`/`gpt-`/`claude-` in `src/` (non-test) | **NONE** (zero call sites) |
| Provider boundary / client wrapper (`aiClient`/`llmClient`/`callLLM`/`chatCompletion`) | **NONE** |
| Prompts / templates / tool-calling / json_schema-for-AI | **NONE** (only deterministic Zod schemas for app data) |
| `prompts/` `ai/` `llm/` `agent/` `copilot/` directories | **NONE** |

So: **AI_PROVIDER_MISSING, AI_PROVIDER_CONFIG_MISSING, AI_NOT_USED_IN_OWNER_MODE, PROMPTS_MISSING, STRUCTURED_OUTPUT_MISSING** (for AI; deterministic output schemas exist), **AI_CONTEXT_POLICY_MISSING, AI_EVALUATION_MISSING**.

---

## 3. What already exists and is REUSABLE (do not rebuild)

| Capability the prompt wants | Existing reusable artifact | Notes |
|---|---|---|
| AI observability ledger (Phase H) | `src/domain/owner-mode/ai-observability-trace.ts` | `OwnerAiTrace`/`OwnerAiTraceEvent` covering the full loop, `createAiTrace`/`addTraceEvent`, workspace-scoped, **public/internal redaction** (`toPublicTraceView`), risk flags, blocked-gates. **In-memory** (no DB) — needs model/provider/token/cost fields + persistence for a true call ledger. |
| Model/prompt/ruleset/eval versioning (Phase E/H `prompt_version`,`schema_version`) | `src/domain/owner-mode/model-versioning.ts` | `VersionType` (model/prompt_template/ruleset/evaluation), `regressionIsRequired`, change-control validators. |
| Governed AI proposal (AI not final authority) | `AIProposalSandbox` Prisma model | workspace+recommendation scoped, `sourceModel`, `confidenceLevel`, `isApproved`/`approvedBy`/`rejectedReason`. **DB-gated** landing spot for AI proposals requiring approval. |
| AI-is-not-verifier guard (Phase O) | `security-rules.ts` `AI_IS_NOT_A_VERIFIER` + `assertVerifierIsNotAI()` (SEC-006) | Throws if any verifier type contains an AI term. Hard guard. |
| LLM-output-not-evidence guard (§1.11 / Phase D) | `owner-dashboard.ts` `/llm_output/i` reject pattern; `source-classification.ts` (AI inference ranked low, never VERIFIED_RECORD) | Foundation for prompt-injection/hallucination defense. |
| Workspace-scope primitive (Phase C) | `security-rules.ts` `assertWorkspaceScopedQuery`; `prisma-workspace-enforcement`; middleware | Context builder must compose these. |
| Deterministic gates AI must not bypass | data-quality, diagnosis-permission, survival/unit-econ, decision/owner-approval, attribution, learning-eligibility | All present + tested (Phases 1–16). AI is advisory over these. |
| Audit event store | `AuditEvent` (hash chain) + `CanonicalEvent` | Reuse for AI-call audit events if DB available. |

**Conclusion:** the governance contract for "AI everywhere, AI nowhere as final authority" is **already encoded**. New work is the execution pipeline, not the governance philosophy.

---

## 4. What is MISSING (the AI execution pipeline)

| Missing piece | Phase | Minimum-code shape |
|---|---|---|
| AI provider boundary (one port + mock/unavailable impl) | E | one interface `AiProvider` + a `MockAiProvider`/`UnavailableAiProvider`; no SDK dep until a key is chosen |
| Task-class registry (id, risk, schema, model tier, fallback) | B | one typed config object (pure) |
| Structured-output Zod schemas per task | F | pure schemas (reuse Zod already in repo) |
| Post-AI validator / guardrails (reject taxonomy) | G | one pure validator over (schema, input context, deterministic gates) |
| AI context builder (workspace/business/task-scoped, source-classified) | C | one pure builder composing `assertWorkspaceScopedQuery` + source-classification |
| Prompt-injection defense (untrusted-data labelling + hostile-instruction rejection) | D | pure: wrap untrusted text as data; validator rejects injected directives |
| AI call ledger fields (model/prompt_version/schema_version/tokens/cost/validator_result) | H | extend `ai-observability-trace` event shape; persist via `AuditEvent`/`AIProposalSandbox` when DB available |
| AI eval harness (mock + live tracks) | R | extend existing benchmark/test patterns with AI cases |
| Actual AI tasks (intake-extract, missing-questions, diagnosis-review, recommendation/owner-action red-team, scenario-explain, execution-coach, outcome-review, knowledge-note, owner-briefing) | I–Q | each = prompt + schema + validator wiring; advisory only |

None of E–R requires a provider **key** to build and **mock-test**; only live-AI proof (Phase R live track / Phase S acceptance) needs the key.

---

## 5. Required external connection (AI)

**Exactly one, and it is an owner decision:** a single LLM provider for the governed copilot. The owner must choose provider + supply an API key (cost, data-privacy, and vendor are the owner's call). Until then, live AI is `BLOCKED_NO_AI_PROVIDER`.

| Item | Status |
|---|---|
| Provider name | UNDECIDED — owner choice (e.g. Anthropic / OpenAI / a local model). Repo has no preference baked in. |
| Env var | none defined yet — to be added (e.g. `AI_PROVIDER`, `<PROVIDER>_API_KEY`) when chosen |
| Structured-output support | required (must support JSON-schema/tool-style structured output for decision-relevant tasks) |
| Mock provider for tests | required and buildable now (no key) |
| Live provider for trial | required, key-gated, owner-supplied |
| Data-privacy risk | HIGH consideration — owner business financials go into prompts; context builder must minimise + source-classify; prefer a provider/account with no-training / data-retention controls |

No other external connection is permitted in this execution (no bank/POS/CRM/WhatsApp/scraping).

---

## 6. Required env vars / secrets (AI)

To be introduced when a provider is chosen (none exist today): `AI_PROVIDER` (selector), `<PROVIDER>_API_KEY` (secret, never logged), optional `AI_MODEL_CHEAP` / `AI_MODEL_STRONG`, `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`. The mock/guardrail track needs **none** of these.

---

## 7. DB dependency status

- `ai-observability-trace` is **in-memory** (no DB) — usable for the mock/guardrail track now.
- A durable AI call ledger + `AIProposalSandbox` approval flow are **DB-gated** (no reachable `DATABASE_URL` in-container; see trial-readiness audit). Persisted AI-governance proof is therefore blocked until the DB blocker clears (free via CI `postgres:16`).

---

## 8. Phase-A classification matrix

| Dimension | Classification |
|---|---|
| AI provider | AI_PROVIDER_MISSING |
| AI provider config | AI_PROVIDER_CONFIG_MISSING |
| AI used in owner mode | AI_NOT_USED_IN_OWNER_MODE |
| Prompts | PROMPTS_MISSING |
| Structured output (AI) | STRUCTURED_OUTPUT_MISSING |
| AI guardrails | **AI_GUARDRAILS_PARTIAL** (strong deterministic anti-AI guards present; no post-AI output validator) |
| AI audit ledger | **AI_AUDIT_LEDGER_PARTIAL** (in-memory trace + AuditEvent + AIProposalSandbox; no per-call model/token ledger) |
| AI context policy | AI_CONTEXT_POLICY_MISSING |
| Prompt-injection defense | **PROMPT_INJECTION_DEFENSE_PARTIAL** (untrusted-content source classification + llm_output guard; no AI-specific validator) |
| AI evaluation | AI_EVALUATION_MISSING |
| Overall AI track | **AI_ARCHITECTURE_READY_PROVIDER_MISSING** |
| Live AI | **BLOCKED_NO_AI_PROVIDER** |

---

## 9. Smallest safe next implementation step (recommended)

A **provider-agnostic, key-free, mock-guardrail foundation** — buildable and fully testable now without any provider key, DB, or cost, reusing the existing skeleton:

**Slice "AI-1 — Governed copilot foundation (mock track)":**
1. **Provider boundary (Phase E):** one `AiProvider` port + `UnavailableAiProvider` (default) + `MockAiProvider` (test). No SDK dep. AI-unavailable returns an explicit `AI_UNAVAILABLE` result, never fake output.
2. **Task registry + one schema (Phase B/F):** typed task-class config; implement **one lowest-risk task first** — `MISSING_QUESTION_GENERATION` (LOW_CONTENT, cannot mutate state) with its Zod output schema.
3. **Post-AI validator (Phase G):** pure validator with the reject taxonomy (schema-invalid / hallucinated-evidence / policy-violation / confidence-overclaim / workspace-scope / prompt-injection / unsupported-numbers). Advisory-until-accepted.
4. **Context builder stub (Phase C):** pure, workspace/business/task-scoped, source-classified; blocks the call if workspace scope can't be proven.
5. **Ledger extension (Phase H, in-memory):** extend `ai-observability-trace` event with model/prompt_version/schema_version/validator_result/accepted-or-rejected (no DB).
6. **Mock guardrail + prompt-injection + hallucinated-evidence + workspace-scope + AI-unavailable tests (Phase R mock track).**

This yields classification `AI_MOCK_GUARDRAIL_TESTED` with **zero external cost and no key**, and leaves a clean seam to plug a real provider later (Phase E live impl behind the same port).

**Owner decision required before live AI (Phase S):** pick a provider and supply a key (cost/privacy/vendor). This is the genuine external blocker — surfaced for an explicit owner choice rather than assumed.

---

## 10. Hostile audit (Phase A)

- *Could anything be fake?* No AI exists, so nothing AI-generated is presented as real today — the deterministic guards (`AI_IS_NOT_A_VERIFIER`, `/llm_output/`) actively prevent it. The risk arrives only when AI is wired; the validator (Slice AI-1 step 3) must land before any AI output reaches the owner.
- *Overbuilt?* The recommended foundation reuses trace/versioning/sandbox/guards and adds one port + one task + one validator — minimal. No agent framework, no tool-calling, no autonomous execution (forbidden).
- *Public SaaS touched?* No.
- *Dead code?* The existing `ai-observability-trace`/`model-versioning`/`AIProposalSandbox` are currently lightly used; this plan gives them an active caller (turning latent scaffolding into used infrastructure) rather than adding parallel systems.
- *Live-provider proof missing?* Yes — by design; key-gated owner decision. *DB proof missing?* Yes — ledger persistence is DB-gated.
