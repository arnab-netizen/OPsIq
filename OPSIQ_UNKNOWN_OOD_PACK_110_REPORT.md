# OpsIQ Unknown / Novel / OOD Pack (110) — Report

> Pack 1 of the known-to-unknown corpus expansion. Proves OpsIQ SAFELY handles unknown/novel/OOD situations —
> it does NOT claim to solve unknown-unknowns. Owner Mode; minimum-code (data + pure expander + tests + specs);
> reuses the merged contract + proven DB/browser path; no new engine.

## 1. Branch
`claude/unknown-ood-pack-110`

## 2. Base HEAD
`a28b3f68` (main, PR #65).

## 3. Final HEAD
`d061a34f…` (before this report commit).

## 4. Working tree status
Clean (all work committed).

## 5. Scenario count
**110** counted, unique, schema-valid (pack `UNKNOWN_OOD`). No filler, no synthetic-counted.

## 6. Source count
**22** privacy-clean OOD sources (composite/sector, `sourceRecordSchema`-valid, privacyRisk low). Every scenario source-backed.

## 7. Independent gold count
**11** (≥1 per subcategory).

## 8. Taxonomy distribution (11 × 10)
unfamiliar_business_model 10 · new_service_category 10 · new_equipment_process 10 · new_jurisdiction_rule 10 ·
unusual_b2b_terms 10 · strange_customer_behavior 10 · unseen_staff_proof_manipulation 10 · unusual_vendor_supply 10 ·
sudden_external_shock 10 · contradictory_incomplete_urgent 10 · weak_analogy_pattern_adjacent 10.

## 9. Action-status distribution (DB-resolved)
need_more_data **51** · owner_decision_required **34** · blocked **18** · cautious_proceed **5** · proceed **2**.
All five statuses present; proceed/cautious rare; dominated by need_more_data (the honest novelty response).

## 10. Novelty-state distribution
novel_low_risk 76 · novel_high_risk 32 · known 2.

## 11. Boundary distribution
needs_external_verification 51 · owner_approval_required 34 · safe_operational 15 · blocked_until_review 10.

## 12. Input-quality distribution
critical_missing 51 · data_limited 26 · owner_estimate_only 18 · conflicting 8 · sufficient 7.

## 13. DB proof count
**110 / 110** (`unknown-ood-db.db.test.ts` → `OPSIQ_UNKNOWN_OOD_PACK.run.json`). Each resolves to its intended
disposition; need_more_data cases are not real-backed and never high-confidence; cross-workspace isolation proven.

## 14. Desktop proof count
**110 / 110** (`23-ood-desktop.spec.ts` → `OPSIQ_UNKNOWN_OOD_DESKTOP.run.json`), real Chromium.

## 15. Mobile proof count
**110 / 110** (`24-ood-mobile.spec.ts` → `OPSIQ_UNKNOWN_OOD_MOBILE.run.json`), 375×812, no horizontal overflow.

## 16. Skipped count
**0**.

## 17. Unsafe output count
**0** (no high-risk/professional/guardrail case proceeds — asserted at schema, DB, desktop, and mobile layers).

## 18. Generic advice count
**0** — each scenario carries a specific do-now (ask for the named missing data / block until review / prepare owner options).

## 19. Fake-confidence count
**0** — every need_more_data case is not real-backed and confidence ≠ high (asserted in the DB test).

## 20. Live-outcome claim count
**0** — `liveOutcomeClaimAllowed=false` on all 110; guardrail-enforced.

## 21. High-risk action proceed count
**0**. Professional-review proceed count: **0**. Guardrail proceed count: **0**.

## 22. Global-learning promotion count
**0** — no scenario promotes learning; the runtime's controlled-learning stays local/workspace-scoped (unchanged; governance suite green).

## 23. No-regression proof
prisma validate ✓ · tsc ✓ · eslint (changed) ✓ · ratchet PASS (2155=2155). Vitest scenarios + owner-mode +
behavioral-validation + services/owner-mode + governance green (incl. OOD schema 10 + OOD DB 3, business-reality
schema 16, guardrail 9, shadow-pilot 10, exhaustive-db 180, gate-protection 5, ledger-integrity 10, action-status
policy, AI-supervisor, adjudication). Existing full-mobile 180 + chaos untouched (no diff to those paths).

## 24. Tests / checks run
prisma validate, tsc, eslint, ratchet; unknown-ood-pack (10), unknown-ood-db (110), business-reality-schema (16),
guardrail (9), shadow-pilot (10), exhaustive-db (180), gate-protection (5), ledger-integrity (10), action-status
policy, AI-supervisor, source/privacy, business-scope isolation, governance/adjudication; Playwright OOD desktop
(110) + OOD mobile (110).

## 25. Final classification
**`UNKNOWN_OOD_PACK_READY`** — 110 counted; all schema-valid + ledger-valid; all 110 DB-backed; all high-risk /
professional-review / unknown_unknown_guardrail cases pass desktop AND mobile; **all 110** pass desktop and mobile
(far exceeds the 60/60 minimum); novelty lowers confidence where required; high-risk never proceeds;
professional-review never proceeds; no fake confidence / generic advice / unsafe output / live claim; no global
learning promotion; no-regression green.

## 26. Limitations
- This pack proves SAFE HANDLING of unknowns, NOT unknown-unknown solving (guardrail behaviour, not solution correctness).
- OOD `need_more_data` scenarios resolve dominant `profitable_growth` (arbitration fallback under stripped data);
  the proven signal is the disposition (need_more_data + low confidence + data request), not the dominant.
- No live outcome / profit / public-SaaS claim (no live data).
- 9 remaining corpus packs + 50 sequential simulations are future PRs.
- Local no-regression uses `prisma db push`; CI confirms under `migrate deploy`.

## 27. Next recommended pack
**Staff / Proof / Anti-Gaming Pack (120)** — highest safety value after OOD (extends the proof-fraud / manipulation
coverage), or the **Daily Operations Pack (300)** for breadth.
