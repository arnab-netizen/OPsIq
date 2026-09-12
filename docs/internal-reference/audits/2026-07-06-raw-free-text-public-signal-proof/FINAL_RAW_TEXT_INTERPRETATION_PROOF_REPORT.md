# Final Raw Free-Text Public Signal Interpretation Proof Report — PASS 28

**Date:** 2026-07-06

## 1. Main HEAD before
`dc792d0ee83cd226819b08b70d5f25d8afcc4e09` (PR #159 merged; contains #157/#158/#159).

## 2. Branch
`claude/raw-free-text-public-signal-interpretation-proof`

## 3. Files changed
**Added (code):**
- `src/domain/owner-mode/public-signal-interpretation.ts` — deterministic interpreter + Zod schema + bridge adapter.
- `src/__tests__/owner-mode/public-signal-interpretation.test.ts` — 24 unit tests.
- `src/__tests__/execution/raw-free-text-public-signal-end-to-end.db.test.ts` — 18-test end-to-end DB sim.

**Changed (CI):**
- `.github/workflows/db-verification.yml` — wired the new DB sim into LANE_B + LANE_A.

**Added (docs — fixtures):** `docs/real-world-data/raw-free-text-public-signal-proof/` — `RAW_PUBLIC_TEXT_FIXTURES.json`, `RAW_TO_NORMALIZED_EXPECTATIONS.json`, `RAW_TEXT_PRIVACY_AND_COPYRIGHT_NOTES.md`, `RAW_TEXT_INTERPRETATION_REPORT.md`.

**Added (docs — audit):** `docs/audits/2026-07-06-raw-free-text-public-signal-proof/` — this report, `RAW_TEXT_DECISION_MATRIX.json`, `INTERPRETATION_SAFETY_MATRIX.json`, `EVIDENCE_LEDGER.json`, `DEFERRED_BROAD_GAPS.md`.

## 4. Schema changed
None. No Prisma model/migration change — the interpreter reuses the existing `ProcessExecutionTask` / governed-bridge substrate.

## 5. Raw fixture count
21 fixtures (18 persisted through the governed bridge across 8 archetype workspaces + 3 interpret-only adversarial).

## 6. Archetypes covered
laundry, housekeeping, property, franchise, SaaS, tender (not skipped), B2B, collective conflict — 8 of 8.

## 7. Adversarial cases covered
prompt-injection (verify/authority seizure, auto-submit, auto-contact, staff-firing), money/ROI/win-probability claim, PII (name/email/phone), ambiguous/low-context, one-off complaint.

## 8. Interpreter behavior
Deterministic (`interpretRawPublicSignal`): strips PII first → detects+ignores injection → records but never accepts financial claims → downgrades ambiguous/one-off text → classifies source quality/evidence strength/business issue/opportunity/risks → proposes a governed correction type + owner-approval/evidence requirements + blocked unsafe actions → emits an audit trace. `interpretAndValidateRawPublicSignal` schema-validates before the signal may enter the governed path. `normalizedSignalToProcessCorrection` maps it into a `ProcessCorrection`; the **bridge remains the routing/owner-gating/evidence-gating authority**.

## 9. Privacy / copyright behavior
PII stripped before derivation/persist (`piiRemoved`), currency protected from the phone matcher, ≤180-char sanitized summary, no verbatim text. PII never reaches a governed task or audit event (db test 9).

## 10. Prompt-injection behavior
Detected (`promptInjectionDetected`) and always ignored (`promptInjectionIgnored`); cannot upgrade source quality to verified or change routing/authority (db test 8; unit tests 11/13).

## 11. DB sim result
`raw-free-text-public-signal-end-to-end.db.test.ts` — **18/18 passed** locally against Postgres 16.

## 12. LANE_B proof
Wired into LANE_B + LANE_A. To be confirmed in CI: the file must appear as executed (`✓ …raw-free-text-public-signal-end-to-end.db.test.ts (18 tests)`) with LANE_B ending `LANE_B_DB_VERIFIED`. A generic green DB lane is not accepted unless the new sim is visibly executed.

## 13. Module / domain correctness
Every archetype produces a distinct, correct governed route (correction / reassessment / evidence-request / data / owner-approval / training) — no laundry bias (db test 3). Owner-material decisions are owner-gated; data gaps are data tasks; collective conflict is coherent (fix quality first, scale owner-gated). See `RAW_TEXT_DECISION_MATRIX.json`.

## 14. Bounded fixes made
- Reordered classification so a material commitment DECISION is owner-gated even without an operational keyword (safest answer to "should we commit?" is always "owner decides").
- Narrowed the discount/price path to price-change *intent* (not the bare word "pricing") so RFP "clear pricing" is not misrouted.
- Added decision-oriented business-cue words so owner-decision signals classify with clean confidence.
- Aligned `recommendedExecutionRoute` with the bridge's owner-approval override so the proposal always equals what the bridge produces.

## 15. Broad gaps deferred
LLM/NLP free-text understanding, live connectors/crawling/scraping, autonomous external action, verified internal financials, private owner shadow pilot, multi-archetype product UI — all FROZEN (`DEFERRED_BROAD_GAPS.md`).

## 16. Commands run
`git status`, `git rev-parse HEAD`, `prisma validate`, `prisma generate` (via test bootstrap), `tsc --noEmit`, `governance:scan:strict`, `lint:ratchet`, interpreter unit tests, raw free-text DB sim, full execution DB suite, `next build`.

## 17. Commands failed / blocked
The local Postgres cluster stopped mid-session once (`pg_ctlcluster 16 main` was restarted; the throwaway `opsiq_test` DB was intact) — a local infra hiccup, not a code failure. No command was blocked thereafter.

## 18. CI status
To be recorded at merge: required checks LANE_B / Build + Type + Prisma Verify / lint (20.x) must be green with the new sim proven executed in LANE_B.

## 19. Final classification
**RAW_FREE_TEXT_PUBLIC_SIGNAL_INTERPRETATION_ELITE_ACCEPTED** — with the honest boundary that the interpreter is deterministic/rule-based over controlled fixtures, not an LLM and not a live ingester (disclosed, not worked around).

## 20. PR / merge status
PR "Raw free text public signal interpretation proof" — to be opened from the branch; merge only when required CI is green and LANE_B proves the new sim executed.

## 21. Main HEAD after merge
To be recorded after merge.

## 22. Exact next safest pass
**Interpreter Robustness & Conflicting-Signal Adversarial Hardening** — feed the interpreter conflicting/contradictory raw signals for the SAME workspace (e.g. one review says "fixed", another says "still broken"), noisy multi-topic text, and a wider injection corpus, and prove the governed collective decision stays conservative and no single signal can override the others. Still deterministic, still controlled fixtures, no live ingestion. (Live connectors, LLM understanding, and the private owner shadow pilot remain frozen until explicitly commissioned.)
