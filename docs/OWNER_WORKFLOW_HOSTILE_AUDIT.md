# Owner Workflow Hostile Audit

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase B  
**Status:** AUDIT — findings require resolution before owner workflow is production-ready  

---

## 1. Scope

This document is a hostile audit of the complete OpsIQ owner workflow from first contact (signup) through ongoing reassessment. The audit maps every step a business owner takes, identifies dead ends, confusion points, hidden dependencies, missing guidance, missing confidence indicators, and recommends fixes.

---

## 2. Workflow Map

The full owner journey as currently implemented:

```
/signup
  → POST /api/auth/signup
  → redirect to /dashboard              ← DEAD END (see D-001)

/onboarding (manual navigation required)
  → step: workspace
  → step: team
  → step: complete
  → redirect to /dashboard              ← DEAD END (see D-001)

/owner/intake
  → Data input (CSV, manual, Google Sheets, etc.)
  → Domain targeting (finance, sales, operations, etc.)
  → Validation feedback

/owner (Command Center)
  → Diagnosis summary
  → Recommended next action
  → Domain links

/owner/home
  → Risk-first summary
  → Action list by severity

/dashboard/inbox
  → Decision queue

/dashboard/impact
  → Outcome metrics

/owner/[domain]   (finance, sales, operations, cashflow, marketing, strategy, recovery)
  → Domain-specific diagnosis and actions
```

---

## 3. Dead Ends

### D-001: Signup redirects to `/dashboard`, not `/onboarding`

**Location:** `src/app/signup/page.tsx` line ~40: `router.push("/dashboard")`

**Problem:** After creating an account, the owner is sent to `/dashboard` — the operator decision dashboard, not the owner onboarding flow. The owner has no business registered, no diagnosis, no context. The dashboard shows nothing useful.

**Expected behavior:** After signup, route to `/onboarding` or to a dedicated owner-setup flow.

**Risk:** Owner abandons during first session because they see an empty dashboard with no guidance.

---

### D-002: Onboarding completes but does not route to owner intake

**Location:** `src/app/onboarding/page.tsx` — onboarding step "complete" has no explicit redirect to `/owner/intake`

**Problem:** After workspace creation + team setup, the owner has a workspace but no business data entered. There is no automatic transition to the intake flow.

**Expected behavior:** Onboarding "complete" step must provide a single CTA that routes to `/owner/intake` with the explanation: "Now let's enter your business data so OpsIQ can analyze your situation."

---

### D-003: Owner intake does not route to diagnosis

**Location:** `/owner/intake` — after data submission, no clear next step

**Problem:** After submitting intake data, the owner does not know whether a diagnosis has been triggered, when to expect it, or where to go next.

**Expected behavior:** After intake submission, route to `/owner` (command center) with a loading state that shows: "OpsIQ is analyzing your data…" with estimated completion time.

---

### D-004: Reassessment has no entry point from owner dashboard

**Finding:** The owner dashboard has no visible link or UI element for initiating or viewing a reassessment. Reassessment is a core OpsIQ lifecycle event.

**Expected behavior:** Reassessment panel on `/owner` must include a "Schedule Reassessment" button and a "What triggers reassessment?" explainer.

---

## 4. Confusion Points

### C-001: Two separate "home" pages for owners

**Finding:** There are two owner home pages: `/owner` (Command Center) and `/owner/home`. They contain overlapping information (risk scores, next actions, domain links) but with different layouts and data shapes.

**Impact:** Owner does not know which page is the primary surface. Navigation is confusing.

**Fix:** Consolidate to one primary owner surface at `/owner`. The `/owner/home` page should either be removed or replaced with a redirect.

---

### C-002: Navigation bar overwhelm

**Finding:** The `/owner` page navigation bar contains 7+ destination buttons (Home, Finance, Cashflow, Sales, Operations, Execution, Marketing). A stressed owner sees 7 options and does not know which is relevant to them.

**Impact:** Cognitive overload. Owner defaults to no action.

**Fix:** Replace domain navigation bar with a single "Go to Domain" dropdown. The recommended domain (based on current diagnosis) should be pre-selected.

---

### C-003: Risk score without context

**Finding:** Risk and health scores are displayed as numbers with color badges (e.g., badge value "67", color warning). No explanation of what the score means, what changed it, or what would improve it.

**Impact:** Owner cannot interpret the score. Trust in OpsIQ is not established.

**Fix:** Each score must include: current value, trend arrow (up/down/flat), primary driver in one sentence.

---

### C-004: "No data" state is invisible

**Finding:** When a domain (e.g., cashflow) has insufficient data, the page renders an empty section with no explanation. The owner sees blank space, not a clear "we need more data from you" message.

**Impact:** Owner concludes the feature is broken.

**Fix:** Every panel with no data must render a structured no-data state: "We need [X] to show this. [CTA to provide it]."

---

### C-005: Owner intake validation errors are not actionable

**Finding:** When intake data fails validation, the error message states the validation rule (e.g., "Workspace name and slug are required") but does not highlight which field failed or where to fix it.

**Impact:** Owner must hunt for the error.

**Fix:** Inline field-level validation errors adjacent to the relevant input field.

---

## 5. Hidden Dependencies

### H-001: Diagnosis depends on intake; intake entry point is not surfaced post-onboarding

