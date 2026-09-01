import { describe, it, expect, vi } from "vitest";

/**
 * P0-04 (production trust/governance closure) — regression test for the
 * compile-time guard added alongside the retention-cleanup fix.
 *
 * getAuditEventReadOnlyClient() exists so future code that needs to read
 * AuditEvent rows has a typed, delete/update-free accessor to reach for
 * instead of the untyped `db.auditEvent` — see src/infra/audit.ts for the
 * full rationale. TypeScript enforces the "no destructive methods on this
 * type" half at compile time (tsc --noEmit is part of this PR's validation
 * gate); this test proves the runtime half: the accessor genuinely
 * delegates to the real underlying model, it isn't a stub.
 */

const findManyMock = vi.fn().mockResolvedValue([{ id: "evt-1" }]);
const findFirstMock = vi.fn().mockResolvedValue({ id: "evt-1" });

vi.mock("@/lib/db", () => ({
  db: {
    auditEvent: {
      findMany: (...args: unknown[]) => findManyMock(...args),
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      create: vi.fn(),
      // Intentionally no delete/deleteMany/update/updateMany/upsert here —
      // if getAuditEventReadOnlyClient() ever called one of them, this mock
      // would throw "is not a function", failing the test loudly.
    },
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

import { getAuditEventReadOnlyClient } from "@/infra/audit";

describe("P0-04: getAuditEventReadOnlyClient", () => {
  it("delegates findMany/findFirst to the real underlying AuditEvent model", async () => {
    const client = getAuditEventReadOnlyClient();

    const many = await client.findMany({ where: { workspaceId: "ws-1" } });
    const first = await client.findFirst({ where: { workspaceId: "ws-1" } });

    expect(many).toEqual([{ id: "evt-1" }]);
    expect(first).toEqual({ id: "evt-1" });
    expect(findManyMock).toHaveBeenCalledWith({ where: { workspaceId: "ws-1" } });
    expect(findFirstMock).toHaveBeenCalledWith({ where: { workspaceId: "ws-1" } });
  });

  it("exposes no delete/deleteMany/update/updateMany/upsert at runtime either (mirrors the compile-time type restriction)", () => {
    const client = getAuditEventReadOnlyClient() as unknown as Record<string, unknown>;

    expect(client.delete).toBeUndefined();
    expect(client.deleteMany).toBeUndefined();
    expect(client.update).toBeUndefined();
    expect(client.updateMany).toBeUndefined();
    expect(client.upsert).toBeUndefined();
  });
});
