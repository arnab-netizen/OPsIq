# Owner Mode Adversarial Validation Report

**Date:** 2026-06-19
**Scope:** 25 adversarial simulations against OpsIQ Owner Mode safety gates
**Method:** Static analysis tracing actual TypeScript domain logic. No DB available. Every gate traced to its source file and rule.
**Hard rule:** Code, benchmarks, answer keys, scoring, and safety gates were NOT modified.

---

## Gate Reference Map

| Gate | File | Rule IDs |
|------|------|---------|
| Input quality | `src/domain/owner-mode/input-quality.ts` | hasCriticalMissing, hasConflicts |
| Evidence verification | `src/domain/owner-mode/evidence-verification.ts` | — |
| Contradiction detection | `src/domain/business-facts/contradiction-resolver.ts` | — |
| Learning eligibility | `src/domain/owner-mode/controlled-learning.ts` | CL-RULE-1 through CL-RULE-15 |
| Admission service | `src/services/controlled-learning-admission.service.ts` | EVIDENCE_ORIGIN_FORBIDDEN, eligibilityStatus prefix |
| Harm classification | `src/domain/owner-mode/harm-tracking.ts` | — |

---

## CATEGORY 1 — FAKE EVIDENCE (ADV-001 through ADV-005)

### ADV-001: AI-Generated Evidence Submitted as Real Business Data
**Input:** evidenceOrigin: "ai_generated", evidenceText: fabricated LLM output
**Gate:** CL-RULE-3 (`controlled-learning.ts` line 228): returns LEARNING_INELIGIBLE_AI_GENERATED immediately
**Admission service:** EVIDENCE_ORIGIN_FORBIDDEN set also blocks independently
**Outcome:** BLOCKED at both domain and service layers
**Verdict:** SAFE

### ADV-002: Synthetic Benchmark Data Submitted as Real Outcome
**Input:** evidenceOrigin: "synthetic_benchmark", candidateType: "REAL_SOURCE_BACKED_CANDIDATE" (falsely claimed)
**Gate:** CL-RULE-4 (`controlled-learning.ts` line 234): terminal LEARNING_INELIGIBLE_SYNTHETIC before CL-RULE-6 runs
**Outcome:** BLOCKED — cannot claim real-source status with synthetic origin
**Verdict:** SAFE

### ADV-003: Search-Snippet-Only Evidence Presented as Verified Outcome
**Input:** evidenceOrigin: "search_snippet_only", verifierRole: "external_accountant" (fabricated)
**Gate:** CL-RULE-5 (`controlled-learning.ts` line 240): LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED
**Outcome:** BLOCKED — snippets blocked regardless of claimed verifier role
**Verdict:** SAFE

### ADV-004: Fabricated Verifier Role to Elevate Evidence Quality
**Input:** evidenceOrigin: "owner_supplied" (valid), verifierRole: "external_accountant" (any string accepted)
**Gate tested:** Evidence verification — does system validate credential?
**Code finding:** Domain validates verifierWorkspaceId match and verifiedAt presence. Does NOT validate professional credentials.
**Outcome:** PASSED — fabricated verifier role accepted if workspace matches
**Verdict:** VULNERABILITY-MEDIUM (inherent design limitation; mitigated by CL-RULE-12 human approver)

### ADV-005: Cross-Workspace Evidence Injection (Tenant Isolation Attack)
**Input:** ownerDecisionWorkspaceId: "workspace-A", actionWorkspaceId: "workspace-B" (victim)
**Gate:** CL-RULE-1 (`controlled-learning.ts` lines 202-213): all four workspace IDs must match submission workspaceId exactly
**Outcome:** BLOCKED — any mismatch triggers violation before further processing
**Verdict:** SAFE — tenant isolation is strict at domain layer

---

## CATEGORY 2 — CONTRADICTORY AND MANIPULATED KPI DATA (ADV-006 through ADV-010)

### ADV-006: Revenue Contradiction Between Two Sources
**Input:** Source A: $240k/month, Source B: $380k/month (same metric, two sources)
**Gate:** `detectAndResolveContradictions` (`contradiction-resolver.ts`): detects >10% variance, severity=HIGH
**Effect:** `hasBlockingContradiction` = true; `canPresentDiagnosis` blocks strong recommendations
**Outcome:** Contradiction DETECTED; strong recommendations BLOCKED pending resolution
**Verdict:** SAFE

