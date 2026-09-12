# Final Volume & Prioritisation Proof Report — PASS 30

**Date:** 2026-07-07

## 1. Main HEAD before
`184619e2d99990890b51e9fa9d192af90405aa17` (PR #161 merged; contains #157–#161).

## 2. Branch
`claude/multi-signal-volume-prioritisation-stress-proof`

## 3. Files changed
**Added (code):**
- `src/domain/owner-mode/public-signal-prioritisation.ts` — deterministic volume/prioritisation layer + Zod schema + bridge adapter.
- `src/__tests__/owner-mode/public-signal-prioritisation.test.ts` — 20 unit tests.
- `src/__tests__/execution/multi-signal-volume-prioritisation.db.test.ts` — 14-test high-volume DB sim.

**Changed (CI):** `.github/workflows/db-verification.yml` — wired the new DB sim into LANE_B + LANE_A.

**Added (docs — fixtures):** `docs/real-world-data/multi-signal-volume-prioritisation-proof/` — `MULTI_SIGNAL_VOLUME_FIXTURES.json`, `PRIORITISATION_EXPECTATIONS.json`, `VOLUME_PRIVACY_AND_SAFETY_NOTES.md`, `VOLUME_FIXTURE_REPORT.md`.

**Added (docs — audit):** `docs/audits/2026-07-07-multi-signal-volume-prioritisation-proof/` — this report, `PRIORITISATION_DECISION_MATRIX.json`, `VOLUME_SAFETY_MATRIX.json`, `EVIDENCE_LEDGER.json`, `DEFERRED_BROAD_GAPS.md`.

## 4. Schema changed
None. No Prisma model/migration change — reuses the existing `ProcessExecutionTask` / governed-bridge substrate.

## 5. Fixture count
9 stress cases (8 archetype workspaces + 1 clean control).

## 6. Highest signal volume tested
**51 signals** in one workspace (collective).

## 7. Archetypes covered
laundry, housekeeping, property, franchise, SaaS, tender (not skipped), B2B, collective — 8/8 + clean control.

## 8. Prioritisation behavior
Signals are grouped into a few issue clusters; each cluster is conflict-resolved and assigned a transparent priority tier (1–9) with explicit reasons. Priority order: owner legal/contract/reputation/large-spend (2) → customer quality/rework/operations (3) → cash/profit missing-data (4) → capacity/staff/SOP (5) → tender eligibility/deadline (6) → owner-gated pricing/brand + generic validation (7) → growth/opportunity (8) → monitor-only/positive (9). Growth/marketing/expansion/tender-submit is never the top action while an unresolved quality/cash/capacity/legal risk exists.

## 9. Anti-spam behavior
51→3, 30→3, 26→4, 21→3, 20→2, 15→1 clustered governed tasks — one task per actionable cluster, never one-per-signal. Cockpit shows one top action + grouped secondaries + a monitor-only summary; no raw-signal dump.

## 10. DB sim result
`multi-signal-volume-prioritisation.db.test.ts` — **14/14 passed** locally against Postgres 16.

## 11. LANE_B proof
Wired into LANE_B + LANE_A. To be confirmed in CI: `✓ …multi-signal-volume-prioritisation.db.test.ts (14 tests)` executed with LANE_B ending `LANE_B_DB_VERIFIED`. A generic green DB lane is not accepted unless the new sim is visibly executed.

## 12. Bounded fixes made
- Removed keyword-based growth demotion (a real quality cluster was wrongly demoted to the growth tier because the mixed cluster text mentioned "marketing"/"grow"). Growth is now decided by the cluster's **topic** only — unresolved quality/cash/capacity risk can never be hidden under a growth tier.
- Made non-owner tiering **topic-driven** (an unverified public quality complaint is a tier-3 quality blocker whether the governed route is a correction or a validation data task).

## 13. Broad gaps deferred
Finer topic clustering, learned/weighted prioritisation, LLM/NLP understanding, live connectors/crawling/scraping, autonomous external action, private owner shadow pilot, multi-archetype product UI — all FROZEN (`DEFERRED_BROAD_GAPS.md`).

## 14. Commands run
`git status`, `git rev-parse HEAD`, `prisma validate`, `prisma generate` (via test bootstrap), `tsc --noEmit`, `governance:scan:strict`, `lint:ratchet`, interpreter/conflict/prioritisation unit tests, volume DB sim, full execution + owner-mode suites, `next build`.

## 15. Commands failed / blocked
The local Postgres cluster was stopped at session resume (`pg_ctlcluster 16 main start` restarted it; the throwaway `opsiq_test` DB was intact) — a local infra hiccup, not a code failure.

## 16. CI status
To be recorded at merge: required checks LANE_B / Build + Type + Prisma Verify / lint (20.x) must be green with the new sim proven executed in LANE_B.

## 17. Final classification
**MULTI_SIGNAL_VOLUME_PRIORITISATION_ELITE_ACCEPTED** — with the honest boundary that the layer is deterministic/rule-based over controlled fixtures, priority is a transparent tier (not a learned/opaque score), and it is not a live ingester (disclosed, not worked around).

## 18. PR / merge status
PR "Multi signal volume prioritisation stress proof" — to be opened from the branch; merge only when required CI is green and LANE_B proves the new sim executed.

## 19. Main HEAD after merge
To be recorded after merge.

## 20. Exact next safest pass
**Owner Cockpit Decision-Coherence & Explainability Proof** — take the prioritised cockpit output and prove the owner-facing explanation for each top action is coherent, evidence-linked, and free of fabricated certainty: every top action traces to its clusters/signals, states what is verified vs unverified, why it outranks the rest, what evidence would close it, and what stays owner-gated — with no hidden score and no fabricated money. Still deterministic, still controlled fixtures, no live ingestion. (Live connectors, LLM understanding, and the private owner shadow pilot remain frozen until explicitly commissioned.)
