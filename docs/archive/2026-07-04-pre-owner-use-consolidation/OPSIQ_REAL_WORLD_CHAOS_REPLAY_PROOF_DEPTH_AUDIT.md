# OpsIQ Real-World Chaos Replay — Proof-Depth Audit (hostile, before PR)

> Read-only audit. No production/runtime/UI/test code changed. The point is to prove **exactly what ran**
> and to state, honestly, where the original `REAL_WORLD_CHAOS_REPLAY_READY` claim is solid vs. overstated.

- **Branch:** `claude/real-world-chaos-replay-audit`
- **Final HEAD:** `8a873d0244df1e3ce11683fb96ce884e254b1d93` (audit adds docs only)
- **Manifest:** `OPSIQ_REAL_WORLD_CHAOS_REPLAY_SCENARIO_MANIFEST.md` / `.json` (all 165 rows, generated from a live run)

## Headline finding (honest)
All **165 distinct** real-world cases **did** run through the real `arbitrate()` engine **and** the real
`runOwnerAdvice` runtime + `buildSupervisorSummary` — this is **not** one path / one pattern. BUT three
material caveats temper the "READY / all-100" framing:

1. **No real provider data in the in-memory replay** → `criticalDomainsAllReal` is **false for all 165**, so
   the supervisor disposition collapses to only **`need_more_data` (105)** or **`blocked` (60)**. The
   richer `proceed` / `cautious_proceed` / `owner_decision_required` paths are **never exercised** by the
   165-scenario replay (only the 4 DB-seeded businesses touch the real-data path).
2. **The 100 scores are predominantly STRUCTURAL** (always-emitted supervisor fields + a co-engineered
   dominant), not independent business-judgment grading.
3. **Circularity is MEDIUM**: the locked `expectedDominantConstraint` is the corpus `goldSkeleton` dominant,
   which the library was explicitly engineered to make `arbitrate()` agree with — so "dominant accuracy 100"
   largely re-proves corpus self-consistency, not an independent oracle.

## 2. Proof-depth breakdown (exact counts, not combined)
| Layer | Scenarios proven |
|---|---|
| 1. scenario schema validation | 165 |
| 2. source validation (sourceRef in register, privacy-clean, chaos-bearing) | 165 |
| 3. locked expected-outcome validation (frozen + hash before output) | 165 |
| 4. real `arbitrate()` engine | 165 |
| 5. real owner runtime/service path (`runOwnerAdvice` + supervisor mapping) | 165 |
| 6. DB-backed `getOwnerWholeBusinessPlan` path | **0** (chaos cases); 4 representative non-chaos businesses proven separately |
| 7. Supervisor Summary generation | 165 |
| 8. dashboard jsdom rendering | **8** |
| 9. mobile-bounded rendering (jsdom) | **8** |
| 10. full Next build | 0 |
| 11. full Playwright browser | **0** |
| 12. full Playwright mobile | **0** |
| 13. CI-ready workflow only | 165 (the suite is CI-runnable) |
| 14. actual CI run | 0 (no PR yet) |

## 3. Source proof audit
- total sourceRefs (one per counted scenario): **165**
- unique sourceRefs: **11** — `SRC-FOUNDR-STARTUP, SRC-BND-FRAUD-SIGNS, SRC-SOCIALTARGETER-PIVOT,
  SRC-NETSUITE-DEMAND-SEASON, SRC-KENAN-RESILIENCE, SRC-SCORE-CASHFLOW, SRC-PESHEV-EXPANSION,
  SRC-SCIENCEDIRECT-COVID, SRC-SDK-FICTITIOUS-VENDOR, SRC-TAL-FAKEVENDOR, SRC-FORTUNE-RANSOMWARE`
