# OpsIQ Alpha: Seeding Specification

**Purpose**: Define realistic operator environment data for alpha testing  
**Target**: Operators log in and immediately interact with realistic workflows  
**Realism**: Simulate actual business consulting scenarios  
**Lifecycle**: Engagements at various stages (new, in-progress, complete)

---

## SEEDING OVERVIEW

```
3 Operators:
├─ Sarah Chen (alpha-lead@internal.test) - Lead decision-maker
├─ Mike Torres (validator-1@internal.test) - Validator/implementation
└─ Lisa Park (validator-2@internal.test) - Validator/observer

3 Test Workspaces (Clients):
├─ Acme Corp (Manufacturing, 50 employees)
├─ TechStart Inc (SaaS, 12 employees)
└─ Retail Solutions (Retail network, 8 locations)

12-15 Total Engagements:
├─ 2-3 NEW (awaiting first decision)
├─ 4-5 IN_PROGRESS (active workflows)
├─ 2-3 STALLED (haven't moved in 3 days, good for testing recovery)
└─ 3-4 COMPLETED (reference examples)

50-75 Total Actions:
├─ ~15 Ready (waiting for operator decision today)
├─ ~20 Pending (awaiting external input, reference)
├─ ~30 Completed (show workflow progression)
└─ ~10 Skipped (with notes, show decision-making)
```

---

## OPERATOR ACCOUNTS

### Operator 1: Alpha Lead (Sarah Chen)

```sql
INSERT INTO operators (id, email, name, role, is_internal_alpha) VALUES
  (gen_random_uuid(), 
   'alpha-lead@internal.test', 
   'Sarah Chen', 
   'lead_consultant',
   true);
```

**Purpose**: Primary system user, makes all final decisions  
**Access**: All 3 workspaces (owner of all)  
**Expected Behavior**: Daily user, complete workflows, make trade-off decisions  
**Load**: 8-12 actions/day

### Operator 2: Validator 1 (Mike Torres)

```sql
INSERT INTO operators (id, email, name, role, is_internal_alpha) VALUES
  (gen_random_uuid(), 
   'validator-1@internal.test', 
   'Mike Torres', 
   'implementation_specialist',
   true);
```

**Purpose**: Secondary user, validates decisions, executes implementation  
**Access**: All 3 workspaces (contributor on all)  
**Expected Behavior**: 4-5x per week user, focuses on in-progress items  
**Load**: 5-8 actions/day when working

### Operator 3: Validator 2 (Lisa Park)

```sql
INSERT INTO operators (id, email, name, role, is_internal_alpha) VALUES
  (gen_random_uuid(), 
   'validator-2@internal.test', 
   'Lisa Park', 
   'data_analyst',
   true);
```

**Purpose**: Observer and secondary validator, focuses on metrics  
**Access**: All 3 workspaces (read mostly, can complete actions)  
**Expected Behavior**: 2-3x per week user, selective action participation  
**Load**: 2-4 actions/day when working

---

## WORKSPACE SEEDING

### Workspace 1: Acme Corp

```sql
INSERT INTO workspaces (id, name, org_type, size_band, is_alpha) VALUES
  (gen_random_uuid(),
   'Acme Corp',
   'manufacturing',
   'medium',
   true);
```

**Context**: Manufacturing company (50 employees)  
**Current Situation**: 
- Revenue declining 12% YoY
- Operations efficiency gap identified
- Need decision on capacity planning

**Consulting Engagement**: "Acme Operations Optimization"  
- Status: IN_PROGRESS (Week 3 of 8-week engagement)
- Current Issue: Capacity vs cost trade-off
- Next Decision Needed: Staffing model recommendation

**Operators**: Sarah (owner), Mike (contributor), Lisa (observer)

---

### Workspace 2: TechStart Inc

```sql
INSERT INTO workspaces (id, name, org_type, size_band, is_alpha) VALUES
  (gen_random_uuid(),
   'TechStart Inc',
   'saas',
   'small',
   true);
```

**Context**: SaaS startup (12 employees)  
**Current Situation**:
- Series A just closed ($3M)
- Need to scale sales team
- Burn rate acceleration required decision

