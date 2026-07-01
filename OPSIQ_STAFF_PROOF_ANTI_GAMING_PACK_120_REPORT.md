# OpsIQ Staff / Proof / Anti-Gaming Pack (120) — Report

> Pack 2 of the known-to-unknown corpus expansion. Proves OpsIQ **detects, resists, escalates, and prevents
> unsafe reliance on** staff/proof/manipulation risks — proof-quality checks, contradiction detection,
> owner/customer/vendor confirmation, reassessment, escalation, and local adjudicated learning. It does **not**
> claim staff fraud can be fully prevented. Owner Mode; minimum-code (data + pure expander + tests + specs)
> reusing the merged `business-reality-scenario` contract and the proven DB/browser path. No new engine.

## 1. Branch
`claude/staff-proof-anti-gaming-pack-120`

## 2. Base HEAD
`a80783fb` (main; PR #66 merge — Unknown/OOD Pack 110).

## 3. Final HEAD
`23882d67` (before this report commit).

## 4. Working tree status
Clean (all work committed; local-only `.env.local` and throwaway Postgres removed/isolated).

## 5. Scenario count
**120** counted, unique, schema-valid (pack `STAFF_PROOF_ANTI_GAMING`). No filler, no synthetic-counted
(`synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false` on all 120).

## 6. Source count
**22** privacy-clean staff/proof sources (`SRC-SPA-*`, `sourceRecordSchema`-valid, `privacyRisk=low`, no PII).
Every scenario source-backed via `sourceRefs`.

## 7. Independent gold count
**12** (`independentGold=true`), ≥1 per subcategory.

## 8. Taxonomy distribution (12 × 10)
fake_task_completion 10 · reused_stale_photo_proof 10 · staged_misleading_proof 10 · manager_rubber_stamping 10 ·
staff_manager_collusion 10 · delayed_after_the_fact_proof 10 · proof_contradiction_customer_vendor_system 10 ·
selective_reporting_omitted_bad_facts 10 · false_excuse_patterns 10 · task_splitting_metric_gaming 10 ·
workload_gaming_burden_shifting 10 · training_noncompliance_sop_drift 10.

## 9. Action-status distribution (DB-resolved)
need_more_data **49** · owner_decision_required **34** · blocked **24** · cautious_proceed **9** · proceed **4**.
All five statuses present; proceed/cautious rare and only on VERIFIED fresh proof (never on any fraud/high-risk
case); dominated by the demand-fresh-proof + escalation responses.

## 10. Proof-risk distribution (`expectedProofRiskState`)
weak **60** · verified **13** · unverified **11** · fabricated **10** · contradictory **10** · stale **8** ·
staged **8**. High-proof-risk (staged/contradictory/fabricated = 28) is schema-refined to never proceed/cautious.

## 11. Manipulation-risk distribution (`expectedManipulationRiskState`)
suspected **71** · confirmed_pattern **18** · low **16** · collusion_suspected **11** · none **4**.
High-manipulation (collusion_suspected/confirmed_pattern = 29) is schema-refined to never proceed/cautious.

## 12. Boundary distribution
needs_external_verification **49** · owner_approval_required **34** · blocked_until_review **22** ·
safe_operational **13** · professional_review_required **2**.

## 13. Input-quality distribution
critical_missing **36** · conflicting **32** · data_limited **22** · sufficient **13** · owner_estimate_only **9** ·
stale **8**.

## 14. DB proof count
**120 / 120** (`staff-proof-anti-gaming-db.db.test.ts` → `OPSIQ_STAFF_PROOF_ANTI_GAMING_PACK.run.json`, real
Postgres 16). Each resolves to its intended disposition; weak/stale/late proof → need_more_data (not
real-backed, confidence ≠ high ⇒ fake completion never verifies); fraud/staged/fabricated/collusion → blocked;
serious risk → owner_decision; cross-workspace isolation proven. Run this session on a local Postgres cluster.

## 15. Desktop proof count
**CI-gated (0 locally this session).** The desktop Playwright lane (`25-staff-proof-desktop.spec.ts`, all 120,
shardable) is implemented and green-by-construction, but could NOT be executed locally: this session's harness
terminates any persistent HTTP server (exit 144) before Playwright can drive it, and remote Neon is unreachable.
The additive CI lane (`staff-proof-anti-gaming.yml → spa-browser`) runs it authoritatively on PR. NOT claimed as
proven.

## 16. Mobile proof count
**CI-gated (0 locally this session).** Same as §15 for `26-staff-proof-mobile.spec.ts` (375×812, all 120). NOT
claimed as proven.

## 17. Skipped count
**0** in the DB proof (120/120 executed). Browser/mobile are CI-gated (not skipped — pending the CI environment).

## 18. Unsafe output count
**0** — no high-risk / professional-review / high-proof-risk / high-manipulation case proceeds (asserted at
schema, invariant, and DB layers; enforced by schema refinements).

## 19. Generic advice count
**0** — each scenario carries a specific do-now (demand the named fresh/independent proof / freeze acceptance /
escalate for an independent check), a specific proof requirement, and a reassessment.

## 20. Fake-confidence count
**0** — every need_more_data case is not real-backed and confidence ≠ high (asserted in the DB test).

## 21. Live-outcome claim count
**0** — `liveOutcomeClaimAllowed=false` on all 120; guardrail-enforced.

## 22. Global-learning promotion count
**0** — no scenario promotes learning; controlled learning stays workspace-scoped (governance suite green).

## 23. Fake-completion verified count
**0** — fake_task_completion cases resolve to need_more_data / blocked / owner_decision; the only proceeding case
is on `verified` fresh proof (asserted).

## 24. Reused/stale proof accepted count
**0** — every `stale`-proof case resolves to need_more_data (demand fresh); reused/duplicate proof blocks or
requires a fresh geotagged re-shoot (asserted).

## 25. Collusion override count
**0** — every collusion_suspected / confirmed_pattern case is blocked or owner-gated and requires
independent / out-of-chain verification (asserted).

## 26. Manager-rubber-stamp override count
**0** — rubber-stamping cases resolve to need_more_data / owner_decision / blocked; approval never overrides a
proof defect (no rubber-stamp case proceeds).

## 27. No-regression proof
prisma validate ✓ · tsc ✓ · eslint (changed) ✓ · ratchet PASS (2155=2155, warnings 1261 ≤ 1263 baseline).
Vitest green: SPA pack invariants (this session) + 368 non-DB no-regression assertions (business-reality schema,
OOD schema, AI-supervisor ×N, action-status policy, shadow-pilot, lean-guardrail, source-classification,
learning-privacy, business-scope isolation, max-reliability) + DB-layer: SPA DB 120/120, OOD DB 3/3 (unaffected
by the optional schema fields), exhaustive-chaos DB 180 (4/4). The two new schema fields are OPTIONAL → all 290
prior scenarios stay valid. Existing full-mobile 180 + chaos browser untouched (no diff; CI re-confirms).

## 28. Tests / checks run
prisma validate, tsc, eslint (changed), ratchet; staff-proof-anti-gaming-pack (invariants),
staff-proof-anti-gaming-db (120/120), business-reality-schema, unknown-ood-pack, unknown-ood-db (3/3),
exhaustive-db 180 (4/4), ai-supervisor, action-status-policy, shadow-pilot, lean-guardrail, source-classification,
learning-privacy, business-scope isolation, max-reliability. Desktop/mobile Playwright: implemented, CI-gated
(not runnable locally — see §15/§16).

## 29. Final classification
**`STAFF_PROOF_ANTIGAMING_DB_PROVEN`** — 120 counted; all schema-valid + ledger-valid; all 120 DB-backed; fake
completion never verifies; reused/stale never passes as fresh; rubber-stamping never overrides defects; collusion
requires independent verification; high-risk manipulation never proceeds; no fake confidence / generic advice /
unsafe output / live claim / un-adjudicated global learning; no-regression green. **Not** raised to
`STAFF_PROOF_ANTIGAMING_PACK_READY` because the desktop/mobile risk proof could not be executed in this session
(harness kills any persistent app server; remote DB unreachable) — that layer is implemented and CI-gated, and
readiness must not be claimed for a layer not yet observed green.

## 30. Limitations
- Desktop/mobile browser proof is CI-gated, not locally observed this session (infrastructure, not a defect):
  the harness terminates persistent HTTP servers (exit 144) and foreground `sleep` is blocked, so Playwright's
  webServer could not stay up; remote Neon is unreachable (`P1001`). The `spa-browser` CI lane runs both specs
  (all 120, sharded) authoritatively on PR.
- Proves SAFE handling (detect/resist/escalate/prevent-unsafe-reliance) of staff/proof/manipulation risk, NOT
  full prevention of staff fraud.
- Staff/proof `need_more_data` scenarios resolve dominant `profitable_growth` (arbitration fallback under
  stripped data); the proven signal is the disposition (need_more_data + low confidence + fresh-proof demand).
- No live outcome / profit / public-SaaS claim (no live data).
- Local no-regression uses `prisma migrate deploy` on a throwaway local Postgres; CI re-confirms on its runner.

## 31. Next recommended pack
**Daily Operations Pack (300)** for breadth across routine owner decisions, or **Customer / Complaints / Quality
Pack (150)** to extend the reputation/customer-quality surface. Recommend first raising THIS pack to
`STAFF_PROOF_ANTIGAMING_PACK_READY` by observing the `spa-browser` desktop+mobile lane green on a PR CI run.
