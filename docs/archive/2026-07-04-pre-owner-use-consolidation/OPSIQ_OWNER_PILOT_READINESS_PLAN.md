# OpsIQ Owner Pilot Readiness — Implementation Plan

Branch: `claude/opsiq-owner-pilot-readiness-isow0m`
Base HEAD: `7983edf` (PR #58 merge — `OpsIQ Real-World Case Training + Max Reliability Expert Hardening`)
Classification target: `OWNER_PILOT_READY` (only if every gate proven).

This plan is written **before** any code change, per the phase contract.

---

## 1. Current repo status (post-merge verification)

| Check | Result |
|---|---|
| Current branch | `claude/opsiq-owner-pilot-readiness-isow0m` ✅ |
| main HEAD | `7983edf` ✅ |
| PR #58 merge commit present | yes — `7983edf OpsIQ Real-World Case Training + Max Reliability Expert Hardening (#58)` ✅ |
| Working tree clean | yes (before plan) ✅ |
| `prisma validate` | valid 🚀 ✅ |
| `tsc --noEmit` | 0 errors ✅ |
| eslint ratchet | PASS (2155 baseline errors unchanged, 0 changed-file errors) ✅ |
| max-reliability gate (`behavioral-validation/max-reliability/*` + `expert/ratchet`) | 142 tests PASS ✅ |
| business-scope isolation (non-DB) | 52 tests PASS ✅ |
| owner-mode **DB** tests | **NOT RUNNABLE here** — Postgres port 5432 to the Neon host times out (egress is HTTPS-only). Harness skips `[db]`/`runtime-proof`/`phase-*` unless `TEST_WITH_DB=true`. Honest limitation, will be stated in the report. |
| browser/Playwright flows | Chromium present, but the dev server needs the DB → not runnable here. Mobile/dashboard proven via jsdom component + responsive-class tests instead; stated honestly. |

Environment note: `node_modules` was absent on clone; `npm ci --ignore-scripts` then a manual `schema-engine` download (proxy interferes with prisma's streamed gzip) + `prisma generate` were required to get a green toolchain. No source changed for this.

## 2. Current dashboard structure

Two distinct dashboards exist:

1. **Consulting engagement dashboard** — `src/app/(authenticated)/dashboard/page.tsx` + `src/ui/owner-dashboard.tsx` (1153 lines), fed by `getOwnerDashboard(engagementId)` (`src/services/owner-dashboard.service.ts`). Engagement-scoped (findings/recommendations/actions/drift/execution-certainty). **Not** the owner-business command center.
2. **Owner business command center** — `src/app/(authenticated)/owner/page.tsx` (client), fed by:
   - `GET /api/owner/command-center` → `getBusinessCondition()` (`src/services/owner-condition/business-condition.service.ts`): profile, `missingInputsWithPriority`, `recommendedNextAction`, `dataConfidenceScore`, reassessment cadence.
   - `GET /api/owner/control-center` → `getOwnerControlCenter()` (safety / what-not-to-do / attention).
   - `GET /api/owner/whole-business-plan` → `getOwnerWholeBusinessPlan()` (`src/services/owner-mode/owner-whole-business-plan.service.ts`): **runtime-fed** `runOwnerAdvice` output — top priority/constraint, next best action, do-not-do, owner workload/offload, proof required, reassessment triggers, growth gate, arbitration, red domains, learning, plan 7/30/90, `data.overallConfidence`, `dataSourceMissing`. Rich `data-testid` coverage already (`owner-whole-business-plan`, `wbp-*`).
   - `GET /api/owner/businesses`.

The command center is already heavily runtime-fed and gate-respecting. **It is information-dense, not a 3–5-card command center**, and it lacks an explicit Owner-Pilot-Readiness surface and a dynamic owner-facing input-guidance surface — those are the real gaps.

## 3. Current onboarding flow

- `src/app/onboarding/page.tsx` — workspace + team-invite (3 steps), terminal CTA → `/owner/intake`.
- `src/app/dashboard/onboarding/page.tsx` — workspace → decision → evaluate → dashboard (governance demo).
- No **owner-business** onboarding (business type/role → minimum data → missing-data → confidence-before-diagnosis → first action). Business creation happens implicitly inside the finance/recovery domains.

## 4. Current owner data input capabilities

- Confidence/ingestion engine: `src/services/owner-mode/owner-domain-ingestion.ts` (`ingestBusinessState`, `INGESTION_DOMAINS`, `CRITICAL_INGESTION_DOMAINS`, `DomainState`, `overallConfidence`).
- DB providers: `src/services/owner-mode/owner-db-providers.ts` (`prefetchOwnerDomainRows`, `buildProvidersFromRows`) — workspace+business scoped reads of `OwnerCashflowSnapshot`, `OwnerFinancialSnapshot`, `OwnerWorkingCapitalItem`, `OwnerCapacitySnapshot`, `OwnerComplianceItem`, `Proof`, `OwnerWorkloadSnapshot`, `OwnerStandingInstruction`, `OwnerBusiness`, `BehavioralLearningArtifact`.
- Input quality: `src/domain/owner-mode/input-quality.ts` (`assessInputQuality`, field registry, `CRITICAL_FIELDS`).
- Intake/import paths: `src/services/owner-intake/intake.service.ts` (`createDataIntake`/`confirmDataIntake` → `OwnerDataIntake`), `src/services/file-intake/persist-file-intake.service.ts`, `src/services/data-review/fact-review.service.ts`.

## 5. Current upload / manual-entry / provider gaps

- **Provider/DB path**: present and proven (owner-db-providers + ingestion).
- **Structured import path**: present (intake + file-intake services) but no single shared, unit-testable **record parser/classifier seam** that both manual and import paths reuse.
- **Manual-entry path**: domain pieces exist but there is no single owner-facing manual-entry service that (validate scope → reject malformed → classify category → update confidence state) end-to-end with isolation tests runnable without a live DB.
- **Upload**: full file upload UI is out of scope; an upload-ready parser seam + honest UI placeholder is the correct deliverable.

## 6. Current confidence / missing-data behavior

- `overallConfidence` is derived (none/low/medium/high) from critical-domain realness + freshness + missing count — cannot be faked high with weak data (a critical domain on `DATA_SOURCE_MISSING` forces `low`).
- `missingInputsWithPriority` + `MISSING_INPUT_REASON` give a partial owner-facing reason map.
- Gap: no **dynamic owner-facing guidance** that ties each input to (decision affected, confidence domain, expected confidence gain, recommendation-at-risk, can-proceed-now, owner effort, privacy) and ranks next-best-input by business type + missing data + severity + effort.

## 7. Current action assignment / proof / reassessment behavior

- Proof model + lifecycle: `Proof.status` (REQUIRED/…), owner task completion gate (`/api/owner/tasks/complete` → `owner-action-gate.service.ts`), `wbp.proofRequired`.
- Reassessment: `src/domain/owner-mode/reassessment.ts` (triggers, transitions, human-review map) + `wbp.reassessmentTriggers` + cadence in business-condition service.
- Gap: no single **action-assignment** model that, per recommended action, resolves responsible party (owner/manager/staff/vendor/customer/opsiq), due, proof type, acceptance criteria, reassessment metric, escalation trigger, approval-required, delegatable — and a proof-status lifecycle helper enforcing "rejected keeps incomplete / overdue escalates / no completion without proof / reassessment-pending after accept".

## 8. Dashboard usability gaps

- Information wall, not a 3–5-priority command center.
- No Owner-Pilot-Readiness card; no dynamic Improve-Accuracy / next-best-input card; no compact owner/delegate split summary at the top.

## 9. Mobile usability gaps

- Tap targets exist in places (`min-h-[44px]`), but no readiness/onboarding/guidance surfaces are proven on mobile; no responsive-class assertions for the new surfaces.

## 10. Pilot rehearsal plan

Five packs (laundry/dry-cleaning, housekeeping/cleaning, remote-owner staff-managed service, B2B contract-heavy local service, multi-location/branch). Each is a deterministic fixture of `ScenarioKnobs`-style inputs driving the **production** pure runtime (`ingestBusinessState` → `runOwnerAdvice` fixture providers → input-guidance → readiness), asserting: minimum onboarding completes, missing-data guidance appears, before→after confidence behaves correctly, diagnosis is cautious on weak data, proof + reassessment present, owner workload reduced, no generic/overconfident output, mobile-usable shapes. Reuses the existing `owner-scenario-profiles.ts` one-source-of-truth knob pattern.

## 11. Risk of weakening max-reliability gates

- Risk: new confidence/readiness logic could let weak data read as high confidence. Mitigation: readiness/guidance **consume** the existing `ingestBusinessState`/`assessInputQuality` outputs; they never recompute confidence upward. Tests assert irrelevant data does not raise confidence and critical-missing forces low.
- Risk: touching the ratchet/scorer. Mitigation: **no** edits to `behavioral-validation/**`, scorers, ratchet, or baselines. Re-run all max-reliability suites after each slice.
- Risk: UI business logic. Mitigation: all logic in `domain/`+`services/`; components presentational; routes use `withCanonicalEnforcement` + capabilities.

## 12. Tests required (runnable in THIS environment — pure/DI, no live DB/browser)

- Onboarding domain: min onboarding completes; missing-required guidance; business-type changes requested inputs; remote-owner changes proof/delegation; multi-location isolation; no fake high confidence; mobile shape.
- Input-guidance domain: dynamic guidance present; next-best-input changes by type + by missing; paired before/after confidence; warning clears only on correct data; irrelevant data does not inflate; limited-first-diagnosis on min data; cautious on weak data.
- Input paths: manual-entry updates confidence; parser path updates confidence; provider path updates confidence; malformed rejected; cross-business rejected/isolated; cross-workspace rejected; affects runtime recommendation; status reflected (via mock-db DI).
- Action/proof: responsible party; owner/delegate split; OpsIQ-prepared; proof required; status transitions; rejected keeps incomplete; overdue escalates; reassessment-pending after accept; no fake completion.
- Readiness score: appears; decreases on missing critical; increases on correct data; flat on irrelevant; blocks `OWNER_PILOT_READY` when low; mobile shape.
- Pilot packs: all 5 run through the runtime; guidance appears; before/after confidence correct; no generic/unsafe/overconfident; proof+reassessment present; owner workload reduced.
- Dashboard/onboarding components: jsdom render of runtime-fed sections; **fails if a static fallback replaces runtime data**; readiness + guidance + onboarding render; touch-target + responsive-class assertions for mobile.

DB-backed and Playwright suites are **stated as not run here** (egress blocks Postgres + dev server) — never claimed as passed.

## 13. Implementation slices and commit boundaries

1. **S0** — post-merge verification + this plan (no code). _commit._
2. **S1 — Onboarding**: `domain/owner-mode/owner-onboarding.ts` + `services/owner-mode/owner-onboarding.service.ts` (DI) + `api/owner/onboarding` route + `(authenticated)/owner/onboarding` page + tests. _commit._
3. **S2 — Input guidance**: `domain/owner-mode/input-guidance.ts` + `api/owner/readiness` (guidance+readiness) + command-center "Improve accuracy / next best input" card + tests. _commit._
4. **S3 — Input paths**: `domain/owner-mode/input-record-parser.ts` (shared seam) + `services/owner-mode/owner-manual-entry.service.ts` (DI) + tests (isolation/malformed/confidence). _commit._
5. **S4 — Readiness score**: `domain/owner-mode/readiness-score.ts` + surface in `/api/owner/readiness` + command-center + onboarding card + tests. _commit._
6. **S5 — Action/proof UX**: `domain/owner-mode/action-assignment.ts` + proof-status lifecycle helper + command-center/onboarding surfacing + tests. _commit._
7. **S6 — Pilot rehearsal packs**: `domain/owner-mode/pilot-rehearsal-packs.ts` + runner + tests (5 packs through runtime). _commit._
8. **S7 — Dashboard polish + mobile**: top 3–5 priority ordering, owner/delegate split, empty/loading/error states, mobile component tests; no static fallback. _commit._
9. **S8 — No-regression + reports**: re-run all gates; write `OPSIQ_OWNER_PILOT_READINESS_REPORT.md`; final classification. _commit._

Each slice: implement → `tsc` → eslint changed files → run that slice's tests → re-run max-reliability gate → commit. No slice weakens a gate; no TODO/stub/fake.
