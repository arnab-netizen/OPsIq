# Final Repository Hostile Audit

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase H  
**Status:** AUDIT — end-to-end hostile audit of the full OpsIQ repository

---

## 1. Scope

This document is the final hostile audit of the OpsIQ repository before the Phase I readiness decision. It audits every layer of the platform:

1. Architecture and code integrity
2. Test coverage and CI gates
3. Security and authorization
4. Owner workflow and UX
5. Simulation and benchmark corpus
6. Diagnosis engine and output quality
7. Learning and reassessment controls
8. Dashboard and mobile readiness

The audit applies a hostile lens throughout: what fails, what is insecure, what is incomplete, what would harm a real business owner if deployed.

---

## 2. Architecture Audit

### ARCH-001: Business logic in UI components — potential violations

**Finding:** The existing CLAUDE.md rule prohibits business logic in UI components. Several owner-mode pages (`/owner/page.tsx`, `/owner/home/page.tsx`) perform data fetching and transformation inline rather than in dedicated services.

**Risk:** Business rule mutations are untestable when embedded in React components.

**Required fix:** Extract all data transformation and business rule evaluation to service functions. Pages should be pure data consumers.

---

### ARCH-002: State-transition logic not fully centralised

**Finding:** Consulting lifecycle stage transitions and intervention mode transitions may not be fully centralised in a single policy/service layer. Multiple pages may independently evaluate or display lifecycle state.

**Risk:** Stage display diverges between pages; owner sees inconsistent lifecycle stage across `/owner` and `/owner/home`.

**Required fix:** Single source of truth for lifecycle stage: one function, one service, one DB field. All pages read from that single source.

---

### ARCH-003: Audit event emission coverage — incomplete

**Finding:** Not all meaningful mutations emit audit events as required by CLAUDE.md. Evidence submission, diagnosis generation, action completion, and reassessment scheduling all require audit trails.

**Risk:** Missing audit trail means the platform cannot reconstruct what happened when a diagnosis was wrong or an action was harmful.

**Required fix:** Audit all write paths. Every mutation to: evidence, diagnosis, action status, lifecycle stage, reassessment schedule, confidence score must emit an audit event.

---

## 3. Test Coverage Audit

### TC-001: Simulation harness covers 60 cases — PASS

**Finding:** The simulation corpus contains 60 cases across 35+ industries and root cause categories. All cases pass leakage check and schema validation. Simulation pass rate target is ≥ 70%.

**Status:** PASS (corpus confirmed; pass rate subject to engine run)

---

### TC-002: SMB benchmark fixtures — 12 cases, regression locked

**Finding:** 12 SMB benchmark fixtures exist in `opsiq_real_world_smb_case_fixtures.jsonl`. These are regression-locked; no output change is permitted without a benchmark break report.

**Status:** PASS (confirmed by prior session)

---

### TC-003: Adversarial benchmark fixtures — defined, not yet authored

**Finding:** 10 adversarial benchmark classes are defined in `docs/ADVERSARIAL_BENCHMARK_EXPANSION.md`. Fixture authoring is Phase 2 (separately authorized). No adversarial benchmark fixtures exist yet.

**Status:** OPEN — fixture authoring not started. This is expected per Phase E spec.

---

### TC-004: Unit test coverage for engine and composer — unknown

**Finding:** The diagnosis engine (`diagnosis-engine.ts`) and output composer (`smbOutputComposer.ts`) are the most critical code paths. Unit test coverage for these files has not been confirmed in this audit.

**Risk:** Engine regression may not be caught until simulation tests run, which are slow.

**Required fix:** Confirm unit test existence and line coverage for diagnosis engine and composer. Minimum: input → output for 5 known input patterns per business condition category.

---

### TC-005: Integration tests for API endpoints — coverage unknown

**Finding:** API endpoints for `/api/owner/intake`, `/api/owner/diagnosis`, `/api/actions` have not had their test coverage confirmed in this audit.

**Risk:** Breaking API change not caught before deployment.

**Required fix:** Confirm integration test existence for all critical owner-mode API endpoints.

---

## 4. Security Audit

