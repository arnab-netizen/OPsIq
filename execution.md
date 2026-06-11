OpsIQ Owner Mode Execution Roadmap

Purpose

OpsIQ Owner Mode must become a full-capacity owner command system for real business operators.

The end product must help an owner:

1. understand the real condition of the business,
2. identify survival risks,
3. identify profit leaks,
4. identify growth opportunities,
5. choose the safest highest-impact next action,
6. assign and execute work,
7. verify whether the action improved the business,
8. learn only from verified outcomes,
9. repeat the cycle across money, sales, operations, marketing, staff, customers, SOPs, strategy, and multiple businesses.

The system must not become a collection of disconnected pages. Every module must plug into the same owner operating loop:

Input Data
→ Diagnosis
→ Severity Ranking
→ Recommendation
→ Action Plan
→ Execution Tracking
→ Verification
→ Dashboard Update
→ Next Cycle

The goal is not to create a demo. The goal is to create a reliable owner operating system that can be used on real businesses without hand-holding.

⸻

0. Current Strategic Rule

Owner Mode First

Public SaaS, Product Hunt, billing, pricing, marketing, and Module 2+ public launch work are frozen until Owner Mode is proven.

Current priority:

Finish Owner Mode foundation
→ prove it on real/staging runtime
→ build full owner capacity module by module
→ only then resume public/SaaS launch work

Tumbledry Mukundapur may be used as the first real validation business, but the product must remain generic and reusable for any owner-operated business.

Do not hardcode Tumbledry logic into core product code.

⸻

1. Non-Negotiable Build Principles

1.1 No False Green

Claude must never mark a phase complete unless all required gates pass.

A phase is not complete if:

* code compiles but tests fail,
* tests pass locally but CI is red,
* CI passes but runtime is unverified,
* runtime works only with mock data,
* data is written but not visible in UI,
* UI displays data but verification loop is incomplete,
* migration exists but has not been applied to real/staging DB,
* feature works only for one hardcoded business,
* security/auth/tenant isolation is untested,
* errors are hidden, skipped, or renamed instead of fixed.

1.2 Backbone First

Always fix root/backbone issues before add-on branch issues.

Backbone issues include:

* database schema,
* migrations,
* auth and authorization,
* tenant/workspace isolation,
* owner role gating,
* API contracts,
* persistence correctness,
* deterministic diagnosis pipeline,
* action/verification loop,
* CI gates,
* deployment proof,
* real/staging runtime proof.

Add-on branch issues include:

* UI polish,
* labels,
* copy,
* chart formatting,
* extra filters,
* additional templates,
* optional exports,
* Product Hunt polish,
* billing,
* marketing pages.

Do not work on add-on branches while a backbone gate is red.

1.3 Evidence Over Claims

Every completion report must include evidence:

* files changed,
* commands run,
* exact results,
* tests passed/failed,
* CI status if available,
* screenshots/logs only when needed,
* migration status if DB touched,
* runtime proof if feature is runtime-facing.

Never say “complete” without proof.

1.4 Fail Closed

If a required condition is missing, the system must fail safely.

Examples:

* missing auth → reject,
* missing workspace → reject,
* wrong role → reject,
* missing capability → reject,
* bad diagnostic key → reject,
* missing DB env → fail clearly,
* invalid state transition → reject,
* cross-tenant access → 404/403 as appropriate,
* unverified action → never mark successful,
* failed verification → mark disputed/unverified, not complete.

1.5 No Broad Refactors During Gate Fixes

When fixing a gate:

* fix the direct root cause,
* avoid unrelated cleanup,
* avoid module expansion,
* avoid design changes,
* avoid changing tests to fit broken code,
* avoid reducing coverage.

⸻

2. Global Claude Execution Loop

Claude must use this loop for every build cycle.

2.1 Single Build Loop Command

When instructed with:

/continue-owner-mode-build

Claude must do the following:

