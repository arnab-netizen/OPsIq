# P1 Forensic Inventory

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** CREDIBILITY HARDENING — Phase A  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Status:** INVENTORY ONLY — no code modified

---

## 1. Purpose

This document inventories every P1 finding from the three hostile audit documents:
- `docs/OWNER_INPUT_MODULE_HOSTILE_AUDIT.md`
- `docs/OWNER_WORKFLOW_HOSTILE_AUDIT.md`
- `docs/MOBILE_OWNER_MODE_AUDIT.md`
- `docs/FINAL_REPOSITORY_HOSTILE_AUDIT.md`

Cross-references P0 findings already resolved in Phase C remediation.

P0 findings already closed: D-001, D-002, D-003, H-001, IQ-004, IQ-005, OH-001, NET-001.

---

## 2. Classification Key

- **CONFIRMED** — defect is real and unresolved; must be fixed in Phase C
- **FALSE_POSITIVE** — audited code shows the concern does not exist
- **ALREADY_FIXED** — resolved in P0 Phase C or earlier (full or partial)
- **DUPLICATE** — captured by another finding in this inventory
- **NEEDS_INVESTIGATION** — cannot classify without code inspection

---

## 3. Input Module P1 Findings

### IQ-002: Evidence quality tier not assigned or displayed

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/domain/owner-intake/`, `src/app/(authenticated)/owner/intake/page.tsx`  
**Severity:** P1  
**Reproduction path:** Submit any intake upload → confirm → view command center → no quality tier badge visible on any evidence item  
**Risk:** Assumed or approximate data drives the same diagnostic weight as verified accounting-system data. Owner cannot distinguish Strong from Assumed evidence.  
**Status:** CONFIRMED

---

### IQ-003: No staleness detection on evidence items

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/domain/owner-intake/`, `src/domain/owner-finance/data-confidence.ts`  
**Severity:** P1  
**Reproduction path:** Submit evidence → wait (or backdated test) → observe same confidence score regardless of age  
**Risk:** 6-month-old data presented as current. Business condition may have changed. Diagnosis generated from stale evidence without warning.  
**Status:** NEEDS_INVESTIGATION — `data-confidence.ts` has `isStaleSnapshot()` function; need to confirm whether it is wired to evidence display or only to scoring  
**Note:** `calculateDataConfidence()` subtracts 15 for stale data, but staleness flag is not visually surfaced on command center or evidence items.

---

### IQ-006: Numeric field input not guided or bounded

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** Intake CSV spec; intake UI  
**Severity:** P1  
**Reproduction path:** Upload finance CSV with revenue value "1200" (ambiguous: $1,200 or $1.2M) → engine accepts without warning  
**Risk:** Orders-of-magnitude input errors produce completely wrong diagnoses.  
**Status:** CONFIRMED (partial — `parseNumber()` strips formatting but provides no guidance; no soft-limit warning; no unit label on fields)

---

### CS-003: Evidence coverage by domain not shown

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** Visit /owner command center → no panel or indicator shows which domains have evidence vs. which have none  
**Risk:** Owner does not know which domains OpsIQ can analyze. Trust in diagnosis gaps is not established.  
**Status:** CONFIRMED

---

### MI-001: Missing inputs not categorised by diagnosis impact

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`, `src/domain/owner-finance/data-confidence.ts`  
**Severity:** P1  
**Reproduction path:** Load /owner with partial data → see list of missing inputs → no CRITICAL/IMPORTANT/USEFUL classification  
**Risk:** Owner provides low-priority inputs first; high-priority missing inputs remain; diagnosis stays incomplete.  
**Status:** CONFIRMED — `missingCriticalData` is a flat string array with no priority classification

---

### MI-002: Missing input prompts not domain-specific

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** View missing data list on /owner → messages are generic ("missing critical data") rather than diagnosis-specific  
**Risk:** Owner does not understand what specific data is needed or why.  
**Status:** CONFIRMED

---

### HA-002: Missing inputs not validated against evidence gaps

**Source:** OWNER_INPUT_MODULE_HOSTILE_AUDIT.md  
**Affected module:** `src/services/consulting-engine/diagnosis-engine.ts`, `src/domain/owner-intake/`  
**Severity:** P1  
**Reproduction path:** Submit partial evidence → trigger diagnosis → review what missing inputs were flagged vs. what the engine actually used  
**Risk:** Engine silently proceeds on absent evidence without generating a `missing_inputs` request list against a known-required-evidence registry.  
**Status:** NEEDS_INVESTIGATION — engine has `matchedPatterns` logic; unknown whether it generates a structured missing-inputs list per required field

---

## 4. Owner Workflow P1 Findings

### WF-D004: Reassessment entry point missing from owner dashboard

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (D-004)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** Visit /owner command center → no "Schedule Reassessment" button, no reassessment panel, no "next reassessment" date shown  
**Risk:** Reassessment is a core OpsIQ lifecycle event. Without an entry point, reassessment never happens. Owner has no path to updated diagnosis after initial one.  
**Status:** CONFIRMED

---

### WF-C001: Two overlapping owner home pages

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (C-001)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`, `src/app/(authenticated)/owner/home/page.tsx`  
**Severity:** P1  
**Reproduction path:** Navigate to /owner then /owner/home — both show similar risk scores, action lists, domain links with different layouts and overlapping content  
**Risk:** Owner confusion. Navigation is unclear. Trust in data is undermined when the same information appears differently in two places.  
**Status:** NEEDS_INVESTIGATION — need to read /owner/home/page.tsx to confirm duplication extent