- sourceRefs reused across scenarios: **11** (each pattern's source is reused once per category → 15× each).
  **This is a real concentration: 165 scenarios derive from only 11 distinct public sources** (varied across
  15 categories + numeric/location permutations).
- high reliability: **5** · medium: **6** · low: **0**
- missing URL/citation: **0** (every source has a url or citation)
- internal-pattern-notes rather than real public cases: **0** (all 11 are real public sources in the register)
- synthetic sources among counted: **0**
- disqualified from readiness: **0** — but see the concentration caveat (11 unique sources is thin for a
  "75+ real-world scenarios" claim; the breadth is in category/number permutations, not source count).

## 4. Gold-skeleton independence audit
- **Where goldSkeleton came from:** the existing `public-cases/library.ts` generator, which hand-authors an
  expert answer key (`rootCause / dominantConstraint / whatNotToDo / nextBestAction / proofRequired /
  reassessment / stopLoss`) per sourced pattern.
- **Expected modules:** fixture/pattern-authored (`PublicCaseMeta.domains` + `domain:<constraint>`), not
  independently hand-authored per chaos scenario.
- **Expected dominant vs actual:** the chaos `expectedDominantConstraint` **is** `pc.meta.dominantConstraint`
  (the goldSkeleton dominant). The library is explicitly engineered so `arbitrate()` resolves the SAME
  dominant. → expected and actual are **co-designed**, not independent.
- **Engine-vs-itself comparison:** yes — the dominant-constraint dimension compares `arbitrate()` to an
  expectation built to match `arbitrate()`.
- **Circularity risk:** **MEDIUM.** The answer key is human-authored (so not pure tautology), but it was
  co-engineered with the engine, so "dominant accuracy 100" mostly re-confirms corpus self-consistency
  (already proven by existing `collective-cases`/`public-cases` tests). **Recommendation:** do not claim full
  real-world readiness on this basis alone; add a small set of independently-authored gold cases (expected
  outcome written without looking at `arbitrate()` output) to convert MEDIUM → LOW.

## 5. Perfect-score skeptical audit
| Score (100) | Method | Strict or structural | Partial credit? | Failure injection proves it can fail? | Adversarial wrong-output tested? | Reflects business judgment or schema alignment? |
|---|---|---|---|---|---|---|
| module routing | dominant-correct(60) + ≥6 domains assessed(25) + tempting-not-accepted(15) | **structural + circular** | yes (weights) | yes (auditor.test injects empty modules/wrong dominant → <90) | yes | mostly schema/routing alignment |
| dominant constraint | `arbitrate()` == locked goldSkeleton dominant | **circular** | no (binary) | yes (wrong-dominant injection fails) | yes | corpus self-consistency, not independent oracle |
| evidence sufficiency | confidence honest + assumptions marked + reason present + proof present | **structural** | yes | yes (fake-confidence injection fails) | yes | schema alignment (supervisor always emits these) |
| AI supervisor behaviour | status-ok(+over-cautious allowance) + do-not-do + safe action + honest confidence + owner/delegate | **structural** | yes | yes (missing-do-not-do / proceed-on-ugly injection fails) | yes | mostly schema alignment + safety invariants |
| dashboard usefulness | required panel fields present + ≤3 priorities | **structural** | yes | yes (stripped-fields injection < 85) | yes | schema alignment |
| business outcome usefulness | dominant + no-bad-outcome + do-not-do + proof + impact | **structural + circular** | yes | yes (bad-outcome injection fails) | yes | composite of the above |
| good/bad/ugly correctness | pass-rate of the above gates | **structural** | n/a | yes | yes | composite |

**Honest verdict:** every 100 is **mostly structural** (the supervisor, by construction, always marks
assumptions, never fakes confidence, lists proof, caps to ≤3 priorities) plus a **co-engineered dominant**.
The auditor is **not** a no-op — adversarial injection tests prove it fails wrong/unsafe/generic output — but
the real runtime passes everything because (a) the corpus answer key was co-designed with the engine and
(b) the graded properties are guaranteed by the supervisor's design. The scores do **not** demonstrate
independent business judgment beyond what the merged supervisor already guarantees.

## 6. Sample output review — 15 scenarios (one per category)

Distinct pattern + dominant per category; full supervisor output shown. Note the action status is only `need_more_data` or `blocked` across ALL in-memory replays — see §2/§5 for why (no real provider data).

### CHAOS-PC-weak_unit_economics_scale-laundry-r0  ·  laundry / weak_unit_economics_scale  ·  **GOOD**
- **messy facts:** laundry_dry_cleaning scaling ad spend before retention is proven | returns/RTO eat the margin | CAC is close to or above contribution
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** increase ad spend to grow top-line revenue
- **expected dominant:** `below_margin` · **OpsIQ actual dominant:** `below_margin`
- **OpsIQ do-not-do:** Do not accept the opportunity/contract before the cost, margin, capacity and payment-term checks pass
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['working_capital', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: adSpend=20000, adRevenue=22000, returnRatePct=18, rtoRatePct=12, grossMarginPct=30, consideredRate=18. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only accept / re-quote / decline the opportunity once the margin proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Fully-loaded cost per unit / Reassess in 30 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Below-margin work — root cause: Root cause: the economics of the opportunity/contract (cost, margin, capacity, payment terms) — not ad volume — decide whether it is worth taking. Observed: laundry_dry_cleaning scaling ad spend before retention is proven; returns/RTO eat the margin.
- **auditor verdict:** PASS · **real-world match:** rejecting "increase ad spend to grow top-line revenue…" avoids — Taking work below fully-loaded cost loses money on every unit and the loss grows with volume.

### CHAOS-PC-owner_overload-housekeeping-r0  ·  housekeeping / owner_overload  ·  **BAD**
- **messy facts:** housekeeping_cleaning owner is the bottleneck for every decision | owner works every day with no offload | nothing happens without the owner
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** owner keeps doing everything personally to 'keep quality'
- **expected dominant:** `owner_workload` · **OpsIQ actual dominant:** `owner_workload`
- **OpsIQ do-not-do:** Do not act before the constraint is measured and proof is defined
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=40000, cash=22000, staff=15000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Measured proof of the claimed problem and the expected effect / Reassess in 14 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Owner workload — root cause: Root cause: the presenting symptom is downstream of a process/economics issue that must be measured first. Observed: housekeeping_cleaning owner is the bottleneck for every decision; owner works every day with no offload.
- **auditor verdict:** PASS · **real-world match:** rejecting "owner keeps doing everything personally to 'keep q…" avoids — Keeping the owner as the bottleneck caps the business and creates a single point of failure.

### CHAOS-PC-quality_complaints-restaurant-r0  ·  restaurant / quality_complaints  ·  **BAD**
- **messy facts:** restaurant_cafe_cloudkitchen getting rising complaints and rework | reviews dropping | owner wants to spend on ads to grow
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** spend on marketing to bring in more customers
- **expected dominant:** `customer_quality` · **OpsIQ actual dominant:** `customer_quality`
- **OpsIQ do-not-do:** Do not accept the opportunity/contract before the cost, margin, capacity and payment-term checks pass
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['working_capital', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=38000, cash=16000, adSpend=8000, adRevenue=10000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only accept / re-quote / decline the opportunity once the margin proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Fully-loaded cost per unit / Reassess in 30 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Customer quality — root cause: Root cause: the economics of the opportunity/contract (cost, margin, capacity, payment terms) — not ad volume — decide whether it is worth taking. Observed: restaurant_cafe_cloudkitchen getting rising complaints and rework; reviews dropping.
- **auditor verdict:** PASS · **real-world match:** rejecting "spend on marketing to bring in more customers…" avoids — Spending on acquisition while quality/complaints are unresolved burns cash and accelerates reputation loss.

### CHAOS-PC-seasonality_planning-retail_grocery-r0  ·  retail_grocery / seasonality_planning  ·  **BAD**
- **messy facts:** a festival/seasonal spike is coming beyond current capacity | owner tempted to overbuy stock for the season | last season ended in markdowns and dead stock
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** overbuy stock and accept every seasonal order
- **expected dominant:** `capacity_feasibility` · **OpsIQ actual dominant:** `capacity_feasibility`
- **OpsIQ do-not-do:** Do not take on more volume than reliable capacity and quality can support
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: reliableKgPerDay=90, offeredKgPerDay=160, grossSalesNow=44000, cash=18000, receivables=10000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Bottleneck/throughput measurement / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Capacity / feasibility — root cause: Root cause: reliable capacity and quality — not demand — limit safe growth here. Observed: a festival/seasonal spike is coming beyond current capacity; owner tempted to overbuy stock for the season.
- **auditor verdict:** PASS · **real-world match:** rejecting "overbuy stock and accept every seasonal order…" avoids — Accepting load beyond reliable capacity breaks delivery and quality, destroying repeat demand.

### CHAOS-PC-local_market_remote-pharmacy-r0  ·  pharmacy / local_market_remote  ·  **BAD**
- **messy facts:** owner runs multiple locations remotely | local-market reality differs by branch | owner is the bottleneck for every branch decision
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** owner keeps personally approving every branch decision
- **expected dominant:** `owner_workload` · **OpsIQ actual dominant:** `owner_workload`
- **OpsIQ do-not-do:** Do not act before the constraint is measured and proof is defined
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=48000, cash=20000, staff=18000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Per-branch P&L breakdown / Reassess in 14 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Owner workload — root cause: Root cause: a portfolio average is hiding a specific failing branch. Observed: owner runs multiple locations remotely; local-market reality differs by branch.
- **auditor verdict:** PASS · **real-world match:** rejecting "owner keeps personally approving every branch deci…" avoids — Keeping the owner as the bottleneck caps the business and creates a single point of failure.

### CHAOS-PC-cashflow_squeeze-salon-r0  ·  salon / cashflow_squeeze  ·  **UGLY**
- **messy facts:** salon_spa_beauty profitable on paper but cash keeps disappearing | owner tempted to take a loan to 'buy time' | receivables lag while payables are due now
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** take a high-interest loan to cover the gap and keep spending
- **expected dominant:** `cash_survival` · **OpsIQ actual dominant:** `cash_survival`
- **OpsIQ do-not-do:** Do not spend on marketing, hiring or equipment while cash and margin are deteriorating
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: cash=8000, grossSalesNow=40000, rent=18000, staff=14000, chemicals=10000, receivables=35000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Cash and margin are deteriorating; treating revenue growth as success here would worsen the cash position. Any spend must wait for margin and quality proof. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only the cash-protection call (approve the spend block / receivables push) — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore vanity revenue/top-line targets while cash is the constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Contribution margin by line/service / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Cash survival — root cause: Root cause: cash and margin are the binding constraint, not top-line demand. Observed: salon_spa_beauty profitable on paper but cash keeps disappearing; owner tempted to take a loan to 'buy time'.
- **auditor verdict:** PASS · **real-world match:** rejecting "take a high-interest loan to cover the gap and kee…" avoids — Spending or committing while cash is short risks missed payroll, supplier default, and insolvency.

### CHAOS-PC-over_expansion-repair-r0  ·  repair / over_expansion  ·  **UGLY**
- **messy facts:** repair_maintenance_services opened a second site before the first proved repeatable | fixed cost doubled, demand did not | cash draining across both locations
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** open a third location to 'spread overhead'
- **expected dominant:** `cash_survival` · **OpsIQ actual dominant:** `cash_survival`
- **OpsIQ do-not-do:** Do not spend on marketing, hiring or equipment while cash and margin are deteriorating
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: cash=9000, grossSalesNow=55000, rent=30000, staff=24000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Cash and margin are deteriorating; treating revenue growth as success here would worsen the cash position. Any spend must wait for margin and quality proof. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only the cash-protection call (approve the spend block / receivables push) — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore vanity revenue/top-line targets while cash is the constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Per-branch P&L breakdown / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Cash survival — root cause: Root cause: cash and margin are the binding constraint, not top-line demand; a portfolio average is hiding a specific failing branch. Observed: repair_maintenance_services opened a second site before the first proved repeatable; fixed cost doubled, demand did not.
- **auditor verdict:** PASS · **real-world match:** rejecting "open a third location to 'spread overhead'…" avoids — Spending or committing while cash is short risks missed payroll, supplier default, and insolvency.

### CHAOS-PC-compliance_shutdown_risk-manufacturing-r0  ·  manufacturing / compliance_shutdown_risk  ·  **UGLY**
- **messy facts:** small_manufacturing faces a licence/compliance notice with shutdown risk | exact rule/tax position is uncertain | owner wants to proceed and 'sort it later'
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** ignore the notice and keep operating as usual
- **expected dominant:** `compliance_block` · **OpsIQ actual dominant:** `compliance_block`
- **OpsIQ do-not-do:** Do not rely on a definitive legal/tax answer without professional review
- **OpsIQ safe next step:** Pause and obtain written professional compliance/tax review before any action.
- **confidence / missing-data behaviour:** confidence=`low`, status=`blocked`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=46000, cash=14000, rent=18000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only whether to pause the grey-area action pending professional review — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Written professional compliance/tax review / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Compliance / legal block — root cause: Root cause: an unresolved licensing/tax/compliance grey area sits underneath the request. Observed: small_manufacturing faces a licence/compliance notice with shutdown risk; exact rule/tax position is uncertain.
- **auditor verdict:** PASS · **real-world match:** rejecting "ignore the notice and keep operating as usual…" avoids — Operating past a licensing/tax/regulatory boundary risks fines, forced shutdown, or personal liability.

### CHAOS-PC-fake_completion_proof-logistics-r0  ·  logistics / fake_completion_proof  ·  **UGLY**
- **messy facts:** logistics_delivery has completions marked done with no real evidence | photos/records may be reused or faked | a manager's report cannot be independently checked
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** act on the manager's report and pay the bonus
- **expected dominant:** `proof_fraud_block` · **OpsIQ actual dominant:** `proof_fraud_block`
- **OpsIQ do-not-do:** Do not act on self-reported or unverifiable numbers
- **OpsIQ safe next step:** Require independent verification of the numbers before acting; treat unverifiable proof as no proof.
- **confidence / missing-data behaviour:** confidence=`low`, status=`blocked`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=44000, cash=18000, staff=16000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Written professional compliance/tax review / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Proof / fraud block — root cause: Root cause: the reported numbers may be gamed, so the true gap is verification/trust before any action. Observed: logistics_delivery has completions marked done with no real evidence; photos/records may be reused or faked.
- **auditor verdict:** PASS · **real-world match:** rejecting "act on the manager's report and pay the bonus…" avoids — Acting on unverifiable or gamed numbers means paying for fraud and corrupting every downstream decision.

### CHAOS-PC-fake_vendor_fraud-agency-r0  ·  agency / fake_vendor_fraud  ·  **UGLY**
- **messy facts:** local_agency_professional_services has irregular payments to an unfamiliar linked vendor | one staffer both approves and pays vendors | invoices lack matching purchase orders
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** confront the staffer immediately on a hunch and keep paying
- **expected dominant:** `proof_fraud_block` · **OpsIQ actual dominant:** `proof_fraud_block`
- **OpsIQ do-not-do:** Do not act on self-reported or unverifiable numbers
- **OpsIQ safe next step:** Require independent verification of the numbers before acting; treat unverifiable proof as no proof.
- **confidence / missing-data behaviour:** confidence=`low`, status=`blocked`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=50000, cash=20000, staff=18000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Written professional compliance/tax review / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Proof / fraud block — root cause: Root cause: the reported numbers may be gamed, so the true gap is verification/trust before any action. Observed: local_agency_professional_services has irregular payments to an unfamiliar linked vendor; one staffer both approves and pays vendors.
- **auditor verdict:** PASS · **real-world match:** rejecting "confront the staffer immediately on a hunch and ke…" avoids — Acting on unverifiable or gamed numbers means paying for fraud and corrupting every downstream decision.

### CHAOS-PC-cyber_payment_fraud-ecommerce-r0  ·  ecommerce / cyber_payment_fraud  ·  **UGLY**
- **messy facts:** systems hit by ransomware/payment-fraud; data encrypted or diverted | a payment/ransom is demanded urgently | no verified, segregated backups
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** pay the ransom/urgent demand immediately to restore access
- **expected dominant:** `proof_fraud_block` · **OpsIQ actual dominant:** `proof_fraud_block`
- **OpsIQ do-not-do:** Do not act on self-reported or unverifiable numbers
- **OpsIQ safe next step:** Require independent verification of the numbers before acting; treat unverifiable proof as no proof.
- **confidence / missing-data behaviour:** confidence=`low`, status=`blocked`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=46000, cash=16000, staff=14000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Written professional compliance/tax review / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Proof / fraud block — root cause: Root cause: the reported numbers may be gamed, so the true gap is verification/trust before any action. Observed: systems hit by ransomware/payment-fraud; data encrypted or diverted; a payment/ransom is demanded urgently.
- **auditor verdict:** PASS · **real-world match:** rejecting "pay the ransom/urgent demand immediately to restor…" avoids — Acting on unverifiable or gamed numbers means paying for fraud and corrupting every downstream decision.

### CHAOS-PC-weak_unit_economics_scale-eldercare-r0  ·  eldercare / weak_unit_economics_scale  ·  **GOOD**
- **messy facts:** elderly_home_care scaling ad spend before retention is proven | returns/RTO eat the margin | CAC is close to or above contribution
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** increase ad spend to grow top-line revenue
- **expected dominant:** `below_margin` · **OpsIQ actual dominant:** `below_margin`
- **OpsIQ do-not-do:** Do not accept the opportunity/contract before the cost, margin, capacity and payment-term checks pass
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['working_capital', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: adSpend=20000, adRevenue=22000, returnRatePct=18, rtoRatePct=12, grossMarginPct=30, consideredRate=18. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only accept / re-quote / decline the opportunity once the margin proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Fully-loaded cost per unit / Reassess in 30 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Below-margin work — root cause: Root cause: the economics of the opportunity/contract (cost, margin, capacity, payment terms) — not ad volume — decide whether it is worth taking. Observed: elderly_home_care scaling ad spend before retention is proven; returns/RTO eat the margin.
- **auditor verdict:** PASS · **real-world match:** rejecting "increase ad spend to grow top-line revenue…" avoids — Taking work below fully-loaded cost loses money on every unit and the loss grows with volume.

### CHAOS-PC-owner_overload-franchise-r0  ·  franchise / owner_overload  ·  **BAD**
- **messy facts:** franchise_outlet owner is the bottleneck for every decision | owner works every day with no offload | nothing happens without the owner
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** owner keeps doing everything personally to 'keep quality'
- **expected dominant:** `owner_workload` · **OpsIQ actual dominant:** `owner_workload`
- **OpsIQ do-not-do:** Do not act before the constraint is measured and proof is defined
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'working_capital', 'sop_checklist']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=40000, cash=22000, staff=15000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Measured proof of the claimed problem and the expected effect / Reassess in 14 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Owner workload — root cause: Root cause: the presenting symptom is downstream of a process/economics issue that must be measured first. Observed: franchise_outlet owner is the bottleneck for every decision; owner works every day with no offload.
- **auditor verdict:** PASS · **real-world match:** rejecting "owner keeps doing everything personally to 'keep q…" avoids — Keeping the owner as the bottleneck caps the business and creates a single point of failure.

### CHAOS-PC-quality_complaints-multi_location-r0  ·  multi_location / quality_complaints  ·  **BAD**
- **messy facts:** multi_location_operator getting rising complaints and rework | reviews dropping | owner wants to spend on ads to grow
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** spend on marketing to bring in more customers
- **expected dominant:** `customer_quality` · **OpsIQ actual dominant:** `customer_quality`
- **OpsIQ do-not-do:** Do not accept the opportunity/contract before the cost, margin, capacity and payment-term checks pass
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['working_capital', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: grossSalesNow=38000, cash=16000, adSpend=8000, adRevenue=10000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~40% less owner time): Owner decides only accept / re-quote / decline the opportunity once the margin proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer nice-to-have optimisations; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 14 days (exception-only before then).
- **proof / reassessment:** Fully-loaded cost per unit / Reassess in 30 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Customer quality — root cause: Root cause: the economics of the opportunity/contract (cost, margin, capacity, payment terms) — not ad volume — decide whether it is worth taking. Observed: multi_location_operator getting rising complaints and rework; reviews dropping.
- **auditor verdict:** PASS · **real-world match:** rejecting "spend on marketing to bring in more customers…" avoids — Spending on acquisition while quality/complaints are unresolved burns cash and accelerates reputation loss.

### CHAOS-PC-seasonality_planning-b2b_contractor-r0  ·  b2b_contractor / seasonality_planning  ·  **BAD**
- **messy facts:** a festival/seasonal spike is coming beyond current capacity | owner tempted to overbuy stock for the season | last season ended in markdowns and dead stock
- **missing data:** real provider-backed financial records, verified proof of completion, current compliance status
- **wrong tempting action:** overbuy stock and accept every seasonal order
- **expected dominant:** `capacity_feasibility` · **OpsIQ actual dominant:** `capacity_feasibility`
- **OpsIQ do-not-do:** Do not take on more volume than reliable capacity and quality can support
- **OpsIQ safe next step:** Enter the missing critical data before acting.
- **confidence / missing-data behaviour:** confidence=`low`, status=`need_more_data`, missing=['margin_pricing', 'sop_checklist', 'staff_training']
- **profit/cash/workload impact:** Profit / margin: Figures observed: reliableKgPerDay=90, offeredKgPerDay=160, grossSalesNow=44000, cash=18000, receivables=10000. Decision must improve contribution margin and cash, not just revenue. ; Cash: Confirm the action improves contribution margin and does not extend the cash-conversion cycle. ; Owner workload: Offload from the owner (~60% less owner time): Owner decides only approve the single next action once the proof is in — one decision, not the execution. OpsIQ prepares 3 items and monitors the proof; a named supervisor executes and provides proof (proof burden is on staff/process, not the owner). Batch routine approvals; defer all discretionary spend/marketing/expansion until the constraint clears; ignore non-binding metrics that do not move the dominant constraint for now. Standing rule: Pre-approve routine, in-band actions under a standing rule; the owner is asked only when a threshold breaks (approval memory suppresses repeat asks). Escalate to the owner ONLY if cash, margin, complaint/rework or capacity move outside the acceptable band — otherwise no owner action. Next owner touchpoint in 7 days (exception-only before then).
- **proof / reassessment:** Bottleneck/throughput measurement / Reassess in 7 days: cash balance, contribution margin, complaint/rework rate, capacity load, and whether the blocked action is still being pushed — escalate the review cadence if any worsens.
- **dashboard summary (main issue):** Capacity / feasibility — root cause: Root cause: reliable capacity and quality — not demand — limit safe growth here. Observed: a festival/seasonal spike is coming beyond current capacity; owner tempted to overbuy stock for the season.
- **auditor verdict:** PASS · **real-world match:** rejecting "overbuy stock and accept every seasonal order…" avoids — Accepting load beyond reliable capacity breaks delivery and quality, destroying repeat demand.

## 7. DB and browser representativeness audit
1. **Scenarios that ran DB-backed:** **0 of the 165 chaos scenarios.** The DB suite
   (`chaos-db-isolation.db.test.ts`) seeds 4 **owner-scenario-profile** businesses (cash_crisis,
   vendor_compliance, owner_overload, growth_scale) — it proves the real DB runtime + supervisor + workspace/
   business isolation on those **representative dominant constraints**, but it does **not** run the chaos
   corpus PublicCases through the DB.
2. **Scenarios rendered in jsdom dashboard:** **8** (weak_unit_economics_scale/laundry, owner_overload/agency,
   quality_complaints/restaurant, cashflow_squeeze/retail_grocery, compliance_shutdown_risk/pharmacy,
   cyber_payment_fraud/ecommerce, fake_completion_proof/logistics, over_expansion/multi_location).
3. **Mobile-bounded (jsdom):** the same **8** (responsive-grid / no-fixed-wide-width assertions).
4. **Full Playwright locally:** **0** chaos scenarios.
5. **Will PR CI run full Playwright 13–18?** Yes — the `owner-pilot-e2e` lane runs on PRs to main.
6. **Do specs 13–18 cover chaos replay scenarios?** **No.** They render the owner-pilot fixtures
   (`PILOT_LAUNDRY_BIZ` etc.) and the supervisor panel for those — **not** the chaos corpus scenarios. So PR
   CI green on 13–18 proves the owner-pilot surface is intact, **not** that chaos scenarios render in a browser.
7. **Is a new chaos Playwright spec needed?** **Yes** — to make a genuine browser claim about chaos scenarios,
   a minimal Playwright spec should seed ≥1–3 chaos cases (DB-backed) and assert the SupervisorSummary panel
   renders the runtime-fed blocked/need-more-data disposition. Recommended **before** asserting browser proof
   of chaos replay.

## 8. Final audit classification
**`CHAOS_REPLAY_RUNTIME_REPLAY_PROVEN`**

Rationale (strongest honestly supported rung):
- ✅ Scenario pack validated (165 sourced, schema-valid, privacy-clean, chaos-bearing) → ≥ `SCENARIO_PACK_VALIDATED`.
- ✅ **165 ran through the real `arbitrate()` + `runOwnerAdvice` runtime + supervisor** → `RUNTIME_REPLAY_PROVEN`.
- ❌ **Not** `DB_REPRESENTATIVE_PROVEN` for chaos scenarios: 0 chaos cases ran DB-backed (only 4 non-chaos
  profile businesses).
- ❌ **Not** `BROWSER_REPRESENTATIVE_PROVEN`: jsdom ≠ real browser; 0 chaos scenarios in Playwright; specs
  13–18 don't render chaos scenarios.
- ❌ **Not** `FULL_E2E_PROVEN`: no chaos scenario ran through full Playwright.

## Is the original `REAL_WORLD_CHAOS_REPLAY_READY` claim justified?
**Partly justified — and overstated on browser/DB-of-chaos and on the "independent 100 scores" framing.**
Solid: 165 distinct real cases through the real runtime; safety invariants hold (0 unsafe / fake-confidence /
bad-outcome); strong adversarial auditor. Overstated: (a) browser proof is jsdom-only and covers 0 chaos
scenarios in a real browser; (b) DB proof covers representative profiles, not the chaos cases; (c) the
in-memory replay only exercises `need_more_data`/`blocked` (no real-data proceed path); (d) scores are
structural + the dominant is co-engineered (MEDIUM circularity); (e) only 11 unique public sources back all 165.

## Recommended additions before a "full readiness" PR
1. **Minimal chaos Playwright spec** — seed ≥3 chaos cases DB-backed; assert the panel renders the
   runtime-fed blocked/need-more-data disposition (desktop + mobile).
2. **DB-backed chaos run** — push ≥1 chaos PublicCase per dominant into the DB and run
   `getOwnerWholeBusinessPlan` so the real-data `proceed`/`owner_decision` path is exercised on chaos cases.
3. **Independent gold cases** — author a handful of expected outcomes without reference to `arbitrate()`
   output to drop circularity MEDIUM → LOW.
4. **Broaden sources** — raise the 11 unique public sources toward the breadth the "75+ real-world" claim implies.

---

# PROOF-ADDITION UPDATE (after DB-backed + full Playwright + independent gold)

Read-only re-audit after the proof additions (test/fixture/spec only; no production change).

## Updated exact counts
1. **counted scenarios:** **180** (165 chaos-corpus + 15 independent gold).
2. **unique sources:** **26** (11 chaos-pattern sources + 15 new independent-gold sources).
3. **scenarios through `arbitrate()`:** **180**.
4. **scenarios through owner runtime (`runOwnerAdvice`):** **180**.
5. **scenarios through DB-backed `getOwnerWholeBusinessPlan`:** **10** (chaos themes, real scoped rows) +
   the 4 chaos-isolation profiles — representative, not all 165.
6. **scenarios through jsdom dashboard:** **8**.
7. **scenarios through full Playwright desktop (real browser):** **6** (spec 19 — ran locally, 11 passed).
8. **scenarios through full Playwright mobile (real browser):** **3** (spec 19).
9. **independent gold cases:** **15** (hand-authored expectations; engine independently agreed on all 15).
10. **circularity risk:** **LOW for the 15 independent gold** (hand-authored, no engine hint, engine agreed);
    **MEDIUM for the 165 derived corpus** (goldSkeleton co-engineered) — reported honestly, not averaged away.
11. **action-status distribution (honest):** real-data DB path → `blocked` (4) + `owner_decision_required`
    (6); in-memory chaos → `need_more_data` (105) + `blocked` (60). **`proceed` / `cautious_proceed` = 0** —
    the supervisor is conservative by design: any binding constraint routes to an owner decision or a block,
    so the full proceed spectrum is **not** reachable for binding-constraint chaos data (a safety property,
    not a faked gap).
12. **Playwright covers chaos scenarios:** **YES** — `tests/browser/19-chaos-replay.spec.ts` renders 6 chaos
    scenarios desktop + 3 mobile in a real browser and is wired into the `owner-pilot-e2e` CI lane.
13. **DB covers chaos scenarios:** **YES** — 10 chaos themes through the real DB-backed owner plan path.
14. **Classification ceiling:** **`CHAOS_REPLAY_DB_BROWSER_REPRESENTATIVE_PROVEN`** — DB-of-chaos and
    real-browser chaos proven on representative scenarios + circularity reduced to LOW on 15 independent
    cases + source breadth met (26). **Not** `REAL_WORLD_CHAOS_REPLAY_READY`, because the conservative
    supervisor does not emit `proceed`/`cautious_proceed` for binding-constraint chaos data, so the full
    action-status spectrum that gate requires is not honestly demonstrable without changing production logic.

## What remains representative vs exhaustive
- DB-backed and real-browser proofs are **representative** (10 DB themes, 6+3 Playwright scenarios), not all
  180 counted scenarios. The 165 corpus replays remain runtime-level (in-memory) proven.
- `proceed`/`cautious_proceed` dispositions are not produced by realistic chaos data and are reported as a
  conservative-design property, not claimed.
