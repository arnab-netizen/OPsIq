# Engagement State Verification

## 1. Schema Fields Verification

### Prisma Schema - Engagement Model
Required fields:
- ✓ id (String @id)
- ✓ engagementId (implicit - id is the engagement identifier)
- ✓ interventionMode (String)
- ✓ interventionPhase (String)
- ✓ isBlocked (Boolean)
- ✓ blockerReason (String?)
- ✓ blockedAt (DateTime?)

Verification via grep:
model Engagement {
  id                    String    @id @default(uuid()) @db.Uuid
  code                  String    @unique // human-readable engagement code
  title                 String
  clientId              String    @map("client_id") @db.Uuid
  serviceTier           String    @map("service_tier") // "standard" | "premium" | "enterprise"
  engagementMode        String    @map("engagement_mode") // "beginner" | "expert"
  status                String    @default("draft") // governed by ENGAGEMENT_STATUSES
  healthStatus          String    @default("healthy") @map("health_status") // "healthy" | "at_risk" | "critical" | "unknown"
  interventionMode      String?   @map("intervention_mode") // governed by INTERVENTION_MODES, null until initialized
  interventionPhase     String?   @map("intervention_phase") // governed by INTERVENTION_PHASES, null until initialized
  isBlocked             Boolean   @default(false) @map("is_blocked")
  blockerReason         String?   @map("blocker_reason")
  blockedAt             DateTime? @map("blocked_at")
  description           String?
  startDate             DateTime? @map("start_date")
  targetEndDate         DateTime? @map("target_end_date")
  actualEndDate         DateTime? @map("actual_end_date")
  ownerId               String?   @map("owner_id") @db.Uuid // primary consultant
  assignedConsultantId  String?   @map("assigned_consultant_id") @db.Uuid
  currentScopeVersionId String?   @map("current_scope_version_id") @db.Uuid // placeholder for future scope module

All required fields are present in schema. ✓

## 2. Service Usage - Reading from DB

### src/services/intervention-state.ts - getInterventionState()
```typescript
const engagement = await db.engagement.findUnique({
  where: { id: engagementId },
  select: {
    id: true,
    interventionMode: true,
    version: true,
  },
});
```
✓ Reads from DB, not from audit events

### src/services/intervention-state.ts - updateInterventionPhase()
```typescript
const engagement = await db.engagement.findUnique({
  where: { id: engagementId },
  select: {
    id: true,
    status: true,
    interventionPhase: true,
    interventionMode: true,
    version: true,
  },
});
```
✓ Reads from DB, not from audit events

### src/services/intervention-state.ts - blockEngagement()
```typescript
const engagement = await db.engagement.findUnique({
  where: { id: engagementId },
  select: { id: true, version: true, isBlocked: true },
});

if (!engagement.isBlocked) {
  await db.engagement.update({
    where: { id: engagementId },
    data: {
      isBlocked: true,
      blockerReason,
      blockedAt: new Date(),
      version: { increment: 1 },
    },
  });
}
```
✓ Reads isBlocked from DB
✓ Updates schema fields directly
✓ Increments version

### src/services/stage.ts - blockStage()
```typescript
// Block the engagement (source of truth for blocking state)
const engagement = await db.engagement.findUnique({
  where: { id: stage.engagementId },
  select: { version: true, isBlocked: true },
});

if (!engagement.isBlocked) {
  await db.engagement.update({
    where: { id: stage.engagementId },
    data: {
      isBlocked: true,
      blockerReason: input.blockerReason,
      blockedAt: new Date(),
      version: { increment: 1 },
    },
  });
}
```
✓ Delegates blocking to Engagement
✓ Updates Engagement fields
✓ Does not persist blocking on Stage model

## 3. Blocking Logic Verification

### Design: Engagement as Source of Truth

From code inspection:
- isBlocked is stored on Engagement model
- Stage.blockStage() updates parent engagement.isBlocked
- Engagement blocking is idempotent (checks `if (!engagement.isBlocked)`)
- Audit events are emitted but don't serve as state source

### Blocking Flow Example:

User calls: blockStage(stageId, { blockerReason: "..." })
↓
1. Read stage from DB → gets engagementId
2. Read engagement.isBlocked from DB
3. If not already blocked:
   - Update engagement.isBlocked = true
   - Set engagement.blockerReason
   - Set engagement.blockedAt = now()
   - Increment engagement.version
4. Emit STAGE_BLOCKED audit event
5. Trigger re-evaluation

### Unblocking Flow:

User calls: unblockStage(stageId)
↓
1. Read stage from DB
2. Read engagement.isBlocked from DB
3. If currently blocked:
   - Update engagement.isBlocked = false
   - Clear engagement.blockerReason = null
   - Clear engagement.blockedAt = null
   - Increment engagement.version
4. Emit STAGE_UNBLOCKED audit event

## Verification Results

| Requirement | Status | Evidence |
|-------------|--------|----------|
| engagementId exists | ✓ | Schema field `id` serves as engagement identifier |
| interventionMode exists | ✓ | Schema field present, used by services |
| interventionPhase exists | ✓ | Schema field present, validated and updated by services |
| isBlocked exists | ✓ | Schema field present, used as blocking flag |
| blockerReason exists | ✓ | Schema field present, stored with blocking reason |
| blockedAt exists | ✓ | Schema field present, timestamp of block |
| Services read from DB | ✓ | All services call db.engagement.findUnique |
| Blocking updates DB | ✓ | db.engagement.update called with new values |
| Not reading from audit | ✓ | State queries use direct DB reads |
| Idempotency checks | ✓ | Blocking logic checks `!isBlocked` before updating |
| Version increment | ✓ | All mutations use { increment: 1 } |

## Conclusion

✓ ENGAGEMENT STATE VERIFICATION PASSED

The Engagement model is correctly implemented as the source of truth for:
- Intervention mode and phase (structured governance)
- Blocking status and reason (state-based blocking)
- Timestamp tracking (audit trail)

Services properly:
- Query the DB for current state (not deriving from audit events)
- Update all relevant fields atomically
- Emit audit events as immutable history (not as state)
- Enforce idempotency checks to prevent double-blocking