---

### WF-C002: Navigation bar overwhelm

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (C-002)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** Visit /owner — 12 navigation buttons in the top bar (now with flex-wrap from P0 fix), no pre-selected recommended domain  
**Risk:** Owner cognitive overload. Stressed owner defaults to no action. No domain is highlighted as recommended.  
**Status:** CONFIRMED (partially improved by flex-wrap P0 fix but the 12-button bar still creates overwhelm; no pre-selected recommended domain)

---

### WF-C003: Risk score without trend or driver context

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (C-003)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** View /owner command center → health score "67/100" shown as badge only, no trend direction, no "primary driver" sentence  
**Risk:** Owner cannot interpret the score. Cannot identify what changed it or what would improve it. Trust is not established.  
**Status:** CONFIRMED

---

### WF-C004: No structured no-data states per domain panel

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (C-004)  
**Affected module:** Owner domain pages (`/owner/finance`, `/owner/cashflow`, `/owner/sales`, etc.)  
**Severity:** P1  
**Reproduction path:** Visit any domain page with no data submitted → blank or empty section with no "we need X to show this" message  
**Risk:** Owner concludes the feature is broken.  
**Status:** NEEDS_INVESTIGATION — need to check individual domain pages for no-data handling

---

### WF-H002: Empty action queue — no explanation

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (H-002)  
**Affected module:** `/owner/page.tsx`, `/owner/home/page.tsx`, `/dashboard/inbox`  
**Severity:** P1  
**Reproduction path:** View /owner with no active diagnosis → action queue section empty, no explanation of why or what would populate it  
**Risk:** Owner concludes OpsIQ is broken; abandons before completing intake.  
**Status:** NEEDS_INVESTIGATION — need to confirm action queue empty-state rendering

---

### WF-H003: Multi-business — no prominent business identifier

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (H-003)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** Load /owner with multiple businesses → business dropdown selector present but business name not shown prominently above fold  
**Risk:** Owner acts on data for the wrong business.  
**Status:** NEEDS_INVESTIGATION — business selector exists but prominence/positioning unclear

---

### WF-G001: No "because" statement on recommended actions

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (G-001)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`, diagnosis composer output  
**Severity:** P1  
**Reproduction path:** View recommended next action → action shows verb + description, no "Because: [evidence]" statement  
**Risk:** Owner does not understand why OpsIQ recommends the action. Compliance drops. Trust is not established.  
**Status:** CONFIRMED

---

### WF-G003: No priority intake guidance on intake page

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (G-003)  
**Affected module:** `src/app/(authenticated)/owner/intake/page.tsx`  
**Severity:** P1  
**Reproduction path:** Visit /owner/intake — page shows all domains equally, no "most important to provide right now" guidance based on current diagnosis state  
**Risk:** Owner provides lowest-priority domain data first; diagnosis stays incomplete.  
**Status:** CONFIRMED (intake page shows all domains equally without priority ranking)

---

### WF-CI001: Confidence score not visible across workflow

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (CI-001)  
**Affected module:** All owner pages  
**Severity:** P1  
**Reproduction path:** Navigate through signup → intake → /owner → domain pages → confidence score only appears as one badge on /owner, not on actions or domain pages  
**Risk:** Owner cannot calibrate trust in individual domain diagnoses or action recommendations.  
**Status:** ALREADY_FIXED (partial) — badge exists on /owner command center; not surfaced on domain pages or action items

---

### WF-CI003: Evidence link missing from every action

**Source:** OWNER_WORKFLOW_HOSTILE_AUDIT.md (CI-003)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`, action rendering  
**Severity:** P1  
**Reproduction path:** View recommended action → no "Based on: [evidence]" link or reference  
**Risk:** Owner cannot verify that the action is evidence-based, not a guess.  
**Status:** CONFIRMED

