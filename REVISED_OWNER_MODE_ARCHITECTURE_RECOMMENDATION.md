# REVISED OWNER-MODE ARCHITECTURE RECOMMENDATION

**Date:** 2026-06-16  
**Context:** Architecture Ceiling Rule triggered (§17, execution_consultant_engine_v2.md)  
**Audit Basis:** ARCHITECTURE_CEILING_REPORT_AUDIT.md  
**Goal:** Enable owner-mode usefulness (private business diagnostic), not consultant-grade claims  

---

## EXECUTIVE SUMMARY

The Architecture Ceiling Report recommends a 12-week / 6-FTE / €200-300k path (Option E + C) to reach consultant-grade autonomous accuracy. However, this solves for the wrong goal: public SaaS / autonomous claims rather than private owner-mode usefulness.

**Revised Recommendation:** PATH 1 or PATH 2 (not PATH 3).

Owner-mode usefulness does not require consultant-grade accuracy (80%+). It requires:
- Evidence clearly surfaced (top-5 evidence items highlighted)
- Plausible hypotheses listed (top-3 candidates, not pick-one diagnosis)
- Actionable next steps (constraint-aware, not generic)
- Owner approval (owner validates and decides, not autonomous engine)

**PATH 1 delivers this in 7.5 weeks / 2-3 FTE / €30-50k.**  
**PATH 2 adds incremental pattern improvement for ~20% accuracy, same timeline.**  
**PATH 3 is over-engineered for private use, only justified if monetized as SaaS.**

---

## WHAT OWNER-MODE ACTUALLY NEEDS

### The Owner's Use Case (Actual)

**Goal:** Analyze my business problem, understand root causes, prioritize next actions  
**Mode:** Private, confidential, under my control  
**Validation:** I will check the diagnosis myself; I don't trust automation  
**Timeline:** Weeks, not months  
**Cost:** Affordable investment (€30-50k), not major consulting engagement (€200-300k)  
**Utility:** Useful at 30% accuracy if I get 3 hypotheses to evaluate; useless at 0% if I get 1 wrong diagnosis  

### What Owner-Mode Does NOT Need

✗ Autonomous 80%+ accuracy (owner will validate)  
✗ Public SaaS infrastructure (private use)  
✗ Hired expert reviewers (owner is the reviewer)  
✗ Consultant-grade certification (diagnostic tool, not certified consultant)  
✗ Production scaling (single owner, not thousands of clients)  

---

## REVISED PATHS

### PATH 1: Owner-Mode Useful (Recommended)

**Objective:** Diagnostic assistant that surfaces evidence and proposes hypotheses  
**Position:** "Structured diagnostic assistant for private business analysis"  

**What Gets Built:**

1. **Evidence Trace Improvement (2 weeks)**
   - Current: 58.5% of evidence referenced
   - Target: 75% of evidence referenced
   - Method: Audit Round 2 cases, identify missing evidence dimensions, update engine to check all dimensions
   - Outcome: Owner sees what evidence the engine examined

2. **Multi-Hypothesis Output (1 week)**
   - Current: Engine picks one diagnosis
   - Target: Engine outputs top-3 candidates ranked by confidence
   - Method: Modify diagnosis engine to surface runner-up patterns and scores
   - Outcome: Owner chooses from 3 candidates instead of trusting one diagnosis

3. **Constraint-Aware Action Weighting (1.5 weeks)**
   - Current: Actions are generic ("conduct analysis", "improve quality")
   - Target: Actions are ranked by constraint impact (speed, cost, risk)
   - Method: Add constraint weights to action selection, show owner which constraints matter most
   - Outcome: Owner understands why action is recommended despite constraints

4. **LLM Reviewer Second Opinion (2 weeks)**
   - Current: Engine outputs deterministic diagnosis only
   - Target: Add guardrailed LLM to validate evidence + offer alternative view
   - Method: LLM reviews engine's evidence trace, flags missing perspectives, bounded confidence
   - Constraints: Evidence-only (no hallucination), citation required, confidence bounded, marked "advisory"
   - Outcome: Owner gets two perspectives (deterministic + reasoning) without over-claiming

