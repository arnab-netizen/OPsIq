/**
 * ADDENDUM F: Sync Engine Contracts
 *
 * Defines state machine, conflict detection, and de-duplication logic
 * for data synchronization across OpsIQ sources.
 *
 * Non-DB: Contains only contracts, algorithms, and state definitions (no persistence).
 * Ready for: Integration with sync service once database available.
 */

import { z } from "zod";

// ============================================================================
// SYNC STATE MACHINE (foundational for all sync operations)
// ============================================================================

/** Sync state enumeration */
export enum SyncState {
  IDLE = "IDLE",
  DISCOVERING = "DISCOVERING",
  PREPARING = "PREPARING",
  DOWNLOADING = "DOWNLOADING",
  PROCESSING = "PROCESSING",
  DETECTING_CONFLICTS = "DETECTING_CONFLICTS",
  RESOLVING_CONFLICTS = "RESOLVING_CONFLICTS",
  UPLOADING = "UPLOADING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  PAUSED = "PAUSED",
  CANCELLED = "CANCELLED",
}

/** Valid state transitions */
export const STATE_TRANSITIONS: Record<SyncState, SyncState[]> = {
  [SyncState.IDLE]: [SyncState.DISCOVERING, SyncState.FAILED, SyncState.PAUSED, SyncState.CANCELLED],
  [SyncState.DISCOVERING]: [SyncState.PREPARING, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.PREPARING]: [SyncState.DOWNLOADING, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.DOWNLOADING]: [SyncState.PROCESSING, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.PROCESSING]: [SyncState.DETECTING_CONFLICTS, SyncState.UPLOADING, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.DETECTING_CONFLICTS]: [SyncState.RESOLVING_CONFLICTS, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.RESOLVING_CONFLICTS]: [SyncState.UPLOADING, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.UPLOADING]: [SyncState.COMPLETED, SyncState.FAILED, SyncState.PAUSED],
  [SyncState.COMPLETED]: [SyncState.IDLE, SyncState.CANCELLED],
  [SyncState.FAILED]: [SyncState.IDLE, SyncState.CANCELLED],
  [SyncState.PAUSED]: [SyncState.DOWNLOADING, SyncState.PROCESSING, SyncState.FAILED, SyncState.CANCELLED],
  [SyncState.CANCELLED]: [SyncState.IDLE],
};

