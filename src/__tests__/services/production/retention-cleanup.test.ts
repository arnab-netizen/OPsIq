import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-04 (production trust/governance closure) — regression tests.
 *
 * cleanupOldRecords() previously deleted AuditEvent rows on a schedule this
 * module owns, and that path was reachable from GET /api/health (see
 * src/app/api/health/route.ts). That deletion has been removed entirely —
 * governed audit history must be append-only (CLAUDE.md: "Modifying
 * audit_log rows in any way" requires explicit owner authority). These
 * tests prove the destructive audit-event methods are never invoked, no
 * matter how many times cleanup runs (including the module's own
 * startup-triggered run and simulated repeated /api/health polling), while
 * the legitimate operator-item retention behavior — which this fix did not
 * touch — still works.
 */

// vi.mock factories are hoisted above ordinary top-level declarations, so
// values assigned directly as object properties inside the factory (as
// opposed to referenced lazily inside a nested closure) must be created via
// vi.hoisted() to avoid a temporal-dead-zone error at module load.
const { auditEventOps, operatorItemDeleteMany } = vi.hoisted(() => ({
  auditEventOps: {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  },
  operatorItemDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    workspace: {
      findMany: vi.fn().mockResolvedValue([{ id: "ws-1" }, { id: "ws-2" }]),
    },
    operatorItem: {
      deleteMany: (...args: unknown[]) => operatorItemDeleteMany(...args),
    },
    auditEvent: auditEventOps,
  },
  getDbInstance: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/observability/log", () => ({
  createEventLogger: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("@/lib/operator-error-governance", () => ({
  classifyOperatorError: (err: unknown) => ({
    operatorMessage: err instanceof Error ? err.message : String(err),
  }),
}));

// Importing this module runs its module-level `cleanupOldRecords().catch(...)`
// once immediately (pre-existing behavior, unrelated to this fix) — the mocks
// above must be registered first so that run is safely observed too.
import { cleanupOldRecords } from "@/services/production/retention-cleanup";

describe("P0-04: retention cleanup never touches AuditEvent destructively", () => {
  beforeEach(() => {
    auditEventOps.delete.mockClear();
    auditEventOps.deleteMany.mockClear();
    auditEventOps.update.mockClear();
    auditEventOps.updateMany.mockClear();
    auditEventOps.upsert.mockClear();
    operatorItemDeleteMany.mockClear();
  });

  it("does not call auditEvent.deleteMany, .delete, .update, .updateMany, or .upsert on a single run", async () => {
    await cleanupOldRecords();

    expect(auditEventOps.deleteMany).not.toHaveBeenCalled();
    expect(auditEventOps.delete).not.toHaveBeenCalled();
    expect(auditEventOps.update).not.toHaveBeenCalled();
    expect(auditEventOps.updateMany).not.toHaveBeenCalled();
    expect(auditEventOps.upsert).not.toHaveBeenCalled();
  });

  it("still performs legitimate operator-item retention cleanup — this fix removed audit deletion only, not the whole function", async () => {
    await cleanupOldRecords();

    expect(operatorItemDeleteMany).toHaveBeenCalled();
    const call = operatorItemDeleteMany.mock.calls[0]![0] as { where: { status: unknown } };
    expect(call.where.status).toEqual({ in: ["done", "failed", "blocked"] });
  });

  it("simulated repeated GET /api/health polling: 50 sequential cleanup runs never touch AuditEvent destructively", async () => {
    for (let i = 0; i < 50; i++) {
      await cleanupOldRecords();
    }

    expect(auditEventOps.deleteMany).not.toHaveBeenCalled();
    expect(auditEventOps.delete).not.toHaveBeenCalled();
    expect(auditEventOps.update).not.toHaveBeenCalled();
    expect(auditEventOps.updateMany).not.toHaveBeenCalled();
  });

  it("does not throw even if operatorItem.deleteMany fails per-workspace (existing resilience preserved)", async () => {
    operatorItemDeleteMany.mockRejectedValueOnce(new Error("db error"));

    await expect(cleanupOldRecords()).resolves.toBeUndefined();
    expect(auditEventOps.deleteMany).not.toHaveBeenCalled();
  });

  it("does not throw even if db.workspace.findMany fails entirely", async () => {
    const { db } = await import("@/lib/db");
    (db.workspace.findMany as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("connection refused"));

    await expect(cleanupOldRecords()).resolves.toBeUndefined();
    expect(auditEventOps.deleteMany).not.toHaveBeenCalled();
  });
});
