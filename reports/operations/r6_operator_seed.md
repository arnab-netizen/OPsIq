# R6 Operator Seed Data — Internal Alpha Participants

**Date**: 2026-05-19  
**Objective**: Define deterministic seed set for real internal alpha execution  
**Status**: SPECIFICATION COMPLETE

---

## OPERATOR ROLES & RESPONSIBILITIES

### Lead Operator (1 user)
- **Name**: Morgan Chen
- **Email**: morgan.chen+alpha@opsiq.test
- **Role**: `operator_lead`
- **Permissions**: Read all, Act on all, Approve recommendations
- **Responsibility**: Primary workflow tester, daily use of all surfaces
- **Expected Actions**: 40-50/day

### Validator A (1 user)
- **Name**: Alex Patel
- **Email**: alex.patel+alpha@opsiq.test
- **Role**: `operator_validator`
- **Permissions**: Read all, Act on assigned items
- **Responsibility**: Independent workflow validation, error discovery
- **Expected Actions**: 20-30/day

### Validator B (1 user)
- **Name**: Jordan Kim
- **Email**: jordan.kim+alpha@opsiq.test
- **Role**: `operator_validator`
- **Permissions**: Read all, Act on assigned items
- **Responsibility**: Concurrent user testing, collaboration scenarios
- **Expected Actions**: 20-30/day

### Observer/Admin (1 user)
- **Name**: Sam Rodriguez
- **Email**: sam.rodriguez+alpha@opsiq.test
- **Role**: `admin`
- **Permissions**: Full system access, telemetry review, user management
- **Responsibility**: Monitor alpha execution, collect data, coordinate support
- **Expected Actions**: 10-20/day (admin tasks only)

---

## WORKSPACE STRUCTURE

### Alpha Workspace
- **Name**: Alpha Test Workspace
- **Slug**: `alpha-workspace-01`
- **Industry**: Manufacturing
- **Scale**: 50-100M revenue (realistic test scale)
- **Owner**: Morgan Chen
- **Members**: All 4 operators

---

## SEED DATA ENTITIES

### Engagements (3 realistic scenarios)

**Engagement 1: Growth Initiative**
- **Title**: Revenue Growth Through Market Expansion
- **Client**: TechCorp Manufacturing
- **Stage**: Diagnostic
- **Owner**: Morgan Chen
- **Business Condition**:
  - Status: Stable but stagnant
  - Cash Pressure: Medium
  - Margin Pressure: Medium-High
  - Process Maturity: Low
  - Management Maturity: Medium
  - Execution Capacity: Medium-High
  - Morale: Medium
  - Resilience: Medium

**Engagement 2: Cost Reduction**
- **Title**: Operational Efficiency Through Process Redesign
- **Client**: FactoryMax Inc
- **Stage**: Implementation
- **Owner**: Alex Patel
- **Business Condition**:
  - Status: Under pressure
  - Cash Pressure: High
  - Margin Pressure: High
  - Process Maturity: Medium
  - Management Maturity: Low
  - Execution Capacity: Low
  - Morale: Low
  - Resilience: Low

**Engagement 3: Capabilities Build**
- **Title**: Leadership Team Expansion
- **Client**: SteelWorks LLC
- **Stage**: Planning
- **Owner**: Jordan Kim
- **Business Condition**:
  - Status: Healthy growth
  - Cash Pressure: Low
  - Margin Pressure: Low
  - Process Maturity: Medium-High
  - Management Maturity: Medium-High
  - Execution Capacity: Medium
  - Morale: High
  - Resilience: High

### Actions per Engagement (9 total)

**Engagement 1 Actions:**
1. Market Analysis (Pending, 5 days)
2. Competitive Positioning Review (Pending, 7 days)
3. Go-to-market Strategy (In Progress, 10 days)

**Engagement 2 Actions:**
1. Process Audit (Completed, actual vs. expected impact tracked)
2. Automation Assessment (In Progress, 3 days)
3. Training Program Design (Pending, 8 days)

**Engagement 3 Actions:**
1. Leadership Assessment (Pending, 4 days)
2. Recruitment Plan (Pending, 6 days)
3. Onboarding Framework (Pending, 12 days)