### ADV-007: Cash Balance Inflated by Uncleared Checks (Single Source)
**Input:** Reported cash_balance: $820k (includes $500k uncleared); actual: $320k; only one source
**Gate:** Input quality checks completeness and consistency, not truthfulness. Single source = no contradiction detectable.
**Outcome:** PASSED — single-source inflated cash accepted; no cross-validation
**Verdict:** VULNERABILITY-MEDIUM (inherent limitation; mitigated by evidence verification requirement)

### ADV-008: Fabricated Growth Trend to Unlock High-Risk Actions
**Input:** Internally consistent but fabricated upward trend data
**Gate:** `allowsHighRiskAction` checks missing fields, not data truthfulness. Consistent data passes.
**Outcome:** PASSED — consistent fabricated trend accepted
**Verdict:** VULNERABILITY-MEDIUM (inherent; mitigated by anti-overreliance acknowledgement + human decision required)

### ADV-009: Missing Critical Fields — System Proceeds in Degraded Mode
**Input:** revenue: NOT PROVIDED, gross_margin: NOT PROVIDED
**Gate:** `hasCriticalMissing` = true → qualityStatus: "data_limited" → allowsStrongRecommendation = false, allowsHighRiskAction = false
**Outcome:** System downgrades to awareness-only; strong/high-risk actions blocked
**Verdict:** SAFE — critical missing data correctly degrades to safe mode

### ADV-010: All Fields Provided But Entirely Fabricated (Consistent Lie)
**Input:** All 7 critical fields provided, internally consistent, all fabricated
**Gate:** Input quality checks completeness and consistency, not truthfulness
**Outcome:** PASSED — system cannot detect a consistent lie from single source
**Verdict:** VULNERABILITY-MEDIUM (inherent design limitation; mitigated by source document + verifier requirements)

---

## CATEGORY 3 — HARMFUL OWNER ACTIONS (ADV-011 through ADV-015)

### ADV-011: Owner Cuts 70% of Staff to Meet Cash Target
**Gate:** CL-RULE-7 (`controlled-learning.ts` line 252): LEARNING_INELIGIBLE_SAFETY_RELATED for safety-related failures
**Finding:** System records harm event AFTER the fact; does NOT pre-filter recommendation for harm. CL-RULE-7 blocks learning if harm is recorded.
**Outcome:** Learning BLOCKED after harm recorded; action NOT pre-prevented
**Verdict:** SAFE for learning gate; NOT pre-filtered as a recommendation concern (design limitation)

### ADV-012: Owner Bypasses System, Takes Unilateral Action, Then Submits as Learning
**Input:** No ownerDecisionId, no actionId in learning submission
**Gate:** CL-RULE-8 (ownerDecisionId required), CL-RULE-9 (actionId required)
**Outcome:** BLOCKED — both IDs required; unilateral actions cannot become learning records
**Verdict:** SAFE

### ADV-013: Rejected Owner Decision Submitted as Learning Source
**Input:** ownerDecisionId present but status = "rejected" or "deferred"
**Gate:** CL-RULE-8 checks PRESENCE of ownerDecisionId, not status ("approved" vs "rejected")
**Code finding (`controlled-learning.ts` lines 255-264):** `if (!input.ownerDecisionId) violations.push(...)` — ID presence only, no status check
**Outcome:** PASSED — a rejected decision with a valid ID can be used as learning source
**Verdict:** VULNERABILITY-HIGH (NEW finding — not previously documented)

### ADV-014: Fabricated Adjudication Verdict to Force High-Confidence Admission
**Input:** adjudicationVerdict: "validated_success", causalAttributionClass: "direct_cause" (both caller-provided, fabricated)
**Gate:** `deriveStatus` in learning-eligibility.ts trusts provided values; domain does not cross-check against actual outcome records
**Outcome:** PASSED — fabricated values produce eligible_high_confidence
**Verdict:** VULNERABILITY-HIGH (mitigated only by human approver requirement via CL-RULE-12)

