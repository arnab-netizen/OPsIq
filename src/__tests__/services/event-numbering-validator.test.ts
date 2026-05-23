import { describe, it, expect, beforeEach } from "vitest";
import { EventNumberingValidator } from "@/services/event-numbering-validator";

// ============================================================================
// TEST SUITE: Event Numbering Validator
// ============================================================================

describe("EventNumberingValidator - Event Number Ordering", () => {
  beforeEach(() => {
    EventNumberingValidator.reset();
  });

  // ========== Single Event Validation ==========

  it("validates first event number (1)", () => {
    const result = EventNumberingValidator.validateEventNumber(
      "aggregate-1",
      "Decision",
      1
    );
    expect(result).toBe(true);
  });

  it("returns true for valid sequential event", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      2
    );
    expect(result).toBe(true);
  });

  it("throws when event number is not sequential", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);

    expect(() =>
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1)
    ).toThrow(/not sequential/);
  });

  it("throws when event number goes backward", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 5);

    expect(() =>
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 3)
    ).toThrow(/not sequential/);
  });

  it("allows event number gaps if monotonically increasing", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);

    // Validator only enforces monotonic increase, gaps are allowed
    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      10
    );
    expect(result).toBe(true);
  });

  it("provides detailed error message on violation", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 5);

    try {
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 5);
      expect.fail("Should have thrown");
    } catch (e: unknown) {
      expect(e.message).toContain("not sequential");
      expect(e.message).toContain("Event number 5");
      expect(e.message).toContain("Last event number was 5");
      expect(e.message).toContain("monotonically increasing");
    }
  });

  // ========== Multiple Aggregates ==========

  it("maintains separate counters for different aggregates", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-2", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);
    EventNumberingValidator.validateEventNumber("agg-2", "Decision", 2);

    expect(
      EventNumberingValidator.getLastEventNumber("agg-1", "Decision")
    ).toBe(2);
    expect(
      EventNumberingValidator.getLastEventNumber("agg-2", "Decision")
    ).toBe(2);
  });

  it("maintains separate counters for different aggregate types", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Action", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);

    expect(
      EventNumberingValidator.getLastEventNumber("agg-1", "Decision")
    ).toBe(2);
    expect(EventNumberingValidator.getLastEventNumber("agg-1", "Action")).toBe(
      1
    );
  });

  it("handles many independent aggregates", () => {
    for (let i = 0; i < 10; i++) {
      EventNumberingValidator.validateEventNumber(`agg-${i}`, "Decision", 1);
    }

    for (let i = 0; i < 10; i++) {
      const lastNum = EventNumberingValidator.getLastEventNumber(
        `agg-${i}`,
        "Decision"
      );
      expect(lastNum).toBe(1);
    }
  });

  // ========== Get Last Event Number ==========

  it("returns 0 for unknown aggregate", () => {
    const result = EventNumberingValidator.getLastEventNumber(
      "unknown",
      "Unknown"
    );
    expect(result).toBe(0);
  });

  it("returns correct last event number after single event", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    const result = EventNumberingValidator.getLastEventNumber(
      "agg-1",
      "Decision"
    );
    expect(result).toBe(1);
  });

  it("returns correct last event number after multiple events", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 3);

    const result = EventNumberingValidator.getLastEventNumber(
      "agg-1",
      "Decision"
    );
    expect(result).toBe(3);
  });

  // ========== Sequence Validation ==========

  it("validates empty event sequence", () => {
    const result = EventNumberingValidator.validateSequence([]);
    expect(result).toBe(true);
  });

  it("validates single-event sequence", () => {
    const events = [
      {
        aggregateId: "agg-1",
        aggregateType: "Decision",
        eventNumber: 1,
      },
    ];

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  it("validates valid multi-event sequence for single aggregate", () => {
    const events = [
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 3 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 4 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 5 },
    ];

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  it("validates multiple aggregates with proper ordering", () => {
    const events = [
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-2", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "agg-2", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 3 },
    ];

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  it("throws when sequence has out-of-order events for same aggregate", () => {
    const events = [
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 3 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 },
    ];

    expect(() => EventNumberingValidator.validateSequence(events)).toThrow(
      /Sequence violation/
    );
  });

  it("throws when sequence has duplicate event numbers", () => {
    const events = [
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 },
    ];

    expect(() => EventNumberingValidator.validateSequence(events)).toThrow(
      /Sequence violation/
    );
  });

  it("provides detailed error on sequence violation", () => {
    const events = [
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 3 },
      { aggregateId: "agg-1", aggregateType: "Decision", eventNumber: 2 }, // Violates monotonic order
    ];

    try {
      EventNumberingValidator.validateSequence(events);
      expect.fail("Should have thrown");
    } catch (e: unknown) {
      expect(e.message).toContain("Sequence violation");
      expect(e.message).toContain("Decision:agg-1");
      expect(e.message).toContain("strictly increasing");
    }
  });

  it("validates sequence with multiple aggregates and types", () => {
    const events = [
      { aggregateId: "d1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "a1", aggregateType: "Action", eventNumber: 1 },
      { aggregateId: "d1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "a1", aggregateType: "Action", eventNumber: 2 },
      { aggregateId: "d1", aggregateType: "Decision", eventNumber: 3 },
      { aggregateId: "a1", aggregateType: "Action", eventNumber: 3 },
    ];

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  // ========== Large Sequences ==========

  it("validates large event sequence (100 events)", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      aggregateId: "agg-1",
      aggregateType: "Decision",
      eventNumber: i + 1,
    }));

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  it("validates batch with 10 aggregates of 10 events each", () => {
    const events = [];
    for (let a = 0; a < 10; a++) {
      for (let e = 1; e <= 10; e++) {
        events.push({
          aggregateId: `agg-${a}`,
          aggregateType: "Decision",
          eventNumber: e,
        });
      }
    }

    const result = EventNumberingValidator.validateSequence(events);
    expect(result).toBe(true);
  });

  it("detects out-of-order in large sequence", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      aggregateId: "agg-1",
      aggregateType: "Decision",
      eventNumber: i + 1,
    }));

    // Swap positions 50 and 51
    [events[50], events[51]] = [events[51], events[50]];

    expect(() => EventNumberingValidator.validateSequence(events)).toThrow(
      /Sequence violation/
    );
  });

  // ========== Reset Functionality ==========

  it("clears all counters on reset", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-2", "Decision", 1);

    EventNumberingValidator.reset();

    // After reset, can start from 1 again
    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      1
    );
    expect(result).toBe(true);
  });

  it("allows reuse of aggregate IDs after reset", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);

    EventNumberingValidator.reset();

    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      1
    );
    expect(result).toBe(true);
  });

  it("returns 0 for all aggregates after reset", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 5);
    EventNumberingValidator.validateEventNumber("agg-2", "Action", 10);

    EventNumberingValidator.reset();

    expect(
      EventNumberingValidator.getLastEventNumber("agg-1", "Decision")
    ).toBe(0);
    expect(EventNumberingValidator.getLastEventNumber("agg-2", "Action")).toBe(
      0
    );
  });

  // ========== Real-World Scenarios ==========

  it("validates decision event lifecycle", () => {
    const decisionId = "dec-123";
    const events = [
      { decisionId, eventNumber: 1, type: "created" },
      { decisionId, eventNumber: 2, type: "approved" },
      { decisionId, eventNumber: 3, type: "communicated" },
      { decisionId, eventNumber: 4, type: "implemented" },
      { decisionId, eventNumber: 5, type: "reviewed" },
    ];

    for (const event of events) {
      EventNumberingValidator.validateEventNumber(
        event.decisionId,
        "Decision",
        event.eventNumber
      );
    }

    expect(
      EventNumberingValidator.getLastEventNumber(decisionId, "Decision")
    ).toBe(5);
  });

  it("validates action event sequence", () => {
    const actionId = "act-456";
    const steps = ["created", "started", "progressed", "completed"];

    for (let i = 0; i < steps.length; i++) {
      EventNumberingValidator.validateEventNumber(
        actionId,
        "Action",
        i + 1
      );
    }

    expect(EventNumberingValidator.getLastEventNumber(actionId, "Action")).toBe(
      4
    );
  });

  it("validates concurrent aggregate event processing", () => {
    const decisionEvents = [
      { id: "dec-1", eventNumber: 1 },
      { id: "dec-2", eventNumber: 1 },
      { id: "dec-1", eventNumber: 2 },
      { id: "dec-3", eventNumber: 1 },
      { id: "dec-2", eventNumber: 2 },
      { id: "dec-1", eventNumber: 3 },
    ];

    for (const event of decisionEvents) {
      EventNumberingValidator.validateEventNumber(
        event.id,
        "Decision",
        event.eventNumber
      );
    }

    expect(
      EventNumberingValidator.getLastEventNumber("dec-1", "Decision")
    ).toBe(3);
    expect(
      EventNumberingValidator.getLastEventNumber("dec-2", "Decision")
    ).toBe(2);
    expect(
      EventNumberingValidator.getLastEventNumber("dec-3", "Decision")
    ).toBe(1);
  });

  // ========== Edge Cases ==========

  it("handles event number 0 as invalid (must start from 1)", () => {
    expect(() =>
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 0)
    ).toThrow(/not sequential/);
  });

  it("handles negative event numbers", () => {
    expect(() =>
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", -1)
    ).toThrow(/not sequential/);
  });

  it("handles very large event numbers", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1000000);
    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      1000001
    );
    expect(result).toBe(true);
  });

  it("handles aggregate IDs with special characters", () => {
    const specialIds = [
      "agg:with:colons",
      "agg-with-dashes",
      "agg_with_underscores",
      "agg.with.dots",
    ];

    for (const id of specialIds) {
      const result = EventNumberingValidator.validateEventNumber(
        id,
        "Decision",
        1
      );
      expect(result).toBe(true);
    }
  });

  it("handles aggregate type names with special characters", () => {
    const types = [
      "Decision:Variant",
      "Action-Type",
      "Event_Stream",
      "Aggregate.Type",
    ];

    for (const type of types) {
      const result = EventNumberingValidator.validateEventNumber(
        "agg-1",
        type,
        1
      );
      expect(result).toBe(true);
    }
  });

  it("handles very long aggregate IDs", () => {
    const longId = "agg-" + "a".repeat(1000);
    const result = EventNumberingValidator.validateEventNumber(
      longId,
      "Decision",
      1
    );
    expect(result).toBe(true);
  });

  // ========== Consistency & Determinism ==========

  it("produces consistent ordering checks", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);

    // Multiple calls should return same last number
    const result1 = EventNumberingValidator.getLastEventNumber(
      "agg-1",
      "Decision"
    );
    const result2 = EventNumberingValidator.getLastEventNumber(
      "agg-1",
      "Decision"
    );

    expect(result1).toBe(result2);
    expect(result1).toBe(1);
  });

  it("maintains state consistency after mixed operations", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-2", "Decision", 1);
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 2);

    expect(
      EventNumberingValidator.getLastEventNumber("agg-1", "Decision")
    ).toBe(2);
    expect(
      EventNumberingValidator.getLastEventNumber("agg-2", "Decision")
    ).toBe(1);

    EventNumberingValidator.validateEventNumber("agg-2", "Decision", 2);

    expect(
      EventNumberingValidator.getLastEventNumber("agg-2", "Decision")
    ).toBe(2);
  });

  // ========== Error Recovery ==========

  it("requires explicit reset to recover from violation error", () => {
    EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);

    // Trigger error
    try {
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1);
    } catch {
      // Expected
    }

    // Without reset, still at event 1
    expect(() =>
      EventNumberingValidator.validateEventNumber("agg-1", "Decision", 1)
    ).toThrow();

    // After reset, can start over
    EventNumberingValidator.reset();
    const result = EventNumberingValidator.validateEventNumber(
      "agg-1",
      "Decision",
      1
    );
    expect(result).toBe(true);
  });

  // ========== Aggregate Key Composition ==========

  it("uses correct key format for aggregate identification", () => {
    EventNumberingValidator.validateEventNumber("id-123", "Decision", 1);
    EventNumberingValidator.validateEventNumber("id-123", "Action", 1);

    // Same aggregateId but different type should be independent
    expect(
      EventNumberingValidator.getLastEventNumber("id-123", "Decision")
    ).toBe(1);
    expect(EventNumberingValidator.getLastEventNumber("id-123", "Action")).toBe(
      1
    );

    // Can increment independently
    EventNumberingValidator.validateEventNumber("id-123", "Decision", 2);
    expect(
      EventNumberingValidator.getLastEventNumber("id-123", "Decision")
    ).toBe(2);
    expect(EventNumberingValidator.getLastEventNumber("id-123", "Action")).toBe(
      1
    );
  });

  // ========== Batch Processing ==========

  it("validates batch events maintain ordering per aggregate", () => {
    const batchEvents = [
      { aggregateId: "batch-1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "batch-2", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "batch-3", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "batch-1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "batch-2", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "batch-1", aggregateType: "Decision", eventNumber: 3 },
    ];

    const result = EventNumberingValidator.validateSequence(batchEvents);
    expect(result).toBe(true);
  });

  it("rejects batch with single violation", () => {
    const batchEvents = [
      { aggregateId: "b1", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "b1", aggregateType: "Decision", eventNumber: 2 },
      { aggregateId: "b2", aggregateType: "Decision", eventNumber: 1 },
      { aggregateId: "b1", aggregateType: "Decision", eventNumber: 2 }, // Violation
    ];

    expect(() => EventNumberingValidator.validateSequence(batchEvents)).toThrow(
      /Sequence violation/
    );
  });
});
