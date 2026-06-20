# Real-World Blind Replay — Phase 1: Case Corpus Inventory

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Program:** OWNER_MODE_REAL_WORLD_BLIND_REPLAY_PROGRAM  
**Phase:** 1 — Case Corpus Inventory  

---

## 1. Purpose

Enumerate every case in the repository that could potentially qualify as a real-world source-verified case for the blind-replay validation suite. This inventory determines whether any cases are immediately usable without additional sourcing work.

---

## 2. Candidate Sources

### 2.1 `simulation_runs/historical_validation/`

| Directory | Files | grounding_class | Usable |
|---|---|---|---|
| (none) | — | — | 0 usable cases |

**Finding:** Directory exists. Contains only `README.md` and `_HISTORICAL_VALIDATION_RESULT.json`. Zero `case_*/` directories. Zero cases to evaluate.

### 2.2 `simulation_runs/round_002/`

Per prior inspection:
- Cases are adversarial/synthetic
- Example: `case_R2-DC-01/01_case_input.json` has `caseType: "adversarial"`, constructed scenario
- Example: `simulation_runs/adversarial_safety_probes_v2/case_HSW-01/01_case_input.json` is constructed adversarial probe

**Finding:** All round_002 cases are synthetic/constructed. `grounding_class` is NOT `REAL_SOURCE_BACKED`. Zero usable cases.

### 2.3 B15-S1 Cases (`src/domain/case-studies/library.ts`)

5 seeded cases:

| Case ID | Industry | Source | grounding_class | Usable for replay? |
|---|---|---|---|---|
| CS-001 | Retail | SCORE/SBA guidance (general) | NOT REAL_SOURCE_BACKED — industry pattern, not a specific historical event | NO |
| CS-002 | Restaurant | NRA industry data (general) | NOT REAL_SOURCE_BACKED — industry pattern, not a specific historical event | NO |
| CS-003 | Professional services | AICPA guidance (general) | NOT REAL_SOURCE_BACKED — industry pattern, not a specific historical event | NO |
| CS-004 | Manufacturing | NIST MEP guidance (general) | NOT REAL_SOURCE_BACKED — industry pattern, not a specific historical event | NO |
| CS-005 | E-commerce | Shopify platform data (general) | NOT REAL_SOURCE_BACKED — industry pattern, not a specific historical event | NO |

**Finding:** B15-S1 cases are seeded public-domain industry summaries. They do not represent specific historical businesses with pre-decision evidence and hidden outcomes. They cannot produce a valid `outcome.json` with `grounding_class: REAL_SOURCE_BACKED`. Zero usable cases.

### 2.4 B15 Pre-Existing DB Layer (`src/domain/benchmark/`)

The `src/domain/benchmark/case-study.ts` defines a Prisma-backed schema for CaseStudy records. The `case-library.service.ts` provides CRUD. DB tests verify the schema works.

**Finding:** The DB layer is an empty schema — no cases are seeded in the DB. There are no real-world case records stored. Zero usable cases.

### 2.5 Documentation and Reports

Scanned all docs in `docs/`, `simulation_runs/`, and root:
- `OWNER_MODE_REALITY_LOOP_CLOSEOUT.md` — adversarial safety probes, synthetic
- `POST_OWNER_MODE_STATUS_REPORT.md` — status tracking, no case data
- `PHASE_29_CONTROLLED_LEARNING_FOUNDATION_REPORT.md` — notes "0 REAL_SOURCE_BACKED" (historical)

**Finding:** No documentation contains embedded real-world case data in the required format. Zero usable cases.

---

## 3. Summary Count

| Source | Cases inspected | REAL_SOURCE_BACKED | Usable for blind replay |
|---|---|---|---|
| `simulation_runs/historical_validation/` | 0 | 0 | 0 |
| `simulation_runs/round_002/` | ~20 | 0 | 0 |
| `simulation_runs/adversarial_safety_probes_v2/` | checked | 0 | 0 |
| B15-S1 (`src/domain/case-studies/`) | 5 | 0 | 0 |
| B15 DB layer (`src/domain/benchmark/`) | 0 seeded | 0 | 0 |
| Documentation | — | 0 | 0 |
| **TOTAL** | — | **0** | **0** |

---

## 4. Conclusion

**Total REAL_SOURCE_BACKED cases available for blind replay: 0**

The repository contains zero cases that satisfy the `ROUND_2_REAL_WORLD_SOURCE_STANDARD` `REAL_SOURCE_BACKED` classification and can be placed in `simulation_runs/historical_validation/case_*/` for blind replay.

The harness is ready. The corpus is empty.

---

**Phase 1 complete.**
