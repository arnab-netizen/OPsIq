# OpsIQ Internal Alpha: Operating Contract

**Date**: 2026-05-19  
**Phase**: Internal Alpha Deployment Readiness  
**Scope**: Non-technical SMB business operators (3-5 users)  
**Duration**: 2-4 weeks  
**Environment**: Staging (controlled, isolated from production)

---

## OPERATOR ROLES

### Role 1: Alpha Lead
- **Count**: 1 operator
- **Responsibility**: Primary system user, day-to-day operations
- **Experience Level**: Non-technical, SMB decision-maker
- **Access**: Full system (all workspaces, all actions)
- **Escalation Authority**: Can authorize workarounds
- **Reporting**: Daily feedback on workflows and confusion

### Role 2: Alpha Validator
- **Count**: 1-2 operators
- **Responsibility**: Secondary user, workflow verification
- **Experience Level**: Non-technical, implementation-focused
- **Access**: Same workspace as Alpha Lead, cannot modify settings
- **Escalation Authority**: Can report issues, cannot override decisions
- **Reporting**: 3x weekly feedback on task completion and difficulty

### Role 3: Alpha Support (Hybrid)
- **Count**: 1 engineer
- **Responsibility**: Live support during business hours
- **Experience Level**: Technical (can read logs, restart services, etc)
- **Access**: All system access including logs and infrastructure
- **Escalation Authority**: Can perform emergency rollback
- **Reporting**: Support ticket log, incident summaries

---

## ACCESS LEVEL MATRIX

| Action | Alpha Lead | Alpha Validator | Alpha Support |
|--------|-----------|-----------------|----------------|
| Create workspace | ✓ | ✗ | ✗ |
| Create engagement | ✓ | ✓ | ✓ (admin) |
| Create action | ✓ | ✓ | ✓ (admin) |
| Complete action | ✓ | ✓ | ✓ (admin) |
| View metrics | ✓ | ✓ | ✓ |
| Change confidence | ✓ | ✓ | ✓ (admin) |
| View audit log | ✓ | ✓ | ✓ |
| Invite operators | ✓ | ✗ | ✗ |
| System settings | ✗ | ✗ | ✓ (admin) |
| View support logs | ✗ | ✗ | ✓ |
| Emergency rollback | ✗ | ✗ | ✓ |

---

## OPERATIONAL BOUNDARIES

### ALLOWED WORKFLOWS

✓ **Engagement Lifecycle**
- Create engagements from templates
- Execute actions within normal business workflow
- Update engagement status
- Add notes and observations
- View historical progression

✓ **Action Execution**
- Complete actions
- Skip actions with justification
- Retry failed actions
- View action details and context
- Create follow-up actions

✓ **Workspace Management**
- Switch between workspaces
- Invite additional operators (Alpha Lead only)
- Configure basic workspace settings

✓ **Observation and Reporting**
- Report confusion via feedback system
- Raise support tickets
- Document unusual behavior
- Report perceived safety issues

### FORBIDDEN WORKFLOWS

✗ **Destructive Operations**
- No deletion of engagements (under any circumstances)
- No destruction of historical records
- No purging of audit logs

✗ **Unvalidated Changes**
- No modification of closed/locked engagements
- No backdating of actions
- No silent status changes
- No metrics modification without audit trail

✗ **Performance Testing**
- No load generation
- No concurrent automation
- No stress testing against live system

✗ **Configuration Changes**
- No schema modifications
- No authentication changes
- No database rewrites

---

## SUPPORT ESCALATION MODEL

### LEVEL 1: SELF-SERVE RECOVERY (0-5 min)
**Operator Authority**: Alpha Lead + Alpha Validator

- Browser refresh / session restart
- Re-read runbook for workflow guidance
- Check "what was unclear?" feedback system
- Attempt action retry

**Support Availability**: None (operator owns recovery)

**Escalation**: If action still stuck after 2 retries, escalate to Level 2

---

### LEVEL 2: SUPPORT GUIDANCE (5-15 min)
**Operator Authority**: Alpha Lead only

- Contact Alpha Support (Slack/email)
- Describe exact workflow state
- Provide error message verbatim
- Report expected vs actual outcome

**Support Availability**: Business hours + 30 min response SLA

**Support Actions**:
- Explain metric/workflow confusion
- Suggest alternative approaches
- Check logs for errors
- Provide workaround if available

**Escalation**: If workaround doesn't resolve, escalate to Level 3

---

### LEVEL 3: EMERGENCY INTERVENTION (15-30 min)
**Operator Authority**: Alpha Support only

- Investigate logs and system state
- Determine root cause (bug vs operator confusion)
- Execute emergency procedures:
  - Session reset
  - Workspace reset
  - Database point-in-time rollback
  - Service restart