1. read this EXECUTION.md,
2. identify the current phase and first incomplete gate,
3. inspect current repo status,
4. refuse to jump ahead if a prior gate is incomplete,
5. implement only the next allowed slice,
6. run all required verification,
7. create/update the relevant proof report,
8. commit and push only if explicitly authorized by the current task or if this file says the phase requires auto-commit after green gates,
9. report status using the required format.

Claude must not ask “what next?” if the next incomplete gate is clear from this file.

2.2 Required Start-of-Loop Checks

Every loop begins with:

git status --short
git branch --show-current
git log --oneline -8

Then Claude must identify:

Current branch:
Current HEAD:
Working tree clean:
Current phase:
Current incomplete gate:
Next allowed task:
Forbidden tasks:

2.3 Required End-of-Loop Report

Every loop ends with:

Status:
Phase:
Gate:
Files changed:
Commands run:
Results:
CI status:
Runtime status:
Migration status:
Owner Recovery status:
Module 2 status:
Public/SaaS status:
Next single action:

⸻

3. Universal Verification Gates

Unless a task explicitly states a narrower verification set, Claude must run:

git diff --check
npm run lint:ratchet
npm test
npx prisma validate
npm run build
npx vitest run src/__tests__/founder-recovery/

If a module adds new tests, run those tests directly before the full suite.

If a module touches auth/security:

npx vitest run src/__tests__/security/

If a module touches route enforcement/canonical wrappers, run the relevant phase tests.

If a module touches Prisma schema/migrations, run:

npx prisma validate
npx prisma migrate status

Do not run npx prisma migrate deploy locally against real DB unless explicitly instructed.

⸻

4. Issue Handling Protocol

When an issue appears, Claude must not patch blindly.

Claude must classify the issue first:

1. build failure
2. test failure
3. lint failure
4. type failure
5. migration failure
6. workflow failure
7. runtime failure
8. auth/security failure
9. data visibility failure
10. tenant isolation failure
11. deployment/environment failure
12. flaky/external failure
13. pre-existing failure
14. unknown

For every issue, Claude must report:

Root cause:
Evidence:
Affected files:
Whether branch-caused or pre-existing:
Whether blocking:
Smallest safe fix:
Tests to prove fix:

Claude must then fix the root cause and rerun the relevant gates.

4.1 If CI Fails

Claude must:

1. inspect failed check logs,
2. identify exact failing command,
3. reproduce locally if possible,
4. fix only direct root cause,
5. rerun full gates,
6. push,
7. re-check PR.

Claude must not guess from log tails.

4.2 If DB Fails

Claude must determine:

Is the failure caused by:
- missing env?
- placeholder env?
- pooled URL used for migration?
- blocked TCP 5432?
- migration drift?
- schema mismatch?
- auth failure?
- unavailable DB?

Claude must never print database URLs or secrets.

4.3 If Test Requires Server

Tests must be deterministic.

Preferred order:

1. in-process route handler tests,
2. dedicated integration test command that starts server,
3. robust test bootstrap if necessary.

Do not leave normal npm test dependent on a missing localhost:3000 server.

⸻

5. Status Definitions

5.1 Owner Mode Status Values

Claude must use these status values exactly.

OWNER_MODE_LOCAL_ONLY
OWNER_MODE_CI_PENDING
OWNER_MODE_CI_GREEN
OWNER_MODE_MERGED_TO_MAIN
OWNER_MODE_DB_MIGRATED
OWNER_MODE_STAGING_DEPLOYED
OWNER_MODE_STAGING_PROVEN
OWNER_MODE_REAL_BUSINESS_PROVEN
OWNER_MODE_FULL_CAPACITY_V1

5.2 Module Status Values

Each module must use:

NOT_STARTED
SPEC_READY
SCHEMA_READY
API_READY
UI_READY
TESTED_LOCAL
CI_GREEN
MIGRATED
STAGING_PROVEN
REAL_BUSINESS_PROVEN
LOCKED

A module is not complete until it reaches at least STAGING_PROVEN.

⸻

6. Current Required Backbone Gate

Before starting any new owner intelligence module, complete this gate:

