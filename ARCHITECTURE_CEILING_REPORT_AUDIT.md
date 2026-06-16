# ARCHITECTURE CEILING REPORT — HOSTILE AUDIT

**Date:** 2026-06-16  
**Audit Perspective:** Owner-mode usefulness (private use), not public SaaS or autonomous consultant claims  
**Principle:** Question every assertion in the Architecture Ceiling Report

---

## ACCEPTED FINDINGS

These findings from the Architecture Ceiling Report are correct and evidence-backed:

1. **Round 2 showed 0% root-cause accuracy** ✓
   - Evidence: ROUND_2_EXECUTION_CLOSEOUT.md shows 0% on all case types
   - This is factual and measured

2. **Safety metrics are clean: 0 dangerous, 0 hallucinations, 0 leakage** ✓
   - Evidence: All Round 2 cases passed safety gates
   - Engine preserves safety even when accuracy is low
   - This is a strength, not a weakness

3. **Evidence trace rate is low (58.5%)** ✓
   - Engine references only ~58% of available evidence
   - This explains poor accuracy: missing evidence → incomplete reasoning
   - Measured and valid

4. **Pattern-matching alone cannot handle Round 2 complexity** ✓
   - Round 1: simple cases, 15% accuracy
   - Round 2: complex multi-dimensional cases, 0% accuracy
   - Regression is clear; pattern-matching has limits

5. **First-priority actions are generic, not case-specific** ✓
   - Answer keys show actions are tailored (e.g., "3-week vs 12-week diagnostic based on timeline")
   - Engine produces generic actions (e.g., "conduct analysis")
   - This is a real gap

6. **Output quality gate passes 78% of cases** ✓
   - Even though root-cause accuracy is 0%, most cases produce useful structure
   - Engine avoids returning "unknown/insufficient" when evidence is present
   - This suggests the engine's output scaffolding is sound

---

## REJECTED OR OVERSTATED FINDINGS

These findings in the Architecture Ceiling Report are either wrong or overstated:

### 1. **Claim: "0% accuracy proves deterministic patterns have reached ceiling"**

**Audit Finding:** ✗ OVERSTATED

**Evidence:**
- The report claims pattern-matching ceiling is ~20% accuracy (Option A)
- But this is not tested; it's estimated
- Round 1 achieved 15% with ~10 patterns
- Round 2 has 50 cases, 9 labels, complex evidence
- With 20-30 more targeted patterns, accuracy might reach 25-35% without major rearchitecture

**Counter-claim:** Incremental pattern expansion was not actually tested. The ceiling might be 30-40%, not 20%. This matters for owner-mode where 30% is useful (user has 3 candidates to choose from).

**Why it matters:** If we build even 15-20 more patterns targeting Round 2 root causes, we might achieve 25-30% accuracy in 2-3 weeks of work. The report dismisses this as "not worth it" for consultant-grade, but it IS worth it for owner-mode.

---

### 2. **Claim: "Human expert review is mandatory for consultant-grade"**

**Audit Finding:** ✓ TRUE for consultant-grade; ✗ FALSE for owner-mode

