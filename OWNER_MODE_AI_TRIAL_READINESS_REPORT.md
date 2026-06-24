# OWNER MODE AI TRIAL READINESS REPORT (Phase AI-20)

Date: 2026-06-24
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Scope: **Owner Mode governed AI copilot only.** No public AI, no autonomous agents, no connectors, no public SaaS.
Companion: `OWNER_MODE_AI_READINESS_AUDIT.md` (Phase A), `OWNER_MODE_DECISION_OS_RELIABILITY_REPORT.md`, `CURRENT_WORKFLOW_STATE.md`.

> Honest by mandate. No live-AI readiness is claimed without a live provider. No forbidden classification is used.

---

## 1. Executive verdict

The governed AI copilot **safety foundation is built and mock-tested end-to-end**, and the **full owner-flow is now proven LIVE against a real OpenAI model**: a provider-agnostic boundary, a workspace-scoped context builder, schema-validated structured outputs, a post-AI guardrail validator with the full reject taxonomy, prompt-injection defense, an auditable call ledger, a task registry encoding the governance invariants, and a scored evaluation harness. The AI-17 live smoke AND the AI-19 live owner-flow acceptance (note → extract → diagnosis review → red-team → owner approval → operator checklist → outcome review) both passed on a GitHub runner on synthetic data, with every governance boundary asserted live.