### SEC-001: Authorization on all owner-mode API routes — not confirmed

**Finding:** All protected owner-mode API routes must enforce authorization server-side (as required by CLAUDE.md). This audit has not confirmed that every route in `/api/owner/` and `/api/actions/` validates the requesting user's permission to access the requested business data.

**Risk:** A user could access another user's business diagnosis by guessing a business ID.

**Required fix:** Verify that every owner-mode API route validates: (1) user is authenticated, (2) user has permission to access the requested `businessId`, (3) no direct object reference vulnerability exists on `businessId` or `diagnosisId` parameters.

---

### SEC-002: No input sanitization audit for free-text fields

**Finding:** The owner intake form contains free-text input fields (business description, notes). These are stored and later rendered. No audit has confirmed XSS sanitization on render.

**Risk:** Stored XSS if input is rendered unsanitized in the dashboard.

**Required fix:** Confirm all free-text fields are rendered via React (auto-escaped) and not via `dangerouslySetInnerHTML`. Confirm backend sanitizes before storage.

---

### SEC-003: No rate limiting on diagnosis trigger

**Finding:** The diagnosis engine trigger endpoint has no confirmed rate limiting. A user could repeatedly trigger diagnosis runs consuming server resources.

**Required fix:** Rate limit diagnosis trigger to 10 per hour per business. Return 429 on excess.

---

## 5. Owner Workflow Audit (Summary Reference)

Full findings documented in `docs/OWNER_WORKFLOW_HOSTILE_AUDIT.md`. Summary:

| Category | P0 | P1 | P2 |
|----------|----|----|-----|
| Dead ends | 4 | 0 | 0 |
| Confusion points | 0 | 3 | 1 |
| Hidden dependencies | 2 | 1 | 0 |
| Missing guidance | 1 | 3 | 2 |
| Missing confidence | 1 | 2 | 1 |
| **Total** | **4** | **9** | **5** |

**P0 verdict:** 4 P0 dead ends prevent end-to-end workflow completion.

---

## 6. Mobile and UX Audit (Summary Reference)

Full findings documented in `docs/MOBILE_OWNER_MODE_AUDIT.md`. Summary:

| Category | P0 | P1 | P2 |
|----------|----|----|-----|
| One-hand usability | 1 | 2 | 0 |
| Network resilience | 1 | 2 | 0 |
| Outdoor / sunlight | 0 | 2 | 1 |
| Tablet | 0 | 1 | 1 |
| Above-fold critical info | 1 | 0 | 0 |
| Input usability | 0 | 0 | 2 |
| **Total** | **3** | **7** | **4** |

**P0 verdict:** NOT MOBILE-READY. 3 P0 findings unresolved.

---

## 7. Simulation and Benchmark Audit

### SIM-001: Corpus size — 60 cases — PASS

Phase D target of 60+ cases: ACHIEVED.

### SIM-002: Leakage check — all cases pass — PASS

All 60 simulation cases pass the leakage check (no must_identify phrase appears verbatim in the input_packet).

### SIM-003: Anti-tuning compliance — PASS

No scoring weights, thresholds, or engine logic was modified to accommodate simulation cases. Pass threshold remains 0.70.

### SIM-004: Holdout integrity — PASS (confirmed by prior audit)

SMB benchmark fixtures remain sealed. No modification to holdout expected outputs occurred.

---

## 8. Diagnosis Engine and Output Quality Audit

### ENG-001: Engine diagnoses from zero evidence — P0

**Finding:** (From Owner Input Module Hostile Audit, CS-002) The engine does not enter a BLOCKED state when evidence is insufficient. It produces a diagnosis from zero or minimal evidence.

**Risk:** False-confidence diagnosis presented to owner as authoritative.

### ENG-002: No assumed-input surfacing — P0

**Finding:** (From IQ-001, HA-001) Engine may synthesise assumed values for missing inputs without surfacing these assumptions to the owner.

**Risk:** Owner acts on a diagnosis that contains hidden assumptions.

### ENG-003: Output confidence tier not surfaced — P0

**Finding:** (From CS-001) Confidence score is not computed from input quality and completeness, and not surfaced anywhere in the owner-facing UI.