**Consulting Engagement**: "TechStart GTM Scaling"  
- Status: NEW (started 1 week ago)
- Current Issue: No decisions made yet
- Next Decision Needed: Go-to-market strategy approval

**Operators**: Sarah (owner), Mike (contributor), Lisa (observer)

---

### Workspace 3: Retail Solutions

```sql
INSERT INTO workspaces (id, name, org_type, size_band, is_alpha) VALUES
  (gen_random_uuid(),
   'Retail Solutions',
   'retail',
   'medium',
   true);
```

**Context**: Retail network operator (8 locations)  
**Current Situation**:
- Inventory management failing at 2 locations
- Supply chain disruption ongoing
- Emergency decision needed

**Consulting Engagement**: "Retail Supply Chain Remediation"  
- Status: STALLED (last action 4 days ago, stuck)
- Current Issue: Awaiting client inventory data
- Next Decision Needed: Interim staffing model while awaiting data

**Operators**: Sarah (owner), Mike (contributor), Lisa (read-only)

---

## ENGAGEMENT SEEDING

### Engagement Type A: Fresh (NEW) - "Need Immediate Decisions"

**Example: TechStart GTM Scaling**

```sql
INSERT INTO engagements (id, workspace_id, name, status, consulting_stage, business_condition) VALUES
  (gen_random_uuid(),
   (SELECT id FROM workspaces WHERE name = 'TechStart Inc'),
   'TechStart GTM Scaling',
   'draft',
   'discovery_phase',
   'growth_opportunity');

INSERT INTO actions (id, engagement_id, name, status, 
                     confidence, priority, impact, due_date) VALUES
  -- Action A1: First discovery decision
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'TechStart GTM Scaling'),
   'Confirm: Current sales process documented?',
   'ready',
   65,
   'high',
   'medium',
   CURRENT_DATE),
   
  -- Action A2: Second discovery decision
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'TechStart GTM Scaling'),
   'Confirm: Sales team size and roles defined?',
   'ready',
   72,
   'high',
   'medium',
   CURRENT_DATE + INTERVAL '1 day');
```

**Purpose**: Tests fresh operator onboarding  
**What Operators See**: Clean queue, clear next steps, simple decisions  
**Expected Behavior**: Sarah logs in, sees fresh engagement, completes first actions

---

### Engagement Type B: In Progress - "Active Decision-Making"

**Example: Acme Operations Optimization**

```sql
INSERT INTO engagements (id, workspace_id, name, status, consulting_stage, business_condition) VALUES
  (gen_random_uuid(),
   (SELECT id FROM workspaces WHERE name = 'Acme Corp'),
   'Acme Operations Optimization',
   'in_progress',
   'analysis_phase',
   'performance_degradation');

INSERT INTO actions (id, engagement_id, name, status, 
                     confidence, priority, impact, due_date) VALUES
  -- Completed actions (show workflow progression)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Acme Operations Optimization'),
   'Benchmark: Current capacity vs industry standard',
   'completed',
   85,
   'high',
   'high',
   CURRENT_DATE - INTERVAL '5 days'),
   
  -- In-progress action (real workflow state)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Acme Operations Optimization'),
   'Decision: Add headcount vs increase automation?',
   'ready',
   68,
   'high',
   'high',
   CURRENT_DATE),
   
  -- Pending actions (awaiting external input)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Acme Operations Optimization'),
   'Pending: Client approval on recommended staffing level',
   'pending',
   null,
   'high',
   'high',
   CURRENT_DATE + INTERVAL '2 days'),
   
  -- Future actions (show workflow structure)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Acme Operations Optimization'),
   'Validate: Financial impact of chosen path',
   'ready',
   55,
   'medium',
   'high',
   CURRENT_DATE + INTERVAL '5 days');
```

**Purpose**: Tests workflow navigation and decision-making progression  
**What Operators See**: Mixed action states, decisions to make, context from prior work  
**Expected Behavior**: Sarah/Mike see logical progression, make informed decisions

---

### Engagement Type C: Stalled - "Recovery Testing"

