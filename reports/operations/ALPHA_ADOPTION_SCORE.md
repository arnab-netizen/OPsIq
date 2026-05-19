# OpsIQ Alpha: Adoption Score Framework

**Purpose**: Measure operator adoption, trust, and readiness for beta  
**Calculation**: Data-driven score from multiple dimensions  
**Scale**: 0-100 (0 = unready, 100 = fully ready for beta)  
**Evaluation Cadence**: Daily, with weekly synthesis  
**Decision Gate**: Beta Go/No-Go decision at end of alpha (50+ = proceed)

---

## ADOPTION SCORE FORMULA

```
ALPHA_ADOPTION_SCORE = 
    (Workflow Completion × 25%) +
    (Operator Confidence × 25%) +
    (Support Self-Sufficiency × 20%) +
    (Trust & Safety × 20%) +
    (Engagement & Growth × 10%)

Where:
- Workflow Completion: How many actions finish (target: >90%)
- Operator Confidence: Self-reported confidence (target: 4+/5)
- Support Self-Sufficiency: % of actions without support (target: >70%)
- Trust & Safety: No safety issues + trust trending up (target: 5/5)
- Engagement & Growth: Operators returning + improving (target: 5/5)
```

---

## DIMENSION 1: WORKFLOW COMPLETION (25%)

**Definition**: Percentage of started actions that operators complete

**Calculation**:
```
Completion_Rate = (Actions Completed) / (Actions Attempted) × 100%

Component Score = 
  IF Completion_Rate >= 95%: 10/10 points
  IF Completion_Rate >= 90%: 9/10 points
  IF Completion_Rate >= 85%: 7/10 points
  IF Completion_Rate >= 80%: 5/10 points
  IF Completion_Rate >= 75%: 3/10 points
  IF Completion_Rate < 75%: 0/10 points

Contribution = Component Score × 25% = [0-2.5] to TOTAL SCORE
```

**What It Measures**: Can operators actually complete workflows without abandonment?

**Data Source**: 
```
SELECT 
  (COUNT(*) FILTER (WHERE status = 'completed')) / COUNT(*) * 100 
FROM actions 
WHERE created_at >= TODAY - INTERVAL '1 day'
```

**Daily Example**:
```
Day 1: 40 attempted, 32 completed = 80% = 5 points contribution (1.25 to total)
Day 2: 56 attempted, 52 completed = 93% = 9 points contribution (2.25 to total)
Day 3: 52 attempted, 52 completed = 100% = 10 points contribution (2.5 to total)

Trend: 80% → 93% → 100% ✓ improving
```

**Success Threshold**: ≥9 points (≥90% completion rate)

---

## DIMENSION 2: OPERATOR CONFIDENCE (25%)

**Definition**: Self-reported confidence in using the system (1-5 scale)

**Calculation**:
```
Confidence_Avg = AVERAGE(daily_confidence_level)

Component Score = Confidence_Avg × 2
(Scales 1-5 → 2-10 points)

Contribution = Component Score × 25% = [0-2.5] to TOTAL SCORE
```

**What It Measures**: Do operators feel capable and comfortable?

**Data Sources**:
1. Daily report: "Confidence level in system: 1-5"
2. Weekly feedback: "I trust the system with decisions: 1-5"
3. Weekly feedback: "I feel I have full control: 1-5"

**Daily Example**:
```
Day 1: 
- Sarah: 3/5 (cautious)
- Mike: 4/5 (moderate)
- Lisa: 3/5 (nervous)
- Average: 3.33/5 = 6.66 points contribution (1.67 to total)

Day 2:
- Sarah: 4/5 (more confident)
- Mike: 4/5 (stable)
- Lisa: 3/5 (still nervous)
- Average: 3.67/5 = 7.33 points contribution (1.83 to total)

Day 3:
- Sarah: 4/5 (confident)
- Mike: 5/5 (very confident)
- Lisa: 4/5 (improving)
- Average: 4.33/5 = 8.67 points contribution (2.17 to total)

Trend: 3.33 → 3.67 → 4.33 ✓ improving
```

**Success Threshold**: ≥8 points (≥4/5 average confidence)

---

## DIMENSION 3: SUPPORT SELF-SUFFICIENCY (20%)

**Definition**: Percentage of actions completed WITHOUT requiring support intervention