**Finding:** OpsIQ's diagnosis requires business data from `/owner/intake`. However, after onboarding, there is no visible prompt or link to intake. The owner must know to navigate there.

**Impact:** Owners skip intake; diagnosis never runs; command center shows empty state indefinitely.

**Fix:** If business data count = 0, every owner page must show a top-level banner: "Your diagnosis requires business data. [Complete intake →]"

---

### H-002: Action queue depends on active diagnosis; diagnosis status is not shown

**Finding:** If no diagnosis is active, the action queue is empty. There is no message explaining why the queue is empty or what would populate it.

**Impact:** Owner concludes OpsIQ is broken.

**Fix:** Empty action queue state must display: "Your action queue will populate after OpsIQ completes its diagnosis. Diagnosis requires [X] inputs." with a direct CTA.

---

### H-003: Multi-business owners must navigate business switcher before any data is shown

**Finding:** The command center loads data for `selectedBusinessId`. If the owner has multiple businesses and arrives without a businessId query param, the page loads the default business without indicating this. Other businesses are hidden in a dropdown.

**Impact:** Owner may act on data for the wrong business.

**Fix:** When multiple businesses exist, display a prominent business name header and a switcher. Show the name above the fold before any diagnostic data.

---

## 6. Missing Guidance

### G-001: No explanation of what OpsIQ is doing at any stage

**Finding:** At no point in the workflow does OpsIQ explain: what it has analyzed, what it decided, and why. The owner receives conclusions without reasoning.

**Impact:** Owner does not understand why OpsIQ recommends a specific action. Compliance drops.

**Fix:** Every recommended action must include a 1-sentence "because" statement: "We recommend X because your evidence shows Y."

---

### G-002: No explanation of the consulting lifecycle stage

**Finding:** If the term "Triage" or "Stabilize" appears anywhere in the UI, it is not explained. A small business owner does not know what these terms mean.

**Fix:** Lifecycle stage labels must include a tooltip or inline explanation: "Triage: OpsIQ is gathering information to understand your situation. This phase typically lasts 2 weeks."

---

### G-003: No guidance on what evidence to provide next

**Finding:** The intake page allows many data source types (CSV, manual, Google Sheets, etc.) but does not guide the owner on priority: which data source, for which domain, matters most for their current diagnosis.

**Fix:** The intake page must surface: "Based on your current situation, the most important data to provide is [X] for [domain]."

---

### G-004: No "what happens next" after any action is completed

**Finding:** When an owner marks an action as complete, there is no confirmation of what happens next (e.g., "OpsIQ will check your outcomes in 7 days" or "Your reassessment has been updated").

**Fix:** Action completion must trigger a confirmation message with the next expected event.

---

## 7. Missing Confidence Indicators

### CI-001: No confidence score anywhere in the workflow

**Finding:** At no point in the signup → intake → command center → action workflow does the owner see a confidence score or indicator.

**Fix:** Confidence score must appear on the command center, on each action, and on each domain page. Low confidence must prompt the owner to fill in missing data.

---

### CI-002: No indication of evidence quality

**Finding:** Evidence items submitted by the owner have no quality feedback. If the owner enters approximate figures, OpsIQ treats them identically to verified data.

**Fix:** Each evidence item must display a quality tier (Strong / Moderate / Weak / Assumed) based on source type. Assumed data must be visually distinguished.

---

### CI-003: No reassurance that actions are evidence-based

**Finding:** Recommended actions appear without a link to the evidence that generated them. The owner cannot verify that OpsIQ is not guessing.

**Fix:** Every action must include: "Based on: [evidence item summary]" as a linked reference.

---

## 8. Fixes Summary and Priority

| ID | Type | Priority | Fix Description |
|----|------|----------|----------------|
| D-001 | Dead end | P0 | Signup → redirect to /onboarding |
| D-002 | Dead end | P0 | Onboarding complete → CTA to /owner/intake |
| D-003 | Dead end | P0 | Intake complete → route to /owner with loading state |
| D-004 | Dead end | P1 | Reassessment entry point in dashboard |
| C-001 | Confusion | P1 | Consolidate /owner and /owner/home |
| C-002 | Confusion | P1 | Replace domain nav bar with dropdown |
| C-003 | Confusion | P1 | Risk score with trend and driver |
| C-004 | Confusion | P1 | Structured no-data states per panel |
| C-005 | Confusion | P2 | Inline field-level validation errors |
| H-001 | Hidden dep | P0 | Banner when intake data = 0 |
| H-002 | Hidden dep | P1 | Empty action queue explanation |
| H-003 | Hidden dep | P1 | Multi-business header and switcher |
| G-001 | Missing guidance | P1 | "Because" statement on every action |
| G-002 | Missing guidance | P2 | Lifecycle stage explanations |
| G-003 | Missing guidance | P1 | Priority intake guidance |
| G-004 | Missing guidance | P2 | Post-action-completion confirmation |
| CI-001 | Missing confidence | P1 | Confidence score across workflow |
| CI-002 | Missing confidence | P2 | Evidence quality tier display |
| CI-003 | Missing confidence | P1 | Evidence link on every action |

**P0 count:** 4  
**P1 count:** 9  
**P2 count:** 5  

**Verdict:** The owner workflow has 4 P0 dead ends that prevent the core workflow from completing end-to-end. These must be resolved before any owner uses the system.

---

*This document is part of the OPTION-A Phase B repository completion work.*