5. **Testing + Documentation (1 week)**
   - Run PATH 1 output on Round 2 test cases
   - Document evidence trace visibility, hypothesis ranking, action constraints
   - Outcome: Owner knows what to expect and how to interpret output

**Total Effort:**  
- Timeline: 7.5 weeks (can parallelize some components, 6-7 weeks realistically)
- Team: 2-3 FTE (1 backend engineer for evidence trace + hypothesis, 0.5 FTE for LLM reviewer guardrails, 0.5 FTE QA + docs)
- Cost: €30-50k (outsource LLM setup if needed)

**Expected Outcome:**

| Metric | Current | PATH 1 | Target |
|--------|---------|--------|--------|
| Evidence trace rate | 58.5% | 75% | 95% |
| Root-cause accuracy (best) | 0% | ~0% | — |
| Hypotheses offered | 1 (wrong) | 3 (1-2 useful) | — |
| Owner utility | ZERO | HIGH | — |
| Safety | Clean | Clean | — |
| Consultant-grade claim | No | No | — |

**What Owner Gets:**

```
Input:  Business case with evidence
Output:

Diagnosis (Confidence ≤65%):
  Primary Hypothesis: UNIT_ECONOMICS_BREAKDOWN
    - Evidence Supporting: 3/5 metrics, margin compression, cost structure
    - Evidence Against: demand appears stable, quality not mentioned
    - LLM Alternative View: could be early-stage DEMAND_FORECASTING_MISMATCH if growth stalled

  Alternative Hypotheses (Lower Confidence):
    2. DEMAND_FORECASTING_MISMATCH (Confidence ~40%)
    3. OPERATIONAL_BOTTLENECK (Confidence ~35%)

Evidence Trace:
  ✓ Financial metrics (5/5 available)
  ✓ Market position (3/4 available)
  ⚠ Team capability (1/3 available - engine didn't examine team issues)
  ⚠ Customer satisfaction (0/2 available - missing data)

Recommended Action (with Constraints):
  Primary: Conduct cost structure audit
    - Why: Unit economics data shows margin compression
    - Constraint Impact: Cost (€5-10k), Timeline (3 weeks), Risk (low)
    - Alternative: margin-protection repricing (faster, €2k, higher market risk)

Owner Decision: 
  I'll use cost audit as primary, hold repricing as backup if margins don't improve
```

**Owner Claim Allowed:** "Structured diagnostic assistant for private business analysis"

**Owner Claim Prohibited:** "Consultant-grade autonomous diagnosis", "80% accuracy", "Can replace expert review"

---

### PATH 2: Moderate Improvement

**Objective:** Incremental pattern improvement + evidence visibility + LLM safety net  
**Position:** "Diagnostic assistant with pattern-based hypothesis generation"  

**What Gets Built:**

PATH 1 components PLUS:

1. **Pattern Expansion (2-3 weeks)**
   - Add 15-20 new patterns targeting Round 2 root-cause labels
   - Focus: Root causes that appear 2-3 times (DEMAND_FORECASTING_MISMATCH, GO_TO_MARKET_MISALIGNMENT)
   - Method: Analyze Round 2 answer keys, extract decision rules, encode as patterns
   - Outcome: Accuracy improves 0% → 20-30% for recognized cases

2. **Real Owner Case Testing (1 week)**
   - Apply engine to actual owner business case
   - Validate that patterns and evidence trace work on real (not synthetic) data
   - Outcome: Owner confidence in engine before full deployment

**Total Effort:**
- Timeline: 7-8 weeks (1-2 weeks longer than PATH 1 for pattern work)
- Team: 2-3 FTE (same as PATH 1 + 1-2 weeks of domain expert for pattern encoding)
- Cost: €40-60k

**Expected Outcome:**