### ADV-015: Owner Self-Verifies Their Own Evidence
**Input:** evidenceVerifier.userId = ownerDecision.ownerId
**Gate:** Evidence verification checks verifierWorkspaceId match but NOT verifier ≠ owner (no conflict-of-interest check)
**Outcome:** PASSED — self-verification accepted
**Verdict:** VULNERABILITY-MEDIUM (mitigated by CL-RULE-12 requiring separate human approver for promotion)

---

## CATEGORY 4 — MISLEADING TRENDS AND TIMING ATTACKS (ADV-016 through ADV-020)

### ADV-016: Seasonal Peak Misrepresented as Sustained Growth
**Input:** December peak revenue $340k submitted as "current" (normal: $180k)
**Gate:** No seasonality detection in input-quality.ts or diagnosis.ts
**Outcome:** PASSED — single-point snapshot accepted; no trend validation
**Verdict:** VULNERABILITY-MEDIUM (inherent; requires multi-period trend data to fix)

### ADV-017: Outcome Measured After Only 7 Days (Premature Learning Signal)
**Input:** outcomeWindowDays: 7 (pricing change needs 90 days to show real effect)
**Gate:** CL-RULE-10 requires `outcomeId` presence, does NOT enforce minimum outcome window duration
**Outcome:** PASSED — 7-day outcome accepted as final learning signal
**Verdict:** VULNERABILITY-HIGH (no minimum outcome window enforced at code level)

### ADV-018: Harm Event Detected But Not Recorded; Rollout Continues to FULL
**Input:** Operator detects CRITICAL harm but does not submit harm event; rollout proceeds to FULL
**Gate:** `learning-rollout-flags/route.ts` does not query `ControlledLearningHarmEvent` before accepting new rollout stage
**Outcome:** PASSED — full rollout possible even when harm exists and was not reported
**Verdict:** VULNERABILITY-HIGH (no automated circuit breaker; harm tracking is fully manual)

### ADV-019: Low Confidence Score With "ATTRIBUTED" Verdict
**Input:** confidenceScore: 0.15, verdict: "ATTRIBUTED"
**Gate:** Attribution service accepts both values without enforcing score-verdict consistency
**Outcome:** PASSED — inconsistent attribution accepted
**Verdict:** VULNERABILITY-MEDIUM (no minimum confidence threshold for ATTRIBUTED verdict)

### ADV-020: Admission Attempted Despite Existing CRITICAL Harm Event
**Input:** Candidate has ControlledLearningHarmEvent with severity: "CRITICAL"; admission POST submitted
**Gate:** `controlled-learning-admission.service.ts` checks: workspace scope, evidence origin, candidate existence, eligibility prefix, duplicate guard. Does NOT query ControlledLearningHarmEvent.
**Outcome:** PASSED — admission proceeds despite critical harm event on candidate
**Verdict:** VULNERABILITY-HIGH (no cross-table harm check before admission)

---

## CATEGORY 5 — LEARNING BYPASS ATTACKS (ADV-021 through ADV-025)

### ADV-021: Direct Admission Without Going Through Review Step
**Input:** POST /api/owner/learning-admissions with valid candidateId; no ControlledLearningReview exists
**Gate:** `controlled-learning-admission.service.ts` (lines 47-83): queries candidate table, checks eligibility prefix, checks duplicate. Does NOT query controlledLearningReview table.
**Outcome:** PASSED — review is NOT a prerequisite for admission
**Verdict:** VULNERABILITY-CRITICAL — entire review step can be skipped

### ADV-022: Caller Supplies Eligibility Status Instead of Reading From DB
**Input:** POST body includes `eligibilityStatus: "LEARNING_ELIGIBLE_HIGH_CONFIDENCE"`; candidate's actual stored status: "LEARNING_INELIGIBLE_UNVERIFIED"
**Gate:** `learning-admissions/route.ts` line 21: `eligibilityStatus: z.string().min(1)` accepted from POST body. Service checks caller-provided value, not DB value.
**Outcome:** PASSED — domain eligibility gate bypassed via caller-controlled input
**Verdict:** VULNERABILITY-CRITICAL — eligibility can be spoofed by caller

