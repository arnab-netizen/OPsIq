# OpsIQ Alpha: Operator Feedback Schema

**Purpose**: Capture operational reality data from internal alpha operators  
**Collection Method**: In-app feedback form + daily reports + weekly sync  
**Data Model**: Structured for trend analysis and decision-making  
**Analysis Cadence**: Daily collection, weekly synthesis, bi-weekly review

---

## FEEDBACK COLLECTION POINTS

### Collection Point 1: In-App Confusion Capture

**Trigger**: Operator clicks "What was unclear?" button (bottom-right corner)

**Form Fields**:
```
┌─────────────────────────────────────────┐
│ What was confusing about OpsIQ?         │
├─────────────────────────────────────────┤
│ Category: [Action / Metric / Workflow/  │
│            Error / Navigation / Other]  │
│                                         │
│ What did you expect?                    │
│ [free text - 1-3 sentences]             │
│                                         │
│ What actually happened?                 │
│ [free text - 1-3 sentences]             │
│                                         │
│ How frustrated? 1(mild) 2 3 4 5(angry) │
│ [radio buttons]                         │
│                                         │
│ [Submit Feedback]    [Cancel]           │
└─────────────────────────────────────────┘
```

**Data Captured**:
- timestamp
- operator_id
- workspace_id
- confusion_category
- expected_behavior (text)
- actual_behavior (text)
- frustration_level (1-5)
- context: [action_name, page, error_code if applicable]

**Storage**: `alpha_feedback_confusion` table

**Expected**: 0-3 submissions per operator per day

---

### Collection Point 2: Safety/Trust Concern

**Trigger**: Operator clicks "Something felt unsafe" button (top-right alert icon)

**Form Fields**:
```
┌─────────────────────────────────────────┐
│ Safety / Trust Concern Report           │
├─────────────────────────────────────────┤
│ What felt unsafe?                       │
│ [textarea - detailed description]       │
│                                         │
│ Could data be lost?    [ ] Yes [ ] No  │
│ Could decisions be      [ ] Yes [ ] No  │
│ silently changed?                       │
│ Did you feel like you  [ ] Yes [ ] No   │
│ had full control?                       │
│                                         │
│ Trust level: 1(low) 2 3 4 5(high)      │
│ [radio buttons]                         │
│                                         │
│ [Submit Concern]    [Cancel]            │
└─────────────────────────────────────────┘
```

**Data Captured**:
- timestamp
- operator_id
- concern_description (text)
- data_loss_concern (boolean)
- silent_mutation_concern (boolean)
- control_concern (boolean)
- trust_level (1-5)
- context: [action_name, page, state]

**Storage**: `alpha_feedback_safety` table

**Expected**: 0-1 submission per operator per week

**Escalation**: Any submission auto-escalates to Alpha Support (same day response)

---

### Collection Point 3: Daily Report (Email/Slack)

**Operator**: Alpha Lead only  
**Frequency**: Daily EOD (end of day)  
**Format**: Structured Slack message or email

**Daily Report Template**:
```
OpsIQ Alpha Daily Report - [DATE]
Operator: [NAME]
Workspace: [NAME]

🎯 TODAY'S WORK:
- Actions completed: [N]
- Actions stalled: [N]
- Actions skipped: [N]
- Time invested: [hours]

⚠️ CONFUSION:
- Most confusing thing today: [1-2 sentences]
- Metric I don't understand: [metric name or "none"]
- Error I encountered: [yes/no, if yes describe]

😟 TRUST SIGNALS:
- Felt unsafe this session: [yes/no, if yes why]
- Confidence level in system: [1-5]
- Would recommend to colleague: [yes/no/unsure]

📝 NOTES:
[Any other observations, questions, feature ideas]
```