PR #31 green
→ merged to main
→ Module 1 migration workflow visible on main
→ migration applied through manual workflow
→ app deployed/redeployed from main
→ one owner recovery cycle completed on staging/real runtime
→ dashboard proves data visibility
→ verification proves before/after loop

Until this is complete:

Module 2: BLOCKED
Public/SaaS: FROZEN
Billing: FROZEN
Product Hunt: FROZEN
Marketing: FROZEN

⸻

7. Module 0 — Governance, CI, and Deployment Backbone

Purpose

Make the repo safe to build without constant regression.

Features / Functions

1. PR check inspection.
2. CI failure classification.
3. Lint ratchet enforcement.
4. Prisma env safety.
5. Migration safety.
6. Secret safety.
7. Required test gates.
8. Branch status validation.
9. No false-green reporting.
10. Proof report creation.

Required Capabilities

* CI must not be broken by committed placeholder .env.local.
* CI secrets must not be overridden by local placeholder env files.
* Migration workflows must remove local .env* files before Prisma migration commands.
* Manual migration workflows must require explicit confirmation.
* No workflow may print secrets.
* No migration workflow may run automatically on push unless intentionally designed.

Required Tests / Checks

npm run lint:ratchet
npm test
npx prisma validate
npm run build

Required Audit

Create/update:

GOVERNANCE_CI_DEPLOYMENT_PROOF_REPORT.md

Done When

All required PR checks are green or only explicitly accepted non-blocking checks remain.
No secrets are printed.
No placeholder env can override CI secrets.
Migration workflows are manual and fail closed.

⸻

8. Module 1 — Owner Recovery Foundation

Purpose

Create the core owner recovery loop.

This is the backbone module. All future modules must plug into it.

Core Flow

Owner creates business
→ owner submits snapshot/intake
→ system creates recovery cycle
→ system detects findings
→ system creates recommendations
→ system creates actions
→ owner/operator completes action
→ system verifies result
→ dashboard updates
→ next cycle links to previous cycle

Features / Functions

8.1 Owner Business

Required fields:

business name
industry
currency
location
owner workspace
business stage
current problem statement
business model type

8.2 Metric Snapshot

Required fields:

revenue
costs
profit
orders
customers
complaints
staff count
capacity
cash on hand
debt/EMI pressure
owner notes
snapshot date

8.3 Recovery Cycle

Required states:

draft
diagnosing
action_planned
in_execution
verification_pending
verified
disputed
closed

Invalid state transitions must fail.

8.4 Findings

Each finding must include:

category
severity
evidence
business impact
confidence level
source metric
recommended next action

8.5 Actions

Each action must include:

title
owner
priority
due date
expected outcome
verification method
status
actual outcome
completion evidence

8.6 Verification

Each verification must include:

before metric
after metric
expected impact
actual impact
status: unverified / verified / disputed
evidence
verification timestamp

8.7 Dashboard

Dashboard must show:

business condition
current cycle
top findings
recommended actions
pending actions
verified wins
disputed actions
next cycle recommendation

APIs

Required API namespace:

/api/owner/recovery/business
/api/owner/recovery/snapshot
/api/owner/recovery/diagnosis
/api/owner/recovery/actions
/api/owner/recovery/verification
/api/owner/recovery/dashboard

UI

Required route:

/owner/recovery

Required UI sections:

business intake
snapshot form
diagnosis panel
finding list
action list
verification panel
dashboard summary
cycle history

Security

* Owner-only access.
* Workspace isolation.
* Cross-workspace access blocked.
* Unauthenticated access blocked.
* Non-owner access blocked unless explicitly allowed by owner role policy.

Tests

Required tests:

unit tests for diagnosis logic
DB persistence tests
authz tests
route tests
state transition tests
dashboard read tests
verification tests
cross-workspace isolation tests

Runtime Proof

Must prove:

signup/login or owner session
business created
snapshot created
diagnosis created
actions created
dashboard reads data
action completion updates state
verification updates state
second cycle links to first

Done When

