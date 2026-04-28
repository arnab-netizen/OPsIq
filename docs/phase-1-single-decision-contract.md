# Phase 1 Single Decision Contract

**Status:** Stable (Verified against main)  
**Version:** 1.0.0  
**Date:** 2026-04-28

## 1. Purpose

The Single Decision Flow is a streamlined interface that allows a user to input financial baseline data and receive a governed business decision with full explanation, impact analysis, and cryptographic proof of integrity.

**Flow:**
1. User enters baseline revenue and baseline cost
2. System calculates revenue change (10% of revenue) and cost change (5% of cost)
3. System evaluates confidence (fixed at 75%)
4. System determines decision: APPROVED or BLOCKED
5. System returns explanation with drivers, risks, assumptions
6. System stores decision integrity (hash + signature)
7. System creates OperatorItem and emits audit event

---

## 2. POST /api/run Request Contract

### Endpoint
```
POST /api/run
Content-Type: application/json
Authorization: Bearer <session-token>
```

### Request Body (Exact Shape)

```typescript
{
  revenue: number,      // baseline monthly revenue (required, must be number)
  cost: number          // baseline monthly cost (required, must be number)
}
```

### Valid Example
```json
{
  "revenue": 100000,
  "cost": 50000
}
```

### Invalid Examples

**Missing field:**
```json
{
  "revenue": 100000
}
```
→ Returns HTTP 400 with INVALID_INPUT reason

**Wrong type:**
```json
{
  "revenue": "one hundred thousand",
  "cost": 50000
}
```
→ Returns HTTP 400 with INVALID_INPUT reason

**Not a number:**
```json
{
  "revenue": null,
  "cost": 50000
}
```
→ Returns HTTP 400 with INVALID_INPUT reason

### Server-Side Calculations (NOT from user input)

The API performs these calculations internally. Do NOT send them in request:

| Field | Formula | Example |
|-------|---------|---------|
| `revenueChange` | `revenue * 0.1` | 10,000 |
| `costChange` | `cost * 0.05` | 2,500 |
| `confidence` | Fixed constant | 0.75 (75%) |
| `expectedImpact` | `revenueChange - costChange` | 7,500 |

---

## 3. POST /api/run Success Response (HTTP 200)

### Response Body (Exact Shape)

```typescript
{
  decision: "APPROVED" | "BLOCKED",
  expectedImpact: number,
  confidence: number,
  explanation: {
    summary: string,
    drivers: Array<{
      type: "REVENUE" | "COST" | "NET",
      value: number,
      label?: string
    }>,
    assumptions: string[],
    risks: string[],
    missingData: string[],
    calculationTrace: {
      baselineRevenue: number,
      baselineCost: number,
      revenueChange: number,
      costChange: number,
      netImpact: number,
      formula: "netImpact = revenueChange - costChange"
    }
  },
  reason?: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT",
  decisionHash: string,         // SHA256 hash for integrity
  signedHash: string,           // HMAC-SHA256 signature
  engineVersion: string,        // "v1.0.0"
  inputsSnapshot: {
    revenue: number,
    cost: number,
    timestamp: string            // ISO8601 timestamp
  }
}
```

### Example Success Response (APPROVED)