**Data Captured**:
- daily_actions_completed: integer
- daily_actions_stalled: integer
- daily_actions_skipped: integer
- daily_time_invested: decimal hours
- confusion_narrative: text
- confusion_metric: string (metric name or "none")
- error_encountered: boolean
- error_description: text if yes
- trust_felt_unsafe: boolean
- trust_unsafe_reason: text if yes
- confidence_level: 1-5
- would_recommend: "yes" | "no" | "unsure"
- notes: text

**Storage**: `alpha_feedback_daily` table

**Expected**: 1 submission per Alpha Lead per day (14-28 per month)

---

### Collection Point 4: Weekly Deep Dive (Validator)

**Operator**: Alpha Validator (1-2 operators)  
**Frequency**: 3x per week (Mon/Wed/Fri)  
**Format**: 5-minute Slack survey + optional 15-min call

**Weekly Report Template**:
```
OpsIQ Alpha Weekly Check-in - [DATE]
Operator: [NAME]
Workspace: [NAME]

✅ WHAT WORKED:
- 1. [workflow that felt smooth]
- 2. [decision that was clear]
- 3. [feature that was helpful]

❌ WHAT WAS HARD:
- 1. [most difficult workflow]
- 2. [most confusing metric]
- 3. [most frustrating error]

🎯 COMPLETION:
- Tasks I've completed: [N] out of [total queued]
- Tasks feeling stalled: [N]
- Tasks I'm avoiding: [N] - names if willing

💡 SUGGESTIONS:
- If I could change one thing: [suggestion]
- Feature I wish existed: [idea]
- Documentation that would help: [topic]

🔐 TRUST:
- I trust the system with decisions: [1-5]
- I feel I have full control: [1-5]
- I would use this for real work: [yes/no/maybe]
```

**Data Captured**:
- what_worked_1/2/3: text
- what_was_hard_1/2/3: text
- completion_count: integer
- completion_total: integer
- stalled_count: integer
- avoided_count: integer
- change_suggestion: text
- feature_idea: text
- documentation_need: text
- trust_score: 1-5
- control_score: 1-5
- real_work_ready: "yes" | "no" | "maybe"

**Storage**: `alpha_feedback_weekly` table

**Expected**: 3 submissions per validator per week (9-12 per alpha)

---

### Collection Point 5: Support Interaction Log

**Collector**: Alpha Support (automatic)  
**Frequency**: Logged automatically with each support ticket  
**Trigger**: Any support request via Slack/email

**Data Captured Automatically**:
- timestamp
- operator_id
- support_channel (slack / email / phone)
- issue_category: [confusion / error / stalled / permission / safety / other]
- issue_description: text (ticket subject)
- resolution_type: [guided / workaround / bug_fix / escalation]
- resolution_time_minutes: integer
- operator_satisfaction: 1-5 (asked at end)
- follow_up_needed: boolean

**Storage**: `alpha_feedback_support_log` table

**Expected**: 1-5 support tickets per day (total, across all operators)

---

## OPERATOR FEEDBACK ANALYSIS MODEL

### Analysis 1: Confusion Trends (Daily)

**Data Source**: `alpha_feedback_confusion` table

**Metrics Calculated**:
```
Daily Confusion Report:
- confusion_count: count of reports (target: <5/day)
- confusion_categories: breakdown by category
  - action_confusion_pct: % of all confusion
  - metric_confusion_pct: % of all confusion
  - workflow_confusion_pct: % of all confusion
  - error_confusion_pct: % of all confusion
  - navigation_confusion_pct: % of all confusion
- top_confusion_topic: most reported issue
- frustration_level_avg: average frustration (target: <2.5)
- trend: increasing/stable/decreasing
```

**Decision Rule**:
- If any single issue >30% of daily confusion: DESIGN REVIEW NEEDED
- If frustration_level_avg >3: UX INTERVENTION NEEDED
- If trend is INCREASING: ESCALATE TO TEAM

---

### Analysis 2: Trust & Safety (Bi-Daily)

**Data Sources**: `alpha_feedback_safety`, `alpha_feedback_daily`, `support_log`

