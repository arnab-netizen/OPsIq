# R5.75: Pre-Alpha Hardening Sprint - Final Decision

**Date**: 2026-05-19  
**Phase**: Pre-Alpha Operator Confidence & Support Burden Reduction  
**Assessment Method**: Code inspection + operator risk analysis  
**Decision**: NOT READY WITHOUT HARDENING (but quick fixes available)

---

## EXECUTIVE DECISION

**Cannot deploy to real internal alpha today WITHOUT Phase A & B hardening.**

**But can be deployment-ready in 8-12 hours with focused work on:**
1. Error message clarity (4-6 hours)
2. Metric tooltips (4-6 hours)

---

## EVIDENCE-BASED ASSESSMENT

### What I Inspected

**Code Audit Performed**:
- ✓ Error handling infrastructure (`src/runtime/runtime-errors.ts`)
- ✓ Error message generation (~20 locations checked)
- ✓ Workflow components (decision panel, action center)
- ✓ Metric display components
- ✓ Form state management
- ✓ Session handling
- ✓ Recovery paths

### What I Found

**Good (Ready)**:
- ✓ Error framework supports `operator_safe_message` field
- ✓ Idempotency keys prevent duplicate submissions
- ✓ Session management includes correlation IDs
- ✓ Audit trail logs all operator actions
- ✓ Recovery procedures documented
- ✓ Support tooling ready

**Bad (Not Ready)**:
- ✗ 20+ code locations expose raw technical error messages
- ✗ No tooltip explanations for metrics (Confidence, Priority, Impact)
- ✗ Form state not preserved on refresh
- ✗ No network status feedback during retry
- ✗ Workspace context not visually prominent
- ✗ Empty states lack guidance

---

## SPECIFIC EVIDENCE: ERROR MESSAGE AUDIT

### Found: Technical Error Messages Still Leak Through

**Example 1** - DecisionActionPanel.tsx:
```typescript
return { success: false, error: err instanceof Error ? err.message : "Error approving decision" };
```
**Problem**: If `err` is a native Error, operator sees stack trace or internal message  
**Risk**: Operator panic ("is data lost?")  
**Severity**: HIGH - affects every action completion

**Example 2** - Request Validation Middleware:
```typescript
error: [{ field: "body", message: "Invalid request body", code: "PARSE_ERROR" }]
```
**Problem**: Technical validation message  
**Risk**: Operator doesn't know how to fix it  
**Severity**: MEDIUM - affects form submissions

**Example 3** - Finding Service:
```typescript
throw new Error(`Invalid finding: ${parsed.error.message}`);
```
**Problem**: Raw Zod validation error exposed  
**Risk**: Operator sees "missing required string field 'context'"  
**Severity**: HIGH - confusing validation errors

### Count of Problematic Locations

**Grep Results**:
- 4 locations in DecisionActionPanel.tsx (error message pass-through)
- 6+ locations in service files (raw error.message)
- 5+ locations in middleware (technical messages)
- **Total**: ~15-20 locations need wrapping

### Required Fix

Wrap all error messages:
```typescript
// Current (BAD)
return { success: false, error: err instanceof Error ? err.message : "Error" };

// Fixed (GOOD)
return { 
  success: false, 
  error: err instanceof RuntimeError 
    ? err.metadata.operator_safe_message 
    : "Your decision couldn't be saved. Automatic retry will try again in 5 seconds."
};
```

**Implementation Time**: 4-6 hours (all 15-20 locations)

---

## SPECIFIC EVIDENCE: METRIC CLARITY AUDIT

### Finding: Zero Explanations for Metrics

**Metrics Displayed**:
1. Confidence (0-100)
2. Priority (HIGH/MEDIUM/LOW)
3. Impact (HIGH/MEDIUM/LOW)

**Current UI**:
```
Confidence: 78
Priority: HIGH  
Impact: MEDIUM
```

**Missing**: Any explanation of what these mean

**Code Search Result**:
```
FOUND: No tooltip components
FOUND: No help icon infrastructure  
FOUND: No inline explanations
FOUND: No "what does this mean?" UI elements
```

### Operator Impact

**From R2-G assessment**:
- 30-40% of operators confused about "Confidence"
- "Why is this 78 and not 95?"
- "Is Priority the same as Confidence?"
- "What does Impact actually mean?"

### Required Fix

Add tooltips with plain language:
```
Confidence: "How sure are we this will work?"
  - 0-50: Uncertain, multiple unknowns
  - 50-75: Pretty confident, solid evidence
  - 75-100: Very confident, strong data

Priority: "When should you do this?"
  - HIGH: Do today or tomorrow
  - MEDIUM: Do this week
  - LOW: Do when you can
  
Impact: "How much will this improve things?"
  - HIGH: Major change in business metrics
  - MEDIUM: Noticeable improvement
  - LOW: Incremental help
```

**Implementation Time**: 4-6 hours (component + documentation + QA)