**Example: Retail Supply Chain Remediation**

```sql
INSERT INTO engagements (id, workspace_id, name, status, consulting_stage, business_condition) VALUES
  (gen_random_uuid(),
   (SELECT id FROM workspaces WHERE name = 'Retail Solutions'),
   'Retail Supply Chain Remediation',
   'at_risk',
   'remediation_phase',
   'critical_failure');

INSERT INTO actions (id, engagement_id, name, status, 
                     confidence, priority, impact, due_date) VALUES
  -- Last action completed 4 days ago
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Retail Supply Chain Remediation'),
   'Assess: Current inventory levels at affected locations',
   'completed',
   92,
   'critical',
   'high',
   CURRENT_DATE - INTERVAL '4 days'),
   
  -- Stalled pending action (good for testing recovery workflow)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Retail Supply Chain Remediation'),
   'Pending: Get inventory data from client (due 3 days ago)',
   'pending',
   null,
   'critical',
   'high',
   CURRENT_DATE - INTERVAL '3 days'),
   
  -- Next decision ready (what to do while waiting)
  (gen_random_uuid(),
   (SELECT id FROM engagements WHERE name = 'Retail Supply Chain Remediation'),
   'Decision: Interim staffing model (temporary, while awaiting data)',
   'ready',
   72,
   'critical',
   'high',
   CURRENT_DATE);
```

**Purpose**: Tests operator recovery from stalled workflows  
**What Operators See**: Red flag (overdue), pending item, and pragmatic next step  
**Expected Behavior**: Sarah sees urgency, makes interim decision while waiting for client data

---

## ACTION SEEDING: STATE VARIETY

### Ready Actions (Waiting for Operator Decision)

```
HIGH PRIORITY:
1. Acme: "Add headcount vs automation?" (confidence 68)
2. TechStart: "Confirm sales process documented?" (confidence 65)
3. Retail: "Interim staffing while awaiting inventory?" (confidence 72)

MEDIUM PRIORITY:
4. Acme: "Validate financial impact?" (confidence 55)
5. TechStart: "Assess current sales infrastructure?" (confidence 71)

Total Ready: ~7 actions (2-3 HIGH, 2-3 MEDIUM, 1-2 LOW)
Expected: Operators see 3-5 available each day
```

### Pending Actions (Awaiting External Input)

```
BLOCKED:
1. Retail: "Get inventory data from client" (overdue 3 days)
2. Acme: "Client approval on staffing recommendation" (due tomorrow)
3. TechStart: "Stakeholder alignment on go-to-market" (due in 2 days)

PURPOSE: Show workflow dependencies
Expected Operator Behavior: Operators see these are blocked, focus on others
```

### Completed Actions (Show Progression)

```
SAMPLE HISTORY:
- "Benchmark current capacity" (Completed 5 days ago, 85% confidence)
- "Assess inventory levels" (Completed 4 days ago, 92% confidence)
- "Initial stakeholder interviews" (Completed 7 days ago, 78% confidence)
- "Preliminary financial analysis" (Completed 10 days ago, 71% confidence)

PURPOSE: Show progression history, build operator context
Expected Operator Behavior: Operators see past work, understand current decisions
```

### Skipped Actions (Decision Records)

```
EXAMPLES:
- "Evaluate outsourced solution" (SKIPPED - High cost ruled out)
- "Expand to new market segment" (SKIPPED - Not in scope)
- "Consider competitor partnership" (SKIPPED - Timing not right)

PURPOSE: Show decision trail, explain why paths were not taken
Expected Operator Behavior: Operators understand decision context
```

---

## METRICS SEEDING

### Recommendations with Varied Confidence

```
HIGH CONFIDENCE (85-95):
- Benchmark actions (based on concrete data)
- Assessment actions (based on clear analysis)
- Actions based on client decision

MODERATE CONFIDENCE (60-75):
- Strategic choice actions (multiple valid paths)
- Forward-looking decisions (some uncertainty)

LOW CONFIDENCE (40-60):
- Exploratory actions (high uncertainty)
- Market prediction (external variables)

DISTRIBUTION: ~30% high, ~40% moderate, ~30% low
Purpose: Realistic range of confidence levels for operator decision-making
```

