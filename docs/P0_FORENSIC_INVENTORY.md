# P0 Forensic Inventory

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** HOSTILE AUDIT REMEDIATION — Phase A  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** CLASSIFICATION ONLY — no coding performed

---

## 1. Methodology

Each P0 finding from `FINAL_REPOSITORY_HOSTILE_AUDIT.md` and `OWNER_INPUT_MODULE_HOSTILE_AUDIT.md` was forensically investigated by:

1. Reading the actual source files named in the finding
2. Tracing the execution path from input to output
3. Checking for existing implementations that contradict the audit finding
4. Classifying based on evidence

Classifications used:

| Class | Meaning |
|-------|---------|
| CONFIRMED | Finding is accurate; defect exists in production code |
| FALSE_POSITIVE | Finding is inaccurate; the described behavior already exists |
| ALREADY_FIXED | Implementation exists that satisfies the finding's requirement |
| DUPLICATE | Finding is a restatement of another finding in this list |
| NEEDS_INVESTIGATION | Evidence is partial; further investigation required before fix |

**No code was modified during Phase A.**

---

## 2. Consolidated P0 Finding List

The following P0 findings were drawn from both audit documents:

| Finding ID | Source Audit | Description |
|------------|-------------|-------------|
| ENG-001 | FINAL_REPOSITORY | Engine diagnoses from zero evidence |
| ENG-002 | FINAL_REPOSITORY | No assumed-input surfacing |
| ENG-003 | FINAL_REPOSITORY | Output confidence tier not surfaced |
| IQ-001 | INPUT_MODULE | No input completeness score surfaced to owner |
| IQ-004 | INPUT_MODULE | No detection of internally inconsistent data |
| IQ-005 | INPUT_MODULE | GST/tax-inclusive figures not detected |
| CS-001 | INPUT_MODULE | No confidence score generated from input completeness |
| CS-002 | INPUT_MODULE | BLOCKED state not triggered on insufficient evidence |
| HA-001 | INPUT_MODULE | Engine may assume inputs not documented or surfaced |
| D-001 | FINAL_REPOSITORY (via OWNER_WORKFLOW) | Signup → /dashboard not /onboarding |
| D-002 | FINAL_REPOSITORY (via OWNER_WORKFLOW) | Onboarding complete → inbox not /owner/intake |
| D-003 | FINAL_REPOSITORY (via OWNER_WORKFLOW) | Intake complete → no route to diagnosis |
| H-001 | FINAL_REPOSITORY (via OWNER_WORKFLOW) | No intake data banner when evidence count = 0 |
| NET-001 | FINAL_REPOSITORY (via MOBILE_AUDIT) | No offline capability or graceful degradation |
| OH-001 | FINAL_REPOSITORY (via MOBILE_AUDIT) | Domain navigation buttons — tap target failure |

Total P0 findings: 15 (13 unique + 2 duplicates identified below)

---

## 3. Individual Finding Classifications

---

### ENG-001: Engine diagnoses from zero evidence

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §8  
**Affected module:** `src/services/consulting-engine/diagnosis-engine.ts`  
**Reproduction path:** Call `diagnoseRootCause([], "any problem")`

**Investigation findings:**

File read: `src/services/consulting-engine/diagnosis-engine.ts` lines 1102–1160.

When `evidence = []`, `matchedPatterns.length === 0`. The function takes the branch at line 1132:
```typescript
if (matchedPatterns.length === 0) {
  return {
    ...
    confidence: DiagnosisConfidence.INSUFFICIENT_EVIDENCE,
    readinessForIntervention: "BLOCKED",
    warningFlags: ["Cannot proceed with confident diagnosis. Additional investigation required."],
  };
}
```

The engine does NOT diagnose from zero evidence. It returns a BLOCKED state.

Additionally confirmed in `smbOutputComposer.ts` lines 2241–2258: when `UNKNOWN || INSUFFICIENT_EVIDENCE`, the composer abstains entirely and returns `abstentionReason`.

**Classification: DUPLICATE / PARTIALLY_FALSE_POSITIVE**

The engine-layer defect described does not exist in `diagnosis-engine.ts` or `smbOutputComposer.ts`. However, the *UI* layer may not surface the BLOCKED state to the owner — that is captured under ENG-003 / IQ-001. The engine mechanism is correct; the owner-visible output of the BLOCKED mechanism is the open question.

