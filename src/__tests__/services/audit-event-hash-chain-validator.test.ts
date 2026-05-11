import { describe, it, expect } from "vitest";
import { AuditEventHashChainValidator } from "@/services/audit-event-hash-chain-validator";
import crypto from "crypto";

// ============================================================================
// TEST SUITE: Audit Event Hash Chain Validator
// ============================================================================

type AuditEvent = {
  id: string;
  previousHash: string | null;
  hash: string;
  eventType: string;
  payload: Record<string, unknown>;
  recordedAt: Date;
};

describe("AuditEventHashChainValidator - Hash Chain Integrity", () => {
  // ========== Hash Computation ==========

  it("computes deterministic SHA256 hash for event data", () => {
    const payload = { action: "create", userId: "user-123" };
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      recordedAt
    );

    const hash2 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      recordedAt
    );

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe("string");
    expect(hash1.length).toBe(64); // SHA256 hex is 64 chars
  });

  it("produces different hashes for different payloads", () => {
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      { action: "create" },
      recordedAt
    );

    const hash2 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      { action: "update" },
      recordedAt
    );

    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes for different event types", () => {
    const payload = { action: "create" };
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      recordedAt
    );

    const hash2 = AuditEventHashChainValidator.computeHash(
      null,
      "action.created",
      payload,
      recordedAt
    );

    expect(hash1).not.toBe(hash2);
  });

  it("includes previousHash in computation", () => {
    const payload = { action: "create" };
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      recordedAt
    );

    const hash2 = AuditEventHashChainValidator.computeHash(
      hash1,
      "decision.created",
      payload,
      recordedAt
    );

    expect(hash1).not.toBe(hash2);
  });

  it("produces different hashes for different timestamps", () => {
    const payload = { action: "create" };

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      new Date("2026-05-11T10:30:00Z")
    );

    const hash2 = AuditEventHashChainValidator.computeHash(
      null,
      "decision.created",
      payload,
      new Date("2026-05-11T10:30:01Z")
    );

    expect(hash1).not.toBe(hash2);
  });

  // ========== Single Event Validation ==========

  it("validates single event hash successfully", () => {
    const event = {
      previousHash: null,
      hash: "test-hash",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    // Compute correct hash
    const correctHash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const validEvent = { ...event, hash: correctHash };
    expect(() =>
      AuditEventHashChainValidator.validateEventHash(validEvent)
    ).not.toThrow();
  });

  it("throws on single event hash mismatch", () => {
    const event = {
      previousHash: null,
      hash: "invalid-hash",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    expect(() =>
      AuditEventHashChainValidator.validateEventHash(event)
    ).toThrow(/Hash validation failed/);
  });

  it("returns true on valid single event validation", () => {
    const event = {
      previousHash: null,
      hash: "",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateEventHash(event);
    expect(result).toBe(true);
  });

  // ========== Empty Chain ==========

  it("validates empty event chain as valid", () => {
    const result = AuditEventHashChainValidator.validateChain([]);
    expect(result).toBe(true);
  });

  // ========== Single Event Chain ==========

  it("validates first event in chain with null previousHash", () => {
    const event = {
      id: "event-1",
      previousHash: null,
      hash: "",
      eventType: "decision.created",
      payload: { action: "create", id: "dec-123" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("throws when first event has non-null previousHash", () => {
    const event = {
      id: "event-1",
      previousHash: "some-hash",
      hash: "event-hash",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    expect(() => AuditEventHashChainValidator.validateChain([event])).toThrow(
      /First event.*must have null previousHash/
    );
  });

  // ========== Valid Chain Validation ==========

  it("validates two-event chain with correct linking", () => {
    const event1: {
      id: string;
      previousHash: string | null;
      hash: string;
      eventType: string;
      payload: Record<string, unknown>;
      recordedAt: Date;
    } = {
      id: "event-1",
      previousHash: null,
      hash: "",
      eventType: "decision.created",
      payload: { action: "create", id: "dec-123" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event1.hash = AuditEventHashChainValidator.computeHash(
      event1.previousHash,
      event1.eventType,
      event1.payload,
      event1.recordedAt
    );

    const event2: {
      id: string;
      previousHash: string | null;
      hash: string;
      eventType: string;
      payload: Record<string, unknown>;
      recordedAt: Date;
    } = {
      id: "event-2",
      previousHash: event1.hash,
      hash: "",
      eventType: "decision.approved",
      payload: { action: "approve", id: "dec-123" },
      recordedAt: new Date("2026-05-11T10:31:00Z"),
    };

    event2.hash = AuditEventHashChainValidator.computeHash(
      event2.previousHash,
      event2.eventType,
      event2.payload,
      event2.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event1, event2]);
    expect(result).toBe(true);
  });

  it("validates multi-event chain with correct chain integrity", () => {
    const events: AuditEvent[] = [];

    for (let i = 0; i < 5; i++) {
      const event: AuditEvent = {
        id: `event-${i + 1}`,
        previousHash: events.length > 0 ? events[events.length - 1].hash : null,
        hash: "",
        eventType: ["decision.created", "decision.approved", "action.created", "action.executed", "action.completed"][i],
        payload: { index: i, action: ["create", "approve", "create", "execute", "complete"][i] },
        recordedAt: new Date(new Date("2026-05-11T10:30:00Z").getTime() + i * 60000),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      events.push(event);
    }

    const result = AuditEventHashChainValidator.validateChain(events);
    expect(result).toBe(true);
  });

  // ========== Chain Integrity Violations ==========

  it("throws when chain is broken (missing link)", () => {
    const event1: AuditEvent = {
      id: "event-1",
      previousHash: null,
      hash: "",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event1.hash = AuditEventHashChainValidator.computeHash(
      event1.previousHash,
      event1.eventType,
      event1.payload,
      event1.recordedAt
    );

    const event2: AuditEvent = {
      id: "event-2",
      previousHash: "wrong-hash",
      hash: "",
      eventType: "decision.approved",
      payload: { action: "approve" },
      recordedAt: new Date("2026-05-11T10:31:00Z"),
    };

    event2.hash = AuditEventHashChainValidator.computeHash(
      event2.previousHash,
      event2.eventType,
      event2.payload,
      event2.recordedAt
    );

    expect(() => AuditEventHashChainValidator.validateChain([event1, event2])).toThrow(
      /Chain broken/
    );
  });

  it("throws when event hash is corrupted", () => {
    const event1 = {
      id: "event-1",
      previousHash: null,
      hash: "",
      eventType: "decision.created",
      payload: { action: "create" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event1.hash = AuditEventHashChainValidator.computeHash(
      event1.previousHash,
      event1.eventType,
      event1.payload,
      event1.recordedAt
    );

    const event2 = {
      id: "event-2",
      previousHash: event1.hash,
      hash: "corrupted-hash",
      eventType: "decision.approved",
      payload: { action: "approve" },
      recordedAt: new Date("2026-05-11T10:31:00Z"),
    };

    expect(() => AuditEventHashChainValidator.validateChain([event1, event2])).toThrow(
      /Hash mismatch/
    );
  });

  it("detects which event is corrupted in chain", () => {
    const events: AuditEvent[] = [];

    for (let i = 0; i < 3; i++) {
      const event: AuditEvent = {
        id: `event-${i + 1}`,
        previousHash: events.length > 0 ? events[events.length - 1].hash : null,
        hash: "",
        eventType: "decision.created",
        payload: { index: i },
        recordedAt: new Date(new Date("2026-05-11T10:30:00Z").getTime() + i * 60000),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      events.push(event);
    }

    // Corrupt second event's hash
    events[1].hash = "corrupted";

    expect(() => AuditEventHashChainValidator.validateChain(events)).toThrow(
      /event-2/
    );
  });

  // ========== Payload Handling ==========

  it("handles complex nested payloads", () => {
    const complexPayload = {
      user: { id: "user-123", name: "John Doe", email: "john@example.com" },
      decision: { id: "dec-456", title: "Launch product", confidence: 0.92 },
      metadata: { source: "api", timestamp: "2026-05-11T10:30:00Z", tags: ["urgent", "critical"] },
      nested: { deep: { data: { value: 42 } } },
    };

    const event = {
      id: "event-complex",
      previousHash: null,
      hash: "",
      eventType: "complex.event",
      payload: complexPayload,
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("detects changes in nested payload values", () => {
    const recordedAt = new Date("2026-05-11T10:30:00Z");
    const basePayload = { user: { id: "user-123", role: "admin" } };

    const hash1 = AuditEventHashChainValidator.computeHash(
      null,
      "user.updated",
      basePayload,
      recordedAt
    );

    const modifiedPayload = { user: { id: "user-123", role: "viewer" } };
    const hash2 = AuditEventHashChainValidator.computeHash(
      null,
      "user.updated",
      modifiedPayload,
      recordedAt
    );

    expect(hash1).not.toBe(hash2);
  });

  it("handles payloads with special characters and unicode", () => {
    const payload = {
      message: 'Hello "World" with quotes',
      description: "Line1\nLine2",
      unicode: "Unicode: 世界 🌍 emoji: 😀👍",
    };

    const event = {
      id: "event-special",
      previousHash: null,
      hash: "",
      eventType: "special.event",
      payload,
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  // ========== Error Messages ==========

  it("provides detailed error message for broken chain", () => {
    const event1 = {
      id: "event-1",
      previousHash: null,
      hash: "",
      eventType: "created",
      payload: {},
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event1.hash = AuditEventHashChainValidator.computeHash(
      event1.previousHash,
      event1.eventType,
      event1.payload,
      event1.recordedAt
    );

    const event2 = {
      id: "event-2",
      previousHash: "wrong-hash",
      hash: "event2-hash",
      eventType: "updated",
      payload: {},
      recordedAt: new Date("2026-05-11T10:31:00Z"),
    };

    try {
      AuditEventHashChainValidator.validateChain([event1, event2]);
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("Chain broken");
      expect(e.message).toContain("event-2");
      expect(e.message).toContain("previousHash");
    }
  });

  it("provides detailed error message for hash mismatch", () => {
    const event = {
      id: "event-1",
      previousHash: null,
      hash: "wrong-hash",
      eventType: "created",
      payload: { data: "test" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    try {
      AuditEventHashChainValidator.validateChain([event]);
      expect.fail("Should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("Hash mismatch");
      expect(e.message).toContain("event-1");
      expect(e.message).toContain("corrupted");
    }
  });

  // ========== Real-World Scenarios ==========

  it("validates decision lifecycle audit chain", () => {
    const events: AuditEvent[] = [];

    const eventTypes = [
      { type: "decision.created", action: "create", title: "Launch product" },
      { type: "decision.approved", action: "approve", approver: "manager-1" },
      { type: "decision.communicated", action: "communicate", recipients: 10 },
      { type: "decision.implemented", action: "implement", owner: "owner-1" },
    ];

    for (let i = 0; i < eventTypes.length; i++) {
      const event: AuditEvent = {
        id: `dec-event-${i + 1}`,
        previousHash: events.length > 0 ? events[events.length - 1].hash : null,
        hash: "",
        eventType: eventTypes[i].type,
        payload: { decision_id: "dec-123", ...eventTypes[i] },
        recordedAt: new Date(new Date("2026-05-11T10:00:00Z").getTime() + i * 3600000),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      events.push(event);
    }

    const result = AuditEventHashChainValidator.validateChain(events);
    expect(result).toBe(true);
  });

  it("validates action execution audit chain", () => {
    const events: AuditEvent[] = [];

    const eventSequence = [
      { type: "action.created", owner: "owner-1", task: "Review documents" },
      { type: "action.started", status: "in_progress", timestamp: "2026-05-11T10:00:00Z" },
      { type: "action.updated", progress: 50, notes: "Half done" },
      { type: "action.completed", result: "success", completedAt: "2026-05-11T15:00:00Z" },
    ];

    for (let i = 0; i < eventSequence.length; i++) {
      const event: AuditEvent = {
        id: `action-event-${i + 1}`,
        previousHash: events.length > 0 ? events[events.length - 1].hash : null,
        hash: "",
        eventType: eventSequence[i].type,
        payload: { action_id: "act-456", ...eventSequence[i] },
        recordedAt: new Date(new Date("2026-05-11T10:00:00Z").getTime() + i * 3600000),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      events.push(event);
    }

    const result = AuditEventHashChainValidator.validateChain(events);
    expect(result).toBe(true);
  });

  it("validates multi-event audit sequence with many transitions", () => {
    const events: AuditEvent[] = [];

    for (let i = 0; i < 20; i++) {
      const event: AuditEvent = {
        id: `audit-${i + 1}`,
        previousHash: events.length > 0 ? events[events.length - 1].hash : null,
        hash: "",
        eventType: `system.event_${i}`,
        payload: {
          sequence: i,
          timestamp: new Date().toISOString(),
          data: { value: i * 100, status: i % 2 === 0 ? "even" : "odd" },
        },
        recordedAt: new Date(new Date("2026-05-11T00:00:00Z").getTime() + i * 60000),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      events.push(event);
    }

    const result = AuditEventHashChainValidator.validateChain(events);
    expect(result).toBe(true);
  });

  // ========== Consistency & Determinism ==========

  it("produces consistent hashes across multiple calls", () => {
    const payload = { data: "test", nested: { value: 123 } };
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hashes = Array(5)
      .fill(null)
      .map(() =>
        AuditEventHashChainValidator.computeHash(
          null,
          "test.event",
          payload,
          recordedAt
        )
      );

    expect(hashes.every((h) => h === hashes[0])).toBe(true);
  });

  it("validates identical chains consistently", () => {
    const createChain = () => {
      const event = {
        id: "event-1",
        previousHash: null,
        hash: "",
        eventType: "test.created",
        payload: { data: "consistent" },
        recordedAt: new Date("2026-05-11T10:30:00Z"),
      };

      event.hash = AuditEventHashChainValidator.computeHash(
        event.previousHash,
        event.eventType,
        event.payload,
        event.recordedAt
      );

      return [event];
    };

    const chain1 = createChain();
    const chain2 = createChain();

    const result1 = AuditEventHashChainValidator.validateChain(chain1);
    const result2 = AuditEventHashChainValidator.validateChain(chain2);

    expect(result1).toBe(result2);
    expect(result1).toBe(true);
  });

  // ========== Edge Cases ==========

  it("handles empty payload object", () => {
    const event = {
      id: "event-empty",
      previousHash: null,
      hash: "",
      eventType: "empty.event",
      payload: {},
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("handles very long event type strings", () => {
    const longEventType = "very.long.event.type." + "a".repeat(1000);

    const event = {
      id: "event-long",
      previousHash: null,
      hash: "",
      eventType: longEventType,
      payload: { data: "test" },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("handles large payloads (10KB+)", () => {
    const largeArray = Array(1000).fill({ key: "value with data".repeat(5) });

    const event = {
      id: "event-large",
      previousHash: null,
      hash: "",
      eventType: "large.event",
      payload: { data: largeArray },
      recordedAt: new Date("2026-05-11T10:30:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("handles very old timestamps", () => {
    const event = {
      id: "event-old",
      previousHash: null,
      hash: "",
      eventType: "historical.event",
      payload: { data: "old" },
      recordedAt: new Date("2000-01-01T00:00:00Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  it("handles future timestamps", () => {
    const event = {
      id: "event-future",
      previousHash: null,
      hash: "",
      eventType: "future.event",
      payload: { data: "future" },
      recordedAt: new Date("2099-12-31T23:59:59Z"),
    };

    event.hash = AuditEventHashChainValidator.computeHash(
      event.previousHash,
      event.eventType,
      event.payload,
      event.recordedAt
    );

    const result = AuditEventHashChainValidator.validateChain([event]);
    expect(result).toBe(true);
  });

  // ========== Hash Collision Resistance ==========

  it("ensures different inputs produce different hashes", () => {
    const basePayload = { id: "id-1", status: "active" };
    const recordedAt = new Date("2026-05-11T10:30:00Z");

    const hashes = [
      AuditEventHashChainValidator.computeHash(null, "event.type.1", basePayload, recordedAt),
      AuditEventHashChainValidator.computeHash(null, "event.type.2", basePayload, recordedAt),
      AuditEventHashChainValidator.computeHash(null, "event.type.1", { ...basePayload, id: "id-2" }, recordedAt),
      AuditEventHashChainValidator.computeHash("hash-1", "event.type.1", basePayload, recordedAt),
      AuditEventHashChainValidator.computeHash(null, "event.type.1", basePayload, new Date("2026-05-11T10:31:00Z")),
    ];

    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(5);
  });
});
