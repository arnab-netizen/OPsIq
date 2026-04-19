# Finding Invariants, Lifecycle, and Supersession

## Invariants (Must Always Be True)

### Entity Invariants
1. **Belongs to Engagement**: Every Finding must have engagementId set and reference an active Engagement
2. **No Self-Reference**: Finding cannot supersede itself (supersedesFindingId ≠ id)
3. **No Cycles**: Supersession chain cannot form cycles (A→B→A invalid)
4. **Immutable After Supersession**: Once superseded, finding is read-only
5. **Immutable After Closure**: Once status='closed', finding is read-only
6. **Immutable Severity After Validation**: Once severityValidatedAt is set, severity cannot change
7. **Consistent Supersession State**: If status='superseded', then supersedesFindingId must be set and not null
8. **Unique Active Chain Head**: Only one Finding per supersession chain can have status='open'|'in_progress'|'validated'
9. **Single Validation Sequence**: A Finding can only progress through status workflow once; no backwards transitions

### Data Type Invariants
- engagementId: UUID, required, FK references Engagement
- severity: "low" | "medium" | "high" | "critical" (immutable after severityValidatedAt)
- status: "open" | "in_progress" | "validated" | "closed" | "superseded" (ordered progression)
- confidenceStatus: "provisional" | "final" (one-way: provisional → final only)
- confidenceLabel: "low" | "medium" | "high" (severity confidence, separate from status)
- clientVisibilityStatus: "internal" | "client_visible" (immutable, set at creation)
- version: Int ≥ 1 (must increment on every mutation)

### Temporal Invariants
- createdAt ≤ updatedAt (always)
- severityValidatedAt ≤ updatedAt (must be in past)
- statusUpdatedAt ≤ updatedAt (must be in past)
- supersededAt ≤ updatedAt (must be in past)
- No finding can transition to 'superseded' before all other fields are finalized

---

## Lifecycle States

### Status Workflow (Strict Ordering)

```
┌─────────┐
│  open   │ (initial state)
└────┬────┘
     │ (user initiates investigation)
┌────▼──────────────┐
│   in_progress     │ (evidence being gathered)
└────┬──────────────┘
     │ (findings confirmed)
┌────▼────────────┐
│   validated     │ (severity locked, immutable)
└────┬────────────┘
     │ (remediation complete)
┌────▼────────┐
│   closed    │ (immutable state)
└─────────────┘
```

**Valid Transitions (Backend Must Enforce):**
- open → in_progress (can mark as being worked)
- in_progress → validated (after evidence review, severity validated)
- validated → closed (remediation complete)
- Any state → superseded (if superseding finding identified)

**Invalid Transitions (Must Reject with 400):**
- open → validated (skip in_progress)
- open → closed (skip investigation)
- in_progress → closed (skip validation)
- closed → * (terminal, no outbound)
- superseded → * (terminal, no outbound)
- validated/closed/superseded → open (no backward)

### Confidence Status Workflow (One-Way)

```
┌─────────────┐
│ provisional │ (initial state)
└────┬────────┘
     │ (after status=validated)
┌────▼─────┐
│   final   │ (immutable)
└───────────┘
```

**Valid Transitions:**
- provisional → final (only when status='validated')
- final → final (idempotent)

**Invalid Transitions:**
- final → provisional (no backward)

---

## Supersession Constraints

### Chain Structure
- A Finding can supersede exactly one other Finding (0 or 1 upstream)
- A Finding can be superseded by multiple Findings (0 to N downstream)
- Chains are linear: no branching (one head, one or more in chain, no merging)

### Supersession Validation Rules
1. **No Self-Supersession**: supersedesFindingId ≠ id
2. **No Cycles**: Follow chain up, must not loop back to self
3. **Engagement Scoped**: superseded Finding must belong to same engagement
4. **Status Enforcement**: Only status='superseded' findings can have supersedesFindingId set
5. **One Active Head Per Chain**: At most one Finding in chain has status ∈ {open, in_progress, validated}
6. **Immutable Chain Membership**: Once superseded, a Finding's supersedesFindingId cannot change

### Supersession Workflow
```
Finding A (open/in_progress/validated)  ← Active chain head
   ↓
Finding B (open/in_progress/validated)  ← Was active, now superseded
   ↓
Finding C (superseded)                   ← Was superseded earlier
```

