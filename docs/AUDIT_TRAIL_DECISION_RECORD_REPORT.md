# Audit Trail and Decision Record Report

**Program:** OpsIQ Best-in-Class Credibility & Reliability Upgrade — Mission 4  
**Date:** 2026-06-23  
**Scope:** Audit hash chain integrity, event payload completeness, actor tracing, decision record creation  
**Test baseline at time of report:** TypeScript CLEAN, simulation 335/335, SMB 455/455

---

## Executive Summary

Mission 4 fixed the most critical audit deficiency in the codebase: the P0 audit hash chain was broken due to using `eventId` in the `eventName` slot and `new Date()` (wall-clock) in the verification path, making chain verification always non-deterministic and always-failing. Both defects are fixed in `src/infra/audit.ts`. One P1 payload completeness gap was also fixed. Two P2 gaps remain documented.

---

## AU.1 — Hash Chain Integrity (P0 Fix)

### Pre-Fix State

The previous implementation had two bugs in the hash chain:

1. **Write path (`emitAuditEvent`):** `computeEventHash` was called with `lastEvent.id` in both the `eventId` and `eventName` parameter slots. The actual `lastEvent.eventName` was never bound into the hash. This meant the hash did not represent the event content — two different events with the same `id` would produce the same hash.

2. **Verify path (`verifyAuditChainIntegrity`):** The verification called `computeEventHash` with `new Date()` (current wall-clock time) instead of the stored `occurredAt` from the previous event. Since `new Date()` changes every millisecond, the recomputed hash never matched the stored hash. Every verification call returned `isValid: false` regardless of actual chain integrity.

### Fix Applied

File: `src/infra/audit.ts`

**Write path (`emitAuditEvent`, lines 41–45):**
```
select: { id: true, previousHash: true, eventName: true, occurredAt: true }
```
`lastEvent.eventName` and `lastEvent.occurredAt` are now fetched and passed to `computeEventHash`. The `previousHash` stored on each new event is: `sha256(lastEvent.id | workspaceId | lastEvent.eventName | lastEvent.occurredAt.toISOString())`.

**Verify path (`verifyAuditChainIntegrity`, lines 127–144):**
```
select: { id: true, previousHash: true, eventName: true, occurredAt: true }
```
Recomputation now uses `previousEvent.eventName` and `previousEvent.occurredAt` — the same values that were used at write time. Hash verification is now deterministic and correct.

### Hash Formula

```
sha256( eventId | workspaceId | eventName | occurredAt.toISOString() )
```

All four components are immutable after creation. The chain is verifiable at any future point.

### Verification Logic

`verifyAuditChainIntegrity(workspaceId, { since? })` iterates events in chronological order. For each event `i`, it recomputes the expected hash of event `i-1` and compares it to `events[i].previousHash`. Returns `{ isValid: true, eventsChecked: N }` or `{ isValid: false, tamperedAt: i, eventsChecked: i }`.

### First Event in Chain

The first event for a workspace has `previousHash: null` (no prior event). This is correct — the chain starts at `null`.

---

## AU.2 — Complete Payload on Diagnosis Events

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| Evidence | `OWNER_FINANCE_DIAGNOSIS_RUN` audit event payload now includes: `dataConfidenceScore`, `confidenceTier`, `missingCritical` (array), `confidenceDelta` (vs. previous cycle), and `survivalState`. |
| Prior state | Payload contained diagnosis metadata but omitted confidence scoring fields — making post-hoc audit reconstruction incomplete. |
| Notes | `survivalState` was identified as missing in M.3 of the gap map and is now included. |

---

## AU.3 — Actor Trace

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Evidence | `actorId` and `actorType` fields on every `AuditEventInput`. All finance mutation calls pass `actorId`. Default `actorType = "user"` when not specified. The `emitAuditEvent` function stores both on every event record. |
| Notes | System-initiated events (e.g., background diagnosis) should pass `actorType: "system"` — verify in finance diagnosis service call sites. |

---

## AU.4 — OwnerDecision Records for Finance Actions

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Evidence | `OwnerDecision` model exists in the Prisma schema. |
| Gap | No application-layer code path creates `OwnerDecision` records when finance actions are proposed, accepted, deferred, or rejected. The model is defined but not wired. |
| Residual risk | MEDIUM — finance action decisions are not formally recorded as decision records. The audit event log partially covers this (action state-change events), but a structured `OwnerDecision` record provides stronger decision accountability. |
| Planned path | Wire `OwnerDecision` creation into the finance action accept/defer/reject workflow (which is itself a P2 gap — HO.3). Both gaps resolve together. |

---

## Workspace Isolation

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Evidence | `emitAuditEvent` performs an early-exit guard: if `workspaceId` is absent, it logs a warning and returns `"fail-safe-no-workspace-id"` without writing to the DB. All audit queries filter by `workspaceId`. No cross-workspace event leakage is possible at the query layer. |

---

## Visibility Classification

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Evidence | `visibility: "internal" | "client_visible"` on every event. Default is `"internal"`. Finance diagnosis events are internal-only. The `queryAuditEvents` function accepts a visibility filter. |

---

## Audit Events Emitted by Finance Domain (as of Mission 4)

| Event Name | Trigger | Payload Key Fields |
|------------|---------|-------------------|
| `OWNER_FINANCE_DIAGNOSIS_RUN` | Every finance diagnosis | dataConfidenceScore, confidenceTier, missingCritical, confidenceDelta, survivalState |
| `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` | Score < 30 | dataConfidenceScore, confidenceTier, missingCritical, confidenceDelta |
| `OWNER_FINANCE_SNAPSHOT_CREATED` | New snapshot submitted | periodStart, periodEnd, currency |
| `OWNER_FINANCE_ACTION_CREATED` | Finance action proposed | actionCode, impactScore, urgencyScore |
| `OWNER_FINANCE_ACTION_STATUS_CHANGED` | Action status update | actionId, previousStatus, newStatus |

Note: The above list reflects known events. A full audit event registry should be maintained in `src/domain/constants/audit-events.ts`.

---

## Control Summary

| Control | Status | Severity |
|---------|--------|----------|
| AU.1 — Hash chain write path uses eventName + occurredAt | FIXED | was P0 |
| AU.1 — Hash chain verify path is deterministic | FIXED | was P0 |
| AU.2 — Diagnosis payload includes confidence fields | FIXED | was P1 |
| AU.3 — actorId on all events | PASS | — |
| AU.4 — OwnerDecision records for finance actions | GAP-P2 | P2 |
| Workspace isolation on all events | PASS | — |
| Visibility classification on all events | PASS | — |