**Calculation**:
```
Support_Dependency = (Support Tickets) / (Actions Attempted) × 100%
Self_Sufficiency = 100% - Support_Dependency

Component Score = Self_Sufficiency / 10
(If 70% self-sufficient: 70 / 10 = 7 points)
(If 100% self-sufficient: 100 / 10 = 10 points)

Contribution = Component Score × 20% = [0-2] to TOTAL SCORE
```

**What It Measures**: Can operators work independently without constant hand-holding?

**Data Source**:
```
Tickets = (SELECT COUNT(*) FROM support_tickets WHERE created_at >= TODAY - 1)
Actions = (SELECT COUNT(*) FROM actions WHERE created_at >= TODAY - 1)
Dependency = Tickets / Actions × 100%
Self_Sufficiency = 100% - Dependency
```

**Daily Example**:
```
Day 1:
- Actions attempted: 50
- Support tickets: 15
- Dependency: 30%
- Self-sufficiency: 70%
- Points: 7.0, contribution (1.4 to total)

Day 2:
- Actions attempted: 56
- Support tickets: 10
- Dependency: 18%
- Self-sufficiency: 82%
- Points: 8.2, contribution (1.64 to total)

Day 3:
- Actions attempted: 52
- Support tickets: 8
- Dependency: 15%
- Self-sufficiency: 85%
- Points: 8.5, contribution (1.7 to total)

Trend: 70% → 82% → 85% ✓ improving (operators becoming self-sufficient)
```

**Success Threshold**: ≥7 points (≥70% self-sufficiency / <30% dependency)

---

## DIMENSION 4: TRUST & SAFETY (20%)

**Definition**: No safety concerns + trust trending upward + no critical issues

**Calculation**:
```
Component Score = 10 points IF ALL true:
  □ Zero safety concerns reported
  □ Zero data integrity issues detected
  □ Zero silent mutations or lost data
  □ Trust level stable or improving
  □ Control level stable or improving
  
Component Score = 5 points IF ANY:
  □ One minor safety concern (investigated, resolved)
  □ One near-miss (prevented by guardrail)
  
Component Score = 0 points IF ANY:
  □ Multiple safety concerns
  □ Data integrity issue confirmed
  □ Silent mutation discovered
  □ Trust level declining

Contribution = Component Score × 20% = [0-2] to TOTAL SCORE
```

**What It Measures**: Is the system trustworthy and safe for operators?

**Data Source**:
```
Safety Concerns = (SELECT COUNT(*) FROM feedback_safety WHERE created_at >= TODAY - 1)
Data Issues = (SELECT COUNT(*) FROM support_log WHERE category = 'data_integrity')
Trust Trend = COMPARE(trust_level TODAY vs YESTERDAY)
```

**Daily Example**:
```
Day 1:
- Safety concerns: 0
- Data issues: 0
- Trust level: 4.0/5 ✓
- Trend: baseline
- Points: 10, contribution (2.0 to total)

Day 2:
- Safety concerns: 0
- Data issues: 0
- Trust level: 4.1/5 ✓
- Trend: improving
- Points: 10, contribution (2.0 to total)

Day 3:
- Safety concerns: 1 (investigated, turned out to be user confusion)
- Data issues: 0
- Trust level: 4.3/5 ✓
- Trend: improving
- Points: 5 (one minor concern), contribution (1.0 to total)

Ongoing: No actual issues → Trust maintained
```

**Success Threshold**: ≥8 points (zero to minor issues only)

---

## DIMENSION 5: ENGAGEMENT & GROWTH (10%)

**Definition**: Operators showing up, engaging, and improving over time

**Calculation**:
```
Component Score = 10 points IF ALL true:
  □ 100% of operators active (showing up each day)
  □ Action volume stable or increasing
  □ Repeat operator rate 100%
  □ Operators using advanced features
  
Component Score = 7 points IF:
  □ 100% of operators active
  □ Action volume stable
  
Component Score = 5 points IF:
  □ 90%+ of operators active
  □ Slight downward trend in engagement
  
Component Score = 0 points IF:
  □ Operator churn (someone stops showing up)
  □ Significant action volume decline
  □ Disengagement signals

Contribution = Component Score × 10% = [0-1] to TOTAL SCORE
```

