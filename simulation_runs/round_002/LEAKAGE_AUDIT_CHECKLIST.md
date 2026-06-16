# Round 2 Leakage Audit Checklist

**Purpose:** Verify that answer keys contain no hints or information that could be inferred from case inputs. Prevents information leakage from answer keys into case data.

**Authority:** ROUND_2_CASE_PACK_SPECIFICATION.md §8 (Quality Requirements)  
**Requirement:** Leakage audit must PASS before Round 2 execution begins

---

## Audit Principle

The case input (01_case_input.json) should contain **only evidence and context**, never hints about the answer. When an independent domain expert reads ONLY the case input (not the answer key), they should NOT be able to infer the answer key's diagnosis or recommendation.

**Example of leakage (FAIL):**
- Case input statement: "The company faces a BRAND_EROSION problem due to competitor entry."
- This explicitly names the diagnosis archetype, defeating blind diagnosis.
- Leakage detected; case fails audit.

**Example of no leakage (PASS):**
- Case input statement: "NPS declined from 72 to 48. Customer feedback cites 'quality concerns' and 'brand perception.' Market share lost to Competitor X."
- A domain expert can infer BRAND_EROSION from this evidence, but the diagnosis is NOT explicit.
- No leakage; case passes audit.

---

## Audit Checklist

### For Each Case (RW, PD, SYN, ADV, BLND)

**A. Root-Cause Diagnosis Leakage (CRITICAL)**

- [ ] **A1:** Case input does NOT explicitly name the diagnosis archetype (e.g., "BRAND_EROSION problem," "unit economics breakdown")
- [ ] **A2:** Case input does NOT state conclusion about root cause (e.g., "The root cause is X")
- [ ] **A3:** Case input does NOT provide only evidence supporting the answer-key diagnosis while omitting contradictory evidence
- [ ] **A4:** Case input does NOT summarize diagnosis logic (e.g., "We tried X, Y, Z and determined Z is the issue")
- [ ] **A5:** If answer key diagnosis is UNKNOWN or INSUFFICIENT_EVIDENCE, case input DOES contain genuine evidence ambiguity (not fake uncertainty)

**Scoring:**
- PASS if all A1-A5 are TRUE
- FAIL if any A1-A5 is FALSE

---

**B. First-Action Recommendation Leakage (CRITICAL)**

- [ ] **B1:** Case input does NOT specify the recommended action (e.g., "We should hire a brand consultant")
- [ ] **B2:** Case input does NOT provide only evidence supporting answer-key action (e.g., including budget data only if action costs money)
- [ ] **B3:** Case input does NOT state owner's decision or path forward (unless historical context)
- [ ] **B4:** If answer key action requires specific data not yet available, case input DOES omit that data (leaves it as "unavailableData")
- [ ] **B5:** Case input does NOT summarize action logic for decision-maker (e.g., "We narrowed to three options and chose X")

**Scoring:**
- PASS if all B1-B5 are TRUE
- FAIL if any B1-B5 is FALSE

---

**C. Evidence Framing Leakage (MEDIUM)**

- [ ] **C1:** Case input presents evidence in neutral language, not leading language that biases toward answer-key diagnosis
  - Example BAD (leading): "Our brand has eroded due to competitor X." (States conclusion)
  - Example GOOD (neutral): "We lost three contracts to competitor X. Customers cited 'quality concerns' and 'brand perception.'" (States facts)
- [ ] **C2:** Case input includes counter-evidence or ambiguity (not just supporting evidence)
  - Example BAD: Only includes evidence supporting BRAND_EROSION
  - Example GOOD: Includes brand evidence AND operational efficiency evidence AND customer retention data (lets solver diagnose)
- [ ] **C3:** If answer key considers alternative diagnoses, case input DOES present evidence that could support those alternatives
  - Example GOOD: If alternative diagnosis is UNIT_ECONOMICS_BREAKDOWN, case DOES include financial metrics

**Scoring:**
- PASS if all C1-C3 are TRUE
- FAIL if any C1-C3 is FALSE

---

**D. Constraint and Context Leakage (MEDIUM)**

- [ ] **D1:** Case input describes constraints neutrally (budget, time, staff) without revealing how answer-key action uses them
  - Example BAD: "We have $500k budget, exactly enough for a brand audit." (Reveals answer)
  - Example GOOD: "We have $500k budget for the fiscal year" (Neutral statement)
- [ ] **D2:** If case input specifies owner risk appetite or decision-making style, it does NOT bias toward answer-key action
- [ ] **D3:** Case input does NOT include success metrics or KPIs that reveal the answer-key definition of success

**Scoring:**
- PASS if all D1-D3 are TRUE
- FAIL if any D1-D3 is FALSE

---

**E. Case-Type Specific Checks**

**For Real-World Cases (RW):**
- [ ] **E1.RW:** Case input does NOT identify the actual company (if based on real case) in a way that allows looking up the answer externally
  - Example BAD: "Domino's Pizza in 2010 faced challenges..." (Identifiable, answer lookupable online)
  - Example GOOD: "A mid-market pizza delivery chain with 500 franchises faced margin compression..." (Anonymized)

**For Public-Dataset Cases (PD):**
- [ ] **E1.PD:** Case input does NOT provide company name if the diagnosis can be looked up in public financial reports
  - Example BAD: "XYZ Inc., ticker XYZ, 2025 fiscal year results..." (Answers lookupable)
  - Example GOOD: "A mid-market retail company with 85 stores and $500M revenue faced margin compression..." (Anonymized)

**For Synthetic Cases (SYN):**
- [ ] **E1.SYN:** All data is synthetic (no real company identifiers)
- [ ] **E1.SYN:** Stress-test scenario is realistic but does NOT match any specific well-known real case

