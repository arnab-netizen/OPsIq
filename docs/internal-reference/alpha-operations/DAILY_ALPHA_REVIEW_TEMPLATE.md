# OpsIQ Alpha: Daily Review Template

**Frequency**: Daily at 5:30 PM (before EOD)  
**Participants**: Alpha Lead + Alpha Support + Team Lead (async option available)  
**Duration**: 10 minutes (synchronous) or 5 minutes (async review)  
**Format**: Structured checklist + dashboard review  
**Ownership**: Team Lead facilitates, Support presents data

---

## DAILY REVIEW STRUCTURE

### 5:30 PM Daily Sync (10 min meeting or async Slack thread)

```
OpsIQ ALPHA DAILY REVIEW - [DATE]
Location: Slack thread #ops-alpha-team OR 5-min video call
Participants: [Names]

═══════════════════════════════════════════════════════════

📊 QUANTITATIVE SNAPSHOT (2 min)

Actions Attempted Today: [N]
├─ Actions Completed: [N] ([%] completion)
├─ Actions Stalled: [N]
├─ Actions Skipped: [N]
└─ Actions in Progress: [N] (should be 0 at EOD)

Support Activity Today: [N tickets]
├─ Confusion: [N] tickets
├─ Errors: [N] tickets
├─ Stalled Actions: [N] tickets
└─ Other: [N] tickets

Operator Status:
├─ Alpha Lead: [working normally / issues / feedback]
├─ Validator 1: [working normally / issues / feedback]
├─ Validator 2: [working normally / issues / feedback]
└─ Engagement: [high / medium / low]

═══════════════════════════════════════════════════════════

⚠️ INCIDENTS TODAY (2 min)

🔴 Critical Issues (needs immediate action):
├─ [issue 1]
├─ [issue 2]
└─ [ESCALATION REQUIRED? Y/N]

🟡 Notable Issues (monitor tomorrow):
├─ [issue 1]
├─ [issue 2]
└─ [needs investigation? Y/N]

═══════════════════════════════════════════════════════════

🔍 OPERATOR INSIGHTS (2 min)

Top Confusion Topic: [metric / workflow / error]
└─ Mentioned by: [operator] at [time]

Most Surprising Behavior: [something unexpected]
└─ Impact: [operator confusion / workflow blocked / etc]

Emerging Patterns: [is something showing up repeatedly?]
├─ [Pattern 1] - seen [N] times
└─ [Pattern 2] - seen [N] times

═══════════════════════════════════════════════════════════

📈 TREND INDICATORS (2 min)

Support Dependency Trend:
  [Day 1]: [%] → [Day 2]: [%] → [Today]: [%]
  Trend: [↗ increasing / ➡️ stable / ↘️ decreasing]

Operator Confidence Trend:
  [Day 1]: [avg score] → [Today]: [avg score]
  Trend: [↗ increasing / ➡️ stable / ↘️ decreasing]

Workflow Completion Rate:
  [Day 1]: [%] → [Today]: [%]
  Trend: [↗ improving / ➡️ stable / ↘️ declining]

═══════════════════════════════════════════════════════════

🎯 DECISION POINT (1 min)

Health Status: [🟢 GREEN / 🟡 YELLOW / 🔴 RED]

Continue Alpha Tomorrow? [YES / CONDITIONAL / PAUSE]

If conditional or pause:
  Condition: [what needs to be fixed?]
  Action: [who does what?]
  Timeline: [when can we resume?]

═══════════════════════════════════════════════════════════

📝 NEXT STEPS

For Tomorrow:
[ ] [Action 1 - who]
[ ] [Action 2 - who]
[ ] [Action 3 - who]

For Week:
[ ] [Medium-term action 1]
[ ] [Medium-term action 2]

═══════════════════════════════════════════════════════════
```

---

## MEASURING DAILY HEALTH

### Health Status Criteria

#### 🟢 GREEN (Continue Alpha - All Normal)

**Conditions** (all must be true):
- ✓ Completion rate ≥90%
- ✓ Support dependency <30%
- ✓ No safety concerns
- ✓ No unresolved critical issues
- ✓ Operator confidence stable or improving
- ✓ Support tickets all resolved
- ✓ No system errors

**Daily Message**: "Alpha operating normally. Continue as planned."

---

#### 🟡 YELLOW (Continue with Caution - Address Issues)

**Conditions** (1 or more):
- ⚠ Completion rate 75-90%
- ⚠ Support dependency 30-40%
- ⚠ 1 safety concern (under investigation)
- ⚠ 1 unresolved high-priority issue
- ⚠ Operator confidence declining (1-2 point drop)
- ⚠ 2+ tickets same topic (emerging pattern)
- ⚠ One-off system error (investigated, root cause found)

**Daily Message**: "Alpha has [issue]. Continue tomorrow + [remediation]. Monitor [pattern]."

