# OpsIQ — Synthetic-Realistic Owner Dry Run

This folder contains **synthetic-realistic** owner datasets for dry-running OpsIQ
Owner Mode end-to-end **without real owner data**.

## ⚠️ Data honesty

- This is **synthetic-realistic** data, **NOT real owner data**.
- Every file carries a `metadata` block with `dataMode: "SYNTHETIC_REALISTIC"` and
  `dataTruthStatus: "NOT_REAL_OWNER_DATA"`.
- This data **must not** enter the verified learning database, be used for real
  employee-performance judgment, drive a real financial decision without owner
  review, or be cited as public-SaaS / real-employee-pilot proof.
- `canEnterVerifiedLearning(metadata)` returns **false** for this data by design
  (`src/domain/execution/dry-run-diagnosis.ts`), and a test enforces it.

## Files

| File | Scenario |
|---|---|
| `laundry.synthetic-realistic.json` | Laundry / dry-cleaning / pickup-delivery — stable, preparing controlled growth |
| `housekeeping-distressed.synthetic-realistic.json` | Housekeeping / commercial cleaning — **distressed**: debt, client loss, outdated processes, weak cash |
| `runbook.md` | How to run the dry run + capture results |
| `expected-results.md` | Expected pass/fail behavior per scenario |

Each dataset contains the `TrialPackInput` sections the readiness assessor
requires (so READY is earned, not faked) plus rich scenario extensions
(`financials`, `opsSignals`, `processDefects`, `scenarioExtensions`,
`datasetCounts`, `requiredWorkflows`) that the governed diagnosis consumes.
`datasetCounts` documents the realistic intended volumes; the inline arrays are
representative samples that exercise each gate.

## How to run

Readiness only (fail-closed gate):
```
npx tsx scripts/owner-data-dry-run.ts owner-data-dry-run/laundry.synthetic-realistic.json
npx tsx scripts/owner-data-dry-run.ts owner-data-dry-run/housekeeping-distressed.synthetic-realistic.json
```

Readiness **+ governed diagnosis** (progression gate, SOP modernization, client
retention, learning guard):
```
npx tsx scripts/synthetic-owner-dry-run.ts owner-data-dry-run/laundry.synthetic-realistic.json
npx tsx scripts/synthetic-owner-dry-run.ts owner-data-dry-run/housekeeping-distressed.synthetic-realistic.json
```

Exit codes: `0` = READY (+ diagnosed) · `1` = BLOCKED (missing mandatory data) ·
`3` = bad file / not SYNTHETIC_REALISTIC.

## Expected outcome (summary)

- **Laundry** → READY, `CONTROLLED_GROWTH_OK` (controlled growth may be
  considered after owner review).
- **Housekeeping (distressed)** → READY, **`STABILIZATION_FIRST`, expansion
  BLOCKED**, with client recovery/retention + 12 SOP-modernization
  recommendations — all owner-review-required.

See `expected-results.md` for the full matrix.

## Replacing with real owner data later

When real owner data becomes available:
1. Copy a scenario file as a template and replace every value with real figures.
2. Set `metadata.dataMode` / `dataTruthStatus` to your real-data markers (NOT
   `SYNTHETIC_REALISTIC` / `NOT_REAL_OWNER_DATA`).
3. Re-run the readiness + diagnosis scripts; resolve any BLOCKED gaps with real
   values (never fabricated ones).
4. Only after a supervised owner-data dry run + owner review of outputs do the
   Slice 27 live-employee-pilot prerequisites apply (real owner data, real
   employee accounts, supervised live execution).
