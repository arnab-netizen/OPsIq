import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../decision-latency/route";

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    operatorItem: {
      findMany: vi.fn(),
    },
  },
}));

// Mock workspace context
vi.mock("@/services/workspace/context", () => ({
  requireWorkspaceContext: vi.fn(),
}));

import { db } from "@/lib/db";
import { requireWorkspaceContext } from "@/services/workspace/context";

describe("PHASE 5: Decision Latency Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return unauthorized when workspace context missing", async () => {
    vi.mocked(requireWorkspaceContext).mockRejectedValueOnce(
      new Error("Unauthorized")
    );

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("should return empty metrics when no decisions in period", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.latency.completedCount).toBe(0);
    expect(body.latency.avgLatencyMs).toBe(0);
    expect(body.queue.pendingCount).toBe(0);
  });

  it("should calculate latency for completed decisions", async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "d1",
        status: "done",
        createdAt: oneHourAgo,
        completedAt: now,
        startedAt: new Date(oneHourAgo.getTime() + 60000),
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.latency.completedCount).toBe(1);
    expect(body.latency.avgLatencyMs).toBe(3600000);
    expect(body.latency.minLatencyMs).toBe(3600000);
    expect(body.latency.maxLatencyMs).toBe(3600000);
    expect(body.statusBreakdown.completed).toBe(1);
  });

  it("should track pending decisions queue depth", async () => {
    const now = new Date();

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      {
        id: "p1",
        status: "pending",
        createdAt: new Date(now.getTime() - 1800000),
        completedAt: null,
        startedAt: null,
      },
      {
        id: "p2",
        status: "pending",
        createdAt: now,
        completedAt: null,
        startedAt: null,
      },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.queue.pendingCount).toBe(2);
    expect(body.queue.inProgressCount).toBe(0);
    expect(body.statusBreakdown.pending).toBe(2);
  });

  it("should calculate percentiles for latency distribution", async () => {
    const now = new Date();
    const decisions = [];

    // Create 100 decisions with varying latencies
    for (let i = 0; i < 100; i++) {
      const createdAt = new Date(now.getTime() - (100 - i) * 60000); // Earlier times
      const completedAt = new Date(createdAt.getTime() + (i + 1) * 60000); // Variable latencies
      decisions.push({
        id: `d${i}`,
        status: "done",
        createdAt,
        completedAt,
        startedAt: null,
      });
    }

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce(decisions as any);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.latency.completedCount).toBe(100);
    expect(body.latency.p95LatencyMs).toBeGreaterThan(body.latency.medianLatencyMs);
    expect(body.latency.p99LatencyMs).toBeGreaterThanOrEqual(body.latency.p95LatencyMs);
    expect(body.latency.maxLatencyMs).toBeGreaterThanOrEqual(body.latency.p99LatencyMs);
  });

  it("should respect days parameter with min/max bounds", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest(
      "http://localhost/api/metrics/decision-latency?days=120"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.period.days).toBe(90); // Capped at 90
  });

  it("should track status breakdown across all statuses", async () => {
    const now = new Date();

    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([
      { id: "p1", status: "pending", createdAt: now, completedAt: null, startedAt: null },
      { id: "ip1", status: "in_progress", createdAt: now, completedAt: null, startedAt: new Date(now.getTime() - 300000) },
      { id: "d1", status: "done", createdAt: new Date(now.getTime() - 3600000), completedAt: now, startedAt: null },
      { id: "f1", status: "failed", createdAt: now, completedAt: null, startedAt: null },
      { id: "b1", status: "blocked", createdAt: now, completedAt: null, startedAt: null },
    ] as any);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.statusBreakdown.pending).toBe(1);
    expect(body.statusBreakdown.inProgress).toBe(1);
    expect(body.statusBreakdown.completed).toBe(1);
    expect(body.statusBreakdown.failed).toBe(1);
    expect(body.statusBreakdown.blocked).toBe(1);
  });

  it("should include workspace isolation in query", async () => {
    vi.mocked(requireWorkspaceContext).mockResolvedValueOnce({
      workspaceId: "ws-123",
    } as any);

    vi.mocked(db.operatorItem.findMany).mockResolvedValueOnce([]);

    const request = new NextRequest("http://localhost/api/metrics/decision-latency");
    await GET(request);

    expect(vi.mocked(db.operatorItem.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-123",
        }),
      })
    );
  });
});
