# A0 — Current-Main Reality Audit — Final Report

**Date:** 2026-07-10  
**Branch:** `claude/current-main-reality-audit-operating-layer`  
**Base commit:** `ef7706b` (main — Phase 6F)  
**Note:** Phase 6I (`6e003fa`) is on PR #222, not yet merged to main at audit time.  
**Audit type:** Hostile read-only — no product logic changed, no migration run, no secrets touched.

---

## 1. Branch and HEAD

```
Branch: claude/current-main-reality-audit-operating-layer
HEAD:   ef7706b (Phase 6F: verify and fix four governance findings — CAS + atomic audit)
Prior:  c8c85c3 (Phase 6H Wave 1 — Route-Level Audit Pattern Hardening)
```

---

## 2. Commands Run

All read-only. No destructive commands, no DB writes, no migration, no secrets.

```bash
ls /home/user/OPsIq/.claude/
find /home/user/OPsIq/.claude -type d
cat /home/user/OPsIq/.claude/commands/continue-build.md
find /home/user/OPsIq -name "playwright.config*"
find /home/user/OPsIq -name "*.spec.ts" (54 files found)
ls /home/user/OPsIq/tests/browser/
find /home/user/OPsIq/src/app/api -maxdepth 2 -type d
find /home/user/OPsIq/src/services -maxdepth 2 -type d
prisma schema model count (174 models)
cat /home/user/OPsIq/.env.example
cat /home/user/OPsIq/src/services/ai/openai-provider.ts
cat /home/user/OPsIq/src/services/ai/provider.ts
python3 execution_state.json parse
grep -r OPENAI_API_KEY src/
find src/services/external-systems -type f
ls src/app/api/owner/
find src -name "*.ts" grep: vendor, waste, tender, leakage, LocalMode, PrivateMode
cat /home/user/OPsIq/package.json scripts
find src/__tests__ -type f | wc -l (943 test files)
```

---

## 3. Search Evidence

| Search | Result |
|--------|--------|
| `.claude/skills/` | **Does not exist** |
| `.claude/agents/` | **Does not exist** |
| `.claude/hooks/` | **Does not exist** |
| `.claude/commands/` | Exists — 2 files |
| `playwright.config.ts` | Exists |
| `*.spec.ts` count | 54 files |
| Prisma model count | 174 models |
| `OPENAI_API_KEY` in `.env.example` | **Not present** |
| `GOOGLE_CLIENT_ID` in `.env.example` | **Not present** |
| `STRIPE_SECRET_KEY` in `.env.example` | Present |
| Tender-specific route/service | **Not found** |
| Pricing (business analytics) route | **Not found** |
| Waste/leakage dedicated route | **Not found** |
| `src/__tests__/` total files | 943 |
| Playwright spec files | 54 in `tests/browser/` |
| owner API route dirs | 40+ under `/api/owner/` |
| External systems services | 7 files (OAuth, browser import, sync manager, token lifecycle, field mapping persistence) |

---

## 4. Current Implementation State

### A. Claude Operating Layer

**CLAUDE.md** (94 lines) — well-defined product truth (4 dimensions), hard rules, adaptive rule, technical defaults, ambiguity resolution, human-factors safety, and required response format (A-L sections). This is solid.

**`.claude/` directory** — Not structured as a Claude Code skills/agents/hooks repo. Contains:
- `commands/` — 2 slash-command scripts (`continue-build.md`, `continue-post-owner-build.md`)
- 80+ flat audit/planning artifacts (JSON/markdown dump)
- **No `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`**

The `.claude/commands/` scripts are functional slash-commands wiring autonomous execution loops to `execution.md` and `execution_post_owner_mode.md`.

**Execution state:** `execution_state.json` dated 2026-06-19, reports `OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE`. 20+ phases marked `COMPLETE_VERIFIED`.

### B. Product Capabilities

9 capabilities COMPLETE, 9 PARTIAL, 3 MISSING. See `CAPABILITY_MATRIX.md`.

**Completed core:** Owner Mode (M01-M15), Manual Entry, Diagnosis/Rec/Action, Evidence/Audit, Finance/Budget/Cash, Staff/Proof, SOP/Training, Marketing ROI, Learning/Outcome Review.

**Key gaps:**
- Tender/Application Assistance — **MISSING**
- Pricing (business analytics) — **MISSING**
- Waste/Leakage — **MISSING**
- Live Connectors (Google Sheets, non-Stripe) — **PLACEHOLDER_ONLY**
- LLM/NLP governed analysis — code complete but no API key

### C. Connectors

Stripe: WRITE_CAPABLE_GATED (real).  
Google Sheets: PLACEHOLDER_ONLY (code complete, credentials absent).  
Browser Import: READ_ONLY_REAL (approval gating + consent real).  
OpenAI: LOCAL_MOCK_ONLY (provider implemented, no key).  
Others: NOT_STARTED.

### D. Playwright

54 spec files covering: auth flows, core workflows, owner mode (pilot, mobile, cockpit, whole-business-plan, finance, indicators, supervisor, process intelligence), chaos replay, OOD scenarios, daily ops, weekly management, growth/profit, staff/proof, customer/vendor/market, local/legal/boundary, ugly/tail-risk/crisis, sequential simulations.

CI is fully integrated — 12+ Playwright lanes in CI (DB-backed and desktop+mobile shards).

---

## 5. Duplicate / Stub / Fake-Ready Risks

