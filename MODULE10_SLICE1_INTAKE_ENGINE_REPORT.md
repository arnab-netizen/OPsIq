# Module 10 (Connectors & Data Intake) — Slice 1: Intake Engine — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic data-intake engine: CSV
parser + field-spec-driven validation/normalization that turns a raw upload into a
normalized, validated candidate with an explicit owner-readable error report. No
DB/API/UI. Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §17, Module 10 reduces manual input — and its explicit rule is "do
not build connectors before the core owner loop is stable." The core loop is now
stable (8 domains + portfolio, all STAGING_PROVEN + AUDITED), so connectors are in
scope. The credible foundation is the **CSV / manual intake engine** with the §17
Data Intake Requirements (source, timestamp, validation status, normalization
status, error report, owner confirmation) and the hard rule that connector data
**never changes a diagnosis without owner confirmation** — the engine produces a
CANDIDATE (`ownerConfirmed: false`); confirmation is a later slice.

## 2. Files created

- `src/domain/owner-intake/types.ts` — `IntakeSource` (CSV/manual/sheets/email/
  accounting/POS/bank/lead), `IntakeFieldSpec`, validation + normalization status
  enums, `IntakeFieldError`, `NormalizedRecord`, `IntakeResult`.
- `src/domain/owner-intake/csv.ts` — `parseCsv`: dependency-free, RFC-4180-style
  quoting (embedded commas + escaped `""`), CRLF/LF, trailing newline, skips empty
  lines, never throws (returns what it can parse).
- `src/domain/owner-intake/engine.ts` — `parseNumber` (strips thousands separators
  + currency symbols), `parseDate` (→ ISO or null), `buildCsvIntake`:
  header→field mapping (case/space/punct-insensitive), per-row normalization,
  field-level error report (missing required / invalid number / negative / invalid
  date), unmapped-column reporting, aggregate validation status (valid / partial /
  invalid) and normalization status.
- `src/domain/owner-intake/index.ts` — barrel.
- `src/__tests__/owner-intake/engine.test.ts` — 14 tests.

## 3. Honesty / governance

- Deterministic, no LLM. Same input → identical result (proven by test).
- No invention: an unparseable value becomes `null` + an error, never a guessed
  number; a blank upload is `invalid` + `not_normalized` with no records.
- `ownerConfirmed` is hard-coded `false` — connector data cannot auto-feed a
  diagnosis (execution.md §17). The engine owns no table and mutates nothing.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-intake/` | 14 passed |
| `npx eslint src/domain/owner-intake src/__tests__/owner-intake` | clean (0 warnings) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 2 — persistence +
migration (GATE)**: an additive `OwnerDataIntake` record (source, business,
workspace, validation/normalization status, error report JSON, owner-confirmation
flag) + migration + manual migrate workflow — create the workflow and stop. Then
API + services, UI, deployed runtime proof, audit. Public/SaaS stays frozen.