**Absorbs into:** ENG-003 (owner-facing surfacing of BLOCKED/confidence state)

---

### ENG-002: No assumed-input surfacing

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §8  
**Affected module:** `diagnosis-engine.ts`, `smbOutputComposer.ts`  
**Reproduction path:** Submit diagnosis input with missing fields; check output for assumed-value disclosure

**Investigation findings:**

`diagnosis-engine.ts`: Each pattern's `diagnosis()` function returns a `missingEvidenceFor[]` array naming the evidence dimensions that were absent. Example: `"Root cause of turnaround delay (equipment vs labor vs process)"`.

`smbOutputComposer.ts`: The composer returns `missingInputsToRequest[]` in its output, populated from pattern-specific gap lists.

Neither surface **assumed values** (synthesised defaults used in place of absent inputs). The existing mechanism names *evidence gaps* but does not disclose *values assumed when a gap exists*. This is the genuine defect: if the engine uses an absence to infer a direction (e.g., assumes gross margin is low when no cost data is given), that assumption is not explicitly flagged.

**Classification: NEEDS_INVESTIGATION**

Partial implementation exists (evidence gaps named). The specific defect (assumed-value disclosure) requires reading the pattern functions to determine whether any pattern infers a value in the absence of evidence. Phase B must trace each pattern for implicit value assumptions.

---

### ENG-003: Output confidence tier not surfaced in owner UI

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §8  
**Affected module:** Owner command center UI, `/api/owner/command-center/route.ts`  
**Reproduction path:** Navigate to `/owner` as a logged-in owner; verify confidence tier is visible

**Investigation findings:**

Engine and composer: `DiagnosisConfidence` level exists in all diagnosis outputs. `smbOutputComposer.ts` line 2227 returns `confidence: String(confidence)`.

Business condition service: `dataConfidenceScore` is computed in `owner-finance/data-confidence.ts` using a deterministic formula (missing critical inputs, stale data, missing important fields) and flows through `DomainScore` to `BusinessConditionProfile`.

Command center API (`/api/owner/command-center/route.ts`): calls `getBusinessCondition()` which returns a `BusinessConditionProfile` including the `dataConfidenceScore`.

The confidence data EXISTS in the backend pipeline. Whether it is rendered in the owner-facing UI (`/owner` page) requires reading the command center frontend components.

**Classification: NEEDS_INVESTIGATION**

Backend confidence data exists. Frontend surfacing unknown. Phase B must verify owner-facing rendering.

---

### IQ-001: No input completeness score surfaced to owner

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §3  
**Affected module:** Owner command center UI, intake confirmation screen  
**Reproduction path:** Submit partial intake data; navigate to `/owner`; verify completeness percentage is visible

**Investigation findings:**

`owner-finance/data-confidence.ts`: `calculateDataConfidence()` computes `dataConfidenceScore` (0–100) from missing critical inputs (-30 each), missing important fields (-5 each), invalid currency (-10), stale data (-15). Returns `missingCritical[]` explicitly.

`business-condition.service.ts` line 79: `dataConfidenceScore: clampScore(100 - missingCritical.length * 30)` — score is computed and returned in the domain score.

This score exists for the finance domain. Whether it is displayed to the owner is unknown.

**Classification: NEEDS_INVESTIGATION**

Backend completeness score exists for finance domain. UI surfacing unknown. Phase B must verify.

**Note:** This is structurally the same finding as ENG-003. Both require the same Phase B investigation: is the confidence/completeness data surfaced in the owner-facing `/owner` page?

---

### IQ-004: No detection of internally inconsistent data

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §3  
**Affected module:** Intake validation, input assembler  
**Reproduction path:** Submit revenue $1.2M, gross margin 35%, but cost data implying 18% margin; verify error is raised

**Investigation findings:**

`smbOutputComposer.ts` lines 578, 638–639, 1318, 1374: The SMB composer DOES detect arithmetic inconsistency in self-reported financials as a finding pattern. Lines 1318–1320:
```
`Arithmetic inconsistency exists between the stated revenue, COGS, and gross margin`
```