| Metric | Current | PATH 2 | Target |
|--------|---------|--------|--------|
| Evidence trace rate | 58.5% | 75% | 95% |
| Root-cause accuracy | 0% | 20-30% | — |
| Hypotheses offered | 1 | 3 | — |
| Owner utility | ZERO | VERY HIGH | — |
| Patterns active | ~10 | ~25-30 | — |
| Safety | Clean | Clean | — |

**Why Choose PATH 2 Over PATH 1:**

- Owner gets 20-30% accuracy vs 0-5% (much more useful)
- Owner sees 3 hypotheses, one often correct
- Same timeline and cost, slightly higher complexity
- Lower risk than 12-week paths (testable in 7 weeks, not 12)

**Owner Claim Allowed:** "Diagnostic assistant with pattern-based hypothesis generation"

**Owner Claim Prohibited:** "Consultant-grade", "80%+ accuracy", "Fully reliable diagnosis"

---

### PATH 3: Full Consultant-Grade (Not Recommended)

**Objective:** Autonomous consultant-grade diagnosis (80%+ accuracy) via human review  
**Position:** This is the Architecture Ceiling Report's recommendation  

**What Gets Built:**

1. Evidence synthesis + hypothesis ranking engine (6 weeks)
2. Constraint-aware action selection (3 weeks)
3. Human expert review infrastructure (4 weeks, hiring + training)
4. Scaling and production setup (1-2 weeks)

**Total Effort:**
- Timeline: 12-14 weeks (realistic with iteration)
- Team: 6-8 FTE (backend, frontend, domain experts, reviewers, product, devops)
- Cost: €200-400k (engineering + reviewer salary)
- Ongoing: €60-100k/year (reviewer salaries)

**Expected Outcome:**

| Metric | Current | PATH 3 | Target |
|--------|---------|--------|--------|
| Root-cause accuracy | 0% | 95%+ | 80%+ ✓ |
| Evidence trace | 58.5% | 95%+ | 95%+ ✓ |
| Owner utility | ZERO | CONSULTANT-GRADE | CONSULTANT-GRADE ✓ |
| Safety | Clean | Clean | — |
| Time-to-useful | Never | 12 weeks | — |

**Verdict:** This path is justified ONLY if:

✓ Converting to paid SaaS / consulting service  
✓ Need 95%+ autonomous accuracy (consultant-grade claims required)  
✓ Scaling to 100+ clients (infrastructure investment justified)  
✓ Revenue can justify €200-400k + €60-100k/year  

For private owner-mode use, this is over-engineered by 4-6 weeks and €100-150k.

---

## DECISION FRAMEWORK

### Choose PATH 1 If:

- Owner priority is speed (7 weeks vs 12 weeks)
- Owner budget is tight (€30-50k vs €200-400k)
- Owner will validate diagnosis themselves
- Owner comfortable with diagnostic assistant vs autonomous consultant
- Willing to make decisions with 3 candidates + owner judgment

**Timeline:** 7.5 weeks  
**Cost:** €30-50k  
**Owner Utility:** HIGH (structured evidence + hypotheses + action guidance)

### Choose PATH 2 If:

- Owner priority is modest accuracy improvement (20-30% vs 0%)
- Owner wants to test patterns on real case (risk mitigation)
- Owner budget allows €40-60k
- Owner wants higher confidence in top hypothesis
- Same timeline as PATH 1, worth the investment

**Timeline:** 7-8 weeks  
**Cost:** €40-60k  
**Owner Utility:** VERY HIGH (20-30% accuracy + evidence + hypotheses)

### Choose PATH 3 If:

- Owner is monetizing (SaaS, consulting service)
- Owner needs 95%+ autonomous accuracy for marketing claims
- Owner has budget for €200-400k + ongoing reviewer salary
- Market opportunity justifies 12-week timeline
- Willing to wait 12 weeks for launch

**Timeline:** 12-14 weeks  
**Cost:** €200-400k  
**Owner Utility:** CONSULTANT-GRADE (independent of owner validation)

---

## CLAIMS ALLOWED BY PATH