Module 1 local tests pass
CI passes
migration applied to staging/real DB
owner recovery route works on deployed app
one full cycle is proven
dashboard reflects cycle
verification loop is proven

⸻

9. Module 2 — Financial Intelligence

Purpose

Give the owner a true financial control panel.

Core Questions

The system must answer:

Is the business making money?
Where is money leaking?
What is the break-even point?
How much cash runway exists?
Which costs are dangerous?
Which actions improve profit fastest?

Features / Functions

9.1 Financial Snapshot

Inputs:

daily revenue
monthly revenue
gross revenue
cost of goods/services
fixed costs
variable costs
rent
salary
utilities
marketing spend
delivery cost
loan EMI
debt
cash on hand
receivables
payables
owner withdrawals

9.2 Financial Metrics

Calculate:

gross margin
net margin
contribution margin
break-even revenue
daily break-even
monthly burn
cash runway
debt service pressure
cost ratio
revenue per customer
profit per order
fixed cost coverage

9.3 Financial Risk Detection

Detect:

negative margin
low cash runway
high fixed cost burden
high debt pressure
revenue below break-even
cost leakage
salary burden
unprofitable service/product
dangerous receivables

9.4 Owner Output

Show:

financial health score
top 5 financial risks
top 5 profit leaks
break-even target
next 7-day money actions
next 30-day financial recovery plan

APIs

/api/owner/finance/snapshot
/api/owner/finance/metrics
/api/owner/finance/risks
/api/owner/finance/actions
/api/owner/finance/dashboard

UI

/owner/finance

Sections:

financial health
break-even
cash runway
profit leaks
cost pressure
recommended actions
verification

Tests

financial calculation unit tests
risk detection tests
API contract tests
authz tests
dashboard tests
edge cases: zero revenue, negative profit, missing cost, high debt

Done When

owner can enter financial data
system calculates financial condition
risks are ranked
actions are created
actions can be verified
dashboard updates
tests and CI pass

⸻

10. Module 3 — Sales and Customer Intelligence

Purpose

Help the owner understand whether sales are growing, stuck, leaking, or unhealthy.

Core Questions

Where are sales coming from?
Where are customers dropping off?
Are customers repeating?
Which channel works?
Which offer should owner push next?
Which prospects should owner contact today?

Features / Functions

10.1 Sales Snapshot

Inputs:

leads
qualified leads
orders
conversion rate
average order value
repeat customers
new customers
lost customers
B2B prospects
B2B pipeline value
customer complaints
discounts
refunds

10.2 Sales Metrics

Calculate:

lead-to-sale conversion
repeat rate
customer acquisition rate
average order value
sales per day
sales per staff
lost customer rate
B2B pipeline health
revenue by segment

10.3 Sales Risk Detection

Detect:

low conversion
low repeat rate
high complaint-to-sale ratio
overdependence on discounts
weak B2B pipeline
lost customer leakage
poor follow-up
sales below break-even

10.4 Owner Output

sales health score
sales bottleneck
customer leakage
best next sales action
daily follow-up list
B2B prospect ranking
offer recommendation

APIs

/api/owner/sales/snapshot
/api/owner/sales/metrics
/api/owner/sales/risks
/api/owner/sales/actions
/api/owner/sales/dashboard

UI

/owner/sales

Tests

conversion calculations
repeat-rate calculations
pipeline ranking
risk detection
authz
dashboard visibility

Done When

owner can see sales bottlenecks
system recommends sales actions
actions enter execution loop
verification updates result

⸻

11. Module 4 — Operations and Productivity Intelligence

Purpose

Help the owner identify operational bottlenecks, productivity gaps, quality leakage, and capacity constraints.

Core Questions

Can the business handle current demand?
Where is work getting delayed?
Which staff/process is underperforming?
Is quality causing profit leakage?
What must improve today?

Features / Functions

11.1 Operations Snapshot

Inputs:

orders received
orders completed
orders delayed
rework count
complaints
staff hours
machine/equipment capacity
delivery failures
inventory shortages
SOP misses
idle time