**Evidence:**
- For consultant-grade (autonomous 80%+ claims): YES, human review needed
- For owner-mode (user knows it's advisory): NO, human review optional
- The report conflates the two objectives

**Counter-claim:** For owner-mode, no human review is required. The owner IS the reviewer. The engine should present evidence + top hypotheses, owner decides. This is cheaper and faster than 12 weeks + human reviewer hiring.

---

### 3. **Claim: "12 weeks / 6 FTE is necessary for useful improvement"**

**Audit Finding:** ✗ OVERSTATED / UNJUSTIFIED

**Evidence:**
- The report proposes Option E + C (human review + evidence synthesis)
- This is designed for consultant-grade (autonomous 80%+), not owner-mode
- For owner-mode, we don't need consultant-grade accuracy
- We only need: evidence well-presented + engine's best guess + owner decides

**Counter-claim:** A much smaller effort could deliver owner-mode value:
- Option 1: Use engine as-is (0 weeks) + owner presents case manually (1 hour per case) = useless
- Option 2: Improve evidence trace (2 weeks) + show top-3 hypotheses (1 week) = probably useful
- Option 3: Add 15 more patterns (2-3 weeks) + LLM reviewer for second opinion (2 weeks, guardrailed) = likely useful
- Option 4: Full hybrid (12 weeks) = consultant-grade but expensive

For owner-mode, Option 2 or 3 might be sufficient. The report skips these options.

---

### 4. **Claim: "Current architecture is fundamentally broken"**

**Audit Finding:** ✗ MISCHARACTERIZED

**Evidence:**
- The engine outputs structured recommendations (diagnosis + action + constraints + metrics)
- 78% of cases pass the quality gate (specificity and usefulness checks)
- Safety is clean (no dangerous, hallucination, or leakage)
- The only failure is root-cause accuracy (0%)

**Counter-claim:** The engine is not broken. It's incomplete. It can:
✓ Structure evidence clearly (56% trace)
✓ Suggest a diagnosis (even if wrong)
✓ Propose first action (even if generic)
✓ Check constraints (even if not weighted)
✗ Get diagnosis correct (0% accuracy)
✗ Generate case-specific actions (actions are generic)

For owner-mode, this is salvageable. For consultant-grade, it's insufficient. The report treats them the same.

---

## UNSUPPORTED CLAIMS

### 1. **"Evidence synthesis engine can reach 60-75% accuracy"**

**Audit Finding:** ✗ NO EVIDENCE PROVIDED

The report proposes Option C (evidence synthesis + hypothesis ranking) without testing or demonstrating that it works. The claim is:
- "Multi-dimensional evidence aggregator" will solve evidence trace (58.5% → 80%+)
- "Competing-hypothesis evaluator" will improve root-cause accuracy (0% → 60%+)

But there is no proof. No prototype, no test results, no concrete rule examples. This is speculation.

**Risk:** Committing 6 weeks and €150k for "60-75% accuracy" when the actual result might be 40-50% or 30-40% is not justified.

---

### 2. **"Human review adds 20-25 percentage points of accuracy"**

**Audit Finding:** ✗ NO EVIDENCE PROVIDED

The report claims Option E (human-in-the-loop review) gets from 75% to 95%+. But:
- No reviewer training data
- No reviewer agreement benchmarks
- No data on how many cases a reviewer can handle
- No cost estimate for hiring/training reviewers

This is assumed, not validated.

---

### 3. **"12-week timeline is realistic"**

**Audit Finding:** ✗ NO EVIDENCE PROVIDED

The breakdown shows 6 weeks for Phase 1 (evidence synthesis engine) but:
- No engineering estimates for causal reasoning layer
- No testing and iteration buffer
- No scope for "rule encoding is brittle" (acknowledged risk)
- Assumes 1 senior engineer can build hypothesis ranking engine in 1.5 weeks (seems optimistic)

**Risk:** This timeline is probably 18-24 weeks with realistic buffers.

---

### 4. **"Only 6 FTE needed"**

**Audit Finding:** ✗ UNDERSTATED / UNJUSTIFIED

The report lists:
- 1 senior backend engineer (lead)
- 1 mid-level backend engineer (support)
- 1 QA engineer
- 1 frontend engineer
- 1 domain expert
- 1 product manager

But:
- Domain expert needs to encode ~100+ rules (1 FTE not enough; realistically 0.5 FTE + consultants)
- If reviewer hiring is needed, add HR/recruiting (0.5 FTE)
- If scaled to production, add DevOps/infra (0.5 FTE)
- Product manager likely needs to be full-time to manage this complexity

**Realistic estimate:** 7-8 FTE for 12-18 weeks, not 6 FTE for 12 weeks.

---

## EVIDENCE-SUPPORTED CLAIMS (Likely True)

1. **Deterministic patterns don't generalize well** — Owner-mode implication: test new patterns on real owner cases, not just benchmarks

2. **Constraint-aware action selection is missing** — Owner-mode implication: add constraint weighting (small effort) before any major rearchitecture

3. **Adversarial and blind-outcome reasoning are hard for deterministic approaches** — Owner-mode implication: these are benchmark test cases, not owner requirements. Owner doesn't care about adversarial traps; they care about real cases.

4. **Safety is not the bottleneck** — Owner-mode implication: we can afford to take more risks on accuracy without breaking safety. This opens up LLM options.

---

## OWNER-MODE IMPLICATIONS

### What the Owner Actually Needs

The owner (user) objective is:
- Private use: analyze my own business case
- Advisory: I'll validate the diagnosis myself
- Fast: weeks, not months
- Cheap: €20-50k, not €200k+
- Useful: even at 30% accuracy, if I get 3 candidates to choose from

The owner does NOT need:
- ✗ Autonomous consultant-grade (80%+ accuracy)
- ✗ Public SaaS infrastructure
- ✗ Human expert review at scale
- ✗ 100% safety (owner will verify)
- ✗ Certified consultant credentials

**Implication:** The Architecture Ceiling Report is solving for the wrong problem. It's optimizing for "autonomous consultant claims," not "useful private diagnostic tool."

### Revised Goal for Owner-Mode

"OpsIQ produces structured diagnostic suggestions (diagnosis + evidence + actions + constraints) that help the owner reason through their business problem. The owner is responsible for validating and deciding. The engine should surface evidence well and suggest plausible hypotheses, not claim to diagnose."

This is a much lower bar. It's achievable in 4-6 weeks, not 12 weeks.

---

## PUBLIC SAAS IMPLICATIONS

If the goal were public SaaS / autonomous consultant-grade, the report's recommendation (Option E + C) is reasonable:
- Evidence synthesis + hypothesis ranking (6 weeks)
- Human expert review (3 weeks)
- Scaling review workflow (4 weeks)
- Launch (1 week)
- = 12-14 weeks realistic

But the cost is ~€200-300k for engineering + reviewer infrastructure. This is only justified if SaaS market demand exists and pricing can recover this investment.

**The report doesn't address:** Is there market demand for "consultant-grade + human review SaaS"? Existing services (Bain, BCG, etc.) already do this, and they're trusted brands.

---

## RECOMMENDED REVISED PATH

Instead of the Architecture Ceiling Report's recommendation (Option E + C, 12 weeks, 6 FTE, €200k), consider:

### PATH 1: Owner-Mode Useful (Recommended)

**Goal:** Diagnostic assistant that surfaces evidence and suggests hypotheses

**Components:**
1. Keep current engine as-is (deterministic, safe)
2. Improve evidence trace from 58.5% to 75% (2 weeks)
3. Show top-3 hypothesis candidates instead of picking one (1 week)
4. Add constraint-aware action weighting (1.5 weeks)
5. Add LLM reviewer for second opinion (guardrailed, 2 weeks)
6. Testing + docs (1 week)

**Total:** 7.5 weeks, 2-3 FTE, €30-50k

**Expected outcome:**
- Evidence visibility: improved 58% → 75%
- Accuracy: stays ~0% for best hypothesis, but user sees 3 candidates
- Owner utility: HIGH (owner sees evidence, picks favorite hypothesis)
- Safety: maintained (LLM guardrails + owner approval)

**Owner claim allowed:** "Evidence-driven diagnostic assistant for private business analysis"

---

### PATH 2: Moderate Improvement (Alternative)

**Goal:** Small deterministic improvements + LLM safety net

**Components:**
1. Add 15-20 new patterns targeting Round 2 root causes (2-3 weeks)
2. Improve evidence trace to 75% (2 weeks)
3. Add LLM reviewer (guardrailed, 2 weeks)
4. Test on real owner case (1 week)

**Total:** 7-8 weeks, 2-3 FTE, €40-60k

**Expected outcome:**
- Root-cause accuracy: improves 0% → 20-30%
- Owner utility: HIGH (owner gets diagnosis + 2-3 alternatives)
- Safety: maintained

**Owner claim allowed:** "Diagnostic assistant with pattern-based hypothesis generation"

---

### PATH 3: Full Consultant-Grade (Not Recommended for Owner-Mode)

This is the Architecture Ceiling Report's recommendation (Option E + C).

**Total:** 12 weeks, 6-8 FTE, €200-300k

**Expected outcome:**
- Root-cause accuracy: 75% (engine) + 95% (human review) = consultant-grade
- Safety: maintained
- Owner utility: same as PATH 1/2 if used privately, but over-engineered

**Owner claim allowed:** "Hybrid engine + expert review consultant service" (but this is consulting, not software)

**Verdict:** Only makes sense if monetized as SaaS or consulting service. Not cost-effective for private owner-mode use.

---

## WHAT EACH OPTION DELIVERS FOR OWNER-MODE

| Option | Time | Cost | Owner Utility | Safety | Claim |
|--------|------|------|---------------|--------|-------|
| **A: Patterns only** | 2-3w | €20-30k | Modest (20-30% accuracy) | Clean | Low-risk suggestion |
| **B: Causal layer** | 4-6w | €60-80k | Moderate (40-60% accuracy) | Clean | Moderate suggestion |
| **C: Evidence synth** | 4-6w | €70-100k | Moderate (60-75% accuracy) | Clean | Moderate suggestion |
| **D: Hybrid Det+LLM** | 3-4w | €40-60k | HIGH (3 candidates) | Guardrailed | Diagnostic assistant |
| **E: Human review** | 12w | €200-300k | HIGH (consultant-grade) | Expert-validated | Consultant service |
| **F: Diagnostic assist** | 4-6w | €50-80k | HIGH (evidence + hypotheses) | Guardrailed | Diagnostic assistant |

---

## HOSTILITY FINDINGS

### 1. **The report doesn't distinguish owner-mode from SaaS-mode**

The Architecture Ceiling Report treats all paths as if they're building for consultant-grade / public SaaS. It doesn't ask: "What if we just build for the owner?"

**Implication:** 12-week timeline is inflated by 4-6 weeks of unnecessary scope (reviewer hiring, SaaS infra, public claims).

---

### 2. **The report dismisses Option A (pattern expansion) without testing**

The report claims pattern expansion has a "ceiling at ~20%" but:
- Doesn't estimate how many new patterns are actually needed
- Doesn't test whether 20 more patterns could reach 30%
- Assumes pattern generalization won't improve, without data

**Implication:** Pattern expansion might be viable for owner-mode and should have been tested before dismissing.

---

### 3. **The report assumes LLM reasoning is risky but doesn't explore guardrails**

The report mentions Option D (deterministic + LLM reviewer) but dismisses it as "introduces non-determinism; loses auditability."

But with proper guardrails:
- Evidence must be cited (no hallucination)
- Confidence must be bounded
- Unsafe actions must be blocked
- Output is marked advisory
- Owner approval required

This is not non-deterministic; it's guardrailed. The report doesn't explore this.

**Implication:** LLM reviewer option is viable for owner-mode and undersold.

---

### 4. **The report doesn't cost-justify the 12-week effort**

The report proposes:
- 12 weeks + €200-300k investment
- For "consultant-grade" 95% accuracy via human review
- But doesn't ask: "Is consultant-grade necessary for owner-mode?"

Answer: NO. Owner just needs evidence visible and top-3 hypotheses. This is achievable in 7 weeks for €40-60k.

---

### 5. **The report doesn't address the actual bottleneck: cost to hire/train reviewers**

If human review is part of Option E, the report needs to:
- Estimate hiring 2-3 domain expert reviewers
- Budget reviewer salary (~€60k/year each)
- Training time (~4 weeks per reviewer)
- Quality validation / disagreement resolution

**Cost implication:** Option E's €200-300k budget for engineering is only Phase 1. Reviewer hiring and scaling adds another €200-400k/year ongoing.

The report doesn't acknowledge this.

---

## FINAL AUDIT VERDICT

### Accepted: Architecture Ceiling Report is Correct About...
- Deterministic patterns have limits
- Round 2 showed 0% accuracy (fact)
- Safety is clean (strength)
- Evidence trace is weak (diagnosed correctly)

### Rejected: Architecture Ceiling Report is Wrong About...
- That only 12-week consultant-grade path is viable
- That incremental patterns are not worth testing
- That LLM reviewer introduces unacceptable non-determinism (false with guardrails)
- That owner-mode needs the same architecture as SaaS-mode (false)

### Unsupported: Architecture Ceiling Report Makes Claims Without Evidence...
- "Evidence synthesis can reach 60-75%" (untested)
- "Human review adds 20 points" (no data)
- "12 weeks is realistic" (likely 18-24 weeks with iteration)
- "6 FTE is sufficient" (probably 7-8 FTE)

### Missing: Architecture Ceiling Report Doesn't Address...
- What the owner actually needs (private diagnostic, not public SaaS)
- Faster paths (4-6 weeks instead of 12)
- Cheaper paths (€40-60k instead of €200-300k)
- LLM options with guardrails
- Cost of reviewer hiring / scaling

---

**AUDIT CONCLUSION: The Architecture Ceiling Report solves the wrong problem. It optimizes for consultant-grade / SaaS, not for owner-mode usefulness. A revised path (Option D or F) can deliver useful output in 4-6 weeks for €40-60k, rather than 12 weeks for €200-300k.**

