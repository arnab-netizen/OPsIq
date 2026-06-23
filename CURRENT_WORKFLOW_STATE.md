# CURRENT WORKFLOW STATE

Last updated: 2026-06-23
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Active execution: **OpsIQ Owner Mode Decision OS — Strict Minimum-Code Continuous Build**
Companion audit: `OPSIQ_OWNER_MODE_DECISION_OS_STATE_AUDIT.md`

---

## CONTROLLING STATEMENT

This execution is **Owner Mode only**. Public SaaS / billing / Product Hunt / marketing / public onboarding remain FROZEN (see SCOPE FREEZE below).

The Owner Mode loop that must be proven reliable:

```
owner/business data → data quality → financial survival → unit economics
→ diagnosis (+evidence/counter-evidence) → decision object → evidence bundle
→ ranked action portfolio → scenario comparison → owner approval/override
→ guided execution (+proof) → outcome verification → attribution/confounder review
→ private learning eligibility → regression/audit gate → dashboard proof
```

**Repo posture (critical):** OpsIQ already implements the overwhelming majority of this loop (see audit §0). The governing rule for every slice is **REUSE-AND-VERIFY, not build**. New tables/routes/services/components are justified only against the audit's §7 Gap Register. Duplicate parallel systems (`*V2`, second dashboard, second portfolio engine) are forbidden.

---

## SCOPE FREEZE (unchanged)

FROZEN until Owner Mode Decision OS is reliability-gated: Public SaaS flows, Product Hunt, Billing (Lemon Squeezy/Stripe), public onboarding, external lead intelligence, CRM/accounting integrations, browser automation, ML forecasting, cohort priors, public marketing pages, cross-customer/public learning, agentic automation, external market intelligence, third-party connectors.

---

## PHASE STATUS (this execution's minimum-code plan)

| Phase | Name | Status |
|---|---|---|
| 0 | Repo truth + Owner Mode state audit | **DOC_ONLY_COMPLETE** |
| 0.5 | Baseline regression harness (install deps, run baseline, map flows→tests) | **STATIC_TESTED_ONLY** (deps installed; owner-mode baseline green; DB tests blocked — see below) |
| 1 | Status/threshold canon + source-classification mapping | **STATIC_TESTED_ONLY** (canon verified; source-classification gap G4 closed) |
| 2 | Data quality + input guidance gate | NOT_STARTED (impl PRESENT; verify) |
| 3 | Financial survival + unit economics | NOT_STARTED (impl PARTIAL; verify/extract helpers) |
| 4 | Decision + evidence snapshot | NOT_STARTED (impl PARTIAL; status-canon mapping) |
| 5 | Recommendation portfolio + feasibility | NOT_STARTED (impl PRESENT; verify) |
| 6 | Scenario / what-if | NOT_STARTED (engine PRESENT; verify) |
| 7 | Experiment design | NOT_STARTED |
| 8 | Execution orchestration | NOT_STARTED (impl PRESENT; verify) |
| 9 | Outcome verification + attribution | NOT_STARTED (impl PRESENT; verify) |
| 10 | Private owner learning eligibility gate | NOT_STARTED (impl PRESENT; verify + security negatives) |
| 11 | Governance / audit / model risk | NOT_STARTED (impl PRESENT; verify) |
| 12 | Owner dashboard command center | NOT_STARTED (PARTIAL panels) |
| 12.5 | Trust & explainability QA | NOT_STARTED |
| 13 | Laundry vertical slice (end-to-end) | NOT_STARTED |
| 14 | Housekeeping archetype | NOT_STARTED |
| 15 | Benchmark harness | NOT_STARTED |
| 16 | Final reliability gate | NOT_STARTED |

> Note: A prior execution tracked `execution.md` phases 0–28 on branch `claude/sleepy-dirac-m4bdb9`. That work produced most of the existing `Owner*` implementation. This document supersedes that tracker for the current minimum-code execution; the underlying code is reused, not discarded.

---

## BASELINE STATUS (Phase 0.5 — captured 2026-06-23)