11.2 Operations Metrics

Calculate:

completion rate
delay rate
rework rate
complaint rate
capacity utilization
staff productivity
orders per staff hour
delivery success rate
SOP compliance rate

11.3 Risk Detection

Detect:

capacity bottleneck
staff productivity issue
quality leakage
high rework
delivery bottleneck
SOP non-compliance
equipment constraint
inventory constraint

11.4 Owner Output

operations health score
top bottleneck
capacity ceiling
staff productivity flags
quality leakage list
today's operations actions

APIs

/api/owner/operations/snapshot
/api/owner/operations/metrics
/api/owner/operations/risks
/api/owner/operations/actions
/api/owner/operations/dashboard

UI

/owner/operations

Tests

capacity calculations
productivity calculations
risk detection
state transitions
dashboard visibility

⸻

12. Module 5 — Cashflow, Receivables, and Leakage Control

Purpose

Prevent business death from cashflow mismanagement.

Core Questions

Who owes money?
What must be collected first?
Which expenses are urgent?
Where is cash leaking?
Can the business survive the next 30 days?

Features / Functions

12.1 Cashflow Inputs

cash in hand
bank balance
daily collections
receivables
payables
upcoming EMI
rent
salary due
vendor due
tax due
owner withdrawal

12.2 Metrics

cash runway
collection gap
payables pressure
cash conversion delay
overdue receivables
urgent payment risk

12.3 Risk Detection

cash shortage
high overdue receivables
salary/rent risk
vendor cutoff risk
debt default risk
owner withdrawal pressure

12.4 Owner Output

cashflow danger score
collection priority list
payment priority list
7-day survival plan
30-day cash recovery plan

APIs

/api/owner/cashflow/snapshot
/api/owner/cashflow/receivables
/api/owner/cashflow/payables
/api/owner/cashflow/risks
/api/owner/cashflow/actions
/api/owner/cashflow/dashboard

UI

/owner/cashflow

⸻

13. Module 6 — Marketing and Growth Intelligence

Purpose

Help the owner decide what marketing action to take, not just view vanity metrics.

Core Questions

Which channel brings customers?
Which offer works?
Which audience should be targeted?
What should be posted/campaigned next?
What is wasting money?

Features / Functions

13.1 Marketing Inputs

campaigns
channel
spend
leads
orders
conversion
content posted
inquiries
coupon usage
referrals
walk-ins

13.2 Metrics

cost per lead
cost per order
campaign ROI
channel conversion
offer conversion
referral rate
organic vs paid mix

13.3 Risk Detection

wasted spend
poor conversion
wrong channel
weak offer
low referral activity
campaign without follow-up

13.4 Owner Output

marketing health score
best channel
worst channel
next campaign idea
daily content/action plan
offer recommendation

APIs

/api/owner/marketing/snapshot
/api/owner/marketing/metrics
/api/owner/marketing/risks
/api/owner/marketing/actions
/api/owner/marketing/dashboard

UI

/owner/marketing

⸻

14. Module 7 — SOP, Process, and Execution Accountability

Purpose

Turn recommendations into repeatable execution.

Core Questions

Who must do what?
By when?
How should they do it?
Was it done?
Did it work?
Should it become SOP?

Features / Functions

14.1 SOP Library

process name
purpose
steps
role responsible
frequency
quality standard
verification method

14.2 Action Assignment

owner
manager
staff
external vendor
due date
priority
required proof
completion status

14.3 Accountability

pending
in progress
completed
verified
disputed
overdue
reassigned

14.4 Owner Output

execution health score
overdue actions
staff accountability view
repeated failures
SOP gaps
actions to convert into SOP

APIs

/api/owner/sop/library
/api/owner/sop/action
/api/owner/sop/verification
/api/owner/sop/dashboard

UI

/owner/execution

⸻

15. Module 8 — Strategy and Scenario Planning

Purpose

Help the owner choose between strategic options using numbers and risk.

Core Questions