**Risk:** Owner cannot calibrate trust in diagnosis.

### ENG-004: Mandatory adaptive re-evaluation not confirmed — open

**Finding:** CLAUDE.md requires that every significant change (new evidence, KPI deterioration, failed implementation, shock event) triggers re-evaluation of BusinessConditionProfile, InterventionMode, InterventionPhase, and action priorities. Implementation of this adaptive trigger is not confirmed in this audit.

**Required fix:** Confirm adaptive re-evaluation trigger exists and is called on: evidence submission, action completion (outcome bad), critical event recorded.

---

## 9. Learning and Reassessment Controls Audit

### LC-001: Reassessment entry point missing from owner dashboard — P1

**Finding:** (From D-004 in Owner Workflow Audit) No visible link or UI element on the owner dashboard for initiating or viewing a reassessment.

### LC-002: Reassessment schedule not surfaced — P1

**Finding:** The command center does not show when the next reassessment is scheduled or what triggers it. The owner does not know if OpsIQ will re-evaluate their situation.

### LC-003: Outcome evidence linkage not confirmed

**Finding:** When an action is completed, it is not confirmed whether the outcome (success, partial, failure) is recorded as evidence and fed back into the next diagnosis cycle.

**Risk:** Actions completed but not feeding the learning loop. OpsIQ cannot improve its diagnosis over time for a given business.

**Required fix:** Action completion must prompt for outcome evidence: "How did this go? [Exceeded / Met / Below expectations]." The outcome must be stored as evidence and trigger adaptive re-evaluation.

---

## 10. Dashboard Data Requirements Audit (Summary Reference)

Full findings documented in `docs/OPSIQ_DASHBOARD_DATA_REQUIREMENTS.md`. Summary:

- 8 panels defined; API contracts specified for all 8
- `ReassessmentSchedule`, `OutcomeRecord`, `KPISnapshot` models need DB verification
- Freshness enforcement via `dataFreshnessWarnings` field defined but not confirmed implemented

---

## 11. Repository Completeness Summary

| Phase | Deliverable | Status |
|-------|-------------|--------|
| Phase A | 5 dashboard spec documents | COMPLETE |
| Phase B | Owner workflow hostile audit | COMPLETE |
| Phase C | Mobile owner mode audit | COMPLETE |
| Phase D | Simulation corpus 60 cases | COMPLETE |
| Phase E | Adversarial benchmark spec (10 classes) | COMPLETE |
| Phase F | External case library (100 cases) | COMPLETE |
| Phase G | Owner input module hostile audit | COMPLETE |
| Phase H | Final repository hostile audit | COMPLETE |
| Phase I | Repository readiness decision | PENDING |

---

## 12. Consolidated Finding Count

| Priority | Count | Blockers for Owner Readiness |
|----------|-------|------------------------------|
| P0 | 13 | Yes — all P0 block owner readiness |
| P1 | 22 | Yes — P1 findings materially degrade owner experience |
| P2 | 12 | No — polish issues |

**P0 findings:** ENG-001, ENG-002, ENG-003 (engine), IQ-001, IQ-004, IQ-005, CS-001, CS-002, HA-001 (input module), D-001, D-002, D-003, H-001 (workflow), NET-001, OH-001 (mobile)

---

## 13. Overall Hostile Audit Verdict

**NOT PRODUCTION-READY.**

The OpsIQ repository contains high-quality specification, simulation corpus, and benchmark infrastructure. The repository-side deliverables are complete. However:

1. **Engine produces diagnoses without confidence scoring or BLOCKED state** — direct patient harm risk
2. **Engine does not detect inconsistent or tax-inclusive financial inputs** — systematic error risk  
3. **Owner workflow has 4 P0 dead ends** — no owner can complete the workflow end-to-end
4. **Mobile experience has 3 P0 failures** — the target persona (on-site, one-hand, poor network) cannot use the product
5. **Authorization model not confirmed** — potential data access vulnerability

These are not cosmetic. They are structural readiness gaps that must be resolved before any real business owner uses the system.

---

*This document is part of the OPTION-A Phase H repository completion work.*
