# OPSIQ REAL BUSINESS CAPABILITY AUDIT

## Objective

Audit whether the current OpsIQ build can actually support the founder’s immediate goal:

Use OpsIQ on real existing businesses to diagnose problems, give credible advice, create realistic recovery plans, assign and track execution, verify results, and only later support public subscription sales.

This is not a Product Hunt polish audit.
This is not a UI-only audit.
This is not a theoretical product vision audit.
This is not a “does the code compile” audit.

This is a hostile, evidence-only capability audit.

---

## Hard Rules

1. Do not guess.
2. Do not assume intended behaviour.
3. Do not infer missing behaviour from names, comments, roadmap files, README claims, or marketing copy.
4. Do not mark a capability as present unless code, schema, route, UI, test, or production-verifiable flow proves it.
5. Do not rely on README claims, marketing copy, comments, or roadmap text as proof.
6. If something exists only as placeholder, mock, demo-only logic, seed-only data, hardcoded content, or static UI, mark it as NOT PROVEN or FAILED.
7. If a feature exists in backend but is not reachable from UI, mark it as PARTIAL.
8. If a feature exists in UI but does not persist, process, or verify real data, mark it as PARTIAL or NOT PROVEN.
9. If a capability depends on manual user input, state exactly what input is required and whether the product validates it.
10. If advice is generated without evidence, confidence, assumptions, financial basis, and verification metric, mark it as NOT CREDIBLE.
11. If the system cannot distinguish real business data from demo, fake, default, or seed data, mark the affected capability as FAILED.
12. Every finding must include exact file paths, function names, route names, table/model names, test names, and command evidence where available.
13. Do not modify application code.
14. Do not modify tests.
15. Do not modify workflows.
16. Do not create migrations.
17. Do not fix defects during this audit.
18. Produce an audit report only.
19. If command execution is blocked by missing environment, database, secrets, Docker, network, or provider credentials, report it explicitly.
20. Do not hide failed commands.

---

## Audit Scope

Audit the full chain from real business data intake to credible business recovery execution:

1. Real business data intake
2. Data validation
3. Persistence schema
4. Business metric calculation
5. Diagnosis generation
6. Evidence-backed findings
7. Recommendation and advice quality
8. Recovery/action plan generation
9. Priority ranking
10. Owner/operator assignment
11. Execution tracking
12. Outcome verification
13. Dashboard reflection
14. Learning loop / next-cycle decision
15. Suitability for founder’s own businesses
16. Suitability for paid subscription customers

---

## Required Output File

Produce this file:

OPSIQ_REAL_BUSINESS_CAPABILITY_AUDIT_REPORT.md

Use this exact structure:

# OpsIQ Real Business Capability Audit Report

## Executive Verdict

Status: PROVEN / PARTIAL / NOT PROVEN / FAILED

One-paragraph blunt verdict.

## Capability Matrix

| # | Capability | Status | Evidence | Missing / Risk | Required Fix |
|---|------------|--------|----------|----------------|--------------|
| 1 | Real business data intake |  |  |  |  |
| 2 | Data validation |  |  |  |  |
| 3 | Persistence schema |  |  |  |  |
| 4 | Business metric calculation |  |  |  |  |
| 5 | Diagnosis generation |  |  |  |  |
| 6 | Evidence-backed findings |  |  |  |  |
| 7 | Recommendation / advice credibility |  |  |  |  |
| 8 | Recovery plan generation |  |  |  |  |
| 9 | Priority ranking |  |  |  |  |
| 10 | Assignment and accountability |  |  |  |  |
| 11 | Execution tracking |  |  |  |  |
| 12 | Outcome verification |  |  |  |  |
| 13 | Dashboard reflection |  |  |  |  |
| 14 | Closed-loop improvement |  |  |  |  |
| 15 | Founder business use-readiness |  |  |  |  |
| 16 | Subscription customer readiness |  |  |  |  |

## Full Findings

### 1. Real Business Data Intake

### 2. Data Validation

### 3. Persistence Schema

### 4. Business Metric Calculation

### 5. Diagnosis Generation

### 6. Evidence-Backed Findings

### 7. Recommendation / Advice Credibility

### 8. Recovery Plan Generation

### 9. Priority Ranking

### 10. Assignment and Accountability

### 11. Execution Tracking

### 12. Outcome Verification

### 13. Dashboard Reflection

### 14. Closed-Loop Improvement

### 15. Founder Business Use-Readiness

### 16. Subscription Customer Readiness

## Blocking Gaps

## Partial Capabilities