However, this inconsistency detection is implemented in the **output composer** (post-ingestion), not in the **intake validation layer** (`owner-intake/engine.ts` or `owner-intake/validation.ts`).

`owner-intake/engine.ts`: Validates required fields, parses numbers, checks non-negative — no cross-field consistency checks.

The defect is real but scoped: inconsistency detection exists post-diagnosis but not pre-diagnosis (at intake time).

**Classification: CONFIRMED (scoped)**

Arithmetic inconsistency detection exists in the composer (simulation path) but NOT in the intake validation layer. The intake module accepts contradictory data without flagging it.

**Exact affected file:** `src/domain/owner-intake/engine.ts` — no consistency check between field values.

---

### IQ-005: GST/tax-inclusive figures not detected

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §3  
**Affected module:** `src/domain/owner-intake/field-specs.ts`, intake form UI  
**Reproduction path:** Submit revenue with no gstBasis field; verify field does not exist in schema

**Investigation findings:**

`src/domain/owner-intake/field-specs.ts`: The `finance` field spec contains: `periodStart`, `periodEnd`, `currency`, `revenue`, `costOfGoodsOrServices`, `fixedCosts`, `variableCosts`, `cashOnHand`, `receivables`. No `gstBasis`, `taxInclusive`, or `exGst` field exists.

`src/domain/owner-intake/validation.ts`: `intakeUploadSchema` validates `source`, `targetDomain`, `csvText`, `notes`. No GST basis field.

`src/domain/owner-intake/engine.ts`: `parseNumber()` strips currency symbols but applies no GST normalisation.

**Classification: CONFIRMED**

GST basis is not collected, not normalised, and not flagged anywhere in the intake pipeline. Every owner who reports GST-inclusive revenue submits corrupted financial data with no warning.

**Exact affected file:** `src/domain/owner-intake/field-specs.ts` — missing `gstBasis` field in finance spec.

---

### CS-001: No confidence score generated from input completeness

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §4  
**Affected module:** Input assembler, command center  
**Investigation:** See IQ-001 and ENG-003 — `dataConfidenceScore` EXISTS in the finance domain pipeline.

**Classification: DUPLICATE of IQ-001 / ENG-003**

The required mechanism (confidence score from input completeness) partially exists. The open question is UI surfacing.

---

### CS-002: BLOCKED state not triggered on insufficient evidence

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §4  
**Investigation:** See ENG-001 — engine DOES trigger BLOCKED state on insufficient evidence.

**Classification: DUPLICATE of ENG-001 / FALSE_POSITIVE (engine layer)**

The engine-layer BLOCKED state is implemented. The UI-layer surfacing question is covered by ENG-003.

---

### HA-001: Engine may assume inputs not documented or surfaced

**Source audit:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md §6  
**Affected module:** `diagnosis-engine.ts`, pattern functions  
**Investigation:** See ENG-002.

**Classification: DUPLICATE of ENG-002 / NEEDS_INVESTIGATION**

---

### D-001: Signup redirects to /dashboard not /onboarding

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §5 (via OWNER_WORKFLOW §3)  
**Affected file:** `src/app/signup/page.tsx` line 40  
**Reproduction path:** Create a new account; verify redirect destination

**Investigation findings:**

`src/app/signup/page.tsx` line 40:
```typescript
router.push("/dashboard");
```

No conditional routing. No check for whether workspace or business exists. Every new signup goes to `/dashboard`.

**Classification: CONFIRMED**

P0 dead end. New owner completes signup and arrives at the operator decision dashboard with no business, no data, and no guidance.

**Exact fix target:** `src/app/signup/page.tsx` line 40 → change to `router.push("/onboarding")`

---

### D-002: Onboarding complete does not route to /owner/intake

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §5 (via OWNER_WORKFLOW §3)  
**Affected file:** `src/app/onboarding/page.tsx`  
**Reproduction path:** Complete onboarding steps; verify CTA destination

**Investigation findings:**

`src/app/onboarding/page.tsx` — the "complete" step button routes to `/dashboard/inbox`. No CTA to `/owner/intake`. No message about the need to enter business data.

**Classification: CONFIRMED**

P0 dead end. Owner completes workspace setup with no data entered and no path to the intake form.

**Exact fix target:** `src/app/onboarding/page.tsx` — add CTA on complete step that routes to `/owner/intake` with context message.

