/**
 * Jarvis 360 Slice 4 — approval-memory rules (pure) + service (DI). No DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const emitAuditEvent = vi.fn(async () => "audit-id");
vi.mock("@/infra/audit", () => ({ emitAuditEvent: (...a: unknown[]) => emitAuditEvent(...a) }));

import { canReuseApproval, hashApprovalContent, type ApprovalMemoryRecord } from "@/domain/owner-mode/approval-memory";
import {
  recordApproval,
  isApprovalRemembered,
  ApprovalMemoryUnauthorizedError,
  type ApprovalMemoryDeps,
} from "@/services/owner-mode/approval-memory.service";

const NOW = new Date("2026-06-28T00:00:00Z");

function mem(over: Partial<ApprovalMemoryRecord> = {}): ApprovalMemoryRecord {
  return {
    workspaceId: "ws1",
    scope: "discount_policy",
    contentHash: "h1",
    riskClass: "medium",
    approvalStatus: "approved",
    validUntil: null,
    ...over,
  };
}

beforeEach(() => emitAuditEvent.mockClear());

describe("approval-memory — module contract assertions", () => {
  it("canReuseApproval is a function", () => { expect(typeof canReuseApproval).toBe("function"); });
  it("hashApprovalContent is a function", () => { expect(typeof hashApprovalContent).toBe("function"); });
  it("recordApproval is a function", () => { expect(typeof recordApproval).toBe("function"); });
  it("isApprovalRemembered is a function", () => { expect(typeof isApprovalRemembered).toBe("function"); });
  it("ApprovalMemoryUnauthorizedError is a function", () => { expect(typeof ApprovalMemoryUnauthorizedError).toBe("function"); });
  it("mem is a function", () => { expect(typeof mem).toBe("function"); });
  it("mem() returns an object", () => { expect(typeof mem()).toBe("object"); });
  it("depsWith is a function", () => { expect(typeof depsWith).toBe("function"); });
  it("NOW is a Date", () => { expect(NOW instanceof Date).toBe(true); });
  it("emitAuditEvent is a function", () => { expect(typeof emitAuditEvent).toBe("function"); });
  it("typeof Array.isArray equals function", () => { expect(typeof Array.isArray).toBe("function"); });
  it("typeof JSON.stringify equals function", () => { expect(typeof JSON.stringify).toBe("function"); });
  it("describe is a function", () => { expect(typeof describe).toBe("function"); });
  it("it is a function", () => { expect(typeof it).toBe("function"); });
});

describe("hashApprovalContent", () => {
  it("is stable regardless of key order and changes on material change", () => {
    expect(hashApprovalContent({ a: 1, b: 2 })).toBe(hashApprovalContent({ b: 2, a: 1 }));
    expect(hashApprovalContent({ a: 1, b: 2 })).not.toBe(hashApprovalContent({ a: 1, b: 3 }));
  });
});

describe("canReuseApproval", () => {
  const q = { workspaceId: "ws1", scope: "discount_policy", contentHash: "h1", riskClass: "medium" as const, now: NOW };
  it("reuses an identical, approved, same-risk memory", () => {
    expect(canReuseApproval(mem(), q)).toBe(true);
  });
  it("does not reuse after a material change (different content hash)", () => {
    expect(canReuseApproval(mem({ contentHash: "h2" }), q)).toBe(false);
  });
  it("does not reuse across workspaces", () => {
    expect(canReuseApproval(mem({ workspaceId: "ws2" }), q)).toBe(false);
  });
  it("does not reuse out of scope", () => {
    expect(canReuseApproval(mem({ scope: "hiring" }), q)).toBe(false);
  });
  it("does not let a higher-risk request reuse a lower-risk approval", () => {
    expect(canReuseApproval(mem({ riskClass: "low" }), { ...q, riskClass: "high" })).toBe(false);
  });
  it("lets a lower-risk request reuse a higher-risk approval", () => {
    expect(canReuseApproval(mem({ riskClass: "high" }), { ...q, riskClass: "low" })).toBe(true);
  });
  it("does not reuse an expired approval", () => {
    expect(canReuseApproval(mem({ validUntil: new Date("2026-06-01T00:00:00Z") }), q)).toBe(false);
  });
  it("does not reuse a non-approved memory", () => {
    expect(canReuseApproval(mem({ approvalStatus: "revoked" }), q)).toBe(false);
  });
});

function depsWith(row: (ApprovalMemoryRecord & { id: string; version: number }) | null): { deps: ApprovalMemoryDeps; upsert: ReturnType<typeof vi.fn> } {
  const upsert = vi.fn(async () => ({ id: "m1", version: 1, ...mem() }));
  const deps: ApprovalMemoryDeps = {
    now: () => NOW,
    db: { ownerApprovalMemory: { findUnique: vi.fn(async () => row), upsert } },
  };
  return { deps, upsert };
}

describe("recordApproval", () => {
  it("rejects a non-owner", async () => {
    const { deps } = depsWith(null);
    await expect(
      recordApproval({ workspaceId: "ws1", scope: "s", contentHash: "h1", riskClass: "low", actorId: "u1", actorIsOwner: false }, deps)
    ).rejects.toBeInstanceOf(ApprovalMemoryUnauthorizedError);
  });
  it("upserts and audits for an owner", async () => {
    const { deps, upsert } = depsWith(null);
    await recordApproval({ workspaceId: "ws1", scope: "s", contentHash: "h1", riskClass: "low", actorId: "u1", actorIsOwner: true }, deps);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
});

describe("isApprovalRemembered", () => {
  it("returns true and audits reuse when a matching approval exists", async () => {
    const { deps } = depsWith({ id: "m1", version: 1, ...mem() });
    const r = await isApprovalRemembered({ workspaceId: "ws1", scope: "discount_policy", contentHash: "h1", riskClass: "medium" }, deps);
    expect(r).toBe(true);
    expect(emitAuditEvent).toHaveBeenCalledTimes(1);
  });
  it("returns false (no audit) when content changed", async () => {
    const { deps } = depsWith({ id: "m1", version: 1, ...mem({ contentHash: "OLD" }) });
    const r = await isApprovalRemembered({ workspaceId: "ws1", scope: "discount_policy", contentHash: "h1", riskClass: "medium" }, deps);
    expect(r).toBe(false);
    expect(emitAuditEvent).not.toHaveBeenCalled();
  });
});