**Remediation Examples**:
- "Operators confused about metrics - provide training EOD"
- "One operator stuck 3 times today - pair with support EOD"
- "Same error from 2 operators - escalate to engineering"

---

#### 🔴 RED (Pause Alpha - Investigate)

**Conditions** (any one):
- ✗ Completion rate <75%
- ✗ Support dependency >40%
- ✗ Multiple safety concerns
- ✗ Unresolved critical issue >2 hours
- ✗ Operator abandonment / churn
- ✗ System errors affecting >1 operator
- ✗ Data integrity concern
- ✗ Repeated same critical error

**Daily Message**: "ALPHA PAUSED. [Issue description]. Will resume [when condition resolved]. [Action plan]."

**Example**:
```
🛑 ALPHA PAUSED - 2026-05-23

Issue: Data integrity concern reported by operator
- Action "Approve Contract" recorded different data than submitted
- Audit log shows mismatch
- 1 operator affected, 1 action potentially corrupted

Investigation: In progress (Team Lead on it)
Timeline: Resume tomorrow EOD (estimated fix time 4 hours)
Action: 1. Find root cause 2. Validate no data loss 3. Fix bug 4. Verify
```

---

## DAILY REVIEW CHECKLIST

### Support Engineer Prepares (4:45 PM - 15 min)

```
BEFORE DAILY REVIEW:

[ ] Pull today's metrics:
    - Actions attempted / completed / stalled
    - Support ticket count by category
    - Operator feedback (in-app)
    - Support satisfaction scores
    
[ ] Review support tickets:
    - Any unresolved tickets?
    - Any escalations?
    - Any recurring patterns?
    
[ ] Check dashboard:
    - Stalled actions (any?)
    - Safety concerns (any?)
    - System errors (any in logs?)
    
[ ] Identify:
    - #1 confusion topic
    - #1 surprising behavior
    - Any emerging patterns
    
[ ] Calculate:
    - Completion rate %
    - Support dependency %
    - Operator confidence avg
    
[ ] Classify:
    - Health status (GREEN / YELLOW / RED)
    - Decision (continue / conditional / pause)
    
[ ] Prepare message in #ops-alpha-team
```

---

### Team Lead Reviews (5:30 PM - 5 min)

```
DURING DAILY REVIEW:

[ ] Read Support Engineer's summary
[ ] Ask clarifying questions (if any)
[ ] Confirm health assessment
[ ] Agree on next steps / actions
[ ] Decide: Continue / Conditional / Pause
[ ] Record decision in daily log
[ ] Schedule any follow-ups needed
```

---

### Alpha Lead Comments (5:35 PM - 2 min)

```
DURING/AFTER DAILY REVIEW:

[ ] Any urgent operator issues?
[ ] Any workflow blockers emerged?
[ ] Operator mood / engagement observation
[ ] Questions on system behavior?
[ ] Feedback on support responsiveness?
```

---

## DAILY DATA SOURCES

### Source 1: Support Ticket System

**How**: Support engineer exports from ticket tracking  
**What**: All tickets from today + resolution status  
**Timing**: 4:45 PM pull  

**Metrics Extracted**:
- Total ticket count
- Tickets by category
- Resolution time average
- Unresolved count
- Escalations
- Repeat issues

---

### Source 2: In-App Feedback Dashboard

**How**: Automated pull from feedback tables  
**What**: All confusion reports + safety concerns from today  
**Timing**: Automated 4:30 PM, shown in dashboard  

**Metrics Extracted**:
- Confusion count + categories
- Safety concerns
- Frustration level average
- Trend (increasing/stable/decreasing)

---

### Source 3: Operator Activity Log

**How**: Database query of actions table  
**What**: All actions started/completed by all operators today  
**Timing**: 4:45 PM pull  

**Metrics Extracted**:
- Actions attempted (count)
- Actions completed (count)
- Completion rate %
- Stalled actions (>30 min in progress)
- Skipped actions

---

### Source 4: Operator Daily Reports

**How**: Slack messages from Alpha Lead  
**What**: Self-reported summary of their day  
**Timing**: Received EOD (before 5:30 PM review)  

**Data from Report**:
- Subjective completion status
- Confusion encountered
- Confidence level
- Safety/trust signals
- Notes and observations

---

### Source 5: System Monitoring

**How**: Automated alerts + log review  
**What**: Errors, timeouts, performance issues  
**Timing**: Continuous, summarized 4:45 PM  

**Metrics Extracted**:
- System error count
- Error categories
- Performance issues
- Availability status

---

## DAILY TRENDS TO TRACK

### Trend 1: Support Dependency (Daily)

**Definition**: (Total support tickets) / (Actions attempted) × 100%

**Target**: <30% (operators not constantly needing help)

