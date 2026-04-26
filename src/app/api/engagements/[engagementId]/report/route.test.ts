import { describe, it, expect } from "vitest";

describe("GET /api/engagements/[engagementId]/report", () => {
  it("route exports GET handler", async () => {
    const module = await import("./route");
    expect(module.GET).toBeDefined();
  });

  it("GET handler is a function", async () => {
    const module = await import("./route");
    expect(typeof module.GET).toBe("function");
  });
});
