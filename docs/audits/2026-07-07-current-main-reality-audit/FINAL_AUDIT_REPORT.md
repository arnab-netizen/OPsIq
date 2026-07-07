# OpsIQ Current-Main Reality Audit — Claude Operating Layer + Product Capability Gap Map

Hostile, skeptical, evidence-based audit of latest main. **This is an audit, not an implementation.** No product logic was changed.

---

## 1. Branch and HEAD

- **Designated branch (used):** `claude/current-main-reality-audit-bqkz4q`
  - The audit prompt asked for `claude/current-main-reality-audit-operating-layer`, but the session's Git Development Branch Requirements mandate `claude/current-main-reality-audit-bqkz4q` and forbid pushing elsewhere without explicit permission. The mandated branch was used.
- **HEAD before changes:** `a14fae157ee4623bba55ae82a295bbdfdd10812b` — "Long running business timeline simulation (#179)"
- **origin/main:** `a14fae15` (identical). `git rev-list --left-right --count origin/main...HEAD` → `0  0` (branch even with main).
- **Working tree at start:** clean.
- **HEAD after commit:** see final response (audit-artifacts-only commit).

## 2. Commands run

```
git status / branch --show-current / rev-parse HEAD / log --oneline -5
git fetch origin main ; git rev-list --left-right --count origin/main...HEAD   # 0 0
find/ls: .claude, .governance, opsiq_claude_low_usage_pack/.claude, .github/workflows
cat: package.json, playwright.config.ts, .claude/commands/continue-build.md, ai-live-smoke.yml,
     src/services/ai/provider.ts, openai-provider.ts, external-systems provider-registry/sync-manager
find src/app -name route.ts (328) / page.tsx (69)
wc -l prisma/schema.prisma (4750) ; grep -c '^model ' (174) ; ls prisma/migrations (113)
ls src/services (100+), src/domain (70+), src/policies, src/engines
rg (evidence): anthropic|openai, connector, tender|grant, retention|churn, local|offline, waste|leakage, skill
npx tsc --noEmit           # FAILS: 'Cannot find module next' — node_modules absent (see §10)
[ -d node_modules ] => NO ; npx prisma validate => cannot load config (no @prisma/config)
rg verification: external-systems 'not implemented' throws, oauth base64, private-mode-gate headers,
     growth static Map, __ignored_tests__ count (91) + diagnostic-core engine tests
```

## 3. Search evidence (headline)

- **Scale:** 174 Prisma models, 4750-line schema, 113 migrations, 328 API route files, 69 pages, 53 Playwright specs, ~926 active unit-test files, **91 quarantined** in `src/__ignored_tests__`, 78 GitHub workflows.
- **Connectors throw:** `src/services/external-systems/google-sheets-oauth.service.ts:134/149/271/290` + `token-lifecycle.service.ts:187` all `throw new Error("… not implemented in this service layer")`. No `await fetch` to a provider anywhere in `src/services/external-systems/*`.
- **base64 ≠ encryption:** `oauth-token.service.ts:102` `Buffer.from(...).toString("base64")` under a header claiming "All tokens are encrypted … workspace-scoped keys".
- **Header-trusting authz:** `src/middleware/private-mode-gate.ts:53` "placeholder implementation"; reads `x-user-id`/`x-private-mode-role`.
- **In-memory growth data:** `pricing-engine.ts:24` `static tiersStore = new Map`; `retention-engine.ts:24/25` `metricsStore`/`churnStore` Maps. No matching Prisma models, no audit.
- **Quarantined core tests:** `src/__ignored_tests__/services/diagnostic-core/__tests__/{archetype,root-cause,maturity,bottleneck}-engine.test.ts`.
- **No Claude skills/agents/hooks:** `find .claude -type d` → only `.claude` + `.claude/commands`.

## 4. Current implementation state

OpsIQ on main is a **large, mature owner-mode operating system** with a genuine centralized governance spine and heavy DB/test coverage — far past MVP. Confirmed-real, reusable capabilities: Owner Mode, Manual Entry/Intake, Evidence/Audit (hash-chained), Finance/Budget/Cash (×3 stacks), Staff/Operator Proof (server-authoritative), SOP/Training, Marketing ROI, Opportunity/Wealth/Tender-screening, Capacity/Bottleneck, Learning/Outcome Review, and a correctly-governed advisory LLM copilot. Centralized layers are real: `src/policies/capability-check.ts` (role→capability), `src/policies/state-transition.ts`, `owner-action-gate.service.ts`, `@/infra/audit` `emitAuditEvent`, Zod validation on write paths.

The **weak edges** are the newer, less-finished surfaces: growth (pricing/retention in-memory Maps), connectors (placeholder), private-mode gate (header stub), and several backend-only capabilities with no UI (startup mode, vendor, compliance). See §5 and the CAPABILITY_MATRIX / CONNECTOR_READINESS_MATRIX.