**What It Measures**: Are operators excited and engaged, or showing fatigue/disengagement?

**Data Source**:
```
Active Operators = COUNT(DISTINCT operator_id WHERE last_action >= TODAY)
Action Trend = COMPARE(actions_today vs AVERAGE(actions_last_3_days))
Churn = COUNT(operators WHERE no_activity >= 2 DAYS)
Feature Usage = COUNT(actions_using_advanced_features)
```

**Daily Example**:
```
Day 1:
- Active: 3/3 operators ✓
- Actions: 50 (baseline)
- Churn: 0 ✓
- Advanced features: 0 (normal, first day)
- Points: 7, contribution (0.7 to total)

Day 2:
- Active: 3/3 operators ✓
- Actions: 56 (+12%, improving) ✓
- Churn: 0 ✓
- Advanced features: 2 (Sarah trying workspace filters)
- Points: 10, contribution (1.0 to total)

Day 3:
- Active: 3/3 operators ✓
- Actions: 52 (stable, expected)
- Churn: 0 ✓
- Advanced features: 5 (multiple operators)
- Points: 10, contribution (1.0 to total)

Trend: Consistent engagement, increasing feature discovery ✓
```

**Success Threshold**: ≥7 points (sustained engagement, no churn)

---

## TOTAL ADOPTION SCORE CALCULATION

### Score Rollup

```
TOTAL ADOPTION SCORE = 
    Workflow Completion (0-2.5) +
    Operator Confidence (0-2.5) +
    Support Self-Sufficiency (0-2) +
    Trust & Safety (0-2) +
    Engagement & Growth (0-1)
    ─────────────────────────────
    = [0-10] points (scaled to 0-100)

Final Score = Total × 10
```

### Daily Score Examples

**Example Day 1 (Strong Start)**:
```
Workflow Completion:     2.0 (80% completion)
Operator Confidence:     1.7 (3.4/5 avg)
Support Self-Sufficiency: 1.4 (70% self-sufficient)
Trust & Safety:          2.0 (no concerns)
Engagement & Growth:     0.7 (100% showing up)
                         ─────
Total:                   7.8 points
ADOPTION SCORE:          78/100

Status: GOOD START, WATCH CONFIDENCE
```

**Example Day 3 (Trajectory Improving)**:
```
Workflow Completion:     2.5 (100% completion) ✓
Operator Confidence:     2.2 (4.4/5 avg) ✓
Support Self-Sufficiency: 1.7 (85% self-sufficient) ✓
Trust & Safety:          2.0 (no concerns) ✓
Engagement & Growth:     1.0 (active + feature discovery) ✓
                         ─────
Total:                   9.4 points
ADOPTION SCORE:          94/100

Status: EXCELLENT TRAJECTORY - READY FOR BETA
```

**Example Day 4 (Problem Emerged)**:
```
Workflow Completion:     1.5 (70% completion) ❌
Operator Confidence:     1.5 (3.0/5 avg) ❌
Support Self-Sufficiency: 0.8 (60% self-sufficient) ❌
Trust & Safety:          0.0 (safety concern found) ❌
Engagement & Growth:     0.5 (declining engagement) ❌
                         ─────
Total:                   4.3 points
ADOPTION SCORE:          43/100

Status: PAUSE ALPHA - INVESTIGATE ISSUES
```

---

## DAILY ADOPTION DASHBOARD