### Findings per Engagement (6 total)

**Engagement 1 Findings:**
1. "Limited presence in adjacent markets"
2. "Competitor X gaining market share"

**Engagement 2 Findings:**
1. "Manual process bottleneck in order fulfillment"
2. "High employee turnover due to process frustration"

**Engagement 3 Findings:**
1. "Founder dependency in strategic decisions"
2. "Management team lacks operational depth"

### Recommendations per Engagement (9 total, some AI-proposed)

**Engagement 1 Recommendations:**
1. "Launch new product line" (Human-generated, High confidence)
2. "Expand sales team in Region B" (AI-proposed, Medium confidence, pending approval)
3. "Establish partnership with logistics provider" (Human-generated, High confidence)

**Engagement 2 Recommendations:**
1. "Implement warehouse automation" (AI-proposed, Medium confidence, pending approval)
2. "Restructure operations team" (Human-generated, High confidence)
3. "Deploy training program" (Human-generated, High confidence)

**Engagement 3 Recommendations:**
1. "Hire CFO" (Human-generated, High confidence)
2. "Hire VP Ops" (Human-generated, High confidence)
3. "Establish governance structure" (AI-proposed, Medium confidence, pending approval)

---

## TELEMETRY CAPTURE POINTS

### Pages to Monitor
1. `/login` — Auth entry
2. `/my-day` — Primary operator interface
3. `/decision` — Decision creation
4. `/decisions` — Decision review
5. `/control` — Management oversight
6. `/dashboard/impact` — Strategic view
7. `/engagement/[id]` — Engagement detail

### Behaviors to Track
- Time spent on each page (seconds)
- Buttons clicked (action vs. navigation)
- Forms abandoned (page exit without submit)
- Actions retried (multiple submissions)
- Errors encountered (type, page, recovery action)
- Repeated clicks (sign of confusion)
- Support requests initiated (page, context)

### Events to Record
- Session start/end
- Page navigation (from → to)
- Component interaction (button name, result)
- Form submission (success/failure/retry)
- Error display (message shown, recovery taken)
- Action completion (initiated → submitted → verified)

---

## FEEDBACK CAPTURE WIDGETS

### Lightweight Inline Feedback

Each high-risk surface gets a subtle feedback toolbar with quick actions:

**Button 1: "Confusing"**
- Triggered when: User seems lost (repeated clicks, long dwell time)
- Captures: Page, action context, timestamp, actor
- Use case: Identify UX pain points

**Button 2: "Not Sure"**
- Triggered when: Form field or workflow step is unclear
- Captures: Form field name, tooltip shown?, timestamp
- Use case: Identify guidance gaps

**Button 3: "Need Help"**
- Triggered when: User explicitly wants guidance
- Captures: Current form/workflow, user context, timestamp
- Use case: Identify support needs before errors

**Button 4: "Unexpected"**
- Triggered when: Result differs from operator expectation
- Captures: Action attempted, result received, expectation, timestamp
- Use case: Identify broken assumptions in UX

### Feedback Storage

```typescript
interface OperatorFeedback {
  id: string;
  feedbackType: 'confusing' | 'not_sure' | 'need_help' | 'unexpected';
  actorId: string;
  workspaceId: string;
  page: string;
  context?: string;
  formField?: string;
  actionAttempted?: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  timestamp: DateTime;
}
```

---

## DAILY ALPHA REVIEW METRICS

### By Operator
- Active time (hours logged in)
- Actions completed
- Actions abandoned
- Pages visited
- Support requests
- Feedback submissions

### By Workflow
- "Create Decision" completion rate
- "Review Recommendations" engagement rate
- "Complete Action" success rate
- "Manage Engagement" navigation patterns

### By Surface
- Page visit count
- Average time on page
- Error rate (errors per visit)
- Feedback submission rate
- Support request rate

### Aggregate
- Total operator-hours
- Total actions completed
- Total errors encountered
- Total feedback items
- Total support incidents
- Confusion hotspots (pages with highest "confusing" feedback)
- Abandonment points (workflows with exits before completion)

---