**For Adversarial Cases (ADV):**
- [ ] **E1.ADV:** Trap type is NOT explicitly stated in case input
  - Example BAD: "This case tests survivorship bias." (Reveals the trap)
  - Example GOOD: Case presents evidence with embedded trap; solver must recognize it
- [ ] **E1.ADV:** Case input provides all evidence for the trap scenario; no hints about where the trap is

**For Blind-Outcome Cases (BLND):**
- [ ] **E1.BLND:** Case input does NOT reveal the outcome or which strategic option is "correct"
  - Example BAD: "The company chose expansion and succeeded." (Reveals outcome)
  - Example GOOD: "The company faces three strategic options. Which should it choose?" (Blind outcome)
- [ ] **E1.BLND:** Strategic alternatives are presented neutrally (no framing that hints at correct choice)

**Scoring:** PASS if all case-type checks are TRUE; FAIL if any is FALSE

---

**F. Answer Key Internal Check**

- [ ] **F1:** Answer key clearly distinguishes between evidence presented in case input vs. additional context known only to answer-key creator
  - Example GOOD: "The diagnosis is based on evidence items 1, 3, and 5 from case input; additional context (not in case) includes..."
- [ ] **F2:** Answer key does NOT reference case input in ways that would allow reverse-engineering answer from case text
  - Example BAD: Answer key says "The diagnosis must be X because the case input contains rare keyword Y." (Reveals lookupable signal)
  - Example GOOD: Answer key explains pattern and reasoning based on multiple evidence points

**Scoring:** PASS if all F1-F2 are TRUE; FAIL if any is FALSE

---

## Audit Process

**For each case:**

1. **Blind case input review** - Auditor reads ONLY case input (01_case_input.json), NOT answer key
2. **Independent diagnosis** - Auditor performs independent diagnosis: "What diagnosis would a solver reach with only this case input?"
3. **Compare to answer key** - Auditor then reads answer key and checks for leakage
4. **If independent diagnosis ≈ answer key diagnosis:** Likely leakage detected (case may have revealed too much)
5. **If independent diagnosis ≠ answer key diagnosis:** Case likely has appropriate opacity (good; pass audit)
6. **Document findings** - Auditor records leakage risk level for each dimension

---

## Leakage Risk Levels

| Risk Level | Definition | Action |
|-----------|----------|--------|
| **NONE** (GREEN) | Independent solver cannot infer answer without significant expert judgment and evidence synthesis. Case is appropriately opaque. | PASS - case accepted |
| **LOW** (YELLOW) | Weak hints present (e.g., case mentions budget matching answer-key action cost), but solver would need to connect dots. Ambiguity remains. | PASS - case accepted, with note |
| **MEDIUM** (ORANGE) | Clear hints present (e.g., case describes constraint in way that reveals how answer respects it). An experienced solver would likely infer answer. | FAIL - case requires revision. Remove hints and resubmit. |
| **HIGH** (RED) | Case explicitly or implicitly names the diagnosis or action. Answer is obvious without expert judgment. | FAIL - case rejected. Requires major revision. |

---

## Audit Pass/Fail Criteria

**Case PASSES leakage audit if:**
- Leakage risk level ≤ LOW (GREEN or YELLOW)
- All checklist items A1-A5, B1-B5, C1-C3, D1-D3, E1-E2 are TRUE
- Answer key passes internal check (F1-F2 TRUE)

**Case FAILS leakage audit if:**
- Leakage risk level ≥ MEDIUM (ORANGE or RED)
- Any checklist item is FALSE
- Answer key reveals reverse-engineerable signals

---

## Audit Execution Timeline

- **Before Round 2 execution:** All 50+ cases must pass leakage audit
- **Schedule:** Audit can run in parallel with case sourcing and answer key creation
- **Per case:** 15-20 minutes (auditor reads case input, performs independent diagnosis, checks answer key, documents findings)
- **Total effort:** 50 cases × 20 min = ~16 hours (can be split among 2-3 auditors)

---

## Remediation Path (If Case Fails)

1. **Identify leakage** - Which checklist item(s) failed? Which evidence points revealed the answer?
2. **Revise case input** - Remove revealing language, add counter-evidence, neutralize framing
3. **Reaudit** - Run case through leakage audit again
4. **Pass or mark as waiver** - If still failing, escalate to PM for explicit waiver (rare)

---

## Notes

- Leakage audit is **binary pass/fail** per case (no partial credit)
- Leakage audit is **independent** of content quality or difficulty (a case can be technically good but have leakage issues)
- Leakage audit is **required before Round 2 execution** (non-negotiable gate)
- Leakage audit is performed by **auditor unfamiliar with case sourcing** (preferably independent of case creator)

---

## Audit Status

| Dimension | Status | Cases Passed | Cases Failed | Notes |
|-----------|--------|--------------|-------------|-------|
| A. Root-Cause Leakage | PENDING | 0 | 0 | Awaiting case inputs |
| B. Action Leakage | PENDING | 0 | 0 | Awaiting case inputs |
| C. Evidence Framing | PENDING | 0 | 0 | Awaiting case inputs |
| D. Constraints Leakage | PENDING | 0 | 0 | Awaiting case inputs |
| E. Case-Type Checks | PENDING | 0 | 0 | Awaiting case inputs |
| F. Answer Key Checks | PENDING | 0 | 0 | Awaiting answer keys |
| **OVERALL** | **PENDING** | **0/50** | **0/50** | **Awaiting case/answer sourcing** |

---

**Status:** CHECKLIST_READY (awaiting cases to audit)  
**Next step:** As cases are sourced, run each through this leakage audit before locking  
**Gate:** All 50+ cases must PASS before Round 2 execution begins

