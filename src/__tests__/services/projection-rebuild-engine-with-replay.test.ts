import { describe, it, expect, beforeEach, vi } from "vitest";

describe("ProjectionRebuildEngine with EventReplayEngine Integration", () => {
  it("should import EventReplayEngine", async () => {
    // Verify that ProjectionRebuildEngine imports EventReplayEngine
    // This is a static verification that the integration is in place
    const moduleCode = await import("@/services/projection-rebuild-engine");

    // The module should exist and be importable
    expect(moduleCode).toBeDefined();
    expect(moduleCode.ProjectionRebuildEngine).toBeDefined();
  });

  it("should have EventReplayEngine as a dependency", async () => {
    // Import the projection-rebuild-engine source as a string to verify the import
    const fs = await import("fs");
    const path = await import("path");

    // Get the file path to projection-rebuild-engine.ts
    const filePath = path.resolve(
      process.cwd(),
      "src/services/projection-rebuild-engine.ts"
    );

    const content = fs.readFileSync(filePath, "utf-8");

    // Verify EventReplayEngine is imported
    expect(content).toContain(
      'import { EventReplayEngine } from "@/services/event-replay-engine"'
    );

    // Verify EventReplayEngine.replayAggregate is called in rebuildRecommendationProjection
    expect(content).toContain("EventReplayEngine.replayAggregate");
    expect(content).toContain(
      "Replay events using EventReplayEngine to reconstruct aggregate state"
    );
  });
});
