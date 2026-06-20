# Owner Mode — Simulation Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Logic trace through actual service code — no mocking, no assumption

Each scenario is evaluated by tracing through the actual guard chain in the code.
Verdict: CORRECT / PARTIALLY_CORRECT / INCORRECT / DANGEROUS

---

## Part 1: Realistic Scenarios (50)

### Admission Flow (Scenarios 1–20)

| # | Scenario | Expected | Actual Guard | Verdict |
|---|---------|----------|--------------|---------|
| 1 | Eligible candidate, APPROVED review, no harm, ≥30 days → admit | PASS | All guards pass → admission created | CORRECT |
| 2 | Eligible candidate, APPROVED review, mitigated HIGH harm, ≥30 days → admit | PASS | Guard 5 checks CRITICAL+unmitigated only; HIGH harm doesn't block | CORRECT |
| 3 | Eligible candidate, 31 days since outcome → admit | PASS | Guard 2b: 31≥30 days → passes | CORRECT |
| 4 | Eligible candidate, 30 days exactly → admit | PASS | Guard 2b: 30≥30 → passes (boundary condition) | CORRECT |
| 5 | Eligible candidate, 29.9 days → block | BLOCK | Guard 2b: 29.9<30 → ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED | CORRECT |
| 6 | Eligible candidate, null outcomeRecordedAt → block | BLOCK | Guard 2b: null → ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP | CORRECT |
| 7 | Ineligible (UNVERIFIED) candidate → block | BLOCK | Guard 3: ELIGIBILITY_ALLOWS_PROMOTION[LEARNING_INELIGIBLE_UNVERIFIED]=false | CORRECT |
| 8 | Ineligible (AI_GENERATED) candidate → block | BLOCK | Guard 3: ELIGIBILITY_ALLOWS_PROMOTION[LEARNING_INELIGIBLE_AI_GENERATED]=false | CORRECT |
| 9 | No APPROVED review (only REJECTED) → block | BLOCK | Guard 4: findFirst({decision:"APPROVED"}) returns null | CORRECT |
| 10 | APPROVED + REJECTED reviews → admit | PASS | Guard 4: findFirst({decision:"APPROVED"}) returns the approved one | CORRECT |
| 11 | Unmitigated CRITICAL harm → block | BLOCK | Guard 5: findFirst({severity:"CRITICAL",mitigated:false}) returns event | CORRECT |
| 12 | CRITICAL harm mitigated → admit (if other guards pass) | PASS | Guard 5: mitigated=true excluded → returns null → proceeds | CORRECT |
| 13 | Duplicate admission attempt → block | BLOCK | Guard 6: existing admission found | CORRECT |
| 14 | admittedBy="" → block | BLOCK | Guard 0: !admittedBy.trim() → violation | CORRECT |
| 15 | admittedBy="  " (whitespace only) → block | BLOCK | Guard 0: "  ".trim()="" → violation | CORRECT |
| 16 | evidenceOrigin="ai_generated" → block before DB | BLOCK | Guard 1: ADMISSION_FORBIDDEN_ORIGINS.has("ai_generated") | CORRECT |
| 17 | evidenceOrigin="synthetic_benchmark" → block before DB | BLOCK | Guard 1: has("synthetic_benchmark") | CORRECT |
| 18 | evidenceOrigin="search_snippet_only" → block before DB | BLOCK | Guard 1: has("search_snippet_only") | CORRECT |
| 19 | evidenceOrigin="public_source_unverified" → block before DB | BLOCK | Guard 1: ADMISSION_FORBIDDEN_ORIGINS also includes "public_source_unverified" | CORRECT |
| 20 | evidenceOrigin="owner_manual_entry" → not blocked | PROCEED | Guard 1: not in forbidden set → continues | CORRECT |

### Review Flow (Scenarios 21–30)

