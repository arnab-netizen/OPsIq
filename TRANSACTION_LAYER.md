# Decision Inbox - Transaction Layer

## Overview

The Decision Inbox is a minimal transaction layer UI that sits on top of OPsIQ's existing governance backend. It enables humans to:
1. **View** pending decisions awaiting approval
2. **Evaluate** decisions with full context (guardrails, block reasons, confidence)
3. **Act** on decisions (approve/reject/override)
4. **Measure** impact to prove what works

## File Structure

```
src/app/decisions/
├── page.tsx                    # Inbox: List pending decisions
├── [decisionId]/
│   └── page.tsx               # Decision detail + action panel
└── impact/
    └── page.tsx               # Impact dashboard

src/components/decisions/
├── DecisionInboxTable.tsx      # Decision list table
├── DecisionDetailCard.tsx      # Decision details + audit trail
├── DecisionActionPanel.tsx     # Approve/reject/override controls
└── ImpactChart.tsx             # Impact visualization
```

## 4 Core Pages

### 1. Decision Inbox (`/decisions`)
**Purpose:** Shows pending decisions awaiting approval

**Features:**
- List of all decisions with status (pending, approved, blocked)
- Filter by status
- Quick view: problem, impact estimate, confidence, block reason
- Click to view full details

**Data source:** `/api/governance/metrics?days=1` + OperatorItem table query

### 2. Decision Detail (`/decisions/[decisionId]`)
**Purpose:** Show complete decision context + make approval decision

**Left panel (2/3 width):**
- Full decision statement
- Expected impact range (low/high)
- Confidence score
- Block reason (if blocked)
- Input snapshot (JSON)
- Audit trail (who changed what, when)

**Right panel (1/3 width - sticky):**
- Action buttons: APPROVE, REJECT, OVERRIDE
- Override reason form (if blocked)
- Status indicator

**Data sources:**
- `/api/governance/metrics` - Decision data
- `/api/audit/events?entityId=[decisionId]` - Audit trail
- `/api/observability/summary` - Block reasons

### 3. Decision Action Panel (embedded in detail)
**Purpose:** Enable approval actions with audit logging

**Actions:**
- **APPROVE:** Sets status=approved, logs DECISION_APPROVED audit event
- **REJECT:** Sets status=rejected, logs DECISION_REJECTED audit event
- **OVERRIDE:** Requires reason text, logs DECISION_OVERRIDE_APPROVED with metadata

**All actions:**
1. Call `logAuditEvent()` (local service)
2. Call PATCH `/api/decisions/:id` to update status
3. Redirect to impact dashboard on success
4. Show error if action fails

**Data sources:**
- Server actions calling `/api/decisions/:id` (PATCH)
- `/api/audit/events` (POST)

### 4. Impact Dashboard (`/decisions/impact`)
**Purpose:** Show governance outcomes and measure decision effectiveness

**Displays:**
- Total decisions + approval rate (bar chart)
- Block rate (with health indicator: healthy/warning/critical)
- Realized impact (₹ value from approved decisions)
- Breakdown: approved expected vs blocked expected vs realized
- Protection ratio: % of risk filtered by governance

**Data sources:**
- `/api/governance/metrics?days=7` - Metrics
- `/api/observability/summary` - Lifecycle counts

## API Requirements

### Existing APIs (Used as-is)

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| /api/governance/metrics | GET | Get decision metrics, counts, block rates | ✓ Exists |
| /api/observability/summary | GET | Get lifecycle data, block reasons | ✓ Exists |
| /api/audit/events | GET | Fetch audit trail for a decision | ✓ Exists |
| /api/audit/events | POST | Log approval/override action | ✓ Exists |

### New API Endpoint Required

```typescript
// PATCH /api/decisions/:id
// Update decision status and metadata

Request body:
{
  status: "approved" | "rejected" | "pending",
  override_reason?: string,        // If overriding
  override_approved_at?: string,   // Timestamp
  notes?: string,                  // Additional notes
}

Response:
{
  id: string,
  status: string,
  updatedAt: string,
  // ... rest of OperatorItem
}
```