## Proven Capabilities

## False / Overstated Claims Found

## Data Required for Real Tumbledry / Laundry Use

## Minimum Fix List Before Founder Can Use It Seriously

## Minimum Fix List Before Public Subscription

## Commands Run

## Failed / Blocked Commands

## Final Go / No-Go Verdict

---

## Status Definitions

Use only these statuses.

### PROVEN

The repo proves the capability works end-to-end with real persisted data, reachable UI/API flow, validation, tests, and no demo-only dependency.

### PARTIAL

Some pieces exist, but the flow is incomplete, unverified, unreachable, weakly validated, not end-to-end, or dependent on manual/developer-only steps.

### NOT PROVEN

Claims, names, files, intentions, or partial stubs exist, but repo evidence does not prove the capability.

### FAILED

Implementation exists but is broken, misleading, fake, unsafe, demo-only, hardcoded, static-only, or produces unreliable output.

---

## Detailed Audit Requirements

### 1. Real Business Data Intake

Check whether OpsIQ can accept real business data from a user or business.

Inspect:

- UI forms
- onboarding flows
- diagnosis inputs
- business profile inputs
- APIs
- upload/import flows
- connectors
- manual entry paths
- seed/demo data separation

Determine whether the system can accept, at minimum:

- daily revenue
- order count
- customer count
- repeat customer count
- new customer count
- average order value
- gross margin
- net profit
- staff cost
- rent
- utilities
- delivery cost
- chemical/material cost
- marketing spend
- complaints
- refunds/rewashes
- unpaid receivables
- B2B revenue
- B2C revenue
- order turnaround time
- staff productivity
- campaign activity
- campaign conversion
- customer retention/churn indicators

For each item, report:

- supported / not supported / unclear
- source file
- DB field/model if any
- validation if any
- UI availability if any
- API route if any

Mark NOT PROVEN if the product only accepts vague text and not measurable business data.

Mark FAILED if fake/demo/default data can be confused with real business data.

---

### 2. Data Validation

Check whether input data is validated for:

- type
- required fields
- min/max ranges
- impossible values
- missing values
- stale values
- currency assumptions
- time period assumptions
- duplicate submissions
- workspace ownership
- role permission
- demo vs real data separation

Mark FAILED if the system accepts business inputs that can produce misleading diagnosis without validation.

Report exact validation library, schema, function, and route evidence.

---

### 3. Persistence Schema

Inspect:

- Prisma schema
- migrations
- seed files
- service layer
- API routes
- repository/data-access code
- tests

Answer:

- Where is business intake data stored?
- Are metrics normalized or dumped as JSON?
- Are actions stored?
- Are findings stored?
- Are recommendations stored?
- Is evidence stored?
- Are advice assumptions stored?
- Are confidence scores stored?
- Are verification metrics stored?
- Are before/after measurements stored?
- Is actual outcome stored?
- Is responsible owner/operator stored?
- Is status history stored?
- Can the system compare cycles over time?
- Is workspace isolation enforced?
- Is real data separated from demo data?

Provide exact model/table evidence.

---

### 4. Business Metric Calculation

Check whether OpsIQ calculates real business metrics or only displays provided values.

Audit for:

- revenue trend
- gross margin
- net margin
- order volume trend
- repeat rate
- customer acquisition
- churn/dormancy
- B2B vs B2C profitability
- campaign ROI
- staff productivity
- cost leakage
- discount leakage
- receivables exposure
- complaint/refund rate
- turnaround performance
- cashflow pressure

For each metric, report:

- exact code path
- formula if implemented
- tests if any
- missing dependencies
- whether formula is credible
- whether formula uses persisted real data

Mark NOT PROVEN if the metric is mentioned in UI/copy but not calculated from persisted real data.

Mark FAILED if the metric is hardcoded, fake, demo-only, or misleading.

---

### 5. Diagnosis Generation

Find the diagnosis engine.

Audit:

- input source
- required data
- algorithm / rule engine / LLM / static template
- evidence used
- scoring model
- confidence handling
- risk ranking
- financial impact estimation
- industry-specific logic
- small business suitability
- hallucination protection
- deterministic vs non-deterministic behaviour
- fallback behaviour
- error handling
- persistence
- test coverage

Answer bluntly:

Can the present build diagnose a real failing business from real business data?

Status must be PROVEN, PARTIAL, NOT PROVEN, or FAILED.

---

### 6. Evidence-Backed Findings

For each finding generated by the system, check whether it includes:

