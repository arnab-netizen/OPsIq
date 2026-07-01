# OpsIQ Staff / Proof / Anti-Gaming Pack (120) — PR Report

> PR to `main` for Pack 2 of the known-to-unknown corpus expansion. Opens the branch so GitHub CI runs the
> new `staff-proof-anti-gaming.yml` desktop + mobile risk lane (which cannot run in the build session's harness)
> plus every standard no-regression / branch-protection gate. **This PR is a CI gate, not a merge request.**

## 1. Branch
`claude/staff-proof-anti-gaming-pack-120`

## 2. Base main HEAD
`a80783fb` (main; PR #66 merge — Unknown/OOD Pack 110).

## 3. Final branch HEAD
`57b2603d` (before this report commit).

## 4. Working tree status
Clean.

## 5. Current classification
**`STAFF_PROOF_ANTIGAMING_DB_PROVEN`** — 120 counted, schema-valid, ledger-valid, all 120 DB-backed; every safety
invariant holds at the schema, invariant, and DB layers. The desktop/mobile risk lane is implemented but not yet
observed green (it needs a sustained app server, which the build session's harness could not provide).

## 6. Why PR CI is required to raise to `STAFF_PROOF_ANTIGAMING_PACK_READY`
`PACK_READY` requires the desktop **and** mobile risk lanes observed green. Those Playwright lanes need a live
Next server driven by a real browser — which the build session's harness terminates (persistent servers exit 144;
foreground `sleep` blocked) and the remote Neon DB is unreachable. GitHub CI provisions a fresh Postgres 16 +
migrated schema + a running app, so the `spa-browser` lane runs authoritatively there. Only after CI shows both
lanes green (with no-regression) may the classification be raised — this PR does not pre-claim it.

## 7. Scenario count
**120** counted, unique, schema-valid (`STAFF_PROOF_ANTI_GAMING`). No fabricated volume; `synthetic=false`,
`countedForReadiness=true`, `liveDataBacked=false` on all 120.

## 8. Source count
**22** privacy-clean staff/proof sources (`SRC-SPA-*`, `sourceRecordSchema`-valid, `privacyRisk=low`, no PII).

## 9. Independent gold count
**12** (`independentGold=true`), ≥1 per subcategory.

## 10. DB proof
**120 / 120** (`staff-proof-anti-gaming-db.db.test.ts` → `OPSIQ_STAFF_PROOF_ANTI_GAMING_PACK.run.json`, real
Postgres 16, re-verified this session; ledger identical to committed). Action-status (DB-resolved):
need_more_data 49 · owner_decision_required 34 · blocked 24 · cautious_proceed 9 · proceed 4.

## 11. Schema / invariant proof
All 120 re-validated against `businessRealityScenarioSchema` (with the optional `expectedProofRiskState` /
`expectedManipulationRiskState` fields + guarded refinements: high proof/manipulation risk can never proceed).
Invariants green: fake completion never verifies (only `verified` proof proceeds); stale proof → need_more_data;
collusion/confirmed-pattern → blocked or owner-gated with independent verification; contradictory proof never
proceeds; dashboard + mobile carry proofRisk + manipulationRisk; 0 unsafe / generic / fake-confidence / live claim.

## 12. Desktop / mobile proof status
**Pending CI.** Specs `25-staff-proof-desktop.spec.ts` + `26-staff-proof-mobile.spec.ts` (all 120, shardable) are
implemented; the `spa-browser` CI lane runs them. NOT claimed as proven until CI is green.

## 13. No-regression proof (this session)
prisma validate ✓ · tsc ✓ · eslint (changed) ✓ · ratchet PASS (2155=2155). Vitest: 27 files / 355 tests green —
SPA DB 120/120, OOD DB, SPA invariants, business-reality schema, OOD schema, AI-supervisor, action-status policy,
source-classification, learning-privacy, business-scope isolation, max-reliability; plus exhaustive-chaos DB 180
(4/4, verified in the build session). Optional schema fields keep all 290 prior scenarios valid (OOD DB unaffected).

## 14. CI expectations
On PR open, GitHub Actions runs:
- `staff-proof-anti-gaming.yml → spa-db` — migrate deploy + schema tests + all-120 DB proof + exact-120 ledger
  assertion + artifact.
- `staff-proof-anti-gaming.yml → spa-browser` (2 shards) — build, seed 120, desktop + mobile Playwright across
  the 12 subcategories; high-risk / professional / fraud / collusion never "Proceed".
- All existing lanes (unchanged): Unknown/OOD (DB + desktop/mobile), chaos-exhaustive 180 (DB + browser/mobile),
  owner-pilot-db, owner-pilot-e2e, no-regression vitest, build/type/prisma, lint, security, MVP readiness,
  branch-protection.

Expected green, matching the DB ledger. If a lane is red for a genuine branch reason it is a blocker (reported,
not merged); an infra flake is re-kicked, not patched around.

## 15. Merge recommendation
**Do not merge** until CI is fully green AND a final read-only hostile audit passes. This PR is the CI gate that
lets us raise `DB_PROVEN → PACK_READY`; it is not a merge request.