**Support Availability**: On-call (30 min response)

**Post-Incident**: Incident review and fix prioritization

---

## REPORTING CADENCE

### Daily (Alpha Lead)
- 2-3 sentence workflow summary
- Any confusion encountered
- Any "felt unsafe" incidents
- Subjective confidence level (1-5)

### 3x Weekly (Alpha Validator)
- Task completion status
- Difficulty assessment (easy/moderate/hard)
- Most confusing moment
- Most surprising behavior
- Feature requests (captured, not prioritized)

### Weekly (Alpha Support)
- Support ticket summary
- Incident count and types
- Escalation frequency
- Top confusion topics
- Recovery success rate

### Bi-Weekly (Team Sync)
- Aggregate operator feedback
- Trend analysis (adoption/trust/completion)
- Decision point on beta readiness
- Prioritization of R3/R4 fixes before beta

---

## OPERATOR SAFETY GUARDRAILS

### Guardrail 1: Workflow Timeout
- **Rule**: Action execution must complete within 5 minutes
- **Failure**: UI shows "took too long" guidance
- **Support**: Level 2 escalation
- **Prevention**: No background queuing without feedback

### Guardrail 2: Stalled Action Detection
- **Rule**: No action should be "in progress" for >30 minutes
- **Detection**: Nightly audit
- **Alert**: Support team notified
- **Recovery**: Operator contacted with rollback option

### Guardrail 3: Duplicate Prevention
- **Rule**: No duplicate action execution (UNIQUE constraint enforced)
- **Failure**: Duplicate request returns 409 Conflict
- **UI Feedback**: "Action already submitted - view status"
- **Prevention**: Submit button disabled during request

### Guardrail 4: Session Integrity
- **Rule**: Session corruption automatically detected
- **Failure**: Workspace context mismatch triggers re-auth
- **Recovery**: Automatic redirect to login with state preserved
- **Prevention**: Hash-based session validation on each request

### Guardrail 5: Audit Immutability
- **Rule**: No modification of completed/locked actions
- **Technical**: NOT NULL constraint on `locked_at`
- **UI Feedback**: "Action locked - cannot edit"
- **Prevention**: Form submission blocked for locked records

---

## SUPPORT ESCALATION CONTACT

| Channel | Response SLA | Availability |
|---------|-------------|--------------|
| Slack #ops-alpha-support | 30 min | Business hours |
| Email to support@ | 1 hour | Business hours |
| Emergency (phone) | 15 min | On-call only |
| Out of hours | Next business day | On-call coverage only |

---

## ALPHA COMPLETION CRITERIA

Alpha will be declared COMPLETE when:

✓ All 3 operators have completed at least one full engagement
✓ At least 10 actions have been executed without escalation
✓ Operator confidence trend is stable (not declining)
✓ No critical bugs found in core workflows
✓ Support dependency is acceptable (<30% of actions require support)
✓ Operator feedback is actionable and non-critical

---

## SUCCESS DEFINITION

### Minimum Success
- Alpha Lead can complete basic workflows independently
- Support burden is <2 hours/day
- No workflow abandonment
- Operator trust is stable

### Target Success
- All operators complete workflows independently
- Support burden is <1 hour/day
- Workflow completion rate >90%
- Operator confidence increasing
- Actionable feedback on R3/R4 priorities

### Exceeds Success
- Operators request more access (not restriction)
- Repeat workflows without support
- Positive confidence trend
- Specific improvement requests that prove understanding

---

## KNOWN CONSTRAINTS

⚠ **System Changes Frozen**
- No new features during alpha
- Only critical bug fixes
- Documentation updates allowed
- No schema changes (except bug fixes)

⚠ **Staging Environment Only**
- No production data exposure
- Safe rollback available
- Synthetic data used for all examples
- No live Stripe integration

⚠ **Operator Education Required**
- Metric definitions must be explained in runbook
- Workflow context must be pre-established
- Error messages are still technical (R3 fix pending)
- Recovery paths documented but not yet streamlined

---

## ALPHA OPERATING MODEL SUMMARY

| Aspect | Definition |
|--------|-----------|
| **Operators** | 1 Lead + 1-2 Validators + 1 Support |
| **Duration** | 2-4 weeks |
| **Success Metric** | Operators complete workflows with <30% support dependency |
| **Data Exposure** | Staging only, fully rollback-safe |
| **Feature Additions** | None - observation only |
| **Decision Gate** | Go/no-go to controlled beta based on operator evidence |

---

Signed: INTERNAL_ALPHA_OPERATING_CONTRACT  
Date: 2026-05-19  
Status: READY FOR OPERATOR RECRUITMENT