- source metric
- source period
- threshold
- comparison baseline
- severity
- financial impact
- confidence
- reason
- recommended action linkage
- verification metric

Mark advice NOT CREDIBLE if findings are generic, unsupported, static, demo-only, or not linked to real data.

---

### 7. Recommendation / Advice Credibility

Audit whether recommendations are:

- specific
- realistic
- tied to evidence
- tied to business constraints
- tied to expected financial impact
- ranked by impact/effort/risk
- executable by owner/staff
- measurable
- time-bound
- not generic
- not fake-consulting language
- not unsupported AI output

Check whether the system asks for or stores constraints such as:

- budget
- available staff
- owner availability
- geography
- current tools
- business type
- pricing model
- customer segment
- cash position
- urgency
- risk tolerance
- staff capability
- owner involvement
- market/channel constraints

Answer:

Can OpsIQ currently produce credible advice for the founder’s real businesses without guessing?

Use only PROVEN, PARTIAL, NOT PROVEN, or FAILED.

---

### 8. Recovery Plan Generation

Check whether the system creates actual plans with:

- action title
- action description
- owner
- due date
- expected outcome
- metric to move
- priority
- effort
- confidence
- evidence link
- verification method
- completion criteria

Determine whether plan generation is:

- persisted
- visible in dashboard
- editable
- assignable
- completable
- verifiable
- test-covered

Mark PARTIAL if a plan is generated but not persisted, not assigned, not verifiable, or not reflected in dashboard.

Mark FAILED if plans are static, hardcoded, demo-only, or generic.

---

### 9. Priority Ranking

Audit whether OpsIQ ranks problems/actions using real logic.

Check for:

- impact scoring
- urgency scoring
- effort scoring
- confidence scoring
- dependency handling
- cashflow sensitivity
- risk handling
- “top 3 actions” logic
- explanation of ranking
- deterministic sorting
- test coverage

Mark NOT PROVEN if ranking is arbitrary, hardcoded, static, or only UI sorting.

---

### 10. Assignment and Accountability

Check whether actions can be assigned to:

- owner
- operator
- staff member
- workspace user
- role-based actor

Audit:

- role model
- permission enforcement
- assignment persistence
- assignment UI
- operator route
- completion flow
- audit trail
- notifications if any
- workspace ownership
- tests

Mark PARTIAL if assignment exists but is not enforced or not visible.

Mark FAILED if users can complete/update actions without correct workspace/role checks.

---

### 11. Execution Tracking

Check whether the system tracks:

- action status
- started date
- completed date
- completion notes
- actual outcome
- blockers
- evidence upload/entry
- responsible user
- status history
- incomplete actions
- overdue actions

Mark PARTIAL if actions can be marked complete but outcomes are not validated.

Mark FAILED if completion can be faked without outcome/evidence where outcome verification is required.

---

### 12. Outcome Verification

This is critical.

Audit whether the system verifies that business actions actually worked.

Check for:

- before metric
- target metric
- after metric
- comparison window
- verification status
- verified/unverified/disputed state
- evidence requirement
- actual outcome field
- owner review
- automatic metric comparison
- manual verification
- dashboard reflection
- tests

Answer directly:

Can OpsIQ prove whether a recommended action improved the business?

If no, mark the turnaround capability NOT PROVEN.

If verification state exists but does not compare before/after real metrics, mark PARTIAL at best.

If verification is fake, static, or manually asserted without evidence, mark FAILED.

---

### 13. Dashboard Reflection

Check whether dashboards show:

- findings
- recommendations
- actions
- evidence
- status
- owner/operator assignment
- verification status
- actual outcomes
- metrics changed
- next recommended action
- stale/incomplete/overdue work
- separation between demo and real data

Report exact routes/pages/components.

Mark PARTIAL if backend has data but dashboard does not surface it.

Mark FAILED if dashboard shows fake/demo/static data as if real.

---

### 14. Closed-Loop Improvement

Audit whether the system can run repeated cycles:

Cycle 1:
data -> diagnosis -> action -> verification

Cycle 2:
updated data -> revised diagnosis -> next action

Check whether:

- old cycles are preserved
- new cycles are created
- cycle comparison exists
- previous action outcomes affect next diagnosis
- failed actions are handled
- disputed outcomes are handled
- recommendations evolve based on results

Mark NOT PROVEN if every diagnosis is isolated.

Mark FAILED if the product implies learning/improvement but does not store or compare cycles.

---

### 15. Founder Business Use-Readiness

Evaluate specifically for a laundry/local-service business like Tumbledry.