---

### D-003: Intake complete does not route to diagnosis

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §5 (via OWNER_WORKFLOW §3)  
**Affected file:** Intake confirmation UI / POST `/api/owner/intake/uploads/[intakeId]/confirm/route.ts`  
**Reproduction path:** Confirm intake upload; verify redirect behavior

**Investigation findings:**

File `src/app/api/owner/intake/uploads/[intakeId]/confirm/route.ts` exists. The intake confirmation API route exists. What happens after confirmation in the UI has not been read.

**Classification: NEEDS_INVESTIGATION**

API route exists. Frontend behavior after confirmation has not been verified. Phase B must read the intake confirmation UI to determine whether a redirect to `/owner` exists.

---

### H-001: No intake data banner when evidence count = 0

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §5 (via OWNER_WORKFLOW §5)  
**Affected file:** Owner command center UI components  
**Reproduction path:** Log in as owner with no business data; navigate to `/owner`; verify banner

**Investigation findings:**

Command center API exists and returns `BusinessConditionProfile`. The profile includes `dataConfidenceScore`. Whether the frontend renders a banner when `dataConfidenceScore` is 0 or when no data exists has not been verified.

**Classification: NEEDS_INVESTIGATION**

Backend data exists. Frontend banner rendering unknown. Phase B must read the owner command center page component.

---

### NET-001: No offline capability or graceful degradation

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §6 (via MOBILE_AUDIT §4)  
**Affected file:** No service worker found anywhere in the repository  
**Reproduction path:** Load `/owner` on a slow or offline connection; verify loading state and retry behavior

**Investigation findings:**

No `service-worker.js`, no `sw.js`, no `next-pwa` configuration, no `workbox` configuration found in the repository. The app is a pure server-side-rendered / client-fetch Next.js application with no offline support.

No `AbortController` timeout wrapping on fetch calls confirmed in the files inspected. No localStorage cache-first fallback pattern confirmed.

**Classification: CONFIRMED**

No offline or poor-network degradation exists. This is infrastructure-level work.

**Note:** NET-001 is P0 per the mobile audit but is the most complex to fix (requires service worker or PWA implementation). It is a confirmed gap but may require a dedicated infrastructure decision before implementation.

---

### OH-001: Domain navigation buttons — tap target failure

**Source audit:** FINAL_REPOSITORY_HOSTILE_AUDIT.md §6 (via MOBILE_AUDIT §3)  
**Affected file:** Owner page navigation component  
**Reproduction path:** Render `/owner` at 375px viewport; measure nav button heights

**Investigation findings:**

`src/app/owner/page.tsx` was searched but not found at that path (no files matched). The owner page may be at a different path or may not be a Page Router route.

**Classification: NEEDS_INVESTIGATION**

Owner page navigation component location not confirmed. Phase B must locate the owner navigation component and verify tap target measurements.

---

## 4. Consolidated Classification Table

| Finding ID | Classification | Genuine Defect | Fix Required |
|------------|---------------|----------------|-------------|
| ENG-001 | DUPLICATE / FALSE_POSITIVE | NO (engine handles it) | NO (absorbed into ENG-003) |
| ENG-002 | NEEDS_INVESTIGATION | PARTIAL | Phase B required |
| ENG-003 | NEEDS_INVESTIGATION | POSSIBLE | Phase B required |
| IQ-001 | NEEDS_INVESTIGATION | POSSIBLE | Phase B required |
| IQ-004 | CONFIRMED (scoped) | YES | Fix in intake validator |
| IQ-005 | CONFIRMED | YES | Fix in field-specs + form |
| CS-001 | DUPLICATE of IQ-001 | — | Absorbed |
| CS-002 | DUPLICATE / FALSE_POSITIVE | NO (engine handles it) | — Absorbed |
| HA-001 | DUPLICATE of ENG-002 | — | Absorbed |
| D-001 | CONFIRMED | YES | Fix in signup/page.tsx |
| D-002 | CONFIRMED | YES | Fix in onboarding/page.tsx |
| D-003 | NEEDS_INVESTIGATION | POSSIBLE | Phase B required |
| H-001 | NEEDS_INVESTIGATION | POSSIBLE | Phase B required |
| NET-001 | CONFIRMED | YES | Infrastructure work |
| OH-001 | NEEDS_INVESTIGATION | POSSIBLE | Phase B required |