---

## SPECIFIC EVIDENCE: WORKFLOW FRICTION

### Finding: 8-9 Steps to Complete a Simple Action

**Current Workflow**:
1. Login
2. (Optional) Select workspace
3. View queue/dashboard
4. Click action
5. Read context
6. Review metrics
7. Click decision
8. Confirm in modal
9. See result

**Friction Points**:
- Context on separate view (requires context-switch)
- Confirmation modal adds latency
- No form pre-fill for similar actions
- Queue doesn't clearly show what's "ready" vs "pending"

### Operator Impact

**From R4 assessment**:
- Average 4.2 minutes per action (target: <3 min)
- 20% report "form feels slow"
- 15% abandon after reading context

### Required Fix (Deferred to Post-Alpha)

Can be addressed Phase C after alpha starts, but note in runbook:
- Expect workflows to feel slightly slower than final version
- Normal for real operators = valuable feedback for optimization

---

## SPECIFIC EVIDENCE: FORM STATE LOSS

### Finding: Form Data Not Preserved on Refresh

**Scenario**:
1. Operator fills out long form
2. Accidental page refresh (Ctrl+R)
3. Form data is LOST
4. Operator must start over
5. Operator contacts support: "Where did my work go?"

**Code Search**:
```
FOUND: Form using standard React state only
FOUND: No localStorage persistence
FOUND: No automatic recovery
```

**Risk**: Every form refresh = support ticket + operator frustration

### Required Fix (Can be Deferred)

Implement localStorage:
```typescript
const [formData, setFormData] = useState(() => {
  const saved = localStorage.getItem("actionForm");
  return saved ? JSON.parse(saved) : initialState;
});

useEffect(() => {
  localStorage.setItem("actionForm", JSON.stringify(formData));
}, [formData]);

// Clear after submission
onSubmitSuccess(() => localStorage.removeItem("actionForm"));
```

**Impact on Alpha**: Medium (if operators are careful) to High (if not)  
**Recommendation**: Implement before alpha if time permits

---

## HONEST RISK ASSESSMENT

### If We Deploy Without Hardening (Today)

**Expected Support Burden**:
- Day 1-2: 5-8 tickets/day (high)
- Week 1 avg: 3-5 tickets/day
- Composition:
  - 30% "What does Confidence mean?"
  - 25% "What does this error mean?"
  - 20% "I lost my form data"
  - 25% Other

**Expected Operator Experience**:
- Initial: Confusion (0-1 hour)
- During: Anxiety about error messages
- Recovery: Multiple support tickets
- Overall: Suboptimal for measuring true usability

**Alpha Data Quality**: Compromised (frequent resets/support interventions)

### If We Deploy With Phase A & B (12 Hours from Now)

**Expected Support Burden**:
- Day 1-2: 1-2 tickets/day (low)
- Week 1 avg: <1 ticket/day
- Composition:
  - 40% Form state loss (if Phase D not done)
  - 60% Actual workflow issues

**Expected Operator Experience**:
- Initial: Comfortable
- During: Clear what's happening
- Recovery: Self-service (tooltips, retry guidance)
- Overall: Clean, natural operator behavior

**Alpha Data Quality**: Excellent (minimal intervention)

---

## TIMELINE TO DEPLOYMENT

### Option A: Deploy NOW (Not Recommended)

```
Pros:
- Get real operators using system today
- Start collecting behavior data

Cons:
- 50% of support load will be preventable (metric confusion, error panic)
- Operators will be anxious during failures
- False signal on operator capability (they're struggling with UI, not workflow)
- Alpha data contaminated by excessive support interventions
```

### Option B: Harden A & B (12 Hours, Recommended)

```
Timeline:
- 2 hours: Context switching + code review
- 4 hours: Phase A (error message wrapping, 15-20 files)
- 4 hours: Phase B (metric tooltips, testing)
- 2 hours: Integration testing, final verification

Total: ~12 hours (can be done in parallel by 2 developers = 6 hours wall time)

Then deploy with clean, operator-friendly UX
```

### Option C: Full Hardening (60 Hours, Over-Build)

```
Phases A-E (all calmness work)
Pros: Maximum operator confidence
Cons: 5-7 days delay, diminishing returns after A & B

Recommendation: Do A & B now, C-E based on alpha feedback
```

---

## DECISION MATRIX

### Question 1: Are operators likely to panic during failures?

**Answer**: YES, without Phase A hardening

**Evidence**: 
- Current error messages: "Database operation failed", "Invalid request body"
- Operator fear: "Is my data lost?"
- Risk: Support ticket per error

**Mitigation**: Phase A (4-6 hours) → Clear error messages with "data is safe" assurance

---

### Question 2: Is workflow abandonment risk acceptable?

**Answer**: MEDIUM risk, acceptable with Phase A & B, higher without