Can the current product support:

- B2C order recovery
- dormant customer recovery
- B2B pricing assessment
- staff productivity tracking
- delivery cost tracking
- complaint/refund tracking
- repeat customer tracking
- discount leakage
- local marketing ROI
- receivables tracking
- monthly recovery planning
- daily/weekly operating review
- manager accountability
- owner-level decision dashboard

For each item, report:

- PROVEN / PARTIAL / NOT PROVEN / FAILED
- exact evidence
- missing data
- missing workflow
- required fix

Final question for this section:

Can the founder use the current build seriously for Tumbledry/current businesses today?

Answer only:

YES, PROVEN
PARTIAL
NO, NOT PROVEN
NO, FAILED

---

### 16. Subscription Customer Readiness

Evaluate whether public customers can safely use this.

Check:

- onboarding clarity
- required data explanation
- demo vs real separation
- billing readiness
- workspace isolation
- auth/permissions
- error handling
- data privacy basics
- export/delete options if any
- support path
- credible disclaimers
- repeatable templates
- industry assumptions
- user trust risks
- customer journey completeness
- production readiness
- tests

Mark NOT PROVEN unless the product is usable by a real external user without developer assistance.

Final question for this section:

Can OpsIQ be sold safely as a subscription product now?

Answer only:

YES, PROVEN
PARTIAL
NO, NOT PROVEN
NO, FAILED

---

## Required Safe Commands

Run only safe inspection/build/test commands.

Do not run commands that mutate production data.
Do not run destructive scripts.
Do not run migrations.
Do not deploy.
Do not push.
Do not commit unless explicitly asked after the audit.

At minimum attempt these commands:

git status --short
git branch --show-current
git log -1 --oneline
cat package.json
grep -R "diagnosis" -n app src prisma scripts tests 2>/dev/null | head -200
grep -R "recommendation\|finding\|evidence\|action\|verification\|actualOutcome\|dueAt\|completedBy" -n app src prisma tests 2>/dev/null | head -300
grep -R "demo\|seed\|client_visible\|workspace" -n app src prisma tests 2>/dev/null | head -300
grep -R "revenue\|margin\|profit\|customer\|order\|complaint\|refund\|receivable\|campaign\|retention\|churn" -n app src prisma tests 2>/dev/null | head -300
npx prisma validate
npm run build
npm test -- --runInBand 2>/dev/null || npm test

If package manager is pnpm or yarn, inspect package.json first and use the correct equivalent command. Report the exact command used.

If any command fails because environment dependencies are missing, report:

- exact command
- exact failure
- whether failure blocks capability proof
- what environment dependency is missing

Do not hide failed commands.

---

## Evidence Rules

Every claim must include one of:

- exact file path + line/function reference
- exact command output
- exact test result
- exact Prisma model
- exact route/component
- exact migration/seed evidence

Do not write:

- seems
- likely
- probably
- intended
- should
- appears
- maybe
- could
- suggests
- presumably

Use only evidence language:

- PROVEN
- PARTIAL
- NOT PROVEN
- FAILED

---

## Final Verdict Rules

The final verdict must answer these questions directly:

1. Can the present OpsIQ build intake real business data?
2. Can it validate that data?
3. Can it persist that data correctly?
4. Can it calculate useful business metrics?
5. Can it diagnose a failing business?
6. Can it provide evidence-backed findings?
7. Can it provide credible, realistic advice?
8. Can it create a recovery plan?
9. Can it prioritize actions by impact?
10. Can it assign execution?
11. Can it track completion?
12. Can it verify whether the action worked?
13. Can it update the dashboard with outcomes?
14. Can it run repeated improvement cycles?
15. Can the founder use it now for Tumbledry/current businesses?
16. Can it be sold safely as a subscription now?

For each answer, use only:

- YES, PROVEN
- PARTIAL
- NO, NOT PROVEN
- NO, FAILED

No optimistic language.

---

## Expected Final Conclusion Standard

If the system cannot verify outcomes, the final conclusion must not say it can turn around a business.

If the system cannot ingest real business metrics, the final conclusion must not say it can diagnose a real business.

If recommendations are generic or unsupported, the final conclusion must not say advice is credible.

If dashboard/action/verification flow is broken or untested, the final conclusion must not say subscription-ready.

If demo data can be mistaken for real data, the final conclusion must mark customer trust as a blocking risk.

If the build relies on manual/developer intervention to complete the journey, the final conclusion must not say founder-ready or subscription-ready.

Be hostile, skeptical, evidence-only, and blunt.