When Finding B supersedes Finding A:
1. Finding A's status → 'superseded'
2. Finding A's supersededAt → NOW
3. Finding A becomes immutable
4. Finding B becomes the active chain head
5. AuditEvent emitted: "FINDING_SUPERSEDED"

---

## Audit Contract Expectations

### Required Audit Events (All Must Emit)

#### FINDING_CREATED
```json
{
  "action": "FINDING_CREATED",
  "entityType": "Finding",
  "entityId": "...",
  "before": null,
  "after": { "id", "engagementId", "title", "statement", "severity", "status", "confidenceStatus", "clientVisibilityStatus", "version": 1 },
  "actorId": "...",
  "reason": "Initial finding creation"
}
```

#### FINDING_UPDATED
```json
{
  "action": "FINDING_UPDATED",
  "entityType": "Finding",
  "entityId": "...",
  "before": { "title", "statement", "status", "confidenceStatus", "version": N },
  "after": { "title", "statement", "status", "confidenceStatus", "version": N+1 },
  "actorId": "...",
  "reason": "Updated finding details"
}
```

#### FINDING_SEVERITY_VALIDATED
```json
{
  "action": "FINDING_SEVERITY_VALIDATED",
  "entityType": "Finding",
  "entityId": "...",
  "before": { "severity", "severityValidatedAt": null },
  "after": { "severity", "severityValidatedAt": "NOW", "version": N+1 },
  "actorId": "...",
  "reason": "Severity locked after evidence review"
}
```

#### FINDING_STATUS_TRANSITIONED
```json
{
  "action": "FINDING_STATUS_TRANSITIONED",
  "entityType": "Finding",
  "entityId": "...",
  "before": { "status": "open", "statusUpdatedAt": "..." },
  "after": { "status": "in_progress", "statusUpdatedAt": "NOW", "version": N+1 },
  "actorId": "...",
  "reason": "Beginning investigation"
}
```

#### FINDING_CONFIDENCE_PROMOTED
```json
{
  "action": "FINDING_CONFIDENCE_PROMOTED",
  "entityType": "Finding",
  "entityId": "...",
  "before": { "confidenceStatus": "provisional" },
  "after": { "confidenceStatus": "final", "version": N+1 },
  "actorId": "...",
  "reason": "Finding validated and confirmed"
}
```

#### FINDING_SUPERSEDED
```json
{
  "action": "FINDING_SUPERSEDED",
  "entityType": "Finding",
  "entityId": "...",
  "before": { "status": "validated", "supersedesFindingId": null },
  "after": { "status": "superseded", "supersedesFindingId": "new_finding_id", "supersededAt": "NOW", "version": N+1 },
  "actorId": "...",
  "reason": "Superseded by Finding #new_finding_id with more recent evidence"
}
```

### Audit Event Guarantees
- visibility = Finding.clientVisibilityStatus (if client_visible, event is visible to client)
- Every mutation must emit exactly one audit event
- Timestamp in audit event = timestamp when mutation committed
- Version in audit after must match Finding.version
- All before/after payloads must include ALL changed fields, not just modified ones

---

## Query Patterns (Index Coverage)

### Critical Query Patterns
1. **List findings by engagement and status**
   - `WHERE engagementId=X AND status IN (open, in_progress, validated)`
   - Index: (engagementId, status)

2. **List findings by engagement and severity**
   - `WHERE engagementId=X AND severity=critical`
   - Index: (engagementId, severity)

3. **List findings by confidence in engagement**
   - `WHERE engagementId=X AND confidenceStatus=provisional`
   - Index: (engagementId, confidenceStatus)

4. **Find supersession chain**
   - `WHERE supersedesFindingId=X` (all findings superseding X)
   - `WHERE id=X` then traverse supersedesFindingId
   - Index on supersedesFindingId FK for traversal

5. **Find one active per issue**
   - `WHERE issueId=X AND status IN (open, in_progress, validated)`
   - Index: (issueId, status)

6. **Find unvalidated findings**
   - `WHERE severityValidatedAt IS NULL AND engagementId=X`
   - Index: (engagementId, severityValidatedAt)

---

## Safe for Backend

✅ **All invariants can be enforced via**:
- Database constraints (CHECK, FK, UNIQUE)
- Backend service policies (state transitions, immutability)
- Audit event emission (guaranteed logging)

✅ **Optimistic locking ready**: version field supports WHERE id + version for concurrent updates

✅ **Supersession safe**: CHECK constraints prevent self-reference and orphaning; backend enforces no cycles and active head uniqueness