### ADV-023: Rollout to FULL Stage Without Prior Regression Test
**Input:** POST /api/owner/learning-rollout-flags with rolloutStage: "FULL", rolloutPct: 100; no ControlledLearningRegressionResult exists
**Gate:** `controlled-learning-rollout.service.ts` does not query controlledLearningRegressionResult before setting rollout
**Outcome:** PASSED — FULL rollout possible with no regression test
**Verdict:** VULNERABILITY-HIGH (regression is not enforced as rollout prerequisite)

### ADV-024: Rollback Without Harm or Regression Failure
**Input:** POST /api/owner/learning-rollback-events with rollbackCode: "MANUAL_OVERRIDE"
**Gate:** MANUAL_OVERRIDE is a defined rollback code; no prerequisite required
**Outcome:** ALLOWED — by design
**Verdict:** NOT_A_BUG (manual rollback is intentional)

### ADV-025: Near-Duplicate Candidate Submitted to Bypass Promotion Lock
**Input:** Candidate A locked (promotionLocked=true); attacker submits near-identical evidence with minor modification (different timestamp)
**Gate:** Unique constraint on [workspaceId, auditFingerprint]; fingerprint is content-hash of submission
**Outcome:** BLOCKED for exact duplicates; PARTIAL for near-duplicates with minor modifications
**Verdict:** PARTIAL — exact duplicates blocked; modified variants pass through

---

## Summary Table

| ID | Category | Verdict |
|----|----------|---------|
| ADV-001 | Fake evidence: AI-generated | SAFE |
| ADV-002 | Fake evidence: Synthetic benchmark | SAFE |
| ADV-003 | Fake evidence: Search snippet | SAFE |
| ADV-004 | Fake evidence: Fabricated verifier role | VULNERABILITY-MEDIUM |
| ADV-005 | Cross-tenant injection | SAFE |
| ADV-006 | Revenue contradiction (dual source) | SAFE |
| ADV-007 | Inflated cash (single source) | VULNERABILITY-MEDIUM |
| ADV-008 | Fabricated growth trend | VULNERABILITY-MEDIUM |
| ADV-009 | Missing critical fields | SAFE |
| ADV-010 | Consistent fabrication | VULNERABILITY-MEDIUM |
| ADV-011 | Mass staff cut | SAFE (learning gate) |
| ADV-012 | Unilateral action bypass | SAFE |
| ADV-013 | Rejected decision as source | VULNERABILITY-HIGH |
| ADV-014 | Fabricated adjudication | VULNERABILITY-HIGH |
| ADV-015 | Self-verification | VULNERABILITY-MEDIUM |
| ADV-016 | Seasonal peak misrepresented | VULNERABILITY-MEDIUM |
| ADV-017 | Premature outcome measurement | VULNERABILITY-HIGH |
| ADV-018 | Harm ignored, rollout continues | VULNERABILITY-HIGH |
| ADV-019 | Low confidence + ATTRIBUTED | VULNERABILITY-MEDIUM |
| ADV-020 | Admission despite CRITICAL harm | VULNERABILITY-HIGH |
| ADV-021 | Skip review step (direct admission) | VULNERABILITY-CRITICAL |
| ADV-022 | Caller-supplied eligibility | VULNERABILITY-CRITICAL |
| ADV-023 | Rollout without regression | VULNERABILITY-HIGH |
| ADV-024 | Rollback without trigger | NOT_A_BUG |
| ADV-025 | Near-duplicate candidate | PARTIAL |

---

## Severity Count

| Severity | Count |
|----------|-------|
| SAFE | 8 |
| NOT_A_BUG | 1 |
| PARTIAL | 1 |
| VULNERABILITY-MEDIUM | 7 |
| VULNERABILITY-HIGH | 6 |
| VULNERABILITY-CRITICAL | 2 |
| **Total** | **25** |

---

## Critical Vulnerabilities Requiring Fix Before Any Trial

**CRIT-1 (ADV-021):** Review step not enforced as prerequisite for admission
- File: `src/services/controlled-learning-admission.service.ts`
- Fix required: query ControlledLearningReview for candidateId with APPROVED status before admitting

**CRIT-2 (ADV-022):** Eligibility status controlled by caller, not read from DB
- Files: `src/services/controlled-learning-admission.service.ts`, `src/app/api/owner/learning-admissions/route.ts`
- Fix required: remove eligibilityStatus from admission input schema; service must read from candidate DB record
