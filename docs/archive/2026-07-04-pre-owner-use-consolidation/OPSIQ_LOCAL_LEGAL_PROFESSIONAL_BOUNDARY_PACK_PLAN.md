# OpsIQ Local / Legal / Professional-Boundary Pack (100) — Plan

> Pack 8 of the known-to-unknown corpus (Step 5 of the Business Reality Corpus execution chain). Committed BEFORE
> implementation, per the chain's plan-first rule.

## 1. Purpose
Prove OpsIQ **respects the professional boundary**: on tax / employment-law / licensing / contract-dispute /
regulatory / data-privacy / health-safety / IP / accounting-audit / zoning matters, OpsIQ PREPARES the question,
gathers the records, and routes to the owner + a qualified professional — it never gives final legal / tax /
accounting / HR advice and never self-clears a compliance boundary. A matter crossing a professional/legal line is
**blocked** (professional review required); a material engage/settle/pay decision is **owner-gated**; a matter
missing its records/filings **needs_more_data**; and only a tiny set of already-professional-prepared routine
in-policy filings (e.g. an accountant-prepared return, a scheduled standard licence renewal) proceed. Fabricated tax
documents / falsified books are blocked as fraud. No new engine; no schema change; no live claim.

## 2. Branch & base
- Branch: `claude/local-legal-professional-boundary-pack`
- Base: `main` @ `ea468961` (PR #72 merge — Customer/Vendor/Market Pack 100). Confirmed present on main before branching.

## 3. Scenario count & taxonomy
Minimum **100**; final **100** = **10 subcategories × 10**. Every scenario is a distinct authored vignette
(no filler), source-backed, `synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false`.

Subcategories (10 each):
1. `tax_filing_gst_treatment`
2. `employment_labor_law_issue`
3. `licensing_permit_registration`
4. `contract_legal_dispute`
5. `regulatory_compliance_inspection`
6. `data_privacy_customer_records`
7. `health_safety_regulation`
8. `intellectual_property_trademark`
9. `accounting_audit_professional_boundary`
10. `local_authority_zoning_municipal`

## 4. Action-status distribution (target ranges → planned)
| status | required range | planned |
|---|---|---|
| proceed | 0–5 | 3 |
| cautious_proceed | 5–15 | 10 |
| need_more_data | 20–40 | 30 |
| owner_decision_required | 25–45 | 32 |
| blocked | 25–45 | 25 |

This is the professional-boundary pack: **blocked + owner_decision dominate** (legal/tax/compliance matters need a
professional and the owner's decision), need-data is high (get the records/filings first), and proceed is rare —
only an already-professional-prepared routine in-policy filing.

Per-subcategory disposition mix (PR/CA/NF/OD/BL), each row = 10, columns hit the totals above:

| # | subcategory | PR | CA | NF | OD | BL |
|---|---|---|---|---|---|---|
| 1 | tax_filing_gst_treatment | 0 | 1 | 3 | 4 | 2 |
| 2 | employment_labor_law_issue | 0 | 1 | 3 | 3 | 3 |
| 3 | licensing_permit_registration | 1 | 1 | 3 | 3 | 2 |
| 4 | contract_legal_dispute | 0 | 1 | 3 | 3 | 3 |
| 5 | regulatory_compliance_inspection | 0 | 1 | 3 | 3 | 3 |
| 6 | data_privacy_customer_records | 0 | 1 | 3 | 3 | 3 |
| 7 | health_safety_regulation | 0 | 1 | 3 | 3 | 3 |
| 8 | intellectual_property_trademark | 1 | 1 | 3 | 3 | 2 |
| 9 | accounting_audit_professional_boundary | 0 | 1 | 3 | 4 | 2 |
| 10 | local_authority_zoning_municipal | 1 | 1 | 3 | 3 | 2 |

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Pure data + a pure `expand()` over the merged `business-reality-scenario` contract, identical to the Daily
Operations / Finance / Weekly / Growth / Customer-Vendor packs. Each disposition carries a deterministic
`ScenarioSeedPlan` that the existing `getOwnerWholeBusinessPlan` DB path resolves to the intended status:
- `PR` → seed `{ profitable_growth, good, sopRiskClass: low }` → **proceed**
- `CA` → seed `{ profitable_growth, good, sopRiskClass: medium }` → **cautious_proceed**
- `NF` → seed `{ profitable_growth, bad, stripCriticalData: true }` → **need_more_data**
- `OD` → seed `{ OD_DOMINANT[sub], bad }` → **owner_decision_required**
- `BL` → seed `{ BL_DOMINANT[sub], ugly }` → **blocked**

Per-subcategory binding constraints (all DB-proven by the prior packs via the same seed path):
- `OD_DOMINANT`: tax/contract-settlement/IP/accounting → `below_margin` (cost/provision/settlement); employment/
  licensing/regulatory/data-privacy/health-safety/zoning → `owner_workload` (owner must personally decide the
  engagement with professional input).
- `BL_DOMINANT`: tax-filing + accounting-audit → `proof_fraud_block` (fabricated tax documents / falsified books);
  all others → `compliance_block` (professional-review-required legal/regulatory boundary). Planned: 21 compliance
  (professional-review) blocks, 4 fraud blocks.

## 6. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-LLB-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
each subcategory + the routine-professional-prepared / professional-boundary / fraud boundaries backed. **10
independent gold** (≥1 per subcategory). Every counted scenario source-backed.

## 7. Proof plan
- **Schema + invariant tests** (`local-legal-professional-boundary-pack.test.ts`): count 100, 10×10, unique,
  schema-valid, source-backed, 24 sources privacy-clean, 10 gold, distribution within the required ranges, and hard
  safety rules (every professional-boundary case is blocked and never proceeds; no missing-records case proceeds;
  no fabricated-document case proceeds; proceed/cautious only on already-professional-prepared routine in-policy
  filings; NO final-advice claim — every scenario carries a professional-boundary note; no live claim).
- **DB proof** (`local-legal-professional-boundary-db.db.test.ts`): all 100 seeded into isolated businesses, run
  through the REAL `getOwnerWholeBusinessPlan`; assert status + dominant + need_more_data provider-gate + safety +
  proof/reassessment; all five statuses present; cross-workspace isolation. Ledger →
  `OPSIQ_LOCAL_LEGAL_PROFESSIONAL_BOUNDARY_PACK.run.json`.
- **Desktop + mobile Playwright** (`37-local-legal-desktop.spec.ts`, `38-local-legal-mobile.spec.ts`): all 100
  render the runtime-fed Supervisor Summary at desktop + mobile (375×812); status matches; no professional-review/
  fraud case reads "Proceed"; no horizontal overflow. Shardable via `LLB_SHARD_INDEX`/`LLB_SHARD_TOTAL`. CI-gated.
- **CI workflow** (`local-legal-professional-boundary.yml`): `llb-db` + 2-shard `llb-browser`. Additive; modifies
  no existing lane.

## 8. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: cumulative 1230 → **1330** counted scenarios; this pack
brings **local / legal / professional boundary (26)** to full coverage and extends **compliance / safety (27)** and
anti-gaming (19).

## 9. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data only (no schema change → all 1230 prior scenarios stay valid). Every scenario reduces risk or improves proof
coverage. No fabricated volume, no filler, no weakened gate, no lowered threshold, no deleted test.

## 10. What this pack does NOT claim
- Does **not** give final legal / tax / accounting / HR / regulatory advice — this is the whole point: it PREPARES
  and routes to a professional; boundary cases block.
- Does **not** claim OpsIQ can replace lawyers / accountants / HR / compliance professionals.
- Does **not** prove live outcome improvement (no live data; `liveOutcomeClaimAllowed=false` on all 100).
- Does **not** solve unknown-unknowns, unblock public SaaS, or make OpsIQ autonomous.
- The proven signal is the **disposition** (status + confidence + proof demand + owner-gate + professional-boundary
  flag). Where a routine/need-data disposition resolves dominant `profitable_growth` under the seeded knobs, that is
  the documented arbitration behaviour (same as prior packs), not a claim about the matter's legal merits.

## 11. Merge gate
Merge only when: DB 100/100 green in CI, desktop+mobile shards green, ALL prior lanes green (no regression),
ratchet unchanged, and a final read-only hostile audit passes. Classification target on merge:
`LOCAL_LEGAL_PROFESSIONAL_BOUNDARY_PACK_READY`.