```json
{
  "decision": "APPROVED",
  "expectedImpact": 5000,
  "confidence": 0.75,
  "explanation": {
    "summary": "Decision APPROVED: Estimated impact of $5000 monthly with 75% confidence. Revenue impact of $10000 with cost adjustment of $2500.",
    "drivers": [
      {
        "type": "REVENUE",
        "value": 10000,
        "label": "Revenue increase of $10000"
      },
      {
        "type": "COST",
        "value": -2500,
        "label": "Cost reduction of $2500"
      },
      {
        "type": "NET",
        "value": 5000,
        "label": "Net positive impact of $5000"
      }
    ],
    "assumptions": [
      "Baseline revenue: $100000 monthly",
      "Baseline costs: $50000 monthly",
      "Confidence level: 75%",
      "Revenue change is achievable and sustainable for the specified period",
      "Cost adjustments are feasible without service disruption"
    ],
    "risks": [
      "Impact variability: actual results could range ±1500 based on market conditions",
      "Execution risk: dependent on timely implementation",
      "Market risk: external factors may affect revenue projections"
    ],
    "missingData": [],
    "calculationTrace": {
      "baselineRevenue": 100000,
      "baselineCost": 50000,
      "revenueChange": 10000,
      "costChange": 2500,
      "netImpact": 5000,
      "formula": "netImpact = revenueChange - costChange"
    }
  },
  "decisionHash": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "signedHash": "z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4j3i2h1g0",
  "engineVersion": "v1.0.0",
  "inputsSnapshot": {
    "revenue": 100000,
    "cost": 50000,
    "timestamp": "2026-04-28T19:30:00.000Z"
  }
}
```

### Example Success Response (BLOCKED)

Same structure but with decision = "BLOCKED", reason field populated, and explanation.summary indicating why decision was blocked:

```json
{
  "decision": "BLOCKED",
  "expectedImpact": 0,
  "confidence": 0,
  "reason": "INVALID_INPUT",
  "explanation": {
    "summary": "Decision BLOCKED: Required input parameters are missing or invalid.",
    "drivers": [],
    "assumptions": [],
    "risks": [],
    "missingData": [
      "Baseline revenue required",
      "Baseline costs required",
      "Revenue change required",
      "Cost adjustment required",
      "Confidence level required"
    ],
    "calculationTrace": { ... }
  },
  ...
}
```

---

## 4. POST /api/run Error Responses

### HTTP 400 - Validation or Business Logic Error

**Shape:**
```typescript
{
  decision: "BLOCKED",
  expectedImpact: number,
  confidence: number,
  reason: "LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT",
  explanation: DecisionExplanation,  // details why decision was blocked
  decisionHash: string,
  signedHash: string,
  engineVersion: string,
  inputsSnapshot: Record<string, unknown>
}
```

**Examples:**

**Invalid input (revenue not a number):**
```json
{
  "decision": "BLOCKED",
  "expectedImpact": 0,
  "confidence": 0,
  "reason": "INVALID_INPUT",
  "explanation": {
    "summary": "Decision BLOCKED: Required input parameters are missing or invalid.",
    "drivers": [],
    "assumptions": [],
    "risks": [],
    "missingData": [
      "Baseline revenue required",
      "Baseline costs required",
      "..."
    ],
    "calculationTrace": { ... }
  },
  "decisionHash": "...",
  "signedHash": "...",
  "engineVersion": "v1.0.0",
  "inputsSnapshot": { ... }
}
```
Status: 400