The **Claude operating layer** is minimal and honest: `CLAUDE.md` + two autonomous slash commands + JSON state/baseline gates. **No skills/agents/hooks exist.** (See SKILL_CLASSIFICATION.md.)

## 5. Duplicate / stub / fake-ready risks

**Fake-ready (labelled better than it is):**
- **Live connectors** — DB models + contracts + a real OAuth-initiation URL, but token exchange/refresh/data-fetch all throw "not implemented"; no API routes. Must not be called "live". (H-CONN-01)
- **OAuth token "encryption"** — base64 encoding behind an "encrypted at rest" comment. (H-CONN-02)
- **`private-mode-gate`** — spoofable header trust under a real-looking gate; real service exists but is unwired. (H-PRIV-01)
- **Pricing / Retention** — routes accept writes that vanish into a static Map; no persistence, no audit; pricing route uses a non-owner capability. (H-GROWTH-01)
- **Production smoke scripts** — inert unless env wired; `smoke-tests.ts` default `https://yourdomain.com`, `production-smoke.mjs` "offline mode", CI Playwright has no `webServer`. (H-SMOKE-01)

**Stub/backend-only (real but unreachable):** Startup Mode (no UI), Vendor/Procurement (no route/UI), Compliance (no UI, boundary-test only).

**Duplication:** three near-identical finance/cashflow/budget vertical stacks (cash-safety drift risk); two audit entrypoints (`@/infra/audit` vs `src/services/audit/log.ts`); two unrelated things named "simulation" (toy `/scenario` engine vs internal fixture packs); orphaned `opsiq_claude_low_usage_pack` duplicating operating-layer intent.

**Untested-but-shipped:** 91 quarantined tests incl. diagnostic-core inference engines; live LLM path skip-gated; SOP/training and several capabilities lack browser E2E.

## 6. Correct implementation order (specific to current main)

Ordered to **prove current owner flows → avoid duplicate modules → close fake/stubbed integrations → enforce DB/UI proof → then build missing capabilities.** Nothing here rebuilds a confirmed-COMPLETE capability.

**Phase 0 — Truth & safety corrections (highest priority, no new modules)**
1. Fix the **fake-ready security labels**: replace base64 token storage with real crypto (or remove the "encrypted" claim + block real-token storage), and wire `private-mode-gate` to `role-access.service` (kill header trust). (H-CONN-02, H-PRIV-01)
2. Make **pricing/retention honest**: either persist to new Prisma models + audit + canonical owner enforcement, or clearly mark demo-only and remove the write routes. (H-GROWTH-01)
3. Harden smoke proofs: fail-closed when `BASE_URL`/env unset; ensure CI boots the app for Playwright. (H-SMOKE-01)

**Phase 1 — Prove what already exists**
4. Re-activate the 91 quarantined tests in priority order, **starting with `diagnostic-core` engines** (core inference currently untested). (H-TEST-01)
5. Add browser E2E for the covered-but-unproven owner journeys: **billing/checkout, signup-from-scratch, member-invite/role-assignment, SOP/training** (all currently absent per test audit).
6. Add a **gated live LLM smoke** in an automated (secret-gated) pipeline so the advisory path is proven, not just mocked. (H-AI-01)

**Phase 2 — Consolidate before extending (avoid duplication)**
7. Consolidate cash-safety logic across finance/cashflow/budget into one shared gate; pick a single audit entrypoint.
8. Decide the "simulation" story: promote the fixture-pack engine or retire the toy `/scenario`.

**Phase 3 — Close the real integration gap**
9. Build **one** real connector end-to-end (Google Sheets read-only is the closest): token exchange, callback route, data fetch, stale-data + failure handling, owner-approval on any write — using the existing DB spine and DRAFT/approval model. No new parallel connector framework.

**Phase 4 — Fill missing product capabilities (only after 0–3)**
10. Surface backend-only capabilities via route+UI: **Startup Mode, Vendor/Procurement, Compliance** (each already has a service). Then unify **Waste/Leakage** (COPQ + complaint-rework) and **Risk** (scattered rules) into explicit surfaces. Add real **Retention/Reactivation** persistence.

**Phase 5 — Claude operating layer (separate track, not product)**
11. Only if wanted: create `.claude/skills/` + `.claude/agents/` populated with **agent-workflow** skills (see SKILL_CLASSIFICATION.md §4). Merge or delete the orphaned `opsiq_claude_low_usage_pack`.

## 7. Phases to keep / change / delete from the previous plan

