# Decision Intake API - POST /api/decisions/create

## Overview

Raw decision intake endpoint. Creates a decision in **pending** state without any evaluation, guardrails, or blocking logic.

This is the entry point for the decision governance flow:
1. **Create** decision (this endpoint)
2. **Show** in inbox (`/decisions` page)
3. **Review** with full context (`/decisions/[id]` page)
4. **Approve/Reject/Override** (`/decisions/[id]` action panel)
5. **Measure** impact (`/decisions/impact` dashboard)

## Request

```bash
POST /api/decisions/create
Content-Type: application/json

{
  "title": "Approve $5M investment in Portfolio Company X",
  "description": "Capital allocation decision to fund expansion into new market. Expected to generate 25% ROI over 12 months with medium risk profile.",
  "confidence": 0.75,
  "risk": "medium",
  "financialInputs": {
    "revenue": 5000000,
    "cost": 1250000,
    "expectedROI": 0.25
  }
}
```

## Request Schema

| Field | Type | Required | Constraints | Example |
|-------|------|----------|-------------|---------|
| `title` | string | Yes | 5-200 chars | "Approve $5M investment" |
| `description` | string | Yes | 10-2000 chars | "Capital allocation decision..." |
| `confidence` | number | Yes | 0-1 (0% to 100%) | 0.75 |
| `risk` | enum | Yes | "low" \| "medium" \| "high" | "medium" |
| `financialInputs` | object | No | See below | {...} |

### financialInputs object

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `revenue` | number | No | 0 | Expected revenue in ₹ |
| `cost` | number | No | 0 | Expected cost in ₹ |
| `expectedROI` | number | No | 0 | ROI as decimal (0.25 = 25%) |

## Response

### Success (201 Created)

```json
{
  "decisionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2024-04-30T10:30:00Z",
  "message": "Decision created successfully. Status is pending."
}
```

### Validation Error (400)

```json
{
  "error": "Invalid input",
  "details": [
    {
      "field": "title",
      "message": "String must contain at least 5 character(s)"
    },
    {
      "field": "confidence",
      "message": "Number must be less than or equal to 1"
    }
  ]
}
```

### Auth Error (403)

```json
{
  "error": "Unauthorized"
}
```

### Rate Limit (429)

```json
{
  "error": "Rate limit exceeded"
}
```

## Database Fields Set

When a decision is created, these OperatorItem fields are populated:

| Field | Source | Value |
|-------|--------|-------|
| `id` | Generated | UUID |
| `workspaceId` | Context | From session workspace |
| `createdBy` | Session | Current user ID |
| `ownerUserId` | Session | Current user ID |
| `problem` | Input | title |
| `action` | Input | description |
| `confidence` | Input | confidence value |
| `impactExpected` | Calculated | revenue - cost |
| `impactLow` | Calculated | expectedImpact * 0.7 |
| `impactHigh` | Calculated | expectedImpact * 1.3 |
| `status` | Default | "pending" |
| `blockStage` | Default | null |
| `blockReason` | Default | null |
| `inputsSnapshot` | Input | Full request JSON |
| `createdAt` | System | now() |
| `updatedAt` | System | now() |

## Flow After Creation

1. **Decision created** with status="pending"
2. **Audit event logged**: DECISION_CREATED with full metadata
3. **decisionId returned** to client
4. **UI displays** in /decisions inbox
5. **User reviews** at /decisions/[decisionId]
6. **User approves/rejects/overrides** → status changes
7. **Audit logged** for each action
8. **Impact measured** at /decisions/impact

## Key Behaviors

### No Evaluation
- Decision is **NOT** evaluated against guardrails
- Decision is **NOT** evaluated against decision gates
- Decision is **NOT** checked for variable validation
- Decision is **NOT** blocked, even if risky

### Audit Trail
- Creation is logged as DECISION_CREATED
- All metadata captured in inputsSnapshot
- Actor (current user) recorded
- Timestamp recorded

### Rate Limiting
- Respects per-workspace rate limit (1000 req/min)
- Returns 429 if limit exceeded
- Limit configured in /src/services/production/safety-config.ts

### Input Validation
- Zod schema validates all inputs
- Returns 400 with field-level errors if invalid
- title: 5-200 characters
- description: 10-2000 characters
- confidence: 0-1
- risk: must be "low", "medium", or "high"

## Example Usage

### cURL

```bash
curl -X POST http://localhost:3000/api/decisions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Approve $5M investment",
    "description": "Capital allocation to expand into new market. 25% ROI target.",
    "confidence": 0.75,
    "risk": "medium",
    "financialInputs": {
      "revenue": 5000000,
      "cost": 1250000,
      "expectedROI": 0.25
    }
  }'
```

### JavaScript/Fetch

```typescript
async function createDecision() {
  const response = await fetch("/api/decisions/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Approve $5M investment",
      description: "Capital allocation to expand into new market.",
      confidence: 0.75,
      risk: "medium",
      financialInputs: {
        revenue: 5000000,
        cost: 1250000,
        expectedROI: 0.25,
      },
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log("Decision created:", data.decisionId);
    // Redirect to decision detail page
    window.location.href = `/decisions/${data.decisionId}`;
  } else {
    console.error("Error:", data.error);
  }
}
```

### React Component

```typescript
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateDecisionForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [confidence, setConfidence] = useState(0.5);
  const [risk, setRisk] = useState<"low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/decisions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          confidence,
          risk,
          financialInputs: {
            revenue: 5000000,
            cost: 1250000,
          },
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create decision");
      }

      const data = await response.json();
      router.push(`/decisions/${data.decisionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating decision");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        placeholder="Decision title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        minLength={5}
        maxLength={200}
      />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        minLength={10}
        maxLength={2000}
      />
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={confidence}
        onChange={(e) => setConfidence(parseFloat(e.target.value))}
      />
      <select value={risk} onChange={(e) => setRisk(e.target.value as any)}>
        <option value="low">Low Risk</option>
        <option value="medium">Medium Risk</option>
        <option value="high">High Risk</option>
      </select>
      <button type="submit" disabled={loading}>
        {loading ? "Creating..." : "Create Decision"}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </form>
  );
}
```

## Integration with Inbox

After creating a decision, it immediately appears in the inbox:

```
POST /api/decisions/create → {"decisionId": "abc123"}
                            ↓
                    Redirect to /decisions/abc123
                            ↓
                    GET /api/governance/metrics
                            ↓
                    Show in inbox with status="pending"
```

## Testing Checklist

- [ ] Create decision with valid input
- [ ] Verify decisionId returned
- [ ] Verify decision appears in /decisions inbox
- [ ] Verify audit event logged (DECISION_CREATED)
- [ ] Verify status="pending"
- [ ] Test with invalid title (too short)
- [ ] Test with invalid confidence (>1)
- [ ] Test with invalid risk value
- [ ] Test unauthorized (no session)
- [ ] Test rate limit exceeded

## Security Notes

- Requires authenticated session (checks getSession)
- Workspace-scoped (uses requireWorkspaceContext)
- Rate-limited per workspace
- All inputs validated with Zod
- Audit event logged for compliance
- No evaluation, no blocking (safe to create any decision)