| Risk | Severity | Detail |
|------|----------|--------|
| Google Sheets connector claims coverage but has no credentials | HIGH | `PLACEHOLDER_ONLY` — zero live tests possible |
| `ExternalFieldMapping`, `ExternalRawRecord` models with no service layer | MEDIUM | Schema implies implementation that doesn't exist in `src/services/` |
| `OPENAI_API_KEY` absent from `.env.example` | MEDIUM | Live AI path implemented but entirely blocked |
| No `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` | MEDIUM | The "Claude operating layer" is underbuilt — only 2 slash commands |
| Tender/Pricing/Waste capabilities implied by CLAUDE.md product scope but unimplemented | MEDIUM | 3 capability gaps |
| `execution_state.json` dated 2026-06-19 | LOW | State tracking may be stale (2+ weeks old) |

---

## 6. Correct Implementation Order

Ranked by: closing fake/stubbed first → proving current owner flows → connector readiness → new capabilities.

1. **[INFRA] Add `OPENAI_API_KEY` to `.env.example` and wire AI smoke test** — unblocks LLM/NLP capability with zero code changes. Highest ROI per effort.

2. **[CONNECTOR] Add Google Sheets credentials to `.env.example`** — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. Service is already written. No code change needed; credential plumbing only.

3. **[PROOF] Playwright coverage for simulation/scenario flows** — 54 Playwright specs exist but simulation (the `src/app/api/scenario/` route) has no confirmed dedicated spec. Add one.

4. **[PROOF] Playwright coverage for startup-validate flow** — `StartupStatus` model + route exists; no dedicated spec confirmed.

5. **[CAPABILITY] Waste/Leakage module** — Service and route required. DB capacity snapshots exist; build diagnosis + action service atop them.

6. **[CAPABILITY] Pricing (business analytics)** — Not to be confused with Stripe billing. Owner business pricing analysis. Route + service + DB required.

7. **[CAPABILITY] Tender / Application Assistance** — Route + service + DB required. MISSING entirely.

8. **[CLAUDE_LAYER] Create `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`** — Commit real Claude Code skill scripts for: `phase-audit`, `security-review`, `idempotency-check`, `pr-lifecycle`.

9. **[CONNECTOR] External field mapping service layer** — `ExternalFieldMapping` and `ExternalRawRecord` models have no service. Either build service or remove dead models.

10. **[PARTIAL → COMPLETE] Startup Mode** — Route + model exist; add dedicated test coverage and Playwright spec.

---

## 7. Phases to Keep / Change / Delete

| Phase type | Recommendation |
|-----------|---------------|
| Phase 6 defect conveyor | **STOP** — per instructions, no new CONFIRMED_CRITICAL or CONFIRMED_HIGH found in this audit |
| Phase 6I PR (#222) | **MERGE** when CI green |
| Phase A0 (this audit) | **DONE** — artifacts committed |
| A1 — OpenAI key / AI smoke | **START** — highest ROI, no code change needed |
| A2 — Google Sheets credentials | **START** — alongside A1 |
| A3 — Waste/Leakage capability | Queue after A1/A2 |
| A4 — Pricing capability | Queue after A3 |
| A5 — Tender capability | Queue after A4 |
| `.claude/skills/` creation | **START** — small effort, high governance value |
| Connector expansion (non-Google) | **Defer** — no confirmed business need yet |
| New product modules beyond A0 list | **Defer** — owner core is complete; prove it first |

---

## 8. Highest-Risk Gaps

1. **Live Connectors (Google Sheets)**: Code complete; zero live tests possible without credentials. Any demo or owner use will silently degrade.
2. **LLM/NLP (OpenAI)**: Deterministic fallback is working, but the AI-advisory path (Phase AI-16) is dead without `OPENAI_API_KEY`. This blocks the "AI copilot" value prop.
3. **3 MISSING capabilities**: Tender, Pricing, Waste/Leakage — present in product scope (CLAUDE.md 4-dimension model) but not implemented.
4. **No `.claude/skills/agents/hooks/`**: The Claude Code operating layer is only 2 slash commands. Hostile audits, security reviews, and idempotency checks rely on session-level skills, not repo-committed automation.
5. **`ExternalFieldMapping`/`ExternalRawRecord` dead models**: 174 models include schema weight that implies more connector coverage than exists.

---

## 9. No-Source-Change Confirmation

This audit branch (`claude/current-main-reality-audit-operating-layer`) contains only:
- `docs/audits/2026-07-10-current-main-reality-audit/` (5 new files)

**No product logic changed. No migration run. No secrets altered. No dependencies installed.**

---

## 10. Validation Results

```bash
# All read-only checks passed

# .claude structure
find /home/user/OPsIq/.claude -type d
# → only .claude/ and .claude/commands/ (no skills, agents, hooks)

# Playwright
find /home/user/OPsIq -name "playwright.config*"
# → /home/user/OPsIq/playwright.config.ts (exists)
find /home/user/OPsIq -name "*.spec.ts" | wc -l
# → 54

# Connector credentials
grep GOOGLE_CLIENT_ID /home/user/OPsIq/.env.example   # not found
grep OPENAI_API_KEY /home/user/OPsIq/.env.example     # not found
grep STRIPE_SECRET_KEY /home/user/OPsIq/.env.example  # found

# Missing capabilities
grep -r "tender" src/app/api/owner/ # no route hits
grep -r "waste" src/app/api/owner/  # no route hits
# → confirmed MISSING
```

---

## Appendix: File Inventory

| File | Purpose |
|------|---------|
| `FINAL_AUDIT_REPORT.md` | This file |
| `CAPABILITY_MATRIX.md` | 22-capability classification table |
| `CONNECTOR_READINESS_MATRIX.md` | Connector + LLM + Local Mode classification |
| `SKILL_CLASSIFICATION.md` | Claude Code skill vs policy/checklist vs product capability |
| `EVIDENCE_LEDGER.json` | Machine-readable summary of all findings |
