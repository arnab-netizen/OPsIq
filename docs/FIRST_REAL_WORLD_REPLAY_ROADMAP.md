# First Real-World Replay Roadmap

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 7 — Replay Execution Roadmap  

---

## 1. Starting Point

| Component | Current State |
|---|---|
| Replay harness | READY — `simulation_runner/run-historical-validation.ts` (242 lines, fully implemented) |
| Case directory | EXISTS but empty — `simulation_runs/historical_validation/` (0 case directories) |
| Source standard | DEFINED — `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` |
| Information barrier | DESIGNED and IMPLEMENTED in harness code |
| Statistical confidence plan | COMPLETE — `docs/REAL_WORLD_STATISTICAL_CONFIDENCE_PLAN.md` |
| Source catalog | COMPLETE — `docs/REAL_WORLD_SOURCE_CATALOG.md` |
| Case transformation spec | COMPLETE — `docs/REAL_WORLD_CASE_TRANSFORMATION_SPEC.md` |
| Information barrier audit | COMPLETE — `docs/REAL_WORLD_INFORMATION_BARRIER_AUDIT.md` |
| Hard case priority list | COMPLETE — `docs/REAL_WORLD_HARD_CASE_PRIORITY_LIST.md` |

---

## 2. Missing Assets

### 2.1 Case corpus (CRITICAL — blocks Phase 5)

| Asset | Status | Blocking? |
|---|---|---|
| `simulation_runs/historical_validation/case_HV-001/` through `case_HV-050/` | MISSING — 0 cases present | YES |
| Each case: `01_case_input.json` | MISSING (no cases) | YES |
| Each case: `outcome.json` | MISSING (no cases) | YES |
| Each case: `source.json` | MISSING (no cases) | YES |

**What is needed:** At least 1 case (for harness function test) and 50 cases (for statistical minimum). All cases must be REAL_SOURCE_BACKED with reliability tier ≥ B.

---

### 2.2 Case tracking infrastructure (RECOMMENDED — not blocking for first run)

| Asset | Status | Blocking? |
|---|---|---|
| Case inventory spreadsheet / tracker (Google Sheets or CSV) | MISSING | NO |
| Case status tracking per ID (sourced / authored / reviewed / admitted) | MISSING | NO |

**What is needed:** A simple Google Sheet or CSV at `simulation_runs/historical_validation/_corpus_tracker.csv` tracking: case_id, source_url, reliability_tier, outcome_polarity, industry, size, review_status, contamination_risk.

---

### 2.3 Case validator script (OPTIONAL — not blocking)

| Asset | Status | Blocking? |
|---|---|---|
| `simulation_runner/validate-historical-case.ts` | MISSING | NO |
| `simulation_runner/audit-corpus.ts` | MISSING | NO |

**What is needed:** A validation script that checks a case directory for required files, prohibited keys in `01_case_input.json`, correct `grounding_class`, and minimum reliability tier. This prevents malformed cases from entering the corpus. Not blocking for first run but reduces risk of harness errors on malformed input.

---

### 2.4 Web access / fetch-capable environment (CRITICAL)

| Asset | Status | Blocking? |
|---|---|---|
| Network access to external URLs | BLOCKED in current environment (HTTP 403) | YES — cannot source or verify cases without this |
| Access to SEC EDGAR | BLOCKED | YES |
| Access to CourtListener | BLOCKED | YES |
| Access to Indie Hackers / Startups.com | BLOCKED | YES |

**What is needed:** A fetch-capable environment (local machine, separate cloud environment with outbound HTTP, or a GitHub Actions workflow with outbound access). The current remote Claude Code environment does not have outbound network access.

---

## 3. Missing Data

| Data | Status | Required for |
|---|---|---|
| Pre-decision financial evidence from 50+ real businesses | MISSING | Case corpus |
| Hidden ground truth outcomes for 50+ real businesses | MISSING | `outcome.json` files |
| Source citations with reliability tier ≥ B | MISSING | `source.json` files |
| T₀ decision dates for each case | MISSING | Temporal barrier validation |
| De-identified business problem statements | MISSING | `01_case_input.json` businessProblem field |

---

## 4. Missing Tooling

### 4.1 Case sourcing tooling

| Tool | Status | Notes |
|---|---|---|
| Browser with SEC EDGAR EDGAR full-text search | Available on any local machine | Not present in current environment |
| CourtListener search interface | Available at courtlistener.com | Not present in current environment |
| Indie Hackers / Startups.com access | Available publicly | Not present in current environment |
| A script to list pending cases and track acquisition status | MISSING | Nice to have |

### 4.2 Case authoring tooling

| Tool | Status | Notes |
|---|---|---|
| Text editor / JSON editor | Available on any local machine | Not present in current environment |
| Spell-check and hindsight-language scanner | MISSING | Could be a simple grep script |
| JSON schema validator for case files | MISSING | Could validate against HistoricalInput and HistoricalOutcome schemas |

### 4.3 Harness run tooling

| Tool | Status | Notes |
|---|---|---|
| `npx tsx` | Available (`tsx` is in package.json) | Ready to run |
| `simulation_runner/tsconfig.json` | Confirmed to exist | Ready to run |
| Node.js environment | Available | Ready to run |
| A test DATABASE_URL or local DB (if harness needs DB) | Check required | See §5 |

---

## 5. Missing Governance

### 5.1 Dual-review process

| Governance control | Status |
|---|---|
| Author A role (evidence extraction, no outcome knowledge) | DEFINED in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md; no assigned person |
| Author B role (outcome extraction, no evidence knowledge) | DEFINED; no assigned person |
| Author C role (leakage review, sees both) | DEFINED; no assigned person |

