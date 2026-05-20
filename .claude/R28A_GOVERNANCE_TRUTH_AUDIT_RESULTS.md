# R28A Governance Scanner Truth Audit - Final Results

**Date:** 2026-05-20  
**Audit Status:** COMPLETE

## EXECUTIVE SUMMARY

Of 369 reported governance violations:
- **102 are REAL BLOCKERS** (operator-visible issues)
- **5 are SCANNER FALSE POSITIVES** (metric strings in backend)
- **46 are RUNTIME_FACTORY_SAFE** (error factories with embedded safe messages)
- **212 are INTERNAL_DEBT** (not operator-visible)
- **3 are TEST_CODE** (test files)
- **1 is INTENTIONAL_EXEMPTION** (conditional render pattern)

## BREAKDOWN

### REAL BLOCKERS: 102 violations
These are actual operator-facing issues that should be fixed:

#### REAL_OPERATOR_UI: 69 violations
UI components showing raw errors or dead-end empty states to users
- Top files: DecisionDetailView.tsx (9), decision-acceptance-modal (3), OperatorItem (3)
- Issue: Raw error.message displayed to operators, empty states without guidance
- Severity: HIGH - operators see confusing technical messages

#### REAL_API_RESPONSE: 33 violations
API routes returning raw error messages to clients
- Top files: shared-error-extractor.ts (3), various /api/routes
- Issue: Errors not classified through governance layer before response
- Severity: HIGH - clients receive ungoverned errors

### FALSE POSITIVES / INTERNAL: 267 violations
These are NOT operator-visible, no blocker classification:

#### INTERNAL_LOG_ONLY: 212 violations
Services, middleware, domain logic using error.message for internal logging
- Issue: Scanner flags all error.message, even in logging contexts
- Reality: Operators never see these
- Recommendation: Accept as internal debt or update scanner rules

#### RUNTIME_FACTORY_SAFE: 46 violations
Error factories (src/runtime/runtime-errors.ts) creating with embedded operator_safe_message
- Issue: Scanner flags `new RuntimeError()`, but they create with safe messages
- Reality: These ARE properly governed, scanner doesn't understand the pattern
- Recommendation: False positive - scanner rule is too broad

#### SCANNER_FALSE_POSITIVE: 5 violations
Metric strings in backend services (e.g., `${metric} returns to baseline`)
- Issue: Scanner expects <GovMetric /> component in backend services (wrong layer)
- Reality: These are diagnostic/test method strings, not UI rendering
- Recommendation: False positive - scanner applied to wrong code context

#### TEST_CODE: 3 violations
Test files with error handling patterns
- Recommendation: Not applicable to production

#### INTENTIONAL_EXEMPTION: 1 violation
Conditional render pattern in hooks (return null for conditional logic)
- Recommendation: Intentional, no fix needed

## DEPLOYMENT DECISION TREE

```
IF fixing 102 real blockers:
  - 69 UI violations require wrapping error messages with toOperatorSafeError()
  - 33 API violations require classifyOperatorError() in response handlers
  - Estimated effort: 15-20 hours (systematic string wrapping + context passing)
  - Impact: Operators get safe error messages, API clients get proper errors

IF calibrating scanner:
  - Update rules to exclude backend services from unsafe-metric check
  - Update rules to recognize error factories with safe messages
  - Update rules to ignore logging contexts
  - Effort: 2-3 hours
  - Impact: Reduces false positives from 267 to ~30

IF accepting as known debt:
  - Document 102 real violations as governance enhancement backlog
  - Document 267 internal violations as non-blocking technical debt
  - Gate status: check:security fails, but root cause is documented
  - Impact: Can proceed with other work, but deployment readiness incomplete
```

## TOP GENERATION SOURCES

| File | Count | Types | Priority |
|------|-------|-------|----------|
| DecisionDetailView.tsx | 9 | raw-error, empty-state | HIGH |
| report/page.tsx | 4 | empty-state | HIGH |
| decision-acceptance-modal | 3 | raw-error, empty-state | HIGH |
| shared-error-extractor.ts | 3 | unsafe-render | HIGH |
| OperatorItem.tsx | 3 | raw-error | MEDIUM |
| dashboard/onboarding/page.tsx | 3 | raw-error | MEDIUM |
| settings/page.tsx | 3 | unsafe-render, empty | MEDIUM |

## GATE STATUS ASSESSMENT

```
Current:
  npm run build: ✓ PASS
  npx tsc: ✓ PASS  
  npx prisma validate: ✓ PASS
  npm run check:optional-context: ✓ PASS
  npm run governance:scan:strict: ✗ FAIL (369 violations)

After fixing 102 real blockers:
  npm run governance:scan:strict: PARTIAL PASS (267 false positives remain)
  - Still fails because of scanner false positives
  - Would need scanner calibration to complete

After scanner calibration:
  npm run governance:scan:strict: ✓ PASS (0-5 true violations)
```

## RECOMMENDATIONS

**OPTION A: Fix Real Blockers + Calibrate Scanner (BEST)**
1. Fix 102 real operator-visible violations (15-20 hours)
2. Calibrate scanner rules to reduce false positives (2-3 hours)
3. Gates: ALL PASS, deployment ready

**OPTION B: Fix Real Blockers Only (PARTIAL)**
1. Fix 102 real operator-visible violations (15-20 hours)
2. Keep 267 false positives in code (no fix)
3. Gates: governance:scan:strict STILL FAILS but with reduced violations
4. Outcome: Operators get safe messages, but gates not fully green

**OPTION C: Calibrate Scanner Only (QUICK WIN)**
1. Update scanner rules to recognize error factories and logging contexts
2. Reduces violations from 369 to ~100 (only real blockers)
3. Gates: governance:scan:strict FAILS but with clarity on true violations
4. Outcome: Clearer picture of what needs fixing

**OPTION D: Document and Defer (DEFERRED)**
1. Document 102 real violations as enhancement backlog
2. Document 267 false positives for future scanner calibration
3. Accept check:security as failing gate for this cycle
4. Outcome: Can proceed with other work, known blockers documented

## DEPLOYMENT STATE

- **Code Compilation:** ✓ All gates pass (build, tsc, prisma, optional-context)
- **Operator Visibility:** ✗ 102 violations where operators see raw/unsafe content
- **API Contract:** ✗ 33 violations in API error responses
- **Technical Debt:** Acknowledged 267 internal violations (non-blocking)
- **Scanner Quality:** Needs calibration (267/369 = 72% false positive rate)

**CONCLUSION:** 102 real violations exist and should be addressed for complete operator experience. 267 violations are scanner false positives or internal debt. Scanner calibration would clarify the scope.

---

**Files Generated:**
- `.claude/governance_violations_dataset.json` - All 369 violations with metadata
- `.claude/governance_violations_classified.json` - Classified violations with assessment
- `.claude/R28A_GOVERNANCE_TRUTH_AUDIT_RESULTS.md` - This report