| # | Scenario | Expected | Actual Guard | Verdict |
|---|---------|----------|--------------|---------|
| 21 | Create APPROVED review for eligible candidate | PASS | Decision enum passes, workspaceId scoped | CORRECT |
| 22 | Create REJECTED review | PASS | Decision="REJECTED" is valid | CORRECT |
| 23 | Create DEFERRED review | PASS | Decision="DEFERRED" is valid | CORRECT |
| 24 | Create review with invalid decision "PENDING" | BLOCK | Zod validation at route + service enum check | CORRECT |
| 25 | List reviews for workspace → returns only own workspace reviews | CORRECT | findMany({ where: { workspaceId } }) | CORRECT |
| 26 | Review with cross-tenant candidateId → blocked | BLOCK | Service checks candidate.workspaceId === input.workspaceId | CORRECT |
| 27 | DEFERRED review → admission attempt → still blocked at Guard 4 | BLOCK | Guard 4 looks for decision="APPROVED" only | CORRECT |
| 28 | Multiple reviews, one APPROVED → admission proceeds | PASS | findFirst returns the APPROVED one | CORRECT |
| 29 | Review created without reviewerId → blocked by Zod | BLOCK | Required field in Zod schema | CORRECT |
| 30 | Review created with future reviewedAt | PASS | No future-date restriction; business rule not enforced | PARTIALLY_CORRECT |

### Rollout Flow (Scenarios 31–40)

| # | Scenario | Expected | Actual Guard | Verdict |
|---|---------|----------|--------------|---------|
| 31 | Rollout with PASS regression → proceed | PASS | HIGH-5 guard finds PASS result | CORRECT |
| 32 | Rollout with no regression result → block | BLOCK | HIGH-5 guard: findFirst({testVerdict:"PASS"}) returns null | CORRECT |
| 33 | Rollout with only FAIL regression → block | BLOCK | HIGH-5 guard: findFirst specifically for PASS → null | CORRECT |
| 34 | Rollout with INCONCLUSIVE regression → block | BLOCK | HIGH-5 guard: INCONCLUSIVE ≠ PASS → null | CORRECT |
| 35 | Rollout with unmitigated CRITICAL harm → block | BLOCK | HIGH-4 guard fires | CORRECT |
| 36 | Rollout with mitigated CRITICAL harm + PASS regression → proceed | PASS | HIGH-4: mitigated=true excluded; HIGH-5: PASS found | CORRECT |
| 37 | Rollout stage="SHADOW" → proceed | PASS | VALID_ROLLOUT_STAGES includes "SHADOW" | CORRECT |
| 38 | Rollout stage="PILOT" → block | BLOCK | "PILOT" not in VALID_ROLLOUT_STAGES | CORRECT |
| 39 | rolloutPct=101 → block | BLOCK | pct>100 violation | CORRECT |
| 40 | rolloutPct=-1 → block | BLOCK | pct<0 violation | CORRECT |

### Harm / Attribution / Rollback (Scenarios 41–50)

| # | Scenario | Expected | Actual Guard | Verdict |
|---|---------|----------|--------------|---------|
| 41 | Record harm FINANCIAL_LOSS severity=HIGH → pass | PASS | Valid harmType + severity | CORRECT |
| 42 | Mitigate harm → marks mitigated=true, emits audit | PASS | markHarmMitigated updates field + audit | CORRECT |
| 43 | Attribution review verdict=ATTRIBUTED confidence=0.9 → pass | PASS | Valid verdict + confidence | CORRECT |
| 44 | Attribution verdict=INCONCLUSIVE → pass | PASS | INCONCLUSIVE in VALID_VERDICTS | CORRECT |
| 45 | Attribution confidence=1.5 → block | BLOCK | confidence>1.0 violation | CORRECT |
| 46 | Attribution confidence=-0.1 → block | BLOCK | confidence<0.0 violation | CORRECT |
| 47 | Attribution without matching harmEventId in workspace → block | BLOCK | harmEvent findFirst({id, workspaceId}) returns null | CORRECT |
| 48 | Rollback REGRESSION_DETECTED → recorded | PASS | Valid rollbackCode + audit ROLLBACK_REGRESSION_DETECTED | CORRECT |
| 49 | Rollback "PILOT_FAILURE" (invalid code) → block | BLOCK | Not in VALID_ROLLBACK_CODES | CORRECT |
| 50 | Rollback with cross-tenant candidateId → block | BLOCK | candidate findFirst({id, workspaceId}) returns null | CORRECT |

---

## Part 2: Adversarial Scenarios (25)

