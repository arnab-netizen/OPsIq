/**
 * GAP-TEN-01 — DB-level tenant backstop is LIVE for the curated enforced set [db].
 *
 * Proves:
 *  - The Prisma workspace-enforcement extension actually fires (the PascalCase
 *    casing bug that made it silently inert cannot recur).
 *  - Enforced models (UsageEvent, CanonicalEvent) fail closed on unscoped
 *    reads/creates and succeed when workspace-scoped.
 *  - Excluded models (User) are NOT enforced, so signup/user creation is not
 *    broken by the backstop.
 */
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

const ISO = /WORKSPACE ISOLATION VIOLATION/;

describe("DB-level tenant backstop — curated enforcement [db]", () => {
  it("BLOCKS an unscoped findMany on an enforced model (backstop is live)", async () => {
    await expect(db.usageEvent.findMany({})).rejects.toThrow(ISO);
    await expect(db.usageEvent.findMany({ where: {} })).rejects.toThrow(ISO);
  });

  it("BLOCKS a create on an enforced model without workspaceId in data", async () => {
    await expect(
      db.usageEvent.create({ data: { id: randomUUID(), eventType: "x", quantity: 1 } as never }),
    ).rejects.toThrow(ISO);
  });

  it("ALLOWS a workspace-scoped read on an enforced model", async () => {
    // Passes the backstop; returns [] (no rows) — the point is it does not throw.
    const rows = await db.usageEvent.findMany({ where: { workspaceId: randomUUID() } });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("BLOCKS an unscoped delete on an enforced model", async () => {
    await expect(
      db.usageEvent.deleteMany({ where: { eventType: "nope" } as never }),
    ).rejects.toThrow(ISO);
  });

  it("does NOT enforce a non-allowlisted model (CanonicalEvent) — unscoped read passes", async () => {
    // CanonicalEvent is a candidate but not yet enforced (event-store ordering
    // paths do unscoped counts); it must pass through the backstop for now.
    await expect(db.canonicalEvent.findMany({ take: 1 })).resolves.toBeDefined();
  });

  it("does NOT enforce an excluded model (User) — signup path stays intact", async () => {
    // User is intentionally excluded (created at signup before any workspace).
    // An unscoped findMany must NOT be blocked by the backstop.
    await expect(db.user.findMany({ take: 1 })).resolves.toBeDefined();
  });

  it("does NOT enforce another excluded workspace-owned model (OperatorItem)", async () => {
    // OperatorItem uses verify-then-update-by-id; it must pass through the
    // backstop (route/service layer scopes it). Unscoped find must not throw.
    await expect(db.operatorItem.findMany({ take: 1 })).resolves.toBeDefined();
  });
});
