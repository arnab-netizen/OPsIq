# OpsIQ Extensive Real-World Case Training — Report

## 1. Branch
`claude/opsiq-real-world-case-training` (from `main` `57f4ea69`).

## 2. Base HEAD
`57f4ea69` (post-merge of PR #57; classification `READY_FOR_REAL_WORLD_CASE_TRAINING`).

## 3. Final HEAD
`cbb828d` + this report commit on top.

## 4. Working tree status
Clean (all slices committed; report added on top).

## 5. Source acquisition summary
Real public business **patterns** were gathered via web search (cash-flow failures, receivables/credit-
term traps, dead-stock/overstock, over-expansion, fake-vendor/kickback fraud, fictitious-vendor invoicing,
ghost-employee payroll, turnaround sequencing, weak unit economics). Only the operational pattern
(numbers/constraint/root cause/correct action) was extracted — **no personal identifiers, no long copied
text**. Captured as 14 metadata-only `SourceRecord`s in `OPSIQ_PUBLIC_CASE_SOURCE_REGISTER.md`.

## 6. Source categories
gov/SME guidance (SCORE/SBA), failure post-mortems, turnaround stories, case studies, sector examples,
advice/forum, staffing-ops, regulatory summaries — 14 sources spanning retail, cafe/restaurant,
hospitality, manufacturing, professional services, housekeeping, B2B contracting, auto-service,
wholesale, micro-SaaS.

## 7. Total cases
**2,016** (`PUBLIC_CORPUS`), all schema-valid (`PublicCase` wrapping a valid `BehavioralCase`).

## 8. Real-source-derived cases
**504** (each carries `sourceRef` into the register + `patternId`).

## 9. Synthetic variants
**1,512** (each links to a real lineage parent; ≥3 materially-changed axes vs parent — verified, 0 weak).

## 10. Adversarial/extreme cases
**1,008** by severity (fraud/extreme/ugly_spiral); adversarial split = 351.

## 11. Multi-turn cases
**504** (2-turn owner pushback → OpsIQ holds the gate with the reason).

## 12. Collective cases
**2,016** (≥3 materially-conflicting domains + a blocking constraint → whole-business arbitration).

## 13. Browser/E2E representative cases
**1,152** flagged browser-representative; **288** assigned to the `browser_representative` split.
(Browser E2E execution of representative flows is NOT run this session — see §32/§36.)

## 14. Cases by business category
All **36** required categories covered (min 56 cases each): laundry, housekeeping, restaurant,
retail/grocery, pharmacy, salon, gym, clinic, eldercare, childcare, tutoring, repair, pest-control,
trades, printing, manufacturing, logistics, ecommerce, agency, IT-services, micro-SaaS, construction,
hotel, franchise, agri, carwash, catering, wholesale, warehouse, multi-location, renovation, travel,
subscription, B2B-contractor, auto-service, distributor.

## 15. Cases by domain
**30 distinct domains** covered (each ≥144 cases): cash flow, working capital, budgeting, capital
allocation, pricing/margin, B2B receivables/payment terms, inventory/stock, profitability/efficiency,
operations, capacity/equipment, staff/process control, staff incentives/KPI gaming, customer
quality/reputation, customer acquisition, customer retention, marketing, opportunity/contract evaluation,
scaling/expansion, stop-loss/pivot/shutdown, strategy, owner workload reduction, approval
memory/standing instructions, self-evaluation/learning, vendor/supplier management, fraud/collusion
prevention, proof/anti-gaming, compliance/professional-review, tax/legal/insurance escalation, digital/
e-commerce unit economics, business continuity/risk management.

## 16. Cases by critical domain
Critical domains present and well-covered: cash flow, pricing/margin, working capital, budgeting,
capacity/equipment, staff/process control, proof/anti-gaming, compliance/professional-review,
opportunity/contract evaluation, owner workload reduction, self-evaluation/learning, customer
quality/reputation, scaling/expansion, stop-loss/pivot/shutdown, profitability/efficiency, fraud/collusion
prevention, B2B receivables/payment terms, staff incentives/KPI gaming. (Cyber/continuity present at a
lighter depth; see §36 for the not-yet-covered domains.)

## 17. Cases by scenario severity
best-fragile (good_fragile) 144 · normal 288 · bad_management 576 · ugly_spiral 432 · fraud 432 ·
extreme 144.

## 18. Cases by geography/location
**8** geographies (India tier1/2/3 + rural + dense-urban + low-income-urban presets, Singapore, Australia,
UK, US, UAE, SEA, global-online — drawn from the validated `LOCATIONS` presets).

## 19. Cases by business stage
**8** stages: startup, early, established, growth, scaling, distressed, turnaround, winding_down.

## 20. Anonymization/privacy proof
Source register + corpus carry **no** personal identifiers and **no** long copied text — enforced by the
PII detector (email/phone/SSN/address/handle) and the short-quote cap, with positive-control tests.
`source-register.test.ts` (6) green.

## 21. Training/validation/holdout/adversarial/regression split
training 504 · validation 286 · holdout 172 (all `holdoutProtected`) · adversarial 351 · regression 304 ·
production_runtime 111 · browser_representative 288. `publicSplitIntegrity()` = OK (holdout protected, not
in training; all splits represented).

## 22. Domain scores
Per-domain segment scores (avg collective.total through the runtime) ≥90 for 28/30 covered domains.

## 23. Critical domain scores
No covered critical domain below threshold in the runtime sweep (all categories ≥85, all severities ≥85).

## 24. Weak business categories
**None** — every one of the 36 categories scores ≥85 through the production runtime (min category ≈98).

## 25. Weak severity groups
**None** — every severity group ≥85 (min ≈95).

## 26. Weak locations
**None observed** at the location level in the sweep.

## 27. Collective whole-business score
**98.2** (≥90).

## 28. Production runtime score
**98.1** (≥90) — measured by running **1,442** cases through `runOwnerAdvice` (the production path).

## 29. Holdout score
**97.6** (≥88).

## 30. Adversarial unsafe count
**0**.

## 31. Regression failures
**0** (every regression case keeps its gold dominant constraint through the runtime).

## 32. Browser/E2E representative result
**Not executed this session.** 1,152 cases are flagged browser-representative and the command-center
whole-business card was already proven to render the runtime output end-to-end on `main` (PR #57, 11/11
owner Playwright specs). The 10 dedicated representative browser flows in §14 of the prompt are **not yet
run** here — this is the gap between `PRODUCTION_RUNTIME_TRAINING_READY` and `CORE_READY`.

## 33. Learning artifacts generated
The runtime applies the trained learning store (store trained on the existing expanded corpus failures);
`learningAppliedRate` ≈ **60%** across the scored corpus. Dedicated public-corpus failure→artifact loop
(§11 of the prompt) is partially exercised via the production path; a standalone public-corpus learning
slice is **remaining** (see §36).

## 34. Playbooks generated/updated
Each play encodes a domain + whole-business playbook (root cause → dominant constraint → do-not-do → next
action → proof → reassessment → stop-loss → 7/30/90 plan), applied across 36 categories. Standalone
playbook-update persistence is **remaining**.

## 35. Do-not-repeat rules generated
Every case carries a `learningRuleIfFails` + `regressionTrigger` (e.g., "block contract acceptance when
margin after terms is non-positive"). Persisted do-not-repeat suppression is exercised by the existing
learning engine; a public-corpus-specific suppression slice is **remaining**.

## 36. Weaknesses still found
1. **Domain coverage 30/60.** Not-yet-covered required domains include: SOPs/checklists/process-
   improvement (as distinct tags), staff training, staff workload/fairness, hiring/firing, maintenance/
   downtime, delivery/logistics (as a tagged domain), location/local-market (tagged), remote-owner
   (tagged), multi-location/portfolio (tagged), quality control, customer service, brand/franchise,
   cybersecurity/data-loss/payment-fraud, insurance/claim, emergency/disaster continuity, reputation/
   social-media crisis, loan/debt/EMI affordability, asset purchase/payback, local competition/price-war,
   seasonality/festival/weather, succession/key-person, exit/sale readiness, sales (as a tag), owner
   emotional/override discipline (tagged).
2. **2 domain tags <90** in the sweep: "approval memory/standing instructions" and "self-evaluation/
   learning" (owner-workload-adjacent) — non-safety, candidates for a learning slice.
3. **Browser representative E2E (10 flows) not run** this session.
4. **Standalone public-corpus learning + regression persistence loop** not yet built (the production
   runtime applies the existing store; a dedicated public failure→artifact→improvement slice remains).

## 37. Cases needing expert adjudication
The 2 sub-90 domain tags and any future weak segment surfaced when the remaining domains are added.

## 38. Final classification
**`PRODUCTION_RUNTIME_TRAINING_READY`**

Proven this session: source register (privacy-enforced) · a **2,016-case** real-world library (504 real-
source-derived, 1,512 lineage-linked variants, 1,008 adversarial/extreme, 504 multi-turn, 2,016
collective) covering **all 36 business categories** with **gold skeletons** and **zero shallow
duplicates** · **100%** correct dominant-constraint resolution through the real arbitration engine ·
expert-level scores **through the production runtime** (runtime 98.1 / collective 98.2 / holdout 97.6,
adversarial unsafe 0, regression 0, every category & severity ≥85) · leak-safe splits · a readiness gate
that a weak segment or harness-only result cannot pass.

Honestly **below** `CORE_READY`/`EXPERT_READY` because: **domain coverage is 30/60** (DOMAIN_TRAINING_
PARTIAL), the **10 browser-representative flows are not run** this session, and a **standalone public-
corpus learning/regression persistence loop** remains. No PR opened (below CORE_READY); not merged.

## Tests / checks run
`tsc` (0) · eslint changed (0) · `source-register.test.ts` (6) · `corpus.test.ts` (11, incl. 100%
arbitration-constraint match + corpus-wide scorer pass + 0 unsafe) · `scoring.test.ts` (7, incl. a live
production-runtime threshold sweep + weak-segment/harness-only gate tests) — **24/24 public-cases tests
green**. Full production-runtime sweep over **1,442** cases via `runOwnerAdvice`.