**Metrics Calculated**:
```
Trust Scorecard:
- safety_concerns: count of safety reports (target: 0-1/week)
- data_loss_concerns: count of "could data be lost?" (target: 0)
- silent_mutation_concerns: count reported (target: 0)
- control_concerns: count reported (target: 0-1)
- trust_level_avg: from daily report (target: >4/5)
- confidence_level_avg: from daily report (target: >4/5)
- would_recommend_pct: % saying yes (target: >80%)
- safety_escalations: count requiring support (target: 0/week)
```

**Decision Rule**:
- Any safety concern: IMMEDIATE INVESTIGATION + EMAIL TO TEAM
- If data_loss_concerns > 0: ARCHITECTURAL REVIEW
- If trust_level_avg <3: ALPHA PAUSE + ROOT CAUSE ANALYSIS
- If control_concerns cluster around same feature: FEATURE REDESIGN

---

### Analysis 3: Workflow Friction (Weekly)

**Data Sources**: `alpha_feedback_weekly`, `alpha_feedback_daily`, `support_log`

**Metrics Calculated**:
```
Friction Report:
- avg_completion_rate: (completed / queued) (target: >90%)
- stalled_action_count: actions stuck >30min (target: <5/week)
- abandoned_action_count: actions skipped (target: <5/week)
- support_dependency: (support_tickets / actions_attempted) (target: <30%)
- hard_workflows: [list of workflows >3 support tickets]
- easy_workflows: [list of workflows 0 support tickets]
- time_per_action_avg: [minutes, should trend down]
- trend: efficiency improving/stable/declining
```

**Decision Rule**:
- If completion_rate <80%: WORKFLOW REVIEW REQUIRED
- If support_dependency >40%: RUNBOOK/UX IMPROVEMENT NEEDED
- If abandonment >10 actions/week: DECISION FRAMEWORK UNCLEAR
- If same workflow appears in >3 support tickets: TARGETED FIX NEEDED

---

### Analysis 4: Adoption Metrics (Weekly)

**Data Sources**: All feedback sources

**Metrics Calculated**:
```
Adoption Scorecard:
- operator_engagement: actions/day per operator (target: >5)
- repeat_operator_rate: % returning daily (target: 100%)
- support_repeat_rate: same operator contacting >1x (target: <30%)
- confidence_growth: trend in self-reported confidence
- error_reduction: trend in error encounters
- feature_discovery: % of operators using advanced features
```

**Decision Rule**:
- If engagement <3 actions/day: OPERATOR EDUCATION NEEDED
- If repeat_rate <100%: OPERATOR CHURN SIGNAL
- If support_repeat_rate >50%: TRAINING GAP OR BUG PATTERN
- If confidence_growth is negative: TRUST EROSION - INVESTIGATE

---

### Analysis 5: Support Burden (Daily)

**Data Sources**: `alpha_feedback_support_log`

**Metrics Calculated**:
```
Support Operations Report:
- ticket_count: daily count (target: <2/day)
- ticket_categories: breakdown by issue type
  - confusion_pct: % confused vs broke
  - error_pct: % encountering bugs
  - stalled_pct: % with stalled actions
  - permission_pct: % with access issues
- resolution_time_avg: minutes to resolve (target: <30)
- satisfaction_avg: operator satisfaction (target: >4/5)
- repeat_issues: issues from same operator (target: 0)
- patterns: [issues affecting >1 operator]
```

**Decision Rule**:
- If ticket_count >3/day: SUPPORT CAPACITY STRESS
- If resolution_time_avg >45min: ESCALATION PROCESS BROKEN
- If satisfaction_avg <3: SUPPORT QUALITY ISSUE
- If same issue >2 operators: SYSTEMIC BUG - PRIORITIZE FIX
- If error_pct >30%: CODE QUALITY ISSUE - HALT ALPHA

---

## FEEDBACK DASHBOARD (Real-Time)

**Location**: `/reports/alpha-operations` (internal only)

**Refreshes**: Every 30 minutes

**Visible To**: Alpha Lead + Alpha Support + Team Lead