## DETERMINISTIC SEED IDS

### UUIDs (fixed for repeatability)

**Users:**
- Morgan Chen: `11111111-1111-1111-1111-111111111111`
- Alex Patel: `22222222-2222-2222-2222-222222222222`
- Jordan Kim: `33333333-3333-3333-3333-333333333333`
- Sam Rodriguez: `44444444-4444-4444-4444-444444444444`

**Workspaces:**
- Alpha Workspace: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`

**Engagements:**
- Growth Initiative: `eeee0001-eeee-eeee-eeee-eeeeeeeeeeee`
- Cost Reduction: `eeee0002-eeee-eeee-eeee-eeeeeeeeeeee`
- Capabilities Build: `eeee0003-eeee-eeee-eeee-eeeeeeeeeeee`

**Actions:**
- A0001: `aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
- A0002: `aaaa0002-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
- A0003: `aaaa0003-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
- ... (up to A0009)

**Findings:**
- F0001: `ffff0001-ffff-ffff-ffff-ffffffffffff`
- F0002: `ffff0002-ffff-ffff-ffff-ffffffffffff`
- ... (up to F0006)

**Recommendations:**
- R0001: `rrrr0001-rrrr-rrrr-rrrr-rrrrrrrrrrrr`
- R0002: `rrrr0002-rrrr-rrrr-rrrr-rrrrrrrrrrrr`
- ... (up to R0009)

---

## DATA FRESHNESS

**Seed Creation Date**: 2026-05-19 (Today)

**Initial State**:
- 3 engagements created
- 9 actions distributed (3 per engagement)
- 6 findings identified
- 9 recommendations (3 per engagement, 3 AI-proposed pending approval)
- All audit events recorded with proper timestamps
- All relationships properly initialized

**During Alpha**:
- Operators create new findings, recommendations, actions
- AI proposes additional recommendations
- Actions transition through lifecycle (pending → in_progress → completed → verified)
- Engagement progresses through stages
- Business conditions updated as work progresses

---

## IMPLEMENTATION CHECKLIST

### Database Setup
- [ ] Create seed script (src/scripts/seed-alpha-operators.ts)
- [ ] Define schema adjustments if needed (roles, permissions)
- [ ] Run migrations for any new fields
- [ ] Populate users table with 4 test accounts
- [ ] Populate workspaces table with alpha workspace
- [ ] Create workspace memberships
- [ ] Populate engagements (3 total)
- [ ] Populate actions (9 total)
- [ ] Populate findings (6 total)
- [ ] Populate recommendations (9 total)
- [ ] Create audit events for all seed data

### Telemetry Setup
- [ ] Create OperatorTelemetry service
- [ ] Wire up page visit tracking
- [ ] Wire up action tracking
- [ ] Wire up error tracking
- [ ] Wire up support request tracking
- [ ] Verify data storage and retrieval

### Feedback Capture Setup
- [ ] Create OperatorFeedback service
- [ ] Add feedback buttons to critical surfaces
- [ ] Wire up feedback submission
- [ ] Store feedback in database
- [ ] Verify feedback capture is working

### Daily Review Setup
- [ ] Create daily summary generator
- [ ] Define report structure
- [ ] Create scheduled job (runs daily at 6 AM)
- [ ] Test report generation manually
- [ ] Verify report accuracy

### Validation
- [ ] Build succeeds with no errors
- [ ] Tests pass (or identify why they don't)
- [ ] Seed data loads correctly
- [ ] Telemetry records events
- [ ] Feedback capture works end-to-end
- [ ] Daily report generates

---

## NOTES

- All test emails use `+alpha` pattern for easy filtering
- UUIDs are deterministic so seeds can be re-run without duplication
- Seed data represents realistic business scenarios (not edge cases)
- Operators are given realistic workloads (not minimal test data)
- Engagement lifecycle reflects actual consulting progression
- Actions have realistic due dates (3-12 days out)
- Confidence levels mixed (some high-confidence human, some lower AI proposals)

---

**Status**: SPECIFICATION COMPLETE - Ready for implementation

**Next**: Implement seed script, telemetry, feedback capture, and daily review pipeline.