**This endpoint must:**
- Update OperatorItem.status
- Create audit event if not already done in server action
- Validate user authorization
- Return updated decision

**Alternative:** If modifying /api/run POST to support status updates:
```typescript
POST /api/run
{
  mode: "update_decision",  // vs "create_decision"
  decisionId: string,
  status: "approved" | "rejected",
  override_reason?: string,
}
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    DECISION INBOX UI                        │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ↓                    ↓                    ↓
    ┌─────────┐         ┌──────────┐        ┌──────────┐
    │ Inbox   │         │ Decision │        │ Impact   │
    │ Page    │         │ Detail   │        │Dashboard │
    └─────────┘         └──────────┘        └──────────┘
         │                    │                    │
         ├─→ GET /governance/metrics             ←┤
         │   GET /observability/summary            │
         │                    │                    │
         │            ┌────────────────┐          │
         │            │ Action Panel   │          │
         │            │ APPROVE/REJECT │          │
         │            └────────────────┘          │
         │                    │                    │
         │                    ├─→ PATCH /decisions/:id
         │                    ├─→ POST /audit/events
         │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────────────────┐
                    │   OPsIQ BACKEND     │
                    │  OperatorItem       │
                    │  AuditLog          │
                    │  DecisionLifecycle │
                    └─────────────────────┘
```

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Inbox page | ✓ Ready | List decisions |
| Detail page | ✓ Ready | Show decision + audit |
| Action panel | ✓ Ready | Approve/reject/override |
| Impact dashboard | ✓ Ready | Show metrics |
| DecisionInboxTable | ✓ Built | React component |
| DecisionDetailCard | ✓ Built | React component |
| DecisionActionPanel | ✓ Built | React component |
| ImpactChart | ✓ Built | React component |
| PATCH /api/decisions/:id | ⚠️ **NEEDED** | Must create |

## Minimal Backend Work Required

1. **Create endpoint:** PATCH /api/decisions/:id
   - Update OperatorItem.status
   - Handle override_reason field
   - Log action (or assume server action already logged)

2. **Expose query:** Decisions by status
   - Use existing /api/governance/metrics
   - OR add GET /api/decisions?status=pending query

That's it. No other backend changes needed.

## Integration Points

```typescript
// Server action in DecisionActionPanel.tsx
async function approveDecision(decisionId: string) {
  // 1. Log action
  await logAuditEvent({
    eventName: "DECISION_APPROVED",
    entityId: decisionId,
    // ...
  });

  // 2. Update decision
  const res = await fetch(`/api/decisions/${decisionId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" }),
  });

  // 3. Redirect
  router.push("/decisions/impact");
}
```

## Key Design Decisions

1. **No state management framework** - Using React hooks + server actions
2. **All data real** - No mocks, all API calls are to real endpoints
3. **Every action audited** - APPROVE/REJECT/OVERRIDE creates audit event
4. **Minimal styling** - Functional UI using Tailwind + simple components
5. **No external dependencies** - Uses existing OPsIQ patterns

## Testing Checklist

- [ ] Inbox page loads and lists decisions
- [ ] Click decision navigates to detail page
- [ ] Detail page shows all decision data
- [ ] Audit trail displays previous actions
- [ ] APPROVE button works and redirects
- [ ] REJECT button works and redirects
- [ ] OVERRIDE button shows form and requires reason
- [ ] Override logs with metadata
- [ ] Impact dashboard shows real metrics
- [ ] All actions appear in audit log

## Next Steps (Post-MVP)

1. Add real decision intake (how decisions get created)
2. Add settings UI (configure guardrails per organization)
3. Add multi-tenancy (per workspace)
4. Add more decision types (support different decision domains)
5. Add collaboration (comments, approvals by multiple people)
6. Add integrations (Slack, email notifications)