Should I add staff?
Should I buy equipment?
Should I increase price?
Should I target B2B?
Should I open another branch?
Should I cut costs?
Which option gives highest safe upside?

Features / Functions

15.1 Scenario Inputs

current revenue
expected revenue change
cost change
investment required
time to impact
risk level
cash available
capacity impact
staff impact

15.2 Scenario Outputs

projected profit
cash requirement
break-even change
payback period
risk score
best case
base case
worst case
recommendation

15.3 Strategy Ranking

highest ROI
lowest risk
fastest cash improvement
highest survival impact
highest growth impact

APIs

/api/owner/strategy/scenario
/api/owner/strategy/compare
/api/owner/strategy/recommend
/api/owner/strategy/dashboard

UI

/owner/strategy

⸻

16. Module 9 — Multi-Business Portfolio Command Center

Purpose

Allow an owner to manage multiple businesses from one command center.

Core Questions

Which business is healthiest?
Which business needs attention today?
Which business is leaking money?
Where should owner spend time?
Which business should receive investment?

Features / Functions

16.1 Portfolio View

business list
financial score
sales score
operations score
cashflow score
execution score
risk score
opportunity score

16.2 Cross-Business Ranking

most urgent business
highest profit opportunity
highest cash risk
worst execution problem
best growth candidate

16.3 Owner Output

portfolio health score
today's top 3 priorities
business-by-business action queue
investment recommendation
risk alerts

APIs

/api/owner/portfolio/dashboard
/api/owner/portfolio/ranking
/api/owner/portfolio/actions
/api/owner/portfolio/risks

UI

/owner/portfolio

⸻

17. Module 10 — Connectors and Data Intake

Purpose

Reduce manual input and make Owner Mode easier to use.

Rule

Do not build connectors before the core owner loop is stable.

Initial Connector Targets

CSV upload
manual form
Google Sheets import
email import
accounting export upload
POS/order upload
bank statement upload
WhatsApp/manual lead import

Later Connector Targets

Tally
Zoho Books
QuickBooks
Razorpay
Lemon Squeezy
Shopify
WooCommerce
Google Analytics
Meta Ads
Google Ads
CRM tools

Data Intake Requirements

Every intake must include:

source
timestamp
business
workspace
validation status
normalization status
error report
owner confirmation

No connector data should automatically change final diagnosis without validation.

⸻

18. Module 11 — Trust, Audit, and Explainability

Purpose

Make recommendations credible.

Required Features

Every recommendation must show:

what was detected
why it matters
source data used
calculation used
confidence level
risk if ignored
expected impact
verification method

Audit Trail

Track:

input data
diagnosis version
recommendation version
action created
action completed
verification result
who changed what
when it changed

Anti-Hallucination Rule

The system must not invent:

revenue
costs
customers
staff count
market facts
competitor facts
tax/legal claims
guaranteed outcomes

If data is missing, say missing and request data or provide assumption-labeled scenarios.

⸻

19. Module 12 — Owner UI and Mobile Usability

Purpose

Make Owner Mode usable by a busy business owner on mobile.

UI Principles

* one clear next action,
* no dashboard overload,
* risk first,
* money first,
* execution second,
* insights tied to actions,
* every action has verification,
* mobile-first,
* low bandwidth friendly.

Required Screens

/owner
/owner/recovery
/owner/finance
/owner/sales
/owner/operations
/owner/cashflow
/owner/marketing
/owner/execution
/owner/strategy
/owner/portfolio

Owner Home Screen Must Show

business health
cash danger
sales danger
operations danger
execution danger
top 3 risks
top 3 opportunities
today's required actions
last verified improvement

⸻

20. Module 13 — Real Business Validation

Purpose

Prove the product works on real businesses.

First Validation Business

Tumbledry Mukundapur
Industry: Laundry / Dry Cleaning
Currency: INR

Validation Flow

enter actual business data
run diagnosis
review findings
accept actions
execute at least one action
enter after-data
verify result
record owner feedback
repeat second cycle

Required Proof