**What is needed:** Either (a) two humans for dual-review, or (b) a structured single-author process with a mandatory 48-hour delay between evidence extraction and leakage review (to reduce hindsight availability).

### 5.2 Case admission criteria

| Governance control | Status |
|---|---|
| Written admission criteria | DEFINED in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md §7 checklist |
| Signed-off admission log | MISSING |
| Version control for case files | AVAILABLE (git) |

### 5.3 Contamination risk policy

| Governance control | Status |
|---|---|
| Famous-case exclusion list | MISSING (should enumerate known high-contamination cases) |
| Contamination risk tagging in source.json | DEFINED (contamination_risk field) |
| Policy for HIGH contamination risk cases | DEFINED in REAL_WORLD_CASE_ACQUISITION_STRATEGY.md §7.1 |

---

## 6. Missing Validation Controls

### 6.1 Pre-run validation

| Control | Status |
|---|---|
| Check that all case directories have all 3 required files | NO automated check; harness skips missing files silently |
| Check that all `outcome.json` have `grounding_class: REAL_SOURCE_BACKED` | NO pre-run check; harness gates this at runtime |
| Check that no `01_case_input.json` contains prohibited keys | NO automated check |
| Check that corpus polarity mix is balanced | NO check |

**Recommended:** Add a pre-run `audit-corpus.ts` script that reports on corpus composition before running the harness.

### 6.2 Post-run validation

| Control | Status |
|---|---|
| Verify `_HISTORICAL_VALIDATION_RESULT.json` was updated | HARNESS writes this automatically |
| Verify `rejectedUngrounded` matches expectation | Manual check |
| Verify `blindReplaysCompleted` equals expected REAL_SOURCE_BACKED case count | Manual check |
| Verify scores are within reasonable range | Manual check |

---

## 7. Ordered Pre-Execution Checklist

These are the exact steps required before the first real-world blind replay can be executed:

```
GATE 1: ENVIRONMENT
  □ Confirm environment has outbound HTTP access
  □ Confirm SEC EDGAR access (test: fetch https://www.sec.gov/cgi-bin/browse-edgar)
  □ Confirm CourtListener access (test: fetch https://www.courtlistener.com/)
  □ Confirm npx tsx is available: `npx tsx --version`
  □ Confirm simulation_runner/tsconfig.json exists

GATE 2: FIRST CASE
  □ Source 1 case from Chapter 11 first-day declarations (reliability tier A)
  □ Author A: extract pre-decision evidence → draft 01_case_input.json
  □ Author B (or same author after 48h delay): extract outcome → draft outcome.json
  □ Author C (leakage review): check 01_case_input.json for prohibited keys and hindsight language
  □ Author final: complete source.json with citation, reliability tier, evidence provenance
  □ Place files in simulation_runs/historical_validation/case_HV-001/
  □ Verify directory structure:
      case_HV-001/
        01_case_input.json
        outcome.json
        source.json

GATE 3: FIRST HARNESS RUN (smoke test)
  □ Run: npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/run-historical-validation.ts
  □ Verify exit code 0
  □ Read: simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json
  □ Verify: blindReplaysCompleted: 1
  □ Verify: scores is not null (one case scored)
  □ Inspect case result: verify engineDiagnosis is populated (not null)
  □ Verify diagnosisAgreement is a boolean (not always true)

GATE 4: CORPUS SCALE (50 cases)
  □ Source 49 more cases following REAL_WORLD_CASE_ACQUISITION_STRATEGY.md
  □ Follow hard case priority from REAL_WORLD_HARD_CASE_PRIORITY_LIST.md
  □ Maintain polarity balance: ≥15 FAILURE, ≥20 SUCCESS, ≥15 MIXED
  □ Maintain industry diversity: ≥10 cases per primary industry
  □ Complete dual-review for all 50 cases
  □ All 50 cases admitted per checklist in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md §7

GATE 5: FULL CORPUS RUN
  □ Run harness on full 50-case corpus
  □ Verify blindReplaysCompleted: 50
  □ Read and interpret scores
  □ Document results in REAL_WORLD_BLIND_REPLAY_VALIDATION_REPORT.md (update)
  □ Issue updated decision in REAL_WORLD_BLIND_REPLAY_DECISION.md (update)
```

---

## 8. What Is NOT Missing (Already Ready)

| Component | Status |
|---|---|
| Harness code | READY — no changes needed |
| Information barrier | READY — no changes needed |
| Integrity gate | READY — enforced in harness |
| Scoring logic | READY — all 5 dimensions implemented |
| Source standard | READY — ROUND_2_REAL_WORLD_SOURCE_STANDARD.md |
| Case layout spec | READY — README.md + REAL_WORLD_CASE_TRANSFORMATION_SPEC.md |
| Statistical confidence plan | READY |
| Source catalog | READY |
| Hard case priority list | READY |
| Acquisition strategy | READY |

**The only blocker is: no cases + no network access.** Everything else is ready.

---

## 9. Estimated Time to First Replay

| Phase | Environment | Time estimate |
|---|---|---|
| Restore network access (move to fetch-capable environment) | Local machine or new environment | 1–2 hours |
| Source first case (Chapter 11 first-day declaration) | Fetch-capable environment | 2–3 hours |
| Author 01_case_input.json + outcome.json + source.json | Any environment | 1–2 hours |
| Leakage review | Any environment | 30 minutes |
| Run harness smoke test | Any environment (with Node.js) | 5–10 minutes |
| **Time to first replay** | | **~4–8 hours** |
| **Time to 50-case corpus** | | **~90 hours (2–3 weeks)** |

---

**Phase 7 complete.**
