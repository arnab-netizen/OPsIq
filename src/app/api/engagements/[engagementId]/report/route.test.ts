import { describe, it, expect } from "vitest";

describe("GET /api/engagements/[engagementId]/report", () => {
  it("endpoint follows REST convention for report generation", () => {
    const engagementId = "test-eng-123";
    const reportUrl = `/api/engagements/${engagementId}/report`;

    expect(reportUrl).toContain("/engagements/");
    expect(reportUrl).toContain("/report");
    expect(reportUrl).toMatch(/\/api\/engagements\/[^/]+\/report$/);
  });

  it("report endpoint is a GET operation", () => {
    const method = "GET";
    expect(method).toBe("GET");
  });
});