The previous roadmap (`execution.md` STAGE 0-17, `execution_post_owner_mode.md` B01–B26, and any plan implying "build Claude skills / build connectors / build LLM-NLP" as greenfield):
- **KEEP:** the governed-vertical-slice pattern (Marketing #9 is the reference), the DB-verification-in-CI discipline, the owner-action-gate/audit spine, the Playwright+seed proof model.
- **CHANGE:** any phase that says "add live connectors" → reframe as "finish the ONE placeholder connector already scaffolded" (Phase 3). Any phase that says "add LLM/NLP" → reframe as "prove the existing governed copilot live" (it already exists). Any "build retention/pricing" → reframe as "add persistence/audit to the existing in-memory engines". Any "build simulation" → "consolidate the two existing simulation notions".
- **DELETE / DO-NOT-BUILD:** a business-capability **skill registry** (violates repo rules — product logic stays in `src/`); a second intake path, a fourth finance stack, a parallel tender module, or a new connector framework (all duplicate existing work). Retire the orphaned `opsiq_claude_low_usage_pack` rather than wire two operating layers.

## 8. Highest-risk gaps (ranked)

1. **Connectors are placeholders labelled with real-security language** (throws + base64 "encryption"). Shipping/claiming them is the top reputational/security risk. (H-CONN-01/02)
2. **Spoofable private-mode gate** — header-trusting authz if any route relies on it. (H-PRIV-01)
3. **Pricing/Retention data loss** — writes to in-memory Maps, no persistence/audit. (H-GROWTH-01)
4. **Core inference untested** — diagnostic-core engine tests quarantined among 91 ignored files. (H-TEST-01)
5. **Proof theatre** — smoke scripts inert without env; CI Playwright boots no server; ~41 files contain trivial `expect(true)` assertions worth spot-checking. (H-SMOKE-01)
6. **Live LLM path unproven in CI** — governed design is sound but never exercised automatically. (H-AI-01)
7. **Untested critical journeys** — billing/checkout, signup, member-invite have zero browser coverage.
8. **Duplication drift** — triple finance stacks, dual audit entrypoints.

## 9. No-source-change confirmation

**No product logic was modified.** This audit created **only** documentation artifacts under `docs/audits/2026-07-07-current-main-reality-audit/` (this report + 4 companion files). No files under `src/`, `prisma/`, `tests/`, `scripts/`, `.claude/`, `.github/`, or any config were created, edited, or deleted. No dependencies installed. No CI changed. No secrets/env touched. No DB or production mutations. `git status` before work: clean; the only staged change is the new `docs/audits/2026-07-07-current-main-reality-audit/` folder.

## 10. Validation results

Static validation only — **dynamic gates are DEFERRED_ENV**: this fresh container has **no `node_modules`** (`[ -d node_modules ]` → NO) and installing dependencies is forbidden by audit rule 4. Consequently `npx tsc --noEmit` fails at module resolution (`Cannot find module 'next'`, `'@playwright/test'`, `'@prisma/client'`) — an environment artifact, **not** a code defect; and `npx prisma validate` cannot load `prisma.config.ts` (`Cannot find module '@prisma/config'`). These gates are exercised in CI (`.github/workflows/ci.yml`, `db-verification.yml`, `owner-e2e.yml`, `owner-pilot-e2e.yml`, `ai-live-smoke.yml`).

Passed static checks:
- `git status` clean before edits; branch even with `origin/main`.
- Package scripts inspected (no `test:e2e` npm script; Playwright invoked via `npx`).
- Structural inventory via `find`/`rg`/`wc` (counts in §3).
- Every hostile finding in §5/§8 was **directly grep-verified** (file:line cited in EVIDENCE_LEDGER.json `verified_hostile_findings`).

## Companion artifacts
- `CAPABILITY_MATRIX.md` — all 22 capabilities, classification + evidence + reuse/extend/avoid.
- `CONNECTOR_READINESS_MATRIX.md` — connector/Local-Mode/LLM readiness tiers.
- `SKILL_CLASSIFICATION.md` — the six required skill-vs-capability answers.
- `EVIDENCE_LEDGER.json` — machine-readable evidence, commands, verified findings, classifications.

## Top 10 findings (quick reference)
1. No Claude skills/agents/hooks exist — operating layer is `CLAUDE.md` + 2 slash commands + JSON gates.
2. Live connectors are placeholders — every network op throws "not implemented"; no routes.
3. OAuth token "encryption" is base64 behind an "encrypted at rest" label.
4. `private-mode-gate` trusts spoofable client headers; real service exists but is unwired.
5. Pricing & Retention persist to in-memory Maps — no DB, no audit, data lost on restart.
6. 91 tests quarantined in `__ignored_tests__`, including diagnostic-core inference engines.
7. Live LLM path is real & fail-closed but skip-gated — never proven in automated CI.
8. Billing/checkout, signup, and member-invite journeys have no Playwright coverage.
9. Triple-duplicated finance/cashflow/budget stacks (+ dual audit entrypoints, dual "simulation").
10. `opsiq_claude_low_usage_pack` is an orphaned, un-merged second operating layer.