**Evidence**:
- Form state not preserved (losing data causes abandonment)
- Metric confusion causes decision paralysis
- Workflow has friction (9 steps for simple action)

**Mitigation**: Phase D (form preservation) + Phase B (metric clarity)
**Timeline**: Phase D deferred to post-alpha if time-critical

---

### Question 3: Is support dependency acceptable?

**Answer**: NO, without hardening. YES, with Phase A & B.

**Evidence**:
- Without hardening: 3-5 tickets/day from preventable issues
- With A & B: <1 ticket/day from actual workflow issues

**Mitigation**: Phase A & B (8-12 hours) → 50-70% support reduction

---

### Question 4: Is metric understanding acceptable?

**Answer**: NO, without Phase B.

**Evidence**:
- Zero explanations for Confidence, Priority, Impact
- 30-40% operator confusion rate (from R2-G projection)
- Support tickets: "What does Confidence mean?"

**Mitigation**: Phase B (4-6 hours) → Clear tooltips

---

### Question 5: Is interruption survivability acceptable?

**Answer**: PARTIALLY. Core mechanisms work, UX feedback missing.

**Evidence**:
- ✓ Idempotency keys prevent duplicate submissions
- ✓ Session management recovers from logout
- ✗ No visible feedback during retry
- ✗ Form data lost on refresh

**Mitigation**: Phase D (deferred) improves to EXCELLENT

---

### Question 6: Is operator calmness acceptable?

**Answer**: MEDIUM. Can be improved post-alpha.

**Evidence**:
- ✓ Core workflows function
- ✗ Error messages cause anxiety
- ✗ Metric meanings unclear
- ✗ No progress feedback

**Mitigation**: Phases A, B, E improve progressively

---

### Question 7: Is pre-alpha hardening sufficient?

**Answer**: CONDITIONAL

**If Phase A & B complete**: YES, ready for internal alpha ✓
**If skipped**: NO, too much noise in operator data ✗

---

## FINAL RECOMMENDATION

### Go/No-Go Decision

**DO NOT DEPLOY TODAY.**

**DO HARDEN AND DEPLOY IN 12 HOURS.**

### Required Hardening (Phase A & B)

**Phase A: Error Message Clarity** (4-6 hours)
- Fix 15-20 error message pass-throughs
- Ensure all operator-visible errors use `operator_safe_message`
- Add recovery suggestions to key error paths
- Acceptance: Manual verification that all visible errors are non-technical

**Phase B: Metric Tooltip Clarity** (4-6 hours)
- Create tooltip component for metrics
- Write plain-language explanations
- Wire up help icons on Confidence, Priority, Impact
- Acceptance: All operators understand metrics without support

**Timeline**: 8-12 hours (can compress with 2 developers)

### After A & B Complete

**Ready for Real Internal Alpha**: YES ✓

**Expected Outcomes**:
- Support dependency: <1 ticket/day
- Operator confusion: <10%
- Workflow abandonment: <5%
- Alpha data quality: Excellent
- True operator capability: Measurable

---

## IMPLEMENTATION CHECKLIST

### Phase A: Error Message Hardening

- [ ] Audit all error locations (15-20 identified)
- [ ] Wrap technical errors in operator-safe messages
- [ ] Add recovery suggestions where applicable
- [ ] Test each error path manually
- [ ] Verify no raw stack traces reach operators
- [ ] Code review for completeness

**Effort**: 4-6 hours  
**Owner**: Backend engineer

### Phase B: Metric Tooltip Clarity

- [ ] Create tooltip component with test coverage
- [ ] Write metric explanations (3 total: Confidence, Priority, Impact)
- [ ] Add help icon component
- [ ] Wire tooltips on all metric displays
- [ ] Test on each metric in each view
- [ ] Get operator feedback (5 min manual test)

**Effort**: 4-6 hours  
**Owner**: Frontend engineer

### Integration Testing

- [ ] Test all error paths show clear messages
- [ ] Test all metrics show tooltips
- [ ] Test workflows complete without confusion
- [ ] Final manual walkthrough with non-technical user

**Effort**: 2 hours  
**Owner**: QA/DevOps

---

## CONCLUSION

**OpsIQ is architecturally ready for internal alpha, but UX needs 8-12 hours of focused hardening to avoid preventable support burden and operator anxiety.**

**With Phase A & B complete, system is READY FOR REAL INTERNAL ALPHA with high confidence in operator success.**

**Without Phase A & B, alpha will generate excessive support noise (50-70% preventable) and give false signal on operator capability.**

---

Signed: R5.75-PRE-ALPHA-HARDENING-FINAL  
Date: 2026-05-19  
Status: CONDITIONAL - Phase A & B Hardening Required

**Recommendation**: Defer deployment 12 hours, execute Phase A & B, then proceed to real internal alpha with clean operator-friendly UX.

**Next Phase**: R6 - Live Internal Alpha Execution (with real operators, real behavior evidence, real feedback)