```
╔══════════════════════════════════════════════════════════════════════════╗
║ OpsIQ ALPHA ADOPTION SCORE - 2026-05-22 (Day 3)                         ║
║ Trend: IMPROVING ✓                                                      ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║ OVERALL SCORE: 94 / 100                                    ████████░░   ║
║                                                                          ║
║ ┌────────────────────────────────────────────────────────────────────┐  ║
║ │ DIMENSION SCORES                                                   │  ║
║ ├────────────────────────────────────────────────────────────────────┤  ║
║ │ Workflow Completion:        2.5/2.5   ████████████████░░░░░░       │  ║
║ │ └─ 52/52 actions complete (100%) ✓                                 │  ║
║ │                                                                    │  ║
║ │ Operator Confidence:        2.2/2.5   ███████████████░░░░░░░       │  ║
║ │ └─ Avg: 4.4/5 (Sarah: 4, Mike: 5, Lisa: 4) ✓ improving            │  ║
║ │                                                                    │  ║
║ │ Support Self-Sufficiency:   1.7/2.0   ████████░░░░░░░░░░░░░       │  ║
║ │ └─ 8 tickets / 52 actions = 85% self-sufficient ✓                 │  ║
║ │                                                                    │  ║
║ │ Trust & Safety:             2.0/2.0   ██████████░░░░░░░░░░░       │  ║
║ │ └─ 0 safety concerns, 0 data issues, trust 4.3/5 ✓               │  ║
║ │                                                                    │  ║
║ │ Engagement & Growth:        1.0/1.0   ██████░░░░░░░░░░░░░░░       │  ║
║ │ └─ 3/3 operators active, +5 feature discoveries ✓                │  ║
║ │                                                                    │  ║
║ └────────────────────────────────────────────────────────────────────┘  ║
║                                                                          ║
║ TREND INDICATORS:                                                        ║
║ ├─ Completion rate:  80% → 93% → 100% ✓ improving                      ║
║ ├─ Confidence avg:   3.3 → 3.7 → 4.4  ✓ improving                      ║
║ ├─ Support dependency: 30% → 18% → 15% ✓ improving                     ║
║ ├─ Safety concerns:  0 → 0 → 0        ✓ clean                          ║
║ └─ Engagement:       stable → stable → growing ✓ positive              ║
║                                                                          ║
║ DECISION POINT:                                                          ║
║ ├─ Beta Ready? YES ✓ (score 94/100, all metrics green)                 ║
║ ├─ Continue Alpha? YES ✓ (all decision criteria met)                   ║
║ └─ Next: Monitor trajectory through rest of week                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## BETA READINESS DECISION GATE

### Decision Criteria (End of Alpha)

**PROCEED TO BETA IF**:
```
Adoption Score: ≥50/100
AND
Workflow Completion: ≥90%
AND
Operator Confidence: ≥4/5
AND
Support Dependency: <30%
AND
Trust & Safety: No unresolved concerns
AND
Engagement: 100% operator retention
AND
Trend: Positive or stable (not declining)
```

**Example**: "Alpha Day 5 score is 92/100 with strong upward trend. All decision criteria met. PROCEED TO BETA."

---

### Decision Criteria (PAUSE if)**:
```
Adoption Score: <50/100
OR
Workflow Completion: <75%
OR
Operator Confidence: <3/5
OR
Support Dependency: >40%
OR
Trust & Safety: Critical concern unresolved >4 hours
OR
Engagement: Operator churn detected
OR
Trend: Declining scores 2+ days in row
```

**Example**: "Alpha Day 4 score dropped to 43/100 with systemic issue found. PAUSE alpha, investigate, resume when resolved."

---

## WEEKLY ADOPTION SYNTHESIS

### Weekly Summary (Friday)

```
╔═══════════════════════════════════════════════════════════════════════╗
║ OpsIQ ALPHA ADOPTION - WEEKLY SYNTHESIS                               ║
║ Week of: 2026-05-20                                                   ║
║ Days Completed: 5 (Mon-Fri)                                           ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║ DAILY SCORES:                                                         ║
║ Day 1 (Mon): 78/100 ⬆️ (good start)                                   ║
║ Day 2 (Tue): 85/100 ⬆️ (improving)                                    ║
║ Day 3 (Wed): 92/100 ⬆️ (strong)                                       ║
║ Day 4 (Thu): 91/100 ➡️  (stable)                                      ║
║ Day 5 (Fri): 93/100 ⬆️ (continuing)                                   ║
║                        ─────────────                                  ║
║ WEEKLY AVERAGE:  87.8/100 ✓ STRONG                                    ║
║                                                                       ║
║ DIMENSION TRENDS:                                                     ║
║ ├─ Completion Rate:       80% → 85% → 100% → 98% → 99% ✓ strong    ║
║ ├─ Operator Confidence:   3.3 → 3.7 → 4.4 → 4.3 → 4.4 ✓ strong     ║
║ ├─ Support Dependency:    30% → 18% → 15% → 16% → 14% ✓ excellent ║
║ ├─ Trust & Safety:        10 → 10 → 5 → 10 → 10 ✓ solid             ║
║ └─ Engagement:            7 → 10 → 10 → 10 → 10 ✓ excellent         ║
║                                                                       ║
║ DECISION:                                                              ║
║ Alpha Week 1 Status: ✓ SUCCESSFUL                                     ║
║ Continue to Week 2: YES (all metrics positive)                        ║
║ Beta Readiness: CONDITIONAL (waiting for week 2 consistency)         ║
║                                                                       ║
║ FOCUS AREAS:                                                           ║
║ ✓ Workflow completion excellent                                       ║
║ ✓ Confidence rising steadily                                          ║
║ ✓ Operators becoming self-sufficient                                  ║
║ ✓ No safety concerns                                                  ║
║ ⚠️ Watch: Lisa's support dependency still 2x Sarah's (acceptable)     ║
║                                                                       ║
║ NOTES FOR WEEK 2:                                                      ║
║ - Expect scores may stabilize (won't improve infinitely)             ║
║ - Maintain >85 score to proceed to beta                              ║
║ - Monitor for new confusion topics (week 2 complexity)               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## END-OF-ALPHA DECISION REPORT

### Final Adoption Scorecard

At end of alpha (after 2-4 weeks), generate final report:

```
OpsIQ ALPHA FINAL ADOPTION SCORECARD
====================================

Final Adoption Score: 89/100

✓ Workflow Completion:        94% (target: >90%)
✓ Operator Confidence:        4.3/5 (target: >4)
✓ Support Dependency:         16% (target: <30%)
✓ Trust & Safety:             Clean (target: no critical issues)
✓ Engagement:                 100% retention (target: 100%)

DECISION: PROCEED TO CONTROLLED BETA ✓

Operators Ready:
  ✓ Sarah: Fully independent, feature discovery ongoing
  ✓ Mike:  Fully confident, minimal support dependency
  ✓ Lisa:  Confident, support dependency 25% (acceptable)

Recommendations for Beta:
  1. Implement R3 UX hardening before beta (error messages)
  2. Add metric tooltips (requested by all operators)
  3. Create workspace documentation (Lisa's main request)
  4. Continue daily reviews (good practice)

Beta Start Date: [date]
Beta Operator Count: Scale to 5-10 users (from current 3)
```

---

## ADOPTION SCORE IMPLEMENTATION

### Daily Calculation (Automated)

Create SQL query to run daily at 4:30 PM:

```sql
-- Daily Adoption Score Calculation
WITH metrics AS (
  SELECT
    -- Completion rate
    ROUND(
      COUNT(*) FILTER (WHERE status = 'completed')::float / 
      COUNT(*)::float * 100, 2
    ) as completion_rate,
    
    -- Support dependency
    (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE)
      ::float / COUNT(*)::float * 100 as support_dependency,
    
    -- Operator confidence (from daily reports)
    (SELECT AVG(confidence_level)::float FROM feedback_daily 
     WHERE created_at >= CURRENT_DATE) as avg_confidence,
    
    -- Safety concerns
    (SELECT COUNT(*) FROM feedback_safety 
     WHERE created_at >= CURRENT_DATE AND status = 'unresolved') as safety_concerns,
    
    -- Active operators
    COUNT(DISTINCT operator_id) as active_operators
    
  FROM actions
  WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
)
SELECT
  -- Component scores
  LEAST(10, (completion_rate / 10)::int) as completion_score,
  (avg_confidence * 2)::decimal as confidence_score,
  (100 - support_dependency) / 10 as sufficiency_score,
  (CASE WHEN safety_concerns = 0 THEN 10 ELSE 5 END) as safety_score,
  (CASE WHEN active_operators = 3 THEN 10 ELSE 7 END) as engagement_score,
  
  -- Total
  (
    (LEAST(10, (completion_rate / 10)::int) * 0.25) +
    ((avg_confidence * 2) * 0.25) +
    (((100 - support_dependency) / 10) * 0.20) +
    ((CASE WHEN safety_concerns = 0 THEN 10 ELSE 5 END) * 0.20) +
    ((CASE WHEN active_operators = 3 THEN 10 ELSE 7 END) * 0.10)
  ) * 10 as final_adoption_score
FROM metrics;
```

---

**Adoption Score Framework Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

The adoption score provides objective, data-driven evidence of alpha success and beta readiness.
