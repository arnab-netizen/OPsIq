# OpsIQ Extensive Real-World Case Training — Plan

Branch: `claude/opsiq-real-world-case-training` (from `main` `57f4ea69`).
Base classification: `READY_FOR_REAL_WORLD_CASE_TRAINING`.
Existing corpus to extend: `EXPANDED_CASES` = 310, `COLLECTIVE_CASES` = 120, 36-domain matrix,
production runner + scorer + learning store + DB providers + command-center whole-business card.

## Honesty framing (read first)
The `EXPERT_READY` bar (≥1,500 genuinely-distinct, gold-answered, source-backed cases across 60 domains
all ≥90 through the production runtime + 10 new browser flows + ~35 new test suites) is a large body of
work. It is built here in **small committed slices**, sourcing **real** public patterns (no fabricated
URLs, no shallow duplicates — both are rejected by this plan's own tests). Classification is reported at
the rung **actually proven**, with command/log evidence, using the prompt's ladder. No gate, scorer, or
readiness threshold is weakened to pass.

## 1. Source acquisition strategy
Use `WebSearch`/`WebFetch` (available via the agent proxy) to gather **public** SMB case material:
failure post-mortems, turnaround stories, SBA/SCORE/government guidance, public review/complaint
*patterns*. Extract only the **business pattern** (numbers, constraint, root cause, correct action) —
never copy long text or personal identifiers. Each real-source case stores source metadata + the facts
used/inferred/varied. Fallback when a category is thin: derive synthetic variants from an already-sourced
pattern (linked by lineage), never inventing a fake source.

## 2. Source categories
Public case studies; failure post-mortems; turnaround stories; franchise/restaurant/retail/service
examples; business-advice forum/Reddit-style posts (anonymized); review/complaint patterns (anonymized);
SBA/SCORE/SME government guidance; local-news business stories; accounting/finance examples;
cyber/business-continuity incidents; staffing/operations examples; regulatory/court summaries (cautious);
business blogs with concrete numbers.

## 3. Public-source privacy rules
NEVER store: personal names, phones, emails, exact street addresses, social usernames, staff/customer
identifiers, or long copied source text. Store only: source id/type/title/url/dates/geography/category/
reliability/completeness + facts used/inferred/varied + anonymization status + privacy-risk rating.
Enforced by tests (no-PII regex, max-quote-length, source-id presence, lineage presence).

## 4. Target business categories (36)
laundry/dry-clean, housekeeping/cleaning, restaurant/cafe/cloud-kitchen, retail/grocery,
pharmacy/health-retail, salon/spa/beauty, gym/fitness, clinic/healthcare-service, elderly/home-care,
childcare/daycare/education, coaching/tutoring, repair/maintenance, pest-control,
HVAC/plumbing/electrical, printing/packaging, small-manufacturing, logistics/delivery, e-commerce/D2C,
local-agency/professional-services, software/IT-agency, micro-SaaS, construction/contracting,
hotel/guesthouse, franchise-outlet, rural/agri/dairy/poultry, car-wash/detailing, event/catering,
import/export/wholesale, warehouse/cold-storage, multi-location-operator, home-renovation/interiors,
travel/tour-operator, subscription/membership, B2B-service-contractor, auto-service/repair-parts,
local-distributor/stockist. Each must carry the 15 required scenario angles (best-case → shutdown/pivot).

## 5. Required business domains (60)
The 60 domains in §6 of the prompt (strategy … exit/sale-readiness), mapped onto the existing 36-domain
`DomainId` matrix plus new domain tags where the existing matrix lacks a 1:1 (e.g. cyber/business-
continuity, insurance/claim, seasonality, succession/key-person, loan/EMI affordability, exit-readiness).
A case counts for a domain only when that domain materially changes the correct decision (materiality test).

## 6. Case counts (targets)
≥1,500 total; ≥400 real-source-derived; ≥800 synthetic variants (lineage-linked); ≥300 adversarial/
extreme; ≥250 multi-turn; ≥250 collective cross-domain; ≥150 browser-representative candidates; ≥150
holdout; ≥150 regression. Per-category ≥20 (+≥5 collective, ≥3 adversarial, ≥1 shutdown/pivot).
Per-domain ≥20; per-critical-domain ≥40 (+≥10 adversarial, ≥10 holdout, ≥5 multi-turn, ≥5 prod-runtime).

## 7. Case schema
Extend `BehavioralCase` via a `PublicCase` wrapper (`src/behavioral-validation/public-cases/schema.ts`)
adding: realFlag (real|synthetic|variant), sourceRef|lineage, businessStage, the per-domain fact blocks
(finance/cash/margin/working-capital/staff/equipment/customer/marketing/vendor/delivery/compliance/proof/
owner-workload/continuity), dominantConstraint, crossDomainConflicts, businessMath, stopLossCondition,
7/30/90 path, goldAnswer|goldSkeleton, scoringLabels, learningExpected, regressionTrigger, privacyNote,
productionRuntimeEligible, browserRepresentative, holdoutProtected. Zod-validated; no expert-validation
entry without a gold answer/skeleton.

## 8. Source metadata schema
`SourceRecord` (`source-register.ts`): id, type, title, url|citation, publishedDate?, accessedDate,
geography, category, reliability(low|medium|high), completeness(low|medium|high), factsUsed[],
factsInferred[], factsSyntheticallyVaried[], anonymizationStatus, privacyRisk(low|medium|high). Register
file: `OPSIQ_PUBLIC_CASE_SOURCE_REGISTER.md` (metadata only).

## 9. Anonymization rules
Strip/forbid PII (regex gates), replace any entity with category-level descriptors ("a Kolkata laundry"),
cap any verbatim quote at a short snippet length, mark anonymizationStatus per source. Tested.

## 10. Synthetic-variant rules
A variant must materially change ≥3 of: category, location, stage, cash, margin, capacity, staff/process,
customer/reputation, vendor/delivery, compliance, owner-goal, dominant-constraint, tempting-action,
correct-action. Enforced by a material-change diff test vs its lineage parent.

## 11. Anti-duplicate rules
Shallow-duplicate detector: cases sharing the same (category, dominantConstraint, rounded-numbers
signature, correctAction signature) are flagged; corpus must have 0 shallow duplicates.

## 12. Gold-answer rules
Each expert-validation case carries a `goldSkeleton` (required anchors: rootCause, dominantConstraint,
whatNotToDo, nextBestAction, proofRequired, reassessment, stopLoss where risk) scored by the existing
expert scorer; generic/numerically-wrong/disconnected/wrong-top-priority answers must fail.

## 13. Scoring plan
Score through the **existing** scorer + `production-runner` modes (smoke/core/holdout/adversarial/
regression/collective/domain-competency) extended to include the public corpus. Per-domain, per-critical-
domain, per-category, per-severity, per-location, per-stage, collective, production-runtime, learning-
improvement. No averaging away weak segments — weak segment blocks readiness (tested).

## 14. Production-runtime execution plan
Representative cases execute through `runOwnerAdvice` / `owner-whole-business-plan.service` (and, for
DB-backed representatives, `buildOwnerDomainProviders` + seeded postgres). Harness-only scores cannot
qualify final readiness (tested).

## 15. Learning persistence plan
Failed/weak cases → `learnFromFailure` artifacts (scope-limited, workspace-private, versioned, audit
trail, approval-gated promotion) + domain/whole-business playbook updates + do-not-repeat rules +
regression cases; prove artifact changes future output and no cross-segment regression/leakage.

## 16. Validation split plan
training | validation | holdout | adversarial | regression | production-runtime | browser-representative.
Holdout + its variants excluded from learning before holdout scoring (leakage tests). Regression provenance
preserved.

## 17. Browser/E2E representative plan
≥10 representative flows (cash crisis, bad contract, marketing-blocked, owner-overload, proof/fake-
completion, vendor, delivery, growth/scale, shutdown/pivot, multi-location/remote) proven through the
command-center whole-business card via Playwright against seeded postgres:16; ≥3 mobile smoke.

## 18. Final readiness gates
Exactly the §17 EXPERT_READY gates. Reported honestly; intermediate rungs (SOURCE_REGISTER_READY,
CASE_LIBRARY_READY, DOMAIN_TRAINING_PARTIAL, COLLECTIVE_TRAINING_PARTIAL,
PRODUCTION_RUNTIME_TRAINING_READY, BROWSER_REPRESENTATIVE_TRAINING_READY,
EXTENSIVE_REAL_WORLD_CASE_TRAINING_CORE_READY) used when a higher gate is not yet proven.

## 19. Slice plan with commits
- **S1 Source register infra**: `source-register.ts` (Zod) + privacy/anonymization/no-PII/no-long-text
  tests + seeded real `OPSIQ_PUBLIC_CASE_SOURCE_REGISTER.md` from web-sourced public patterns. Commit.
- **S2 Public-case schema + real-source corpus**: `public-cases/schema.ts` + an initial real-source-derived
  case set (lineage to S1 sources) + schema/gold-answer/source-id tests. Commit.
- **S3 Variant generator + anti-duplicate + coverage**: material-change variant builder + shallow-dup
  detector + category/domain coverage analyzer + tests. Commit (grow corpus toward targets).
- **S4 Scoring + production-runtime integration**: extend production-runner with the public corpus; per-
  segment scoring + weak-segment-blocks-readiness tests. Commit.
- **S5 Learning + regression**: failure→artifact→improvement loop + regression cases + leakage tests. Commit.
- **S6 Browser representative E2E**: representative flows spec + seed + run. Commit.
- **S7 Reports + honest classification**: `OPSIQ_EXTENSIVE_REAL_WORLD_CASE_TRAINING_REPORT.md` + register
  finalization. Commit + push.

Each slice: write tests, run `tsc` + targeted vitest (+ `[db]`/Playwright where the slice needs them),
commit only after green. Counts/scores reported are measured, never asserted.