The fresh remote container ships **without `node_modules`**. Root-cause of repeated `npm install` failures: Prisma's `postinstall` (`prisma generate` → engine binary download from an external host) aborts with `ECONNRESET` and npm rolls the whole install back. **Fix:** `npm install --ignore-scripts` installs all 632 packages cleanly; `./node_modules/.bin/prisma generate` then succeeds locally (client generated to `src/generated/prisma`). Use `--ignore-scripts` for installs in this environment.

Baseline commands run and **recorded results**:

| Command | Result |
|---|---|
| `npm install --ignore-scripts` | ✅ 632 packages |
| `./node_modules/.bin/prisma generate` | ✅ Prisma Client 7.8.0 generated |
| `./node_modules/.bin/prisma validate` | ⚠️ resets on a network update-check; schema validity confirmed by successful `generate` |
| `vitest run src/__tests__/domain/owner-mode/full-loop-validation + owner-decision` | ✅ 129/129 |
| `vitest run outcome-tracking + controlled-learning + services/auth/access` | ✅ 163/163 |
| `vitest run src/__tests__/domain/owner-mode/` (whole dir) | ✅ **34 files, 1831 tests passed** |
| Full `vitest run` (all ~529 files) | recorded in audit §1 |
| `TEST_WITH_DB=true … '[db]'` (PostgreSQL-backed) | ⛔ **BLOCKED** — no local `DATABASE_URL`; test setup skips DB init. DB-backed claims deferred until a Postgres test DB is provisioned. |

**DB-test blocker (documented per §10 anti-mock / §11):** DB-backed (`[db]`) tests cannot run in this container — the test harness logs `DATABASE_URL not configured for local testing, skipping DB initialization`. Until a Postgres test database is wired, no slice may claim `DB_TESTED`; static + non-DB API behavior is the ceiling here.

Quarantined tests to re-activate before claiming related slices TESTED:
`src/__ignored_tests__/workspace-isolation-enforcement.test.ts`,
`src/__ignored_tests__/services/diagnostic-core/__tests__/archetype-engine.test.ts`.

---

## NEXT ACTION

Phase 1 complete (STATIC_TESTED_ONLY). Proceed to **Phase 2 — Data Quality + Input Guidance Gate**: verify the existing `domain/business-facts/data-quality.ts` (`scoreDataQuality`, confidence cap) and its diagnosis-permission/missing-input behavior with tests; wire the new source-classification canon into evidence/data-quality confidence weighting only where a real consumer needs it. No DB-tested claims until a Postgres test DB is provisioned.

### Phase 1 decision record (status/threshold/source canon)
- **Status vocabulary already canonical** — `domain/constants/statuses.ts` (action/evidence/approval/recommendation/intervention/business-condition/health, etc.) and `domain/owner-mode/owner-decision.ts` (`OwnerDecisionStatus` + `OWNER_DECISION_STATUS_TRANSITIONS`). Per Phase 1 restriction, **no new status enum created**, nothing renamed. A prompt↔repo decision-status mapping helper was deliberately NOT added: it would be dead code (no caller), and the repo vocabulary is already the canonical owner decision state machine.
- **Thresholds already centralized** — `services/thresholds/threshold-service.ts` (`DEFAULT_THRESHOLDS`) + per-domain `domain/owner-*/thresholds.ts`. No new config layer created.
- **Source classification was the only genuine gap (G4)** — the canonical 8-class vocabulary (`VERIFIED_RECORD`…`UNKNOWN`) did not exist. Added one pure module `domain/owner-mode/source-classification.ts` mapping existing `ExtractionMethod`/`SourceDocumentKind`/`FactValidationStatus` → canon, with trust ordering enforcing §1.10. Tests are the active caller now; Phase 2 consumes it for evidence/data-quality weighting.
- **Pure helper extraction (G2) deferred** — `calculateFinancialSurvival`/`calculateUnitEconomics`/`calculateAttributionConfidence`/`checkLearningEligibility` are embedded in services with no standalone caller; extracting them now would be dead code. They are addressed in their own phases (3/9/10) where callers + tests exist.