before state
recommendation
action taken
after state
verified result
dashboard update
owner notes

Done When

at least one real/staging business cycle is proven end-to-end
no manual DB edits required
no hardcoded business logic required
owner can understand and act without developer explanation

⸻

21. Full Capacity Owner Mode Definition

Owner Mode reaches OWNER_MODE_FULL_CAPACITY_V1 only when the system can handle:

Recovery
Finance
Sales
Operations
Cashflow
Marketing
Execution
Strategy
Portfolio
Verification
Audit trail

Each domain must support:

data input
metric calculation
risk detection
recommendation
action creation
execution tracking
verification
dashboard update
history

⸻

22. Required Implementation Order

Claude must follow this order.

Phase 0 — PR/CI unblock

Fix PR #31 checks
Merge to main
Confirm workflow appears

Phase 1 — Module 1 deployment proof

Run manual migration workflow
Deploy/redeploy app
Prove one owner recovery cycle

Phase 2 — Owner Command Center shell

Create /owner command center
Connect Module 1 status
Show owner next action
Show system readiness

Phase 3 — Financial Intelligence

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 4 — Sales Intelligence

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 5 — Operations Intelligence

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 6 — Cashflow Intelligence

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 7 — Execution/SOP System

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 8 — Marketing Intelligence

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 9 — Strategy/Scenario Planning

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 10 — Portfolio Command Center

schema
domain logic
API
UI
tests
verification loop
dashboard integration

Phase 11 — Data Intake / CSV / Sheets

CSV upload
manual import
validation
normalization
owner confirmation

Phase 12 — Full audit and hardening

security audit
tenant isolation audit
data correctness audit
financial calculation audit
runtime audit
CI audit
deployment audit

Phase 13 — Public/SaaS readiness

Only after Owner Mode is real-business proven.

pricing
billing
onboarding
landing page
support
Product Hunt

⸻

23. Per-Module Build Contract

Every module must be built in this sequence:

1. SPEC
2. SCHEMA
3. DOMAIN LOGIC
4. API
5. UI
6. TESTS
7. AUDIT
8. RUNTIME PROOF
9. DASHBOARD INTEGRATION
10. REPORT

Claude must not skip steps.

23.1 SPEC

Create/update module spec:

purpose
inputs
outputs
metrics
risk rules
recommendation rules
action rules
verification rules
UI requirements
API contract
test matrix

23.2 SCHEMA

Add Prisma models only when needed.

Every model must include:

id
workspaceId
businessId where relevant
createdAt
updatedAt
status where relevant
audit fields where relevant

23.3 DOMAIN LOGIC

Domain logic must be deterministic first.

No LLM-dependent output is allowed for core calculations.

23.4 API

Every API must enforce:

auth
workspace isolation
role/capability
input validation
safe errors
canonical response format

23.5 UI

Every UI must show:

current condition
problem
why it matters
next action
verification state

23.6 TESTS

Each module needs:

unit tests
route/API tests
authz tests
persistence tests
dashboard tests
edge case tests

23.7 AUDIT

Audit must check:

security
tenant isolation
calculation correctness
state transitions
error handling
data visibility
false-green risk

23.8 RUNTIME PROOF

Runtime proof must demonstrate:

create
read
update
verify
dashboard reflects

23.9 DASHBOARD INTEGRATION

Every module must feed /owner command center.

23.10 REPORT

Create module report:

MODULE_<N>_<NAME>_IMPLEMENTATION_REPORT.md

⸻

24. Testing Matrix

Required Test Categories

unit
integration
route handler
database persistence
authz
tenant isolation
state transition
calculation correctness
dashboard read
runtime smoke
CI workflow
migration

Required Edge Cases

Every module must test:

missing input
zero values
negative values where relevant
extreme values
invalid status
unauthorized user
wrong workspace
non-owner user
duplicate submission
partial failure
stale data

⸻

25. Audit Matrix

Claude must perform audits at these levels:

25.1 Code Audit

