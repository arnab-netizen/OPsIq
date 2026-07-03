/**
 * M6 — deterministic multi-workspace resolution. DB proof.
 *
 * A user with more than one active WorkspaceMembership was resolved to a NON-deterministic workspace
 * (findFirst without orderBy), and the canonical wrapper could disagree with the workspace
 * `getPolicyContext` resolved capabilities for. All membership resolvers now order identically —
 * `[{ addedAt: "asc" }, { workspaceId: "asc" }]` — so resolution is deterministic (earliest membership,
 * workspaceId as tiebreaker) and consistent across surfaces.
 *
 * Exercises the real `requireWorkspaceContext` code path (only the session boundary is mocked).
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/workspace/deterministic-workspace-resolution.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

let mockUserId = randomUUID();

vi.mock("@/services/auth", () => ({
  getSession: vi.fn(async () => ({
    user: { id: mockUserId, email: "m6@example.com", name: "M6", isActive: true },
    sessionId: "s",
    expiresAt: new Date(Date.now() + 86400000),
  })),
}));

async function mkWorkspace(nameSuffix: string): Promise<string> {
  const id = randomUUID();
  await db.workspace.create({ data: { id, name: `WS ${nameSuffix}`, slug: `ws-${id.substring(0, 8)}` } });
  return id;
}

async function mkMembership(userId: string, workspaceId: string, addedAt: Date, role = "admin") {
  await db.workspaceMembership.create({ data: { userId, workspaceId, role, isActive: true, addedAt } });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] M6 deterministic workspace resolution", () => {
  let userId: string;
  let createdWorkspaceIds: string[] = [];

  beforeEach(async () => {
    userId = randomUUID();
    mockUserId = userId;
    createdWorkspaceIds = [];
    await db.user.create({ data: { id: userId, email: `m6-${userId}@example.com`, isActive: true, updatedAt: new Date() } });
  });

  afterEach(async () => {
    await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
    for (const wid of createdWorkspaceIds) {
      await db.workspaceMembership.deleteMany({ where: { workspaceId: wid } }).catch(() => undefined);
      await db.workspace.delete({ where: { id: wid } }).catch(() => undefined);
    }
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
    vi.clearAllMocks();
  });

  it("[db] resolves the earliest-joined workspace, consistently across repeated calls", async () => {
    const { requireWorkspaceContext } = await import("@/services/workspace/activation-context");
    const wsEarly = await mkWorkspace("early");
    const wsLate = await mkWorkspace("late");
    createdWorkspaceIds = [wsEarly, wsLate];
    // Deliberately insert the LATER membership first so insertion order != desired order.
    await mkMembership(userId, wsLate, new Date("2026-02-01T00:00:00Z"));
    await mkMembership(userId, wsEarly, new Date("2026-01-01T00:00:00Z"));

    const results = await Promise.all(Array.from({ length: 8 }, () => requireWorkspaceContext()));
    for (const r of results) {
      expect(r.workspaceId).toBe(wsEarly);
    }
  });

  it("[db] same addedAt → workspaceId tiebreaker resolves deterministically to the lower id", async () => {
    const { requireWorkspaceContext } = await import("@/services/workspace/activation-context");
    const a = await mkWorkspace("tieA");
    const b = await mkWorkspace("tieB");
    createdWorkspaceIds = [a, b];
    const sameInstant = new Date("2026-03-01T00:00:00Z");
    await mkMembership(userId, a, sameInstant);
    await mkMembership(userId, b, sameInstant);
    const lower = a < b ? a : b;

    const results = await Promise.all(Array.from({ length: 8 }, () => requireWorkspaceContext()));
    for (const r of results) {
      expect(r.workspaceId).toBe(lower);
    }
  });
});
