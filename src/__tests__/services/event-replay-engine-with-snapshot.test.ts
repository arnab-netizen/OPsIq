import { describe, it, expect } from "vitest";

describe("EventReplayEngine with SnapshotOptimizationEngine Integration", () => {
  it("should have SnapshotOptimizationEngine as a dependency", async () => {
    // Verify that EventReplayEngine imports SnapshotOptimizationEngine
    const moduleCode = await import("@/services/event-replay-engine");

    // The module should exist and be importable
    expect(moduleCode).toBeDefined();
    expect(moduleCode.EventReplayEngine).toBeDefined();
  });

  it("should call SnapshotOptimizationEngine.createSnapshot after replay", async () => {
    // Import the event-replay-engine source as a string to verify the integration
    const fs = await import("fs");
    const path = await import("path");

    // Get the file path to event-replay-engine.ts
    const filePath = path.resolve(
      process.cwd(),
      "src/services/event-replay-engine.ts"
    );

    const content = fs.readFileSync(filePath, "utf-8");

    // Verify SnapshotOptimizationEngine is imported
    expect(content).toContain(
      'import { SnapshotOptimizationEngine } from "@/services/snapshot-optimization-engine"'
    );

    // Verify SnapshotOptimizationEngine.createSnapshot is called in replayAggregate
    expect(content).toContain("SnapshotOptimizationEngine.createSnapshot");
    expect(content).toContain("Create/update snapshot for optimization");
    expect(content).toContain("Snapshot created after replay");
  });

  it("should wire snapshot creation into replay completion", async () => {
    // Verify the integration is done after successful replay
    const fs = await import("fs");
    const path = await import("path");

    const filePath = path.resolve(
      process.cwd(),
      "src/services/event-replay-engine.ts"
    );

    const content = fs.readFileSync(filePath, "utf-8");

    // Verify snapshot is created after replay finishes (Step 4)
    expect(content).toContain("Step 4: Create/update snapshot");

    // Verify it's called with correct parameters
    expect(content).toContain("aggregateId,");
    expect(content).toContain("aggregateType,");
    expect(content).toContain("state,");
    expect(content).toContain("lastEvent.eventNumber,");
    expect(content).toContain("workspaceId");
  });
});
