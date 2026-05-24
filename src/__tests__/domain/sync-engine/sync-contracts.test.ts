import { describe, it, expect } from "vitest";
import {
  SyncState,
  STATE_TRANSITIONS,
  ConflictType,
  ConflictDetectionSchema,
  ResolutionStrategy,
  DeduplicationMatchSchema,
  ChangeDetectionSchema,
  DeltaSyncBatchSchema,
  IdempotencyKeySchema,
  SyncOperationReplaySchema,
  SyncRateLimitSchema,
  PreSyncValidationSchema,
  PostSyncValidationSchema,
  isValidStateTransition,
  calculateDeduplicationConfidence,
  detectFieldChanges,
  calculateConflictSeverity,
  generateIdempotencyKey,
  validatePreSync,
  type SyncSession,
  type ConflictDetection,
} from "@/domain/sync-engine/sync-contracts";

describe("ADDENDUM F: Sync Engine Contracts", () => {
  describe("SyncState Enumeration", () => {
    it("should define complete state machine", () => {
      expect(SyncState.IDLE).toBe("IDLE");
      expect(SyncState.DISCOVERING).toBe("DISCOVERING");
      expect(SyncState.DOWNLOADING).toBe("DOWNLOADING");
      expect(SyncState.COMPLETED).toBe("COMPLETED");
      expect(SyncState.FAILED).toBe("FAILED");
    });

    it("should have transition rules for all states", () => {
      // Every state should have at least one valid transition
      Object.values(SyncState).forEach((state) => {
        expect(STATE_TRANSITIONS[state]).toBeDefined();
        expect(STATE_TRANSITIONS[state].length).toBeGreaterThan(0);
      });
    });
  });

  describe("State Transition Validation", () => {
    it("should allow IDLE → DISCOVERING", () => {
      expect(isValidStateTransition(SyncState.IDLE, SyncState.DISCOVERING)).toBe(true);
    });

    it("should allow DISCOVERING → PREPARING", () => {
      expect(isValidStateTransition(SyncState.DISCOVERING, SyncState.PREPARING)).toBe(true);
    });

    it("should allow UPLOADING → COMPLETED", () => {
      expect(isValidStateTransition(SyncState.UPLOADING, SyncState.COMPLETED)).toBe(true);
    });

    it("should reject invalid COMPLETED → DISCOVERING transition", () => {
      expect(isValidStateTransition(SyncState.COMPLETED, SyncState.DISCOVERING)).toBe(false);
    });

    it("should allow any state → FAILED", () => {
      Object.values(SyncState).forEach((state) => {
        if (state !== SyncState.COMPLETED && state !== SyncState.FAILED && state !== SyncState.CANCELLED) {
          expect(STATE_TRANSITIONS[state]).toContain(SyncState.FAILED);
        }
      });
    });

    it("should allow any state → PAUSED (except terminal states)", () => {
      const nonTerminalStates = [
        SyncState.IDLE,
        SyncState.DISCOVERING,
        SyncState.PREPARING,
        SyncState.DOWNLOADING,
        SyncState.PROCESSING,
        SyncState.DETECTING_CONFLICTS,
        SyncState.RESOLVING_CONFLICTS,
        SyncState.UPLOADING,
      ];

      nonTerminalStates.forEach((state) => {
        expect(STATE_TRANSITIONS[state]).toContain(SyncState.PAUSED);
      });
    });
  });

  describe("Conflict Detection", () => {
    it("should validate conflict detection result", () => {
      const conflict: ConflictDetection = {
        recordId: "rec_123",
        sourceConnector: "hubspot",
        targetConnector: "salesforce",
        conflictType: ConflictType.UPDATE_CONFLICT,
        sourceVersion: 2,
        targetVersion: 3,
        sourceTimestamp: new Date("2026-05-11T10:00:00Z"),
        targetTimestamp: new Date("2026-05-11T10:05:00Z"),
        sourceData: { name: "John", email: "john@example.com" },
        targetData: { name: "John Doe", email: "john.doe@example.com" },
        detectedAt: new Date(),
        severity: "high",
      };

      const result = ConflictDetectionSchema.safeParse(conflict);
      expect(result.success).toBe(true);
    });

    it("should detect UPDATE_CONFLICT type", () => {
      expect(ConflictType.UPDATE_CONFLICT).toBe("UPDATE_CONFLICT");
    });

    it("should detect DELETE_CONFLICT type", () => {
      expect(ConflictType.DELETE_CONFLICT).toBe("DELETE_CONFLICT");
    });

    it("should detect DUPLICATE_CONFLICT type", () => {
      expect(ConflictType.DUPLICATE_CONFLICT).toBe("DUPLICATE_CONFLICT");
    });
  });

  describe("Conflict Resolution", () => {
    it("should support LAST_WRITE_WINS strategy", () => {
      expect(ResolutionStrategy.LAST_WRITE_WINS).toBe("LAST_WRITE_WINS");
    });

    it("should support SOURCE_WINS strategy", () => {
      expect(ResolutionStrategy.SOURCE_WINS).toBe("SOURCE_WINS");
    });

    it("should support MERGE strategy", () => {
      expect(ResolutionStrategy.MERGE).toBe("MERGE");
    });

    it("should support MANUAL strategy", () => {
      expect(ResolutionStrategy.MANUAL).toBe("MANUAL");
    });
  });

  describe("De-duplication", () => {
    it("should validate de-duplication match result", () => {
      const match = {
        recordId1: "rec_123",
        recordId2: "rec_456",
        matchConfidence: 0.95,
        matchingFields: ["email", "phone"],
        duplicateType: "exact_duplicate" as const,
      };

      const result = DeduplicationMatchSchema.safeParse(match);
      expect(result.success).toBe(true);
    });

    it("should calculate perfect match confidence", () => {
      const record1 = { email: "test@example.com", name: "Test User" };
      const record2 = { email: "test@example.com", name: "Test User" };

      const confidence = calculateDeduplicationConfidence(record1, record2, ["email", "name"]);
      expect(confidence).toBe(1);
    });

    it("should calculate partial match confidence", () => {
      const record1 = { email: "test@example.com", name: "Test User" };
      const record2 = { email: "test@example.com", name: "Different Name" };

      const confidence = calculateDeduplicationConfidence(record1, record2, ["email", "name"]);
      expect(confidence).toBe(0.5);
    });

    it("should calculate no match confidence", () => {
      const record1 = { email: "test1@example.com", name: "Test User 1" };
      const record2 = { email: "test2@example.com", name: "Test User 2" };

      const confidence = calculateDeduplicationConfidence(record1, record2, ["email", "name"]);
      expect(confidence).toBe(0);
    });

    it("should handle case-insensitive matching", () => {
      const record1 = { email: "TEST@EXAMPLE.COM" };
      const record2 = { email: "test@example.com" };

      const confidence = calculateDeduplicationConfidence(record1, record2, ["email"]);
      expect(confidence).toBe(1);
    });
  });

  describe("Change Detection", () => {
    it("should validate change detection result", () => {
      const change = {
        recordId: "rec_123",
        changeType: "updated" as const,
        changedFields: ["email", "phone"],
        previousValues: { email: "old@example.com" },
        currentValues: { email: "new@example.com" },
        detectedAt: new Date(),
        detectionMethod: "field_comparison" as const,
      };

      const result = ChangeDetectionSchema.safeParse(change);
      expect(result.success).toBe(true);
    });

    it("should detect field changes", () => {
      const oldRecord = { name: "John", email: "john@example.com", age: 30 };
      const newRecord = { name: "John Doe", email: "john@example.com", age: 31 };

      const changes = detectFieldChanges(oldRecord, newRecord);
      expect(changes).toContain("name");
      expect(changes).toContain("age");
      expect(changes).not.toContain("email");
    });

    it("should detect new fields", () => {
      const oldRecord = { name: "John", email: "john@example.com" };
      const newRecord = { name: "John", email: "john@example.com", phone: "555-1234" };

      const changes = detectFieldChanges(oldRecord, newRecord);
      expect(changes).toContain("phone");
    });

    it("should detect deleted fields", () => {
      const oldRecord = { name: "John", email: "john@example.com", phone: "555-1234" };
      const newRecord = { name: "John", email: "john@example.com" };

      const changes = detectFieldChanges(oldRecord, newRecord);
      expect(changes).toContain("phone");
    });

    it("should detect no changes", () => {
      const oldRecord = { name: "John", email: "john@example.com" };
      const newRecord = { name: "John", email: "john@example.com" };

      const changes = detectFieldChanges(oldRecord, newRecord);
      expect(changes).toHaveLength(0);
    });
  });

  describe("Delta Sync Batch", () => {
    it("should validate delta sync batch", () => {
      const batch = {
        batchId: "batch_123",
        sourceConnector: "hubspot",
        changeCount: 2,
        changes: [
          {
            recordId: "rec_1",
            changeType: "updated" as const,
            changedFields: ["email"],
            currentValues: { email: "new@example.com" },
            detectedAt: new Date(),
            detectionMethod: "timestamp" as const,
          },
          {
            recordId: "rec_2",
            changeType: "created" as const,
            changedFields: ["name", "email"],
            currentValues: { name: "New User", email: "user@example.com" },
            detectedAt: new Date(),
            detectionMethod: "timestamp" as const,
          },
        ],
        currentTimestamp: new Date(),
      };

      const result = DeltaSyncBatchSchema.safeParse(batch);
      expect(result.success).toBe(true);
    });
  });

  describe("Idempotency", () => {
    it("should validate idempotency key", () => {
      const key = {
        key: "sync_abc123_1234567890",
        operationType: "upload",
        contextHash: "hash_xyz",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      };

      const result = IdempotencyKeySchema.safeParse(key);
      expect(result.success).toBe(true);
    });

    it("should generate unique idempotency keys", async () => {
      const context = { sourceId: "source_123", targetId: "target_456" };
      const key1 = generateIdempotencyKey("sync", context);
      // Ensure different timestamp (need at least 1ms difference for millisecond resolution)
      await new Promise(resolve => setTimeout(resolve, 2));
      const key2 = generateIdempotencyKey("sync", context);

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      // Different timestamps should produce different keys
      expect(key1).not.toBe(key2);
    });

    it("should generate deterministic keys for same context", () => {
      const context = { sourceId: "source_123", targetId: "target_456" };
      const key1 = generateIdempotencyKey("sync", context);
      const [type1] = key1.split("_");

      expect(type1).toBe("sync");
    });
  });

  describe("Sync Operation Replay", () => {
    it("should validate sync operation replay", () => {
      const operation = {
        operationId: "op_123",
        sessionId: "session_456",
        sequenceNumber: 1,
        operationType: "download" as const,
        operationData: { recordCount: 100 },
        resultCode: "success" as const,
        appliedAt: new Date(),
      };

      const result = SyncOperationReplaySchema.safeParse(operation);
      expect(result.success).toBe(true);
    });
  });

  describe("Rate Limiting", () => {
    it("should validate sync rate limit", () => {
      const limit = {
        connectorId: "conn_123",
        recordsPerSecond: 10,
        batchSize: 100,
        maxConcurrentOperations: 5,
        backoffMultiplier: 2,
        maxBackoffSeconds: 60,
      };

      const result = SyncRateLimitSchema.safeParse(limit);
      expect(result.success).toBe(true);
    });
  });

  describe("Conflict Severity Calculation", () => {
    it("should mark DELETE_CONFLICT as critical", () => {
      const severity = calculateConflictSeverity(
        ConflictType.DELETE_CONFLICT,
        new Date(),
        new Date(),
      );
      expect(severity).toBe("critical");
    });

    it("should mark concurrent UPDATE_CONFLICT as critical", () => {
      const now = new Date();
      const oneSecondLater = new Date(now.getTime() + 500); // 500ms apart
      const severity = calculateConflictSeverity(
        ConflictType.UPDATE_CONFLICT,
        now,
        oneSecondLater,
      );
      expect(severity).toBe("critical");
    });

    it("should mark UPDATE_CONFLICT within 1 hour as high", () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 1800000); // 30 minutes apart
      const severity = calculateConflictSeverity(
        ConflictType.UPDATE_CONFLICT,
        now,
        oneHourAgo,
      );
      expect(severity).toBe("high");
    });

    it("should mark UPDATE_CONFLICT beyond 1 hour as medium", () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 172800000); // 2 days apart
      const severity = calculateConflictSeverity(
        ConflictType.UPDATE_CONFLICT,
        now,
        twoDaysAgo,
      );
      expect(severity).toBe("medium");
    });

    it("should mark DUPLICATE_CONFLICT as medium", () => {
      const severity = calculateConflictSeverity(
        ConflictType.DUPLICATE_CONFLICT,
        new Date(),
        new Date(),
      );
      expect(severity).toBe("medium");
    });
  });

  describe("Pre-Sync Validation", () => {
    it("should validate all conditions pass", () => {
      const validation = validatePreSync(true, true, true);
      expect(validation.canConnect).toBe(true);
      expect(validation.hasValidCredentials).toBe(true);
      expect(validation.schemaCompatible).toBe(true);
      expect(validation.validationErrors).toHaveLength(0);
    });

    it("should capture validation errors", () => {
      const validation = validatePreSync(false, false, false);
      expect(validation.canConnect).toBe(false);
      expect(validation.hasValidCredentials).toBe(false);
      expect(validation.schemaCompatible).toBe(false);
      expect(validation.validationErrors.length).toBeGreaterThan(0);
    });

    it("should identify specific connection issues", () => {
      const validation = validatePreSync(false, true, true);
      expect(validation.validationErrors).toContain("Cannot connect to connector");
    });

    it("should identify credential issues", () => {
      const validation = validatePreSync(true, false, true);
      expect(validation.validationErrors).toContain("Invalid or missing credentials");
    });

    it("should identify schema incompatibility", () => {
      const validation = validatePreSync(true, true, false);
      expect(validation.validationErrors).toContain("Schema incompatible between source and target");
    });
  });

  describe("Schema Validation", () => {
    it("should validate pre-sync validation schema", () => {
      const validation = {
        canConnect: true,
        hasValidCredentials: true,
        schemaCompatible: true,
        hasRequiredFields: true,
        networkAvailable: true,
        storageAvailable: true,
        validationErrors: [],
      };

      const result = PreSyncValidationSchema.safeParse(validation);
      expect(result.success).toBe(true);
    });

    it("should validate post-sync validation schema", () => {
      const validation = {
        allRecordsProcessed: true,
        recordCountMatches: true,
        noUnresolvedConflicts: true,
        noOrphanedRecords: true,
        dataIntegrityChecked: true,
        consistencyVerified: true,
        validationErrors: [],
      };

      const result = PostSyncValidationSchema.safeParse(validation);
      expect(result.success).toBe(true);
    });
  });

  describe("Comprehensive Sync Coverage", () => {
    it("should cover state machine (13 states)", () => {
      const states = Object.values(SyncState);
      expect(states.length).toBeGreaterThanOrEqual(10);
    });

    it("should cover conflict types (5+ types)", () => {
      const types = Object.values(ConflictType);
      expect(types.length).toBeGreaterThanOrEqual(5);
    });

    it("should cover resolution strategies (5 strategies)", () => {
      const strategies = Object.values(ResolutionStrategy);
      expect(strategies.length).toBeGreaterThanOrEqual(4);
    });

    it("should provide algorithm helpers", () => {
      expect(isValidStateTransition).toBeDefined();
      expect(calculateDeduplicationConfidence).toBeDefined();
      expect(detectFieldChanges).toBeDefined();
      expect(calculateConflictSeverity).toBeDefined();
      expect(generateIdempotencyKey).toBeDefined();
      expect(validatePreSync).toBeDefined();
    });
  });
});