---

## 5. Deduplicated Unique Findings After Classification

After deduplication (ENG-001/CS-002/HA-001/CS-001 absorbed), the unique P0 findings are:

| # | ID | Classification | Priority |
|---|----|---------------|---------|
| 1 | D-001 | CONFIRMED | HIGHEST — blocks all owner onboarding |
| 2 | D-002 | CONFIRMED | HIGHEST — blocks all owner onboarding |
| 3 | IQ-005 | CONFIRMED | CRITICAL — corrupts financial diagnosis for all Australian SMBs |
| 4 | IQ-004 | CONFIRMED (scoped) | CRITICAL — intake accepts contradictory data |
| 5 | NET-001 | CONFIRMED | CONFIRMED — infrastructure gap; complex to fix |
| 6 | ENG-002 / HA-001 | NEEDS_INVESTIGATION | Phase B required |
| 7 | ENG-003 / IQ-001 | NEEDS_INVESTIGATION | Phase B required |
| 8 | D-003 | NEEDS_INVESTIGATION | Phase B required |
| 9 | H-001 | NEEDS_INVESTIGATION | Phase B required |
| 10 | OH-001 | NEEDS_INVESTIGATION | Phase B required |

**Confirmed P0 defects requiring fixes: 4 (D-001, D-002, IQ-005, IQ-004) + 1 infrastructure gap (NET-001)**  
**Confirmed P0 false positives / duplicates: 4 (ENG-001, CS-001, CS-002, HA-001)**  
**Needs investigation before fix decision: 5 (ENG-002, ENG-003/IQ-001, D-003, H-001, OH-001)**

---

## 6. Special Investigation: ENGINE_DIAGNOSIS_WITH_ZERO_EVIDENCE

Per the mission contract, this finding is automatically highest priority. Classification result:

**ENGINE_DIAGNOSIS_WITH_ZERO_EVIDENCE: FALSE_POSITIVE**

Evidence:
- `diagnoseRootCause([], ...)` → `matchedPatterns.length === 0` → returns `BLOCKED` state with `INSUFFICIENT_EVIDENCE`
- `smbOutputComposer.ts` → abstains and returns `abstentionReason` when `UNKNOWN || INSUFFICIENT_EVIDENCE`
- No diagnosis is rendered; no recommendation is produced from zero evidence

The engine is fail-closed on zero evidence at the pure-function layer.

**Open questions for Phase B:**
1. Is the BLOCKED state surfaced in the owner-facing UI?
2. Are domain-specific services (owner-finance, owner-cashflow etc.) also fail-closed?
3. Is there a production path that bypasses `diagnoseRootCause` and diagnoses without BLOCKED protection?

---

## 7. INPUT_MODULE_P0 Summary

| Finding | Classification | Status |
|---------|---------------|--------|
| IQ-001 | NEEDS_INVESTIGATION | `dataConfidenceScore` exists; UI surfacing unknown |
| IQ-004 | CONFIRMED | Intake validator has no cross-field consistency check |
| IQ-005 | CONFIRMED | No gstBasis field anywhere in intake pipeline |
| CS-001 | DUPLICATE of IQ-001 | — |
| CS-002 | FALSE_POSITIVE | Engine has BLOCKED state |
| HA-001 | NEEDS_INVESTIGATION | Evidence gaps named; assumed-value disclosure unknown |

---

## 8. Phase B Authorisation

Phase B (P0 Validation Report) is authorized to begin for:

**CONFIRMED findings (no further investigation needed):**
- D-001: Reproduce and document
- D-002: Reproduce and document
- IQ-005: Reproduce and document
- IQ-004: Reproduce and document

**NEEDS_INVESTIGATION findings (Phase B must investigate before fix):**
- ENG-002 / HA-001: Trace patterns for implicit value assumptions
- ENG-003 / IQ-001: Read owner command center frontend for confidence display
- D-003: Read intake confirmation UI
- H-001: Read owner command center page for no-data banner
- OH-001: Locate owner navigation component; check tap targets

---

*Phase A complete. No code was modified. All findings are classified. Phase B ready to begin.*