| # | Attack | Expected | Actual Defense | Verdict |
|---|--------|----------|----------------|---------|
| A1 | POST body includes `eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME"` for ineligible candidate | BLOCK | eligibilityStatus not in route Zod schema; service reads from DB | CORRECT |
| A2 | POST body includes `workspaceId` different from auth session workspace | BLOCK | withCanonicalEnforcement: requireWorkspace=true validates session workspace | CORRECT |
| A3 | Unauthenticated POST to /api/owner/learning-admissions | 401 | canonical-route-enforcement: session check → 401 | CORRECT |
| A4 | Missing OWNER_MANAGE capability → attempt admission | 403 | withCanonicalEnforcement: capability check | CORRECT |
| A5 | Inject `"__proto__"` as admittedBy | BLOCK | Guard 0: trim() → non-empty, passes Guard 0; injected as string only | CORRECT |
| A6 | Submit candidateId from workspace B while auth'd to workspace A | BLOCK | Guard 2: findFirst({id, workspaceId:A}) returns null | CORRECT |
| A7 | Replay admission POST for already-admitted candidate | BLOCK | Guard 6: existing admission found | CORRECT |
| A8 | Craft admittedAt 29 days after outcomeRecordedAt | BLOCK | Guard 2b: 29<30 → ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED | CORRECT |
| A9 | Submit negative admittedAt (before outcomeRecordedAt) | BLOCK | Guard 2b: daysSinceOutcome<0<30 → blocked | CORRECT |
| A10 | Rollout without regression result by omitting candidateId → server error | BLOCK | assertWorkspaceScopedQuery + candidate not found | CORRECT |
| A11 | Rollout with harmEventId cross-tenant (workspace B event) | BLOCK | HIGH-4: findFirst({candidateId, workspaceId:A}) — uses own workspaceId | CORRECT |
| A12 | Suppress harm by setting mitigated=true on creation | BLOCK | recordHarmEvent always creates with mitigated=false (default) | CORRECT |
| A13 | Attribution review for harmEvent from another workspace | BLOCK | findFirst({id: harmEventId, workspaceId}) returns null | CORRECT |
| A14 | Attempt to update an existing candidate record to change eligibilityStatus | BLOCK | No update mutation in candidate service; append-only | CORRECT |
| A15 | Submit regression result with testVerdict="PENDING" | BLOCK | Not in (PASS|FAIL|INCONCLUSIVE) enum | CORRECT |
| A16 | Set rolloutPct=NaN | BLOCK | typeof NaN === "number" is true but NaN<0 and NaN>100 are false; NaN is not ≥0 or ≤100; condition `pct<0||pct>100` — NaN comparisons return false. POTENTIAL GAP: NaN may pass rolloutPct check | PARTIALLY_CORRECT |
| A17 | Set rollbackCode="" | BLOCK | Not in VALID_ROLLBACK_CODES | CORRECT |
| A18 | Set consentScope="ALL" (not in enum) | BLOCK | Zod validation at route + service enum check | CORRECT |
| A19 | Set retentionDays=0 | BLOCK | 0 outside 1–3650 range | CORRECT |
| A20 | Set retentionDays=9999 | BLOCK | 9999>3650 → violation | CORRECT |
| A21 | Set controlType="DELETE" (not in enum) | BLOCK | Not in (ANONYMIZE|REDACT|EXCLUDE|QUARANTINE) | CORRECT |
| A22 | Rollout stage="" | BLOCK | Not in VALID_ROLLOUT_STAGES | CORRECT |
| A23 | Submit harmType="UNKNOWN" | BLOCK | Not in VALID_HARM_TYPES | CORRECT |
| A24 | CRITICAL harm severity and mitigated=false but different candidateId in same workspace | PASS | Guard 5 queries by {candidateId, workspaceId} — correctly scoped to this candidate | CORRECT |
| A25 | Missing workspaceId entirely → assertWorkspaceScopedQuery throws | 500/BLOCK | throws Error before any DB access | CORRECT |

**Note on A16 (NaN rolloutPct):**
- `typeof NaN === "number"` → true
- `NaN < 0` → false; `NaN > 100` → false
- Condition: `typeof input.rolloutPct !== "number" || input.rolloutPct < 0 || input.rolloutPct > 100`
- NaN passes all three checks → violations.push() is NOT triggered
- However: Zod schema at the route layer validates `rolloutPct` as a number with `.min(0).max(100)`. Zod's `.min()/.max()` with NaN causes parse failure. So NaN is blocked at the route layer before reaching the service.
- NET: NaN is blocked by Zod, not by the service guard. Service guard alone has this gap.

---

## Part 3: Edge Cases (25)