/** Sync session metadata */
export const SyncSessionSchema = z.object({
  sessionId: z.string().min(1),
  workspaceId: z.string().min(1),
  sourceConnector: z.string().min(1),
  targetConnector: z.string().optional(),
  state: z.union([z.literal("IDLE"), z.literal("DISCOVERING"), z.literal("PREPARING"), z.literal("DOWNLOADING"), z.literal("PROCESSING"), z.literal("DETECTING_CONFLICTS"), z.literal("RESOLVING_CONFLICTS"), z.literal("UPLOADING"), z.literal("COMPLETED"), z.literal("FAILED"), z.literal("PAUSED"), z.literal("CANCELLED")]),
  direction: z.enum(["pull", "push", "bidirectional"]),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  recordsDiscovered: z.number().min(0),
  recordsProcessed: z.number().min(0),
  recordsSucceeded: z.number().min(0),
  recordsFailed: z.number().min(0),
  conflictsDetected: z.number().min(0),
  conflictsResolved: z.number().min(0),
  errorMessage: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type SyncSession = z.infer<typeof SyncSessionSchema>;

// ============================================================================
// CONFLICT DETECTION & RESOLUTION
// ============================================================================

/** Types of data conflicts */
export enum ConflictType {
  UPDATE_CONFLICT = "UPDATE_CONFLICT", // Both sources modified same record
  DELETE_CONFLICT = "DELETE_CONFLICT", // One source deleted, other modified
  DUPLICATE_CONFLICT = "DUPLICATE_CONFLICT", // Same record exists with different IDs
  SCHEMA_CONFLICT = "SCHEMA_CONFLICT", // Field structure mismatch
  VERSION_CONFLICT = "VERSION_CONFLICT", // Incompatible data versions
}

/** Conflict detection result */
export const ConflictDetectionSchema = z.object({
  recordId: z.string().min(1),
  sourceConnector: z.string(),
  targetConnector: z.string(),
  conflictType: z.union([z.literal("UPDATE_CONFLICT"), z.literal("DELETE_CONFLICT"), z.literal("DUPLICATE_CONFLICT"), z.literal("SCHEMA_CONFLICT"), z.literal("VERSION_CONFLICT")]),
  sourceVersion: z.number().min(0),
  targetVersion: z.number().min(0),
  sourceTimestamp: z.date(),
  targetTimestamp: z.date(),
  sourceData: z.record(z.string(), z.any()),
  targetData: z.record(z.string(), z.any()),
  detectedAt: z.date(),
  severity: z.enum(["critical", "high", "medium", "low"]),
});

export type ConflictDetection = z.infer<typeof ConflictDetectionSchema>;

/** Conflict resolution strategy */
export enum ResolutionStrategy {
  LAST_WRITE_WINS = "LAST_WRITE_WINS", // Newer timestamp wins
  SOURCE_WINS = "SOURCE_WINS", // Source version wins
  TARGET_WINS = "TARGET_WINS", // Target version wins
  MERGE = "MERGE", // Combine non-conflicting fields
  MANUAL = "MANUAL", // Requires user decision
}

/** Conflict resolution result */
export const ConflictResolutionSchema = z.object({
  conflictId: z.string().min(1),
  strategy: z.union([z.literal("LAST_WRITE_WINS"), z.literal("SOURCE_WINS"), z.literal("TARGET_WINS"), z.literal("MERGE"), z.literal("MANUAL")]),
  resolvedData: z.record(z.string(), z.any()),
  resolvedBy: z.string().optional(),
  resolvedAt: z.date(),
  notes: z.string().optional(),
});

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

// ============================================================================
// DE-DUPLICATION ENGINE
// ============================================================================

/** De-duplication match result */
export const DeduplicationMatchSchema = z.object({
  recordId1: z.string().min(1),
  recordId2: z.string().min(1),
  matchConfidence: z.number().min(0).max(1), // 0-1 confidence score
  matchingFields: z.array(z.string()), // Fields that matched
  partialMatches: z.array(z.string()).optional(), // Fields with partial match
  duplicateType: z.enum(["exact_duplicate", "potential_duplicate", "merged_entity"]),
});

export type DeduplicationMatch = z.infer<typeof DeduplicationMatchSchema>;

/** De-duplication strategy options */
export enum DeduplicationStrategy {
  MERGE_KEEP_FIRST = "MERGE_KEEP_FIRST", // Keep first, merge second into first
  MERGE_KEEP_NEWER = "MERGE_KEEP_NEWER", // Keep newer, merge older into newer
  MERGE_COMPREHENSIVE = "MERGE_COMPREHENSIVE", // Merge all non-conflicting data
  MARK_DUPLICATE = "MARK_DUPLICATE", // Mark as duplicate, don't merge
  DELETE_DUPLICATE = "DELETE_DUPLICATE", // Delete duplicate (risky)
}

// ============================================================================
// CHANGE DETECTION & DELTA SYNC
// ============================================================================

/** Change detection result for a single record */
export const ChangeDetectionSchema = z.object({
  recordId: z.string().min(1),
  changeType: z.enum(["created", "updated", "deleted", "no_change"]),
  changedFields: z.array(z.string()),
  previousValues: z.record(z.string(), z.any()).optional(),
  currentValues: z.record(z.string(), z.any()),
  detectedAt: z.date(),
  detectionMethod: z.enum(["timestamp", "hash", "field_comparison", "manual"]),
});

export type ChangeDetection = z.infer<typeof ChangeDetectionSchema>;

/** Delta sync batch (only changed records) */
export const DeltaSyncBatchSchema = z.object({
  batchId: z.string().min(1),
  sourceConnector: z.string().min(1),
  changeCount: z.number().min(0),
  changes: z.array(ChangeDetectionSchema),
  lastSyncTimestamp: z.date().optional(),
  currentTimestamp: z.date(),
});

export type DeltaSyncBatch = z.infer<typeof DeltaSyncBatchSchema>;

// ============================================================================
// IDEMPOTENCY & REPLAY CONTRACTS
// ============================================================================

/** Idempotency key for safe retries */
export const IdempotencyKeySchema = z.object({
  key: z.string().min(1), // Unique key for operation
  operationType: z.string(),
  contextHash: z.string(), // Hash of operation context
  createdAt: z.date(),
  expiresAt: z.date(), // When key expires
});

export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

/** Sync operation replay record */
export const SyncOperationReplaySchema = z.object({
  operationId: z.string().min(1),
  sessionId: z.string().min(1),
  sequenceNumber: z.number().min(0),
  operationType: z.enum(["download", "process", "detect_conflict", "resolve_conflict", "upload"]),
  operationData: z.record(z.string(), z.any()),
  resultCode: z.enum(["success", "failure", "skipped", "partial"]),
  errorMessage: z.string().optional(),
  appliedAt: z.date(),
  replayableUntil: z.date().optional(),
});

export type SyncOperationReplay = z.infer<typeof SyncOperationReplaySchema>;

// ============================================================================
// RATE LIMITING & BACKPRESSURE
// ============================================================================

/** Sync rate limits (throttling) */
export const SyncRateLimitSchema = z.object({
  connectorId: z.string().min(1),
  recordsPerSecond: z.number().min(1),
  batchSize: z.number().min(1),
  maxConcurrentOperations: z.number().min(1),
  backoffMultiplier: z.number().min(1),
  maxBackoffSeconds: z.number().min(1),
});

export type SyncRateLimit = z.infer<typeof SyncRateLimitSchema>;

// ============================================================================
// SYNC VALIDATION & GATES
// ============================================================================

/** Pre-sync validation checklist */
export const PreSyncValidationSchema = z.object({
  canConnect: z.boolean(),
  hasValidCredentials: z.boolean(),
  schemaCompatible: z.boolean(),
  hasRequiredFields: z.boolean(),
  networkAvailable: z.boolean(),
  storageAvailable: z.boolean(),
  validationErrors: z.array(z.string()),
});

export type PreSyncValidation = z.infer<typeof PreSyncValidationSchema>;

/** Post-sync validation checklist */
export const PostSyncValidationSchema = z.object({
  allRecordsProcessed: z.boolean(),
  recordCountMatches: z.boolean(),
  noUnresolvedConflicts: z.boolean(),
  noOrphanedRecords: z.boolean(),
  dataIntegrityChecked: z.boolean(),
  consistencyVerified: z.boolean(),
  validationErrors: z.array(z.string()),
});

export type PostSyncValidation = z.infer<typeof PostSyncValidationSchema>;

// ============================================================================
// ALGORITHM HELPERS (NO DB DEPENDENCY)
// ============================================================================

/**
 * Check if state transition is valid
 */
export function isValidStateTransition(fromState: SyncState, toState: SyncState): boolean {
  const validTransitions = STATE_TRANSITIONS[fromState] || [];
  return validTransitions.includes(toState);
}

/**
 * Calculate de-duplication confidence (simple string similarity)
 * Range: 0 (no match) to 1 (perfect match)
 */
export function calculateDeduplicationConfidence(
  record1: Record<string, unknown>,
  record2: Record<string, unknown>,
  keyFields: string[] = [],
): number {
  if (keyFields.length === 0) return 0;

  let matches = 0;
  for (const field of keyFields) {
    const val1 = String(record1[field] || "").toLowerCase().trim();
    const val2 = String(record2[field] || "").toLowerCase().trim();
    if (val1 && val1 === val2) matches++;
  }

  return matches / keyFields.length;
}

/**
 * Detect changes between two record versions using field comparison
 */
export function detectFieldChanges(
  oldRecord: Record<string, unknown>,
  newRecord: Record<string, unknown>,
): string[] {
  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]);

  for (const key of allKeys) {
    const oldValue = JSON.stringify(oldRecord[key]);
    const newValue = JSON.stringify(newRecord[key]);
    if (oldValue !== newValue) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Determine conflict severity based on conflict type and timestamp delta
 */
export function calculateConflictSeverity(
  conflictType: ConflictType,
  sourceTimestamp: Date,
  targetTimestamp: Date,
): "critical" | "high" | "medium" | "low" {
  // Delete conflicts are always critical
  if (conflictType === ConflictType.DELETE_CONFLICT) return "critical";

  // Update conflicts are critical if timestamps are close (concurrent edits)
  if (conflictType === ConflictType.UPDATE_CONFLICT) {
    const timeDelta = Math.abs(sourceTimestamp.getTime() - targetTimestamp.getTime());
    if (timeDelta < 1000) return "critical"; // Within 1 second
    if (timeDelta < 3600000) return "high"; // Within 1 hour
    return "medium";
  }

  // Duplicate conflicts are lower severity
  if (conflictType === ConflictType.DUPLICATE_CONFLICT) return "medium";

  // Schema/version conflicts
  return "low";
}

/**
 * Generate idempotency key from operation context
 * Ensures uniqueness even for consecutive calls using timestamp + random component
 */
export function generateIdempotencyKey(operationType: string, context: Record<string, unknown>): string {
  const contextStr = JSON.stringify(context);
  const hash = contextStr
    .split("")
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0)
    .toString(16)
    .substring(0, 12);

  // Use timestamp + random nonce for uniqueness without state
  const timestamp = Date.now();
  const nonce = Math.random().toString(36).substring(2, 8);

  return `${operationType}_${hash}_${timestamp}${nonce}`;
}

/**
 * Validate pre-sync conditions
 */
export function validatePreSync(
  canConnect: boolean,
  hasValidCredentials: boolean,
  schemaCompatible: boolean,
): PreSyncValidation {
  const errors: string[] = [];

  if (!canConnect) errors.push("Cannot connect to connector");
  if (!hasValidCredentials) errors.push("Invalid or missing credentials");
  if (!schemaCompatible) errors.push("Schema incompatible between source and target");

  return {
    canConnect,
    hasValidCredentials,
    schemaCompatible,
    hasRequiredFields: true,
    networkAvailable: canConnect,
    storageAvailable: true,
    validationErrors: errors,
  };
}
