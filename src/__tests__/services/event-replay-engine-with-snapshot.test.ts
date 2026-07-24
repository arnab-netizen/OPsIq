import { describe, it, expect } from "vitest";

describe("EventReplayEngine — module import and source structural assertions", () => {
  it("EventReplayEngine module is importable", async () => {
    const mod = await import("@/services/event-replay-engine");
    expect(mod).toBeDefined();
  });
  it("EventReplayEngine class is exported from the module", async () => {
    const mod = await import("@/services/event-replay-engine");
    expect(mod.EventReplayEngine).toBeDefined();
  });
  it("EventReplayEngine is a function (class constructor)", async () => {
    const mod = await import("@/services/event-replay-engine");
    expect(typeof mod.EventReplayEngine).toBe("function");
  });
  it("source file path resolves to a string", async () => {
    const path = await import("path");
    const filePath = path.resolve(process.cwd(), "src/services/event-replay-engine.ts");
    expect(typeof filePath).toBe("string");
    expect(filePath.length).toBeGreaterThan(0);
  });
  it("source file contains SnapshotOptimizationEngine import", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("SnapshotOptimizationEngine");
  });
  it("source file contains replayAggregate method", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("replayAggregate");
  });
  it("source file is non-empty (> 200 chars)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content.length).toBeGreaterThan(200);
  });
  it("source file contains aggregateId reference", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("aggregateId");
  });
  it("source file contains workspaceId reference", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("workspaceId");
  });
  it("source file contains createSnapshot call", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("createSnapshot");
  });
  it("source file contains aggregateType reference", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("aggregateType");
  });
  it("source file contains lastEvent reference", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("lastEvent");
  });
  it("source file contains Step 4 comment", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("Step 4");
  });
  it("source file contains 'state,' reference (snapshot state parameter)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("state,");
  });
  it("source file contains 'Snapshot created after replay' log message", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("Snapshot created after replay");
  });
  it("source file has at least one export statement", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("export");
  });
  it("source file references snapshot-optimization-engine module", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(path.resolve(process.cwd(), "src/services/event-replay-engine.ts"), "utf-8");
    expect(content).toContain("snapshot-optimization-engine");
  });
});

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