### Priority Distribution

```
CRITICAL (2-3 actions):
- Emergency actions (supply chain disruption)
- Client-blocking decisions

HIGH (4-6 actions):
- Core consulting workflow
- Main engagement decisions

MEDIUM (3-5 actions):
- Support decisions
- Timing-dependent items

LOW (1-2 actions):
- Nice-to-have explorations
- Future planning

Distribution: Realistic for consulting workflow mix
```

### Impact Distribution

```
HIGH IMPACT (~40%):
- Financial (staffing, spending decisions)
- Strategic (direction changes)
- Critical (emergency responses)

MEDIUM IMPACT (~40%):
- Operational (process changes)
- Tactical (workflow improvements)

LOW IMPACT (~20%):
- Data gathering
- Reference activities
- Follow-ups

Distribution: Varied outcomes keep operators engaged
```

---

## SEEDING SCRIPTS

### Script 1: Seed All Operators

```bash
# scripts/seed-alpha-operators.sql
INSERT INTO operators (id, email, name, role, is_internal_alpha, created_at) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'alpha-lead@internal.test', 'Sarah Chen', 'lead_consultant', true, NOW()),
  ('550e8400-e29b-41d4-a716-446655440002', 'validator-1@internal.test', 'Mike Torres', 'implementation_specialist', true, NOW()),
  ('550e8400-e29b-41d4-a716-446655440003', 'validator-2@internal.test', 'Lisa Park', 'data_analyst', true, NOW());
```

**Usage**: `psql -d opsiq-alpha -f scripts/seed-alpha-operators.sql`

---

### Script 2: Seed All Workspaces

```bash
# scripts/seed-alpha-workspaces.sql
-- Creates 3 test workspaces with realistic context
-- Includes workspace memberships (all operators in all spaces)
-- Sets up initial business condition and consulting stage
```

---

### Script 3: Seed Engagements and Actions

```bash
# scripts/seed-alpha-engagements.sql
-- Creates 12-15 realistic engagements
-- Mixes NEW, IN_PROGRESS, STALLED, COMPLETED states
-- Creates 50-75 actions with realistic state distribution
-- Sets confidence/priority/impact with business logic
```

---

## VERIFICATION: Seeding Checklist

After seeding runs, verify:

```sql
-- Should have exactly 3 operators
SELECT COUNT(*) FROM operators WHERE is_internal_alpha = true;
-- Expected: 3

-- Should have exactly 3 workspaces
SELECT COUNT(*) FROM workspaces WHERE is_alpha = true;
-- Expected: 3

-- Should have 12-15 engagements
SELECT COUNT(*) FROM engagements WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
-- Expected: 12-15

-- Should have 50-75 actions
SELECT COUNT(*) FROM actions WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
-- Expected: 50-75

-- Status distribution check
SELECT status, COUNT(*) FROM actions WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true) GROUP BY status;
-- Expected: 15% ready, 25% pending, 40% completed, 20% skipped

-- Confidence distribution check
SELECT 
  CASE 
    WHEN confidence >= 80 THEN 'HIGH'
    WHEN confidence >= 60 THEN 'MEDIUM'
    ELSE 'LOW'
  END as confidence_level,
  COUNT(*)
FROM actions 
WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true)
AND status = 'ready'
GROUP BY confidence_level;
-- Expected: realistic distribution
```

---

## Seeding Philosophy

**Goal**: Operators log in and see **realistic work**, not dummy data.

**Principles**:
1. ✓ Engagements represent real consulting scenarios
2. ✓ Actions have logical dependencies and progression
3. ✓ Confidence/priority/impact follow business logic
4. ✓ Mixed states (ready/pending/completed) show realistic workflows
5. ✓ Stalled items provide recovery testing opportunities
6. ✓ Historical actions give operators context

**What Operators Should Think**:
- "This looks like real consulting work"
- "I can see what was done before"
- "I understand why these decisions matter"
- "I know what to do next"

---

**Alpha Seeding Spec Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR IMPLEMENTATION