**Tracking**:
```
DAY 1: 15 tickets / 50 actions = 30%
DAY 2: 14 tickets / 56 actions = 25% ✓ improving
DAY 3: 16 tickets / 52 actions = 31% ⚠ slightly up
DAY 4: 12 tickets / 48 actions = 25% ✓ back on track
```

**Interpretation**:
- Trending down = Operators learning, becoming independent
- Trending up = New issues emerging, operators hitting walls
- Stable low = Healthy, operators self-sufficient
- Stable high = Systemic problem, need intervention

---

### Trend 2: Operator Confidence (Daily)

**Definition**: Average of operator self-reported confidence (1-5 scale)

**Target**: >4/5 (operators feel capable)

**Tracking**:
```
DAY 1: 3.8/5 (first day, cautious)
DAY 2: 4.1/5 (learning)
DAY 3: 4.3/5 ✓ improving
DAY 4: 4.2/5 (slight dip, not concerning)
DAY 5: 4.4/5 ✓ trend up
```

**Interpretation**:
- Trending up = Operators gaining confidence
- Stable 4+ = Healthy confidence
- Trending down = Trust erosion, investigate
- Below 3 = Serious concern, intervention needed

---

### Trend 3: Completion Rate (Daily)

**Definition**: (Actions completed) / (Actions attempted) × 100%

**Target**: >90% (operators finishing what they start)

**Tracking**:
```
DAY 1: 40/50 = 80% (initial learning)
DAY 2: 48/56 = 86% (improving)
DAY 3: 52/52 = 100% ✓ excellent
DAY 4: 48/48 = 100% ✓ excellent
DAY 5: 44/52 = 85% ⚠ slight decline
```

**Interpretation**:
- >90% = Operators finishing workflows
- 80-90% = Normal early days, should improve
- 70-80% = Some abandonment, investigate
- <70% = Significant abandonment, pause

---

### Trend 4: Confusion Topics (Daily)

**Definition**: What's confusing operators most?

**Tracking**:
```
DAY 1: Metrics (3 reports) - expected
DAY 2: Metrics (2 reports) - improving
DAY 3: Metrics (1 report), Workflow (2 reports)
DAY 4: Workflow (1 report), Navigation (1 report)
DAY 5: Navigation (0 reports) - not mentioned
```

**Interpretation**:
- Topic count ↓ = UX improving or operators adapted
- New topic appears = New workflow introduced or confusion spreads
- Repeated >3 reports = Needs design review
- Disappears = Problem solved or adaptation happened

---

## WEEKLY DECISION TRIGGERS

### Weekly (Friday EOD)

Based on 5 days of daily reviews:

**Continue Alpha Next Week?**
- ✓ YES if: Green health 4+ of 5 days, no red alerts, completion >90%
- ⚠ CONDITIONAL if: Yellow 3+ days, manageable issues, clear remediation
- ✗ NO if: Red status any day, unresolved critical issues, trust erosion

**Example Friday Review**:
```
WEEKLY SUMMARY:
- Days Green: 3
- Days Yellow: 2
- Days Red: 0
- Avg completion rate: 92%
- Avg support dependency: 28%
- Avg confidence: 4.3/5

Decision: CONTINUE TO NEXT WEEK ✓
Focus: Monitor "workflow navigation" confusion (slight upward trend)
```

---

## SAMPLE DAILY REVIEWS

### Sample Day 1 (Successful Start)

```
OpsIQ ALPHA DAILY REVIEW - 2026-05-20 (Day 1)

📊 QUANTITATIVE SNAPSHOT:
Actions Attempted: 5
├─ Completed: 4 (80%)
├─ Stalled: 0
├─ Skipped: 1
└─ In Progress: 0

Support: 2 tickets (40% dependency)
├─ Confusion: 2
├─ Errors: 0
├─ Stalled: 0

Operators: Sarah (working) + Mike (working) + Lisa (working)

⚠️ INCIDENTS:
🔴 Critical: None
🟡 Notable: None

🔍 INSIGHTS:
Top Confusion: "What is Confidence metric?" (Sarah, 2:15 PM)
└─ Support response: Explained metric definition + analogy
└─ Resolved: Sarah understood

Most Surprising: Action submitted twice, 2nd was rejected (correct!)
└─ Shows duplicate prevention working
└─ Operator confused by 409 error message (technical)

📈 TRENDS:
Support dependency: 40% (expected high on day 1)
Confidence: 3.8/5 (cautious, expected)
Completion: 80% (good for first day)

🎯 DECISION:
Health: 🟢 GREEN
Continue: YES

Next Steps:
[ ] Watch confusion metric count tomorrow (may spike as more operators ask)
[ ] Explain duplicate prevention error message to operators
```

---

### Sample Day 3 (Mid-Week Issue)