---

## 5. Mobile P1 Findings

### MOB-NET002: No fetch timeout on non-command-center owner pages

**Source:** MOBILE_OWNER_MODE_AUDIT.md (NET-002)  
**Affected module:** All owner domain pages (finance, sales, cashflow, operations, etc.)  
**Severity:** P1  
**Reproduction path:** Visit /owner/finance on a slow network → page hangs indefinitely (no timeout)  
**Risk:** Owner on vessel/job site with poor connection sees indefinite loading state on domain pages.  
**Status:** ALREADY_FIXED (partial) — /owner command center page has 10s timeout (P0 fix NET-001); domain pages do not

---

### MOB-NET003: No progressive loading (single large payload)

**Source:** MOBILE_OWNER_MODE_AUDIT.md (NET-003)  
**Affected module:** `/api/owner/command-center`, `/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** Load /owner on slow mobile → entire payload loads as one request; critical action not visible until full load  
**Risk:** Owner with slow connection must wait for full payload before seeing any content.  
**Status:** CONFIRMED

---

### MOB-SUN001: No dark mode

**Source:** MOBILE_OWNER_MODE_AUDIT.md (SUN-001)  
**Affected module:** Global CSS / Tailwind config  
**Severity:** P1  
**Reproduction path:** Enable OS dark mode on mobile → OpsIQ renders in light mode; glare issue outdoors  
**Risk:** Readability failure for outdoor use (job site, construction, marine).  
**Status:** NEEDS_INVESTIGATION — CSS variable system may support dark mode but implementation not confirmed

---

### MOB-SUN002: Muted text contrast failure outdoors

**Source:** MOBILE_OWNER_MODE_AUDIT.md (SUN-002)  
**Affected module:** All owner pages using `text-muted-foreground`  
**Severity:** P1  
**Reproduction path:** Inspect diagnosis secondary text and label text for WCAG 4.5:1 contrast ratio; likely to fail in bright light  
**Risk:** Key diagnostic information (labels, secondary scores) unreadable on outdoor screens.  
**Status:** NEEDS_INVESTIGATION — requires contrast audit against Tailwind CSS variable values

---

### MOB-OH002: Business switcher dropdown below 44px

**Source:** MOBILE_OWNER_MODE_AUDIT.md (OH-002)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx` Select component  
**Severity:** P1  
**Reproduction path:** View /owner on 375px — business selector Select component likely renders at h-9 (36px), below 44px touch target  
**Risk:** Owner cannot reliably open business selector with one thumb.  
**Status:** NEEDS_INVESTIGATION — depends on Select component's default height

---

### MOB-OH003: Action queue items — text-only tap target

**Source:** MOBILE_OWNER_MODE_AUDIT.md (OH-003)  
**Affected module:** `/dashboard/inbox`, action list rendering  
**Severity:** P1  
**Reproduction path:** View action list on 375px — if list items use text-only links (not full-row tap targets), mis-taps will occur  
**Risk:** Owner cannot reliably select the correct action item under stress/one-hand.  
**Status:** NEEDS_INVESTIGATION — need to inspect inbox/action list rendering

---

### MOB-TAB001: No two-column layout on tablet

**Source:** MOBILE_OWNER_MODE_AUDIT.md (TAB-001)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** View /owner on 768px tablet — single-column layout wastes screen real estate  
**Risk:** Tablet owners see a sub-optimal layout; critical action not alongside diagnosis.  
**Status:** CONFIRMED — `max-w-5xl` single-column layout applies at all viewports

---

## 6. Final Repository Audit P1 Findings (Architecture / Security / Testing)