**Low confidence (if confidence < 0.5, which shouldn't happen with current 0.75 fixed value):**
```json
{
  "decision": "BLOCKED",
  "expectedImpact": 0,
  "confidence": 0,
  "reason": "LOW_CONFIDENCE",
  "explanation": {
    "summary": "Decision BLOCKED: Confidence level (...%) is below minimum required threshold of 50%.",
    "drivers": [],
    "assumptions": [],
    "risks": [
      "Insufficient data for reliable decision-making"
    ],
    "missingData": [
      "Additional evidence needed to increase confidence"
    ],
    "calculationTrace": { ... }
  },
  ...
}
```
Status: 400

**Non-positive impact (if expectedImpact <= 0):**
```json
{
  "decision": "BLOCKED",
  "expectedImpact": -1000,
  "confidence": 0.75,
  "reason": "NON_POSITIVE_IMPACT",
  "explanation": {
    "summary": "Decision BLOCKED: Expected impact of $-1000 is non-positive. Revenue change ($...) does not exceed cost adjustment ($...).",
    "drivers": [],
    "assumptions": [],
    "risks": [],
    "missingData": [
      "Revenue improvement strategy needed",
      "Cost reduction plan required to achieve positive impact"
    ],
    "calculationTrace": { ... }
  },
  ...
}
```
Status: 400

### HTTP 403 - Authentication or Authorization Error

**Shape:**
```json
{
  "error": "Unauthorized" | "Insufficient permissions"
}
```

**No role:**
```json
{
  "error": "Unauthorized"
}
```
Status: 403

**Role exists but no edit permission:**
```json
{
  "error": "Insufficient permissions"
}
```
Status: 403

### Key Points on Errors

- ✅ All HTTP 400 responses include full DecisionResult (not plain error objects)
- ✅ No stack traces or internal server details exposed
- ✅ explanation.missingData provides actionable feedback
- ✅ reason field indicates why decision was blocked
- ✅ Client should always check `decision` field, not HTTP status

---

## 5. UI Input Fields

The UI must collect exactly two fields from the user:

### Field: Baseline Revenue

**Label:** "Baseline Monthly Revenue"  
**Type:** Number (decimal allowed)  
**Placeholder:** "100000"  
**Validation:**
- Required
- Must be a number
- Must be >= 0 (recommended)
- Client-side: validate before sending
- Server-side: validates and returns error if not number

**Display formatting:**
- Show with currency symbol (e.g., $100,000)
- Accept user input with or without currency/commas
- Parse to number before sending

### Field: Baseline Cost

**Label:** "Baseline Monthly Cost"  
**Type:** Number (decimal allowed)  
**Placeholder:** "50000"  
**Validation:**
- Required
- Must be a number
- Must be >= 0 (recommended)
- Client-side: validate before sending
- Server-side: validates and returns error if not number

**Display formatting:**
- Show with currency symbol (e.g., $50,000)
- Accept user input with or without currency/commas
- Parse to number before sending

### Derived Fields (Do NOT collect from user)

These are calculated server-side. UI may display them, but must NOT accept user input:

- **Revenue Change:** Calculated as `revenue * 0.1` (10% of baseline)
- **Cost Change:** Calculated as `cost * 0.05` (5% of baseline)
- **Confidence:** Fixed at `0.75` (75%)
- **Expected Impact:** Calculated as `revenueChange - costChange`

---

## 6. Required Display Elements

After receiving response (whether APPROVED or BLOCKED), display all of:

### 6.1 Decision Status (Required)

```
Display: Large, prominent
Content: "APPROVED" or "BLOCKED"
Color: 
  - Green for APPROVED
  - Red/Warning for BLOCKED
Size: Large, header-level prominence
```

### 6.2 Expected Impact (Required)

```
Display: Prominent number with currency
Content: response.expectedImpact
Format: $-7,500 or $7,500 (with sign)
Label: "Expected Monthly Impact"
```

### 6.3 Confidence Level (Required)

```
Display: Percentage bar or indicator
Content: response.confidence * 100
Format: "75%" or similar
Label: "Confidence"
Additional: If < 50%, highlight as low confidence
```

### 6.4 Explanation Summary (Required)

```
Display: Text block, user-readable
Content: response.explanation.summary
Format: Single paragraph or section
Font: Regular, readable
Size: Standard body text
```

### 6.5 Structured Drivers (Required)

```
Display: Table, list, or visual breakdown
Content: response.explanation.drivers[]
For each driver:
  - Type: REVENUE | COST | NET (use for grouping/styling)
  - Value: Monetary amount
  - Label: User-friendly description
Visual suggestion:
  - REVENUE drivers: green/positive color
  - COST drivers: amber/neutral color  
  - NET drivers: prominent color (consolidates impact)
```

### 6.6 Assumptions (Required)

```
Display: Bulleted list
Content: response.explanation.assumptions[]
Label: "Assumptions"
Font: Smaller than summary
Important: At least one assumption about baseline and confidence should be shown
```

### 6.7 Risks (Required)

```
Display: Bulleted list
Content: response.explanation.risks[]
Label: "Risks"
Color: Warning or neutral highlight
Font: Standard
Important: Do NOT hide risks even if decision is APPROVED
```

### 6.8 Calculation Trace (Required)

```
Display: Table or structured format
Content: response.explanation.calculationTrace
Fields:
  - baselineRevenue
  - baselineCost
  - revenueChange
  - costChange
  - netImpact
  - formula
Label: "Calculation Trace" or "How We Calculated"
Format: Show formula at bottom: netImpact = revenueChange - costChange
```

### 6.9 Decision Hash (Required)

```
Display: Code block or monospace field
Content: response.decisionHash
Label: "Decision Hash (SHA256)"
Behavior: 
  - Read-only
  - Copyable (click to copy to clipboard)
  - Monospace font
  - Truncate long hash in UI (show full on hover or in modal)
Purpose: Immutable identifier for this decision
```

### 6.10 Signature / Integrity Proof (Required)

```
Display: Expandable section or modal
Label: "Integrity Proof"
Content:
  - decisionHash: [copy button]
  - signedHash: [copy button]
  - engineVersion: "v1.0.0"
  - Timestamp from inputsSnapshot: ISO8601
Behavior:
  - Show summary: "Decision signed by OpsIQ Engine v1.0.0"
  - Allow user to view full hashes if needed
  - Do NOT require user to understand cryptography
```

### 6.11 Engine Version (Required)

```
Display: Small text, footer or metadata section
Content: response.engineVersion
Label: "Engine Version"
Format: "v1.0.0"
Purpose: Track which version of decision logic was used
```

### 6.12 Input Snapshot (Optional but Recommended)

```
Display: Metadata section or collapsible
Content: response.inputsSnapshot
Show:
  - revenue (what user entered)
  - cost (what user entered)
  - timestamp (ISO8601, when decision was made)
Purpose: Audit trail for end user
```

### 6.13 If Decision is BLOCKED

Additionally display:

```
Reason: response.reason ("LOW_CONFIDENCE" | "NON_POSITIVE_IMPACT" | "INVALID_INPUT")
Missing Data: response.explanation.missingData[]
Display: Bulleted list with label "To Approve This Decision, You Need:"
Purpose: Guide user on how to fix their inputs
```

---

## 7. Acceptance Criteria

### Input Validation
- [ ] Both revenue and cost fields are required before submit
- [ ] Client validates that both are numbers before sending request
- [ ] Clear error message if user enters non-numeric value
- [ ] No silent defaults or fallbacks

### Request Handling
- [ ] POST /api/run called with exactly {revenue, cost}
- [ ] Authorization header included (handled by framework/session)
- [ ] Loading state shown during request
- [ ] Request timeout handled gracefully (no infinite loading)

### Success Response (HTTP 200)
- [ ] Display decision (APPROVED or BLOCKED) prominently
- [ ] Display expected impact as formatted currency
- [ ] Display confidence as percentage
- [ ] Display explanation summary as readable text
- [ ] Display all drivers in structured format (REVENUE, COST, NET)
- [ ] Display assumptions and risks as bullet lists
- [ ] Display calculation trace with formula
- [ ] Display decision hash (SHA256) with copy functionality
- [ ] Display integrity proof section (hash, signature, version, timestamp)
- [ ] Display engine version

### Error Response (HTTP 400)
- [ ] Response body is still DecisionResult (not plain error)
- [ ] Reason field clearly indicates why decision was blocked
- [ ] explanation.missingData shown as actionable feedback
- [ ] No stack traces or internal error details visible to user

### Auth Error (HTTP 403)
- [ ] Clear error message: "Unauthorized" or "Insufficient permissions"
- [ ] User redirected to login or shown clear instruction

### Side Effects
- [ ] After successful POST, OperatorItem created in database (backend)
- [ ] Audit event emitted with metadata and snapshots (backend)
- [ ] UI does not need to manually trigger these (automatic)

### Display Requirements
- [ ] All required fields displayed (decision, impact, confidence, explanation, drivers, risks, hash, version)
- [ ] No missing or hidden fields from response
- [ ] Responsive design: works on mobile, tablet, desktop
- [ ] Explanation summary readable without horizontal scroll
- [ ] Driver list readable without horizontal scroll
- [ ] Hash field copyable (click-to-copy pattern)
- [ ] Risks displayed with warning styling

### Mobile Responsive
- [ ] All input fields touch-friendly (min 44px height)
- [ ] All text readable without zoom on mobile
- [ ] Currency formatting readable on small screens
- [ ] Decision status visible above the fold
- [ ] Expandable sections (e.g., risks) don't overwhelm mobile layout

### No Fake Data
- [ ] No hardcoded example responses
- [ ] No default values for revenue/cost unless from previous session
- [ ] All displayed data comes from API response
- [ ] No data populated if request fails

### Error Handling
- [ ] Network error: show message, offer retry button
- [ ] Validation error (HTTP 400): show reason and missingData
- [ ] Auth error (HTTP 403): redirect to login
- [ ] Unexpected error: show generic message, do not expose details
- [ ] Do not show stack traces under any circumstances

---

## 8. Testing Checklist

### Happy Path (APPROVED Decision)
- [ ] Enter revenue: 100000, cost: 50000
- [ ] Submit request
- [ ] Receive HTTP 200
- [ ] decision = "APPROVED"
- [ ] expectedImpact = 5000 (10000 - 2500)
- [ ] confidence = 0.75
- [ ] explanation.summary shows "APPROVED"
- [ ] drivers contains REVENUE, COST, NET entries
- [ ] decisionHash is a 64-char hex string
- [ ] signedHash is a 64-char hex string
- [ ] engineVersion = "v1.0.0"
- [ ] All required fields displayed

### Blocked Path (NON_POSITIVE_IMPACT)
- [ ] Enter revenue: 1000, cost: 50000 (cost > revenue, impact <= 0)
- [ ] Submit request
- [ ] Receive HTTP 400
- [ ] decision = "BLOCKED"
- [ ] reason = "NON_POSITIVE_IMPACT"
- [ ] explanation.summary shows "BLOCKED"
- [ ] explanation.missingData shows actionable feedback
- [ ] Display reason to user clearly

### Invalid Input (Type Error)
- [ ] Enter revenue: "abc", cost: 50000
- [ ] Submit request
- [ ] Receive HTTP 400
- [ ] decision = "BLOCKED"
- [ ] reason = "INVALID_INPUT"
- [ ] explanation.summary shows input error
- [ ] Show user error message

### Mobile Display
- [ ] All fields readable on 375px width
- [ ] Decision status visible without scroll
- [ ] Currency formatting readable
- [ ] Hash copyable on mobile

---

## 9. Notes for Implementers

### Security Considerations
- ✅ Do NOT attempt to compute decisionHash or signedHash on client
- ✅ Treat hash values as immutable proof only
- ✅ Do NOT allow user to edit decision after receiving response
- ✅ Do NOT store revenue/cost except in inputsSnapshot

### Performance
- ✅ Request completes in < 1 second typically
- ✅ Use loading spinner during request
- ✅ Cache user's last decision if needed, but do NOT replay old decisions

### Accessibility
- ✅ All decision text readable by screen readers
- ✅ Currency symbols and numbers properly announced
- ✅ Color not the only indicator (use text for status)
- ✅ Form fields labeled properly
- ✅ Error messages associated with fields

### Future Proofing
- ✅ If response includes new fields, display them gracefully
- ✅ If engineVersion changes, do NOT assume calculations are the same
- ✅ If new reason types appear, handle them generically
- ✅ Always check response.decision field, not HTTP status

---

## 10. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-04-28 | Initial contract based on verified /api/run endpoint |

---

## 11. Questions & Feedback

For questions on this contract:
- Check `/api/run` source: `src/app/api/run/route.ts`
- Check decision type: `src/domain/decision/types.ts`
- Check explanation generator: `src/services/explanation/generate.ts`
- Verify against actual endpoint behavior before shipping
