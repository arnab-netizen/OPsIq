# OpsIQ — Maximum Reliability Completion Plan

Branch: `claude/opsiq-real-world-case-training` · Base HEAD: `16af5c7` · Current rung: `COLLECTIVE_ASSURANCE_READY`.
Plan before code. All modules live under `src/behavioral-validation/max-reliability/`, reuse the existing
validated engines (scorer, business-math, collective scorer, learning store, source register), and add NO
weakening. Each slice = one commit after its tests pass.

## Reusable building blocks (already present)
- `scorer.ts` — `detectUnsafe` (20 rules), `scoreAdvice`, `PASS_THRESHOLD` (locked).
- `expert/business-math.ts` — margin/runway/break-even/payback/ROAS/contract-after-terms/EMI/working-capital.
- `whole-business/collective-scorer.ts` — `COLLECTIVE_WEIGHTS` (locked), fail conditions.
- `learning-store.ts` — artifact schema, `promotable`, supersede/revert, audit trail.
- `public-cases/source-register.ts` — `SourceRecord`, `PII_PATTERNS`, `MAX_QUOTE_CHARS`, ID regex.
- `AdviceOutput` — `riskAnalysis`, `ownerWorkloadPlan` (structured), `ownerApprovalNeeded`,
  `professionalReview`, `calculationTrace`, `blockedActions`, `proofRequired`, `reassessmentTrigger`.

## Slices (each committed)
1. **FMEA assurance** (`fmea.ts` + `fmea.test.ts`): `HIGH_IMPACT_ACTIONS`, `isHighImpact`, `assessFmea`
   (failure mode/cause/severity/likelihood/detectability/RPN/mitigation/proof/stop/reassessment/owner-
   approval/professional-review), `requireFmea(action, advice)` gate. Tests: high-impact w/o FMEA fails;
   high-severity+low-detectability escalates/blocks; missing stop fails; owner override needs audit+risk;
   FMEA flips decision when RPN high; professional-review boundary appears.
2. **Evidence-to-claim trace** (`evidence-trace.ts` + test): `buildEvidenceTrace(advice, ctx)`,
   `validateEvidenceTrace`. Tests: no trace fails; financial claim w/o calc fails; learning claim w/o
   provenance fails; high-confidence+weak-evidence fails; stale/conflicting lowers confidence.
3. **Business-math assurance gate** (`business-math-gate.ts` + test): `assertBusinessMath(decision)` wrapping
   the validators. Tests: numerically wrong fails; missing calc fails; high-rev/low-profit fails; ROAS+/net-
   fails; B2B bad terms fails; asset w/o payback fails; expansion w/o runway fails; hiring w/o utilization/
   cash fails; calc trace matches recommendation.
4. **Expanded red-team** (`red-team.test.ts`): 25 attack types over the real engines (detectUnsafe, learning
   isolation, source validation, business-scope). Tests: unsafe stays 0; poisoned source can't alter rules;
   approval-memory can't bypass high-risk; learning poisoning quarantined; fake proof can't complete; cross-
   business/workspace blocked; hallucinated source fails; report-only can't satisfy runtime/browser gate.
5. **Source-quality** (`source-quality.ts` + test): `scoreSource(rec)` → reliability/completeness/PII/
   poisoning/promotion-eligibility; `validateSourceRef(id)`. Tests: hallucinated ID fails; low-reliability
   can't globally promote; inferred/synthetic without flag/lineage fails; PII fails; long copied text fails.
6. **Contradiction + owner-burden** (`contradiction.ts` + test): `detectContradictions(advice)`,
   `assessOwnerBurden(plan)`. Tests: each of the 8 contradictions fails; owner-overloaded fails; missing
   ignore/defer fails; too many owner tasks fails; valid output passes (no false positives).
7. **Learning-governance re-proof** (`learning-governance.test.ts`): dedicated tests over the store —
   one-weak-source can't globalise; revoked ignored; stale lowers confidence; conflicting → adjudication;
   influence cited; rollback changes output; no private/source leak; artifact can't override safety gate.
8. **Persisted adjudication queue** (`adjudication-queue.ts` + test): in-memory + JSON-persistable queue;
   `enqueueIfNeeded(signals)`, item schema (caseId/source/domain/output/gold/failureLabels/assuranceFailures/
   proposedCorrection/proposedArtifact/risk/status/audit), `resolve`, `unresolvedHighRisk`. Tests: low-conf
   high-impact enqueues; conflicting artifacts enqueue; rejected correction unused; approved affects output;
   unresolved high-risk blocks MAX_READY; queue report.
9. **Fresh browser/mobile re-run**: rebuild + seed + Playwright `13`+`14` (≥10 desktop + ≥5 mobile, 17 total).
10. **Final ratchet + reports + classification**: extend `evaluateRatchet` coverage flags (evidence/FMEA/
    math/source/contradiction); run full validation; update `OPSIQ_MAX_RELIABILITY_HARDENING_REPORT.md` +
    cross-link; classify.

## Classification target
`MAX_RELIABILITY_CORE_READY` if every slice's tests pass + the existing green metrics hold + browser re-run
green + ratchet passes. **EXPERT** is gated by "no near-threshold domain remains" — 10 non-critical domains
sit at 90–94.1 (<95); raising them ≥95 is out of this prompt's scope, so EXPERT is NOT targeted here and the
honest ceiling this pass is CORE_READY. No gate weakened; no average hides a weak segment.