```
OpsIQ ALPHA DAILY REVIEW - 2026-05-22 (Day 3)

📊 QUANTITATIVE SNAPSHOT:
Actions Attempted: 12
├─ Completed: 12 (100%) ✓
├─ Stalled: 0 ✓
├─ Skipped: 0
└─ In Progress: 0

Support: 3 tickets (25% dependency) ✓
├─ Confusion: 1
├─ Errors: 1
├─ Stalled: 1

Operators: Sarah (excellent) + Mike (good) + Lisa (getting stuck)

⚠️ INCIDENTS:
🔴 Critical: 1 error from Lisa - "Action could not be recorded"
   └─ Investigated: Network timeout (not system bug)
   └─ Resolved: Retry successful
   └─ Action: Monitor Lisa's connection tomorrow

🟡 Notable: Lisa has required 2 support assists (vs Sarah 0, Mike 0)
   └─ May be confidence issue or connectivity

🔍 INSIGHTS:
Top Confusion: None today ✓
Most Surprising: Lisa's network issues affecting workflow
Emerging Pattern: Lisa seems less confident than others

📈 TRENDS:
Support dependency: 25% ✓ (down from 40%, improving)
Confidence: 4.1/5 ✓ (up from 3.8)
Completion: 100% ✓ (up from 80%)

🎯 DECISION:
Health: 🟢 GREEN
Continue: YES

Next Steps:
[ ] Check Lisa's network/setup tomorrow
[ ] If Lisa's issues continue, may need 1:1 support call
[ ] Otherwise on-track for good trajectory
```

---

### Sample Day 4 (Red Alert)

```
OpsIQ ALPHA DAILY REVIEW - 2026-05-23 (Day 4)

📊 QUANTITATIVE SNAPSHOT:
Actions Attempted: 10
├─ Completed: 7 (70%) ❌
├─ Stalled: 2 ⚠️
├─ Skipped: 1
└─ In Progress: 0

Support: 6 tickets (60% dependency) ❌
├─ Confusion: 3
├─ Errors: 2
├─ Stalled: 1

Operators: Sarah (good) + Mike (struggling) + Lisa (struggling)

⚠️ INCIDENTS:
🔴 CRITICAL: Same error from 2 operators
   - "Workspace context invalid"
   - Happened to Mike and Lisa simultaneously (3:00 PM)
   - May be system issue, not user error
   - ESCALATION: Needs engineering investigation

🔴 CRITICAL: Completion rate dropped to 70%
   - Operators abandoning workflows mid-action
   - Not clear if blocked by errors or confusion

⚠️ NOTABLE: Operators reporting frustration (avg frustration 3.2/5)

🔍 INSIGHTS:
Top Confusion: "When should I skip vs complete?" (ambiguous workflows)
Most Surprising: Two separate operators hit same error (suggests bug)
Emerging Pattern: Errors seem clustered (mid-afternoon)

📈 TRENDS:
Support dependency: 60% ❌ (up from 25%)
Confidence: 3.5/5 ❌ (down from 4.1)
Completion: 70% ❌ (down from 100%)

🎯 DECISION:
Health: 🔴 RED
Continue: PAUSE

ROOT CAUSE ANALYSIS NEEDED:
1. "Workspace context invalid" error - investigate system
2. Workflow abandonment - operators confused about decisions
3. Afternoon error clustering - could indicate load/timing issue

ACTIONS FOR TOMORROW:
[ ] Engineering team investigate workspace error (URGENT)
[ ] Sarah interview: did you see similar issue?
[ ] Support team: improve error messaging for workspace error
[ ] Review workflow decision criteria with operators
[ ] Check system logs for errors 2:30-3:30 PM window
[ ] Determine: Can we resume if workspace error is fixed?

TIMELINE: Resume alpha when:
- "Workspace context invalid" error is identified + hotfix deployed
- Operators confirm no new errors
- Completion rate recovers to >80%

Estimated: Tomorrow afternoon if root cause is straightforward
```

---

## DAILY REVIEW CADENCE

### Reporting Schedule

| Timing | What | Who | Format |
|--------|------|-----|--------|
| 4:45 PM | Support prepares metrics | Support Eng | Data pull + analysis |
| 5:30 PM | Team sync (optional async) | Team Lead | 10-min meeting or Slack |
| 5:45 PM | Summary posted | Support Eng | Review template filled in |
| Next day | Follow-up actions | Team Lead | Assigned + tracked |

---

## CONCLUSION

The daily review is the **primary control mechanism** for alpha operations. It:
- ✓ Detects problems early (before they escalate)
- ✓ Validates operator experience is acceptable
- ✓ Provides data-driven go/no-go decisions
- ✓ Creates accountability for issues
- ✓ Documents alpha health trajectory

**Daily reviews are non-negotiable for internal alpha success.**

---

**Daily Alpha Review Template Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DAILY USE