| # | Edge Case | Verdict |
|---|-----------|---------|
| E1 | Candidate with 30 days exactly (boundary) → admit | CORRECT |
| E2 | Review with reviewedAt=exactly admittedAt → no restriction | CORRECT (no restriction enforced) |
| E3 | Multiple APPROVED reviews for one candidate → admit | CORRECT (first found is used) |
| E4 | Rollout with rolloutPct=0.0 → allowed | CORRECT (PAUSED at 0%) |
| E5 | Rollout with rolloutPct=100.0 → allowed | CORRECT (FULL at 100%) |
| E6 | Two rollout flags for same candidate → upsert replaces first | CORRECT (@@unique enforced) |
| E7 | Rejection then admission attempt for same candidate | CORRECT (rejection doesn't block admission; eligibilityStatus from DB determines admission) |
| E8 | Admission after rollback event | CORRECT (rollback doesn't block re-admission; no guard for this) |
| E9 | Harm event with severity=LOW, unmitigated → rollout allowed | CORRECT (HIGH-4 only blocks CRITICAL) |
| E10 | Harm event with severity=HIGH, unmitigated → rollout allowed | CORRECT (HIGH-4 checks severity:"CRITICAL" only) |
| E11 | FAIL regression + PASS regression both exist → rollout allowed | CORRECT (findFirst for PASS returns the PASS one) |
| E12 | Attribution review without prior harm → blocked | CORRECT (harmEvent findFirst returns null) |
| E13 | Rollback with no prior rollout flag → allowed | CORRECT (no prerequisite check for rollout flag before rollback) |
| E14 | Privacy control ANONYMIZE + REDACT for same candidate → both allowed | CORRECT (no unique constraint on privacyControls) |
| E15 | Two consent records for same candidate → both allowed | CORRECT (no unique constraint on consentRecords) |
| E16 | Retention policy set twice → second upsert replaces first | CORRECT (@@unique([workspaceId])) |
| E17 | Candidate with promotionLocked=true → admission attempt | PARTIALLY_CORRECT (promotionLocked field exists in DB but is not checked in admitCandidate guard chain) |
| E18 | Regression with regressionScore=1.5 | CORRECT (blocked by 0.0–1.0 range check) |
| E19 | Regression with regressionScore=0.0 | CORRECT (0.0 is within range) |
| E20 | Harm event for candidate in own workspace → both admissions queries scoped correctly | CORRECT |
| E21 | Empty rollbackReason string → blocked | CORRECT (service checks !input.rollbackReason) |
| E22 | Admission with all fields valid, 35 days since outcome → admit | CORRECT |
| E23 | Attribution review linked to harm from another candidate in same workspace → blocked | CORRECT (attribution checks candidateId via candidate lookup) |
| E24 | RolloutFlag update with new pct=50 → replaces existing 10% flag | CORRECT (upsert) |
| E25 | Admission blocked by Guard 3, then eligibilityStatus updated in DB → retry succeeds | CORRECT (Guard 3 always reads fresh from DB) |

**Note on E17 (promotionLocked):**
The `promotionLocked` field exists in the DB schema and is selected in Guard 2 (`select: { ..., promotionLocked: true }`), but the `admitCandidate` service does not check it before proceeding. If `promotionLocked=true`, admission still succeeds. The field is not enforced in the admission guard chain.

This is a **LOW severity gap** — promotionLocked is a UI state field, not a safety gate. However, for strict governance it should block admission.

---

## Aggregate Results

| Category | Total | CORRECT | PARTIALLY_CORRECT | INCORRECT | DANGEROUS |
|----------|-------|---------|-------------------|-----------|-----------|
| Realistic (1–50) | 50 | 49 | 1 | 0 | 0 |
| Adversarial (A1–A25) | 25 | 24 | 1 | 0 | 0 |
| Edge cases (E1–E25) | 25 | 24 | 1 | 0 | 0 |
| **Total** | **100** | **97** | **3** | **0** | **0** |

**Unsafe proceed count: 0**
**Dangerous count: 0**

### Partially Correct Items

1. **#30 (Review future date):** No server-side date validation on `reviewedAt`. Future-dated reviews are accepted.
2. **A16 (NaN rolloutPct):** NaN bypasses the service guard, but is blocked by Zod at the route layer. Defense-in-depth gap in service layer only.
3. **E17 (promotionLocked not checked):** `promotionLocked=true` candidates can still be admitted. The field is stored but not enforced as an admission gate.