**Displays**:
- Daily confusion trend (chart)
- Trust scorecard (big numbers)
- Support ticket queue (live)
- Stalled actions (list)
- Operator status (online/offline/last-action)
- Critical alerts (red if triggered)

---

## DECISION FRAMEWORK

### Green Light Indicators
✓ Confusion <5 reports/day  
✓ No safety concerns  
✓ Completion rate >90%  
✓ Support dependency <30%  
✓ Trust level >4/5  
✓ Operator engagement stable  

**Decision**: Continue alpha → Prepare for beta

---

### Yellow Light Indicators
⚠ Confusion 5-10 reports/day  
⚠ 1 safety concern (under investigation)  
⚠ Completion rate 80-90%  
⚠ Support dependency 30-40%  
⚠ Trust level 3-4/5  
⚠ Operator engagement declining  

**Decision**: Continue alpha + Root cause analysis + Plan improvements

---

### Red Light Indicators
✗ Confusion >10 reports/day  
✗ Multiple safety concerns  
✗ Completion rate <80%  
✗ Support dependency >40%  
✗ Trust level <3/5  
✗ Operator disengagement  

**Decision**: Pause alpha + Emergency investigation + Fix before resuming

---

## FEEDBACK DATA RETENTION

**Daily/Weekly Feedback**: Retained for full alpha duration (4 weeks minimum)  
**Support Logs**: Retained indefinitely  
**Safety Concerns**: Retained indefinitely + escalated to security team  
**Anonymized Trends**: Published in post-alpha reports  
**Operator Names**: Removed from public reports  

---

## SAMPLE ANALYTICS DASHBOARD

```
╔════════════════════════════════════════════════════════════════════╗
║ OpsIQ ALPHA - Operator Feedback Dashboard                         ║
║ Last 24 Hours | 2026-05-22                                        ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║ 📊 CONFUSION TRACKER                                               ║
║ ├─ Total Reports: 3                                               ║
║ ├─ Top Issue: "Metric definitions unclear" (2 reports)            ║
║ ├─ Frustration Avg: 2.3/5 ✓ (good)                                ║
║ └─ Trend: STABLE                                                  ║
║                                                                    ║
║ 🔐 TRUST SCORECARD                                                 ║
║ ├─ Safety Concerns: 0 ✓                                            ║
║ ├─ Trust Level Avg: 4.2/5 ✓                                        ║
║ ├─ Control Level Avg: 4.0/5 ✓                                      ║
║ └─ Would Recommend: 100% ✓                                         ║
║                                                                    ║
║ 📈 WORKFLOW PERFORMANCE                                            ║
║ ├─ Actions Completed: 12/13 (92%) ✓                               ║
║ ├─ Support Tickets: 1 (8%) ✓                                       ║
║ ├─ Avg Time/Action: 4.2 min (stable)                              ║
║ └─ Stalled Actions: 0 ✓                                            ║
║                                                                    ║
║ 👥 OPERATOR STATUS                                                 ║
║ ├─ Alpha Lead (Sarah): Active (last action 14:22)                 ║
║ ├─ Validator 1 (Mike): Active (last action 13:45)                 ║
║ ├─ Validator 2 (Lisa): Away (last action 09:30)                   ║
║ └─ Engagement: 100% showing up ✓                                  ║
║                                                                    ║
║ ⚠️ ALERTS: None - Green across all metrics                         ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
```

---

## FEEDBACK SCHEMA SUMMARY

| Feedback Type | Frequency | Collector | Escalation |
|---|---|---|---|
| In-app Confusion | As reported | Operator | auto, daily review |
| Safety Concern | As reported | Operator | auto, same-day |
| Daily Report | Daily | Alpha Lead | daily synthesis |
| Weekly Deep Dive | 3x/week | Validators | weekly analysis |
| Support Log | Per ticket | Support | pattern-based |

---

**Feedback Schema Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

All feedback systems are instrumented and ready to measure operator reality.