type safety
no any unless justified and scoped
no unsafe error rendering
no raw secret logging
no hardcoded business
no hardcoded workspace
no hardcoded user

25.2 Security Audit

auth required
role enforced
workspace isolation
diagnostic key correct
no same-length bypass
safe errors
no sensitive logs

25.3 Data Audit

writes are transactional where needed
reads are workspace-scoped
dashboard reads actual persisted data
no fake demo data presented as real

25.4 Business Logic Audit

calculations correct
recommendations traceable
risk scoring explainable
actions tied to findings
verification tied to metrics

25.5 Runtime Audit

route accessible
forms submit
data persists
dashboard updates
errors handled
cycle can be repeated

⸻

26. Commit Rules

Claude may commit only when:

working tree is reviewed
diff is scoped
verification gates pass
secret scan is clean
report is created/updated

Before every commit:

git status --short
git diff --stat
git diff --check
git diff --cached --name-only

Commit message format:

MODULE_<N>_<SHORT_REASON>
FIX_<GATE>_<SHORT_REASON>
AUDIT_<AREA>_<SHORT_REASON>

No commit may include:

.env*
node_modules
generated DB files
real secrets
logs with secrets
unrelated product code
unapproved module work

⸻

27. Reports Required

Reports must be concise and evidence-based.

Required report types:

PR_CHECK_FIX_REPORT.md
MODULE_<N>_<NAME>_SPEC.md
MODULE_<N>_<NAME>_IMPLEMENTATION_REPORT.md
MODULE_<N>_<NAME>_RUNTIME_PROOF.md
MODULE_<N>_<NAME>_AUDIT_REPORT.md
OWNER_MODE_STATUS_REPORT.md

Every report must include:

status
files changed
commands run
results
known limitations
next gate

⸻

28. Stop Conditions

Claude must stop and report if:

secret is required but missing
migration would run against unknown DB
real DB URL would be printed
destructive command is requested
CI failure cannot be reproduced
test requires external service not available
scope would enter Module 2 before Module 1 proven
public/SaaS work is requested before Owner Mode proof

⸻

29. Fast-Track Rule

Fast-track does not mean skipping gates.

Fast-track means:

small slices
clear gates
no broad refactors
proof immediately
commit cleanly
move to next module only after lock

The fastest safe route is:

Finish backbone
→ prove runtime
→ build next smallest owner module
→ integrate into common loop
→ verify
→ repeat

⸻

30. Current Next Action

The current next action is:

Fix remaining PR #31 Phase 3 Slice 2 env override
→ get PR #31 fully green
→ merge to main
→ run Module 1 migration workflow manually
→ prove one owner recovery cycle

Do not start Module 2 until Module 1 reaches:

OWNER_MODE_STAGING_PROVEN

⸻

31. Claude Final Output Format

Every Claude execution must end with:

FINAL STATUS
Current phase:
Current gate:
Status:
Branch:
Commit:
Files changed:
Commands run:
Results:
CI status:
Runtime status:
Migration status:
Security status:
Owner Recovery status:
Module 2 status:
Public/SaaS status:
Known blockers:
Next single action:

Allowed status values:

GREEN_AND_LOCKED
GREEN_PENDING_CI
CI_FAILED_FIXED_AND_PUSHED
BLOCKED_NEEDS_SECRET
BLOCKED_NEEDS_DB
BLOCKED_NEEDS_USER_DECISION
FAILED_ROOT_CAUSE_FOUND
FAILED_ROOT_CAUSE_UNKNOWN

Claude must not use vague statuses such as:

mostly done
should work
probably fixed
seems okay
ready maybe

⸻

32. End Goal

The end goal is:

OpsIQ Owner Mode becomes a full-capacity owner command center that can diagnose, prioritize, execute, and verify business improvement across finance, sales, operations, cashflow, marketing, SOPs, strategy, and multiple businesses.

The product is successful only when an owner can open OpsIQ and know:

what is wrong
why it matters
what to do today
who should do it
how to verify it
whether it worked
what to do next

Until that is true, do not resume public/SaaS launch work.