- **AI track classification: `AI_OWNER_TRIAL_READY_WITH_RESTRICTIONS`.** (NOT `AI_OWNER_TRIAL_READY_WITH_AI` — restrictions remain, see §20.)
- **Live AI: PASSED** — AI-17 smoke (6/6) + AI-19 owner-flow acceptance ran real OpenAI calls on a GitHub runner; the whole governed-AI suite is **71/71 with 0 skipped** under `RUN_LIVE_AI=true` (workflow run #4, 2026-06-24). Not faked.
- **Restrictions:** synthetic data only; in-memory ledger (no DB persistence yet); the chat-exposed key must be rotated; not all task runners implemented (breadth-only ones deferred).
- **Deterministic Owner Mode (separate track): `OWNER_INTERNAL_BETA`** (unchanged; CI green, DB+security proof, scored benchmark).

## 2. Deterministic Owner Mode status
`OWNER_INTERNAL_BETA` — CI fully green (DB-backed suite passes on `postgres:16`), §13 security DB negatives pass, scored SMB benchmark met all Alpha/Beta gates. See the reliability report.

## 3. AI Owner Mode status
`AI_OWNER_TRIAL_READY_WITH_RESTRICTIONS`. Architecture + guardrails proven on the mock track AND live: the AI-17 smoke (6/6) and the **AI-19 live owner-flow acceptance** both executed real OpenAI calls (synthetic data) on a GitHub runner — whole governed-AI suite `71/71, 0 skipped` under `RUN_LIVE_AI=true`. Every boundary held live (advisory-only, owner-approval, AI-is-not-verifier, deterministic learning gate, audit ledger).

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
| INTAKE_EXTRACT | AI-7 | IMPLEMENTED + **live-tested** (candidate facts stay unverified; owner must confirm) |
| MISSING_QUESTION_GENERATION | AI-1/AI-8 | IMPLEMENTED + **live-tested** |
| DIAGNOSIS_REVIEW | AI-9 | IMPLEMENTED + **live-tested** (advisory; cannot finalize) |
| OWNER_PROPOSED_ACTION_REDTEAM | AI-10 | IMPLEMENTED + **live-tested** (advisory classification) |
| OPERATOR_CHECKLIST | AI-12 | IMPLEMENTED + **live-tested** (execution-only; gated on owner-approved action) |
| OUTCOME_REVIEW | AI-13 | IMPLEMENTED + **live-tested** (cannot self-verify) |
| (all 14 classes) | AI-2 | DECLARED in the task registry with risk/approval/audit policy |

## 8. AI task classes deferred
`EVIDENCE_SUMMARY`, `SCENARIO_EXPLAIN` (AI-11), `EXECUTION_COACH` (AI-12 owner-facing variant), `CUSTOMER_MESSAGE_DRAFT`, `KNOWLEDGE_NOTE_DRAFT` (AI-14), `OWNER_BRIEFING` (AI-15), `AI_EVALUATION`. These follow the SAME governed pattern (schema + scannable-field extractor → `runGovernedAiTask`); they add breadth, not new safety properties, and are deferred rather than padded. Each is registered (risk/approval/audit) in `task-registry.ts`. The six runners exercised by the live owner-flow are implemented (§7).

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
`PASSED` — both the AI-17 smoke and the **AI-19 owner-flow acceptance** ran **real OpenAI calls on a GitHub runner** (synthetic data only). Whole governed-AI suite **71/71, 0 skipped** under `RUN_LIVE_AI=true`. Not faked.

- AI-17 smoke: run #3 (`d8a565d`) — `Tests 6 passed`; real latencies (MISSING_QUESTION 1284 ms `gpt-4o-mini`, DIAGNOSIS_REVIEW 403 ms `gpt-4o`) confirm live calls.
- **AI-19 owner-flow: run #4 (`2721c59`, 2026-06-24), job `ai-live-smoke` green.** `owner-flow-acceptance.test.ts (15 tests)` passed, including the single live end-to-end case **`drives owner note → extract → quality → questions → diagnosis review → red-team → approve → operator checklist → outcome review` (2624 ms — six sequential live OpenAI calls)**. Because `RUN_LIVE_AI=true` + key were present, the live tests RAN (0 skipped), not skipped.
- Governance proven LIVE end-to-end: candidate facts stayed `allCandidatesUnverified`; DIAGNOSIS_REVIEW kept `requiresOwnerApproval: true`; the action red-team stayed `advisoryOnly`; the operator checklist was `executionOnly` and only generated AFTER the deterministic owner approval; OUTCOME_REVIEW stayed `cannotVerifyAlone`; `assertVerifierIsNotAI("ai")` threw; learning eligibility resolved to `eligible_pending_human_review` deterministically (never AI); the ledger recorded ≥5 `openai` calls with prompt/schema/validator and `ledgerHasNoSecret()` passed.
- Output-contract: the provider now sends a per-task JSON shape hint, so live structured output is schema-valid (the model authors the AI steps; the deterministic validator still adjudicates every output).
- Why on a runner, not here: this dev container cannot reach `api.openai.com` (agent proxy `CONNECT … 403`, org egress denial — reported, not bypassed). The gated workflow is the supported live path; it skips cleanly (never fakes) anywhere the key/flag is absent.
- **Security:** a key shared earlier in plaintext chat is exposed and must be **rotated/revoked**; the live run used the repo Actions secret. No key was ever written to a file, committed, or logged; the ledger stores hashes only.

## 15. DB dependency status
The AI mock foundation needs **no DB** (in-memory ledger). Persisting the ledger + `AIProposalSandbox` approval flow is DB-gated; the deterministic DB path is already green in CI when needed.

## 16. Cost / latency / retry policy
Encoded per task in `task-registry.ts` (model tier, temperature 0 for decision tasks, max tokens, timeout, retries) and honoured by the OpenAI adapter (timeout via AbortController, bounded retries, fail-closed). No cost incurred until a key is set.

## 17. Manual fallback if AI unavailable
Always safe: every task's provider-unavailable / invalid / guardrail-rejected path returns `output: null` and the owner proceeds on the **deterministic** Owner Mode path (which is `OWNER_INTERNAL_BETA`). AI is strictly additive.

## 18. Owner trial go / no-go with AI
- **GO** for an AI-assisted **owner-internal trial WITH RESTRICTIONS** — the full governed owner flow is proven live; deterministic services remain the only authority and AI is strictly additive with a safe fallback.
- **AI-17 live smoke: DONE** (6/6). **AI-19 live owner-flow acceptance: DONE** (run #4; whole AI suite 71/71, 0 skipped under `RUN_LIVE_AI`).
- **Restrictions on the trial:** synthetic data first (validate on real data in a controlled limited trial before broad use); in-memory ledger (persist via `AuditEvent`/`AIProposalSandbox` for an auditable real-data trial); rotate the exposed key; breadth-only task runners still deferred.
- **NO-GO** for `AI_OWNER_TRIAL_READY_WITH_AI` until those restrictions are cleared. **NO-GO** (out of scope) for any public-AI / autonomous / public-SaaS classification.

## 19. AI-19 acceptance scenario coverage (LIVE — run #4)
Live-proven end-to-end with a real model + deterministic authority: (1) owner messy note → (2) AI candidate-fact extraction (unverified) → (3) deterministic source classification → (4) owner-confirmation required → (5) deterministic data-quality state → (6) AI missing-questions → (7) deterministic diagnosis/recommendation → (8) AI diagnosis review (cannot finalize) → (9) AI action red-team (advisory) → (10) hallucinated-evidence rejected → (11) prompt-injection rejected → (12) deterministic owner approval → (13) AI operator checklist (only for the approved action) → (14) operator sees execution-only guidance → (15) synthetic outcome → (16) AI outcome review (cannot verify alone; AI-is-not-verifier enforced) → (17) deterministic learning eligibility → (18) ledger records every call → (19) provider failure ⇒ `AI_UNAVAILABLE` → (20) no public-SaaS scope. Points 10/11/20 and all boundary checks also run in keyless CI (mock layer), so they are verified even without a key.

## 20. Remaining blockers + exact next steps
0. ✅ **DONE — AI-17 live smoke** (run #3) **and AI-19 live owner-flow acceptance** (run #4) on a GitHub runner; whole governed-AI suite `71/71, 0 skipped` under `RUN_LIVE_AI=true`, synthetic data.
1. **Rotate the exposed key** (shared in plaintext chat earlier); the live run used the repo Actions secret, but the chat-exposed key must be revoked regardless.
2. **Persist the AI call ledger** (via `AuditEvent`/`AIProposalSandbox`) for an auditable real-data trial — currently in-memory.
3. **Limited real-data trial** with the owner (small scope, owner confirms each candidate fact, every AI output advisory) before broad use → then consider `AI_OWNER_TRIAL_READY_WITH_AI`.
4. Implement remaining breadth-only task runners (AI-11/14/15, EVIDENCE_SUMMARY, CUSTOMER_MESSAGE_DRAFT) as needed (same governed pattern).
5. Optionally land the AI module on `main` (focused PR / PR #33) so the workflow runs from the default branch and the deterministic+AI tracks share one trunk.

---

### Hostile audit (AI track)
- *Fake?* Live AI is real but stays advisory — output is advisory-until-accepted, the adapter is fail-closed, and nothing AI-generated finalizes a decision. *Overbuilt?* Generic orchestrator keeps each task minimal; only the six runners the owner flow needs are implemented, the rest deferred. *Leak?* Context builder is fail-closed on workspace scope (asserted live + mock); ledger stores hashes not raw/secrets (no `sk-` in the ledger, asserted live). *Bypass owner approval / mutate state / verify outcome / unsafe learning?* Structurally impossible and **confirmed live** — registry `stateMutation: "none"`, schema advisory markers held (`requiresOwnerApproval`/`advisoryOnly`/`executionOnly`/`cannotVerifyAlone`), operator checklist only after deterministic approval, `assertVerifierIsNotAI` enforced, learning gate deterministic (`eligible_pending_human_review`). *Public SaaS touched?* No. *Live proof?* Present — AI-17 smoke (6/6) + AI-19 owner-flow (71/71, 0 skipped) against real OpenAI on synthetic data. *Over-claim?* No — classified `AI_OWNER_TRIAL_READY_WITH_RESTRICTIONS`, not `_WITH_AI` (restrictions in §20).