### ARCH-001: Business logic in UI components

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`, `src/app/(authenticated)/owner/home/page.tsx`  
**Severity:** P1  
**Reproduction path:** Read /owner/page.tsx — data transformation inline; no dedicated service function  
**Risk:** Business rule mutations are untestable when embedded in React components. Any rule change requires UI change.  
**Status:** NEEDS_INVESTIGATION — extent of business logic in pages requires code audit

---

### ARCH-003: Audit event emission incomplete

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md  
**Affected module:** All write paths (evidence submission, diagnosis, action completion, lifecycle stage)  
**Severity:** P1  
**Reproduction path:** Trigger any write mutation → check whether an audit event is emitted  
**Risk:** Platform cannot reconstruct what happened when a diagnosis was wrong or an action was harmful. No forensic trail.  
**Status:** NEEDS_INVESTIGATION — requires audit of all mutation paths

---

### SEC-001: Authorization not confirmed on owner-mode API routes

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md  
**Affected module:** `src/app/api/owner/`, `src/app/api/actions/`  
**Severity:** P1 (risks auto-escalation to P0 under Credibility Rule #10 — Outcome tracking falsifiable if business IDs are guessable)  
**Reproduction path:** Send request to `/api/owner/command-center?businessId=<other_user_business_id>` — if successful, data is leaked  
**Risk:** User accesses another user's business diagnosis by guessing business ID. Direct object reference vulnerability.  
**Status:** NEEDS_INVESTIGATION — authorization implementation requires code audit

---

### SEC-002: XSS — no sanitization audit on free-text fields

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md  
**Affected module:** Intake form free-text fields; rendering on dashboard  
**Severity:** P1  
**Reproduction path:** Submit business description with `<script>alert(1)</script>` → observe rendered output on command center  
**Risk:** Stored XSS if free-text is rendered unsanitized.  
**Status:** NEEDS_INVESTIGATION — React auto-escapes most things but dangerouslySetInnerHTML usage must be confirmed absent

---

### SEC-003: No rate limiting on diagnosis trigger

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md  
**Affected module:** `/api/owner/diagnosis` trigger endpoint  
**Severity:** P1  
**Reproduction path:** Repeatedly POST to diagnosis trigger endpoint — no 429 response  
**Risk:** Resource exhaustion attack; artificially high diagnosis cost.  
**Status:** NEEDS_INVESTIGATION — rate limiting implementation unknown

---

### FRA-ENG004: Mandatory adaptive re-evaluation not confirmed

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md (ENG-004)  
**Affected module:** `src/services/consulting-engine/`, diagnosis trigger  
**Severity:** P1  
**Reproduction path:** Submit new critical evidence → observe whether BusinessConditionProfile, InterventionMode, action priorities are re-evaluated  
**Risk:** CLAUDE.md requires adaptive re-evaluation on all significant changes. Without it, diagnosis is static after first run.  
**Status:** NEEDS_INVESTIGATION

---

### FRA-LC002: Reassessment schedule not surfaced to owner

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md (LC-002)  
**Affected module:** `src/app/(authenticated)/owner/page.tsx`  
**Severity:** P1  
**Reproduction path:** View /owner — no "next reassessment scheduled for [date]" panel or indicator  
**Risk:** Owner does not know if OpsIQ will re-evaluate their situation. Trust gap.  
**Status:** CONFIRMED

---

### FRA-LC003: Outcome evidence linkage not confirmed

**Source:** FINAL_REPOSITORY_HOSTILE_AUDIT.md (LC-003)  
**Affected module:** Action completion flow; evidence store  
**Severity:** P1  
**Reproduction path:** Mark an action as complete → observe whether outcome (success/fail) is recorded as evidence and triggers diagnosis re-evaluation  
**Risk:** Actions completed but not feeding the learning loop. OpsIQ cannot improve diagnosis over time.  
**Status:** NEEDS_INVESTIGATION

---

## 7. Deduplicated P1 Finding List

| ID | Source | Summary | Status |
|----|--------|---------|--------|
| IQ-002 | Input Module | Evidence quality tier not shown | CONFIRMED |
| IQ-003 | Input Module | Staleness flag not displayed | NEEDS_INVESTIGATION |
| IQ-006 | Input Module | Numeric field guidance missing | CONFIRMED |
| CS-003 | Input Module | Domain evidence coverage not shown | CONFIRMED |
| MI-001 | Input Module | Missing inputs not prioritised | CONFIRMED |
| MI-002 | Input Module | Missing input prompts not specific | CONFIRMED |
| HA-002 | Input Module | No evidence gap registry | NEEDS_INVESTIGATION |
| WF-D004 | Workflow | No reassessment entry point | CONFIRMED |
| WF-C001 | Workflow | Two overlapping home pages | NEEDS_INVESTIGATION |
| WF-C002 | Workflow | 12-button nav overwhelm | CONFIRMED |
| WF-C003 | Workflow | Risk score no context | CONFIRMED |
| WF-C004 | Workflow | No-data states per panel | NEEDS_INVESTIGATION |
| WF-H002 | Workflow | Empty action queue no explanation | NEEDS_INVESTIGATION |
| WF-H003 | Workflow | Multi-business no prominent ID | NEEDS_INVESTIGATION |
| WF-G001 | Workflow | No "because" on actions | CONFIRMED |
| WF-G003 | Workflow | No priority intake guidance | CONFIRMED |
| WF-CI001 | Workflow | Confidence score partial | ALREADY_FIXED (partial) |
| WF-CI003 | Workflow | No evidence link on actions | CONFIRMED |
| MOB-NET002 | Mobile | Timeout only on /owner, not domains | ALREADY_FIXED (partial) |
| MOB-NET003 | Mobile | No progressive loading | CONFIRMED |
| MOB-SUN001 | Mobile | No dark mode | NEEDS_INVESTIGATION |
| MOB-SUN002 | Mobile | Muted text contrast | NEEDS_INVESTIGATION |
| MOB-OH002 | Mobile | Select below 44px | NEEDS_INVESTIGATION |
| MOB-OH003 | Mobile | Action list text-only tap area | NEEDS_INVESTIGATION |
| MOB-TAB001 | Mobile | No tablet two-column layout | CONFIRMED |
| ARCH-001 | Final Audit | Business logic in UI | NEEDS_INVESTIGATION |
| ARCH-003 | Final Audit | Audit events incomplete | NEEDS_INVESTIGATION |
| SEC-001 | Final Audit | Authorization not confirmed | NEEDS_INVESTIGATION |
| SEC-002 | Final Audit | XSS risk on free-text | NEEDS_INVESTIGATION |
| SEC-003 | Final Audit | No rate limiting | NEEDS_INVESTIGATION |
| FRA-ENG004 | Final Audit | Adaptive re-eval not confirmed | NEEDS_INVESTIGATION |
| FRA-LC002 | Final Audit | Reassessment schedule not shown | CONFIRMED |
| FRA-LC003 | Final Audit | Outcome evidence not linked | NEEDS_INVESTIGATION |

**Excluded (resolved in P0 Phase C):** D-001, D-002, D-003, H-001, IQ-004, IQ-005, OH-001, NET-001  
**Excluded (P0 FALSE_POSITIVE):** ENG-001, CS-002  
**Excluded (P0 DEFERRED):** ENG-002  
**Excluded (DUPLICATE):** CS-001 (=IQ-001, ALREADY_FIXED partial), LC-001 (=WF-D004), TC-003 (future phase), TC-004 (investigation needed), TC-005 (investigation needed), ARCH-002 (scope of investigation)

---

## 8. Count Summary

| Category | Count |
|----------|-------|
| CONFIRMED | 16 |
| ALREADY_FIXED (partial) | 2 |
| NEEDS_INVESTIGATION | 15 |
| Total in inventory | 33 |

---

## 9. Priority Order for Phase C Remediation

Grouped by the Credibility Hardening program's five pillars:

**Credibility / Trust:**
1. SEC-001 — Authorization on owner API routes (data breach risk)
2. WF-G001 — "Because" statement on actions (trust in recommendations)
3. WF-CI003 — Evidence link on actions (verifiability)
4. WF-C003 — Risk score with trend and driver (interpretability)

**Evidence Hardening:**
5. IQ-002 — Evidence quality tiers
6. IQ-003 — Staleness flag (after investigation)
7. CS-003 — Domain evidence coverage panel

**Confidence Hardening:**
8. MI-001 — Missing inputs by priority
9. MI-002 — Missing input prompts specificity
10. WF-CI001 — Confidence score on domain pages (extend partial fix)

**Fail-Closed / Missing Input:**
11. HA-002 — Evidence gap registry (after investigation)
12. FRA-ENG004 — Adaptive re-evaluation (after investigation)

**Owner Trust / Workflow:**
13. WF-D004 — Reassessment entry point
14. FRA-LC002 — Reassessment schedule display
15. FRA-LC003 — Outcome evidence linkage (after investigation)

**UX / Mobile:**
16. IQ-006 — Numeric field guidance
17. WF-C002 — Nav bar (pre-selected recommended domain)
18. MOB-NET003 — Progressive loading
19. MOB-TAB001 — Tablet layout
20. WF-C004 — Structured no-data states
21. WF-H002 — Empty action queue explanation

---

*Phase A complete. No code was modified. Phase B (P1 Validation) ready to begin.*