| Claim | PATH 1 | PATH 2 | PATH 3 |
|-------|--------|--------|---------|
| "Diagnostic assistant" | ✓ | ✓ | ✓ |
| "Evidence-driven" | ✓ | ✓ | ✓ |
| "Multiple hypotheses" | ✓ | ✓ | ✓ |
| "20%+ accuracy" | ✗ | ✓ | ✓ |
| "Consultant-grade (80%+)" | ✗ | ✗ | ✓ |
| "Autonomous diagnosis" | ✗ | ✗ | ✓ |
| "Owner approval required" | ✓ | ✓ | ✗ |
| "For private use only" | ✓ | ✓ | ✗ |

---

## RECOMMENDED PATH: PATH 1 or PATH 2

**Primary Recommendation:** PATH 1 (fastest, cheapest, delivers owner utility immediately)

**Secondary Recommendation:** PATH 2 (if owner wants to reduce risk by testing on real case)

**Not Recommended for Owner-Mode:** PATH 3 (over-engineered, 12 weeks, €200-400k, only justified if monetizing)

---

## WHAT NOT TO BUILD

**Do NOT:**
- ✗ Build full causal reasoning layer (PATH 3 scope, 4-6 weeks, not needed for owner-mode)
- ✗ Hire expert reviewers (PATH 3 scope, expensive, not needed if owner validates)
- ✗ Scale to SaaS infrastructure (PATH 3 scope, unnecessary for private use)
- ✗ Claim consultant-grade without human review (safety/ethics issue)
- ✗ Spend 12 weeks on incremental improvements (diminishing returns)

**Do instead:**
- ✓ Improve evidence trace (2 weeks, high ROI)
- ✓ Show top-3 hypotheses (1 week, high ROI)
- ✓ Add constraint awareness (1.5 weeks, medium ROI)
- ✓ Add guardrailed LLM reviewer (2 weeks, medium ROI)
- ✓ Test on real case (1 week, risk mitigation)
- ✓ Document for owner use (1 week, essential)

---

## BENCHMARK REQUIREMENTS

### For PATH 1 or PATH 2 to be Approved

**Pre-Implementation Gate:**
- ✓ ARCHITECTURE_CEILING_REPORT_AUDIT.md exists and is reviewed
- ✓ Owner confirms owner-mode use case (not SaaS, not consultant-grade claims)
- ✓ Owner selects PATH 1 or PATH 2 (not PATH 3)

**Post-Implementation Gate:**
- ✓ Evidence trace improves to 75%+ (measurable)
- ✓ Top-3 hypotheses shown (can show 3 on output, not pick-one)
- ✓ LLM reviewer is guardrailed (no hallucinations, evidence-cited, bounded confidence)
- ✓ Owner review on real case successful (owner validates output is useful)

---

## SAFETY REQUIREMENTS

### For PATH 1 or PATH 2

All safety gates from Round 2 must PASS:
- ✓ 0 dangerous recommendations (cannot recommend illegal, unethical, or high-risk actions)
- ✓ 0 hallucinations (all evidence must exist in input)
- ✓ 0 false confidence (confidence ≤ 65% for diagnosis)
- ✓ Evidence trace ≥ 75% (at least 75% of evidence examined)

### LLM Reviewer Guardrails (PATH 1 & 2)

- ✓ LLM can only review evidence provided by deterministic engine
- ✓ LLM must cite evidence when suggesting alternatives
- ✓ LLM cannot recommend actions not in action library
- ✓ LLM output marked "Alternative perspective, not validated"
- ✓ Owner must approve before any action taken

---

## FINAL STATUS

**OWNER_MODE_REVISED_ARCHITECTURE_READY_FOR_USER_DECISION** ✓

All three paths analyzed:
- PATH 1: 7.5 weeks, €30-50k, owner-mode diagnostic assistant ← RECOMMENDED
- PATH 2: 7-8 weeks, €40-60k, diagnostic assistant + 20-30% accuracy ← RECOMMENDED
- PATH 3: 12 weeks, €200-300k, consultant-grade autonomous (not recommended for owner-mode)

Owner may now choose which path to pursue.

---

**Next Step:** Awaiting owner decision on PATH 1, PATH 2, or alternative approach.
