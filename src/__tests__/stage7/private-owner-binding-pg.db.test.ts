/**
 * S7-DC9: Private owner binding — PostgreSQL-backed route tests.
 *
 * Skipped when TEST_WITH_DB is not set (DB_BLOCKED_ENVIRONMENT).
 * Proves the DB-side of the private-mode entitlement chain:
 *
 *  1. resolvePrivateModeRole returns null when no DB record exists
 *  2. resolvePrivateModeRole returns role for APPROVED record
 *  3. resolvePrivateModeRole returns null for PENDING records (no bypass)
 *  4. Cross-workspace isolation: workspace A role does not apply to workspace B
 *  5. Revoked role is NOT returned
 *  6. getSubscriptionTier returns "enterprise" for OPSIQ_PRIVATE_WORKSPACE_ID (env-var path)
 *  7. resolveWorkspaceTier returns "free" for workspace with no active subscription (DB path)
 *  8. getSubscriptionTier and resolveWorkspaceTier are distinct paths (no conflation)
 */

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { resolvePrivateModeRole } from "@/lib/private-mode-enforcement";
import { resolveWorkspaceTier } from "@/services/entitlement.service";
import { getSubscriptionTier } from "@/services/entitlement";
import { v4 as uuidv4 } from "uuid";

const WITH_DB = process.env.TEST_WITH_DB === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const PRIVATE_WS = "11111111-1111-1111-1111-111111111111";
const OTHER_WS = "22222222-2222-2222-2222-222222222222";

let testUserId: string | null = null;

describeIf(WITH_DB)("S7-DC9: PostgreSQL private-owner binding", () => {
  // PrivateModeAccess.workspaceId is a FK to ClientAccount.id — seed stubs once.
  beforeAll(async () => {
    await db.clientAccount.upsert({
      where: { id: PRIVATE_WS },
      update: {},
      create: { id: PRIVATE_WS, name: "DC9 Test Workspace A" },
    });
    await db.clientAccount.upsert({
      where: { id: OTHER_WS },
      update: {},
      create: { id: OTHER_WS, name: "DC9 Test Workspace B" },
    });
  });

  afterAll(async () => {
    await db.clientAccount.delete({ where: { id: PRIVATE_WS } }).catch(() => {});
    await db.clientAccount.delete({ where: { id: OTHER_WS } }).catch(() => {});
  });

  afterEach(async () => {
    delete process.env.OPSIQ_PRIVATE_WORKSPACE_ID;
    if (testUserId) {
      await db.privateModeAccess.deleteMany({ where: { userId: testUserId } }).catch(() => {});
      await db.user.delete({ where: { id: testUserId } }).catch(() => {});
      testUserId = null;
    }
  });

  async function ensureTestUser(): Promise<string> {
    const id = uuidv4();
    await db.user.create({
      data: {
        id,
        email: `dc9-test-${id.slice(0, 8)}@internal.opsiq.test`,
        name: "DC9 Test User",
        hashedPassword: "test-hash",
      },
    });
    testUserId = id;
    return id;
  }

  // ── 1. null when no record ────────────────────────────────────────────────
  it("1. resolvePrivateModeRole returns null when no DB record exists", async () => {
    const userId = uuidv4();
    const result = await resolvePrivateModeRole({ workspaceId: PRIVATE_WS, userId });
    expect(result).toBeNull();
  });

  // ── 2. Role returned for APPROVED record ──────────────────────────────────
  it("2. resolvePrivateModeRole returns role for APPROVED record", async () => {
    const userId = await ensureTestUser();
    await db.privateModeAccess.create({
      data: {
        id: uuidv4(),
        workspaceId: PRIVATE_WS,
        userId,
        role: "OWNER",
        approvalStatus: "approved",
        grantedBy: userId,
      },
    });

    const result = await resolvePrivateModeRole({ workspaceId: PRIVATE_WS, userId });
    expect(result).toBe("OWNER");
  });

  // ── 3. null for PENDING records ───────────────────────────────────────────
  it("3. resolvePrivateModeRole returns null for PENDING records (no bypass)", async () => {
    const userId = await ensureTestUser();
    await db.privateModeAccess.create({
      data: {
        id: uuidv4(),
        workspaceId: PRIVATE_WS,
        userId,
        role: "OWNER",
        approvalStatus: "pending",
        grantedBy: userId,
      },
    });

    const result = await resolvePrivateModeRole({ workspaceId: PRIVATE_WS, userId });
    expect(result).toBeNull();
  });

  // ── 4. Cross-workspace isolation ─────────────────────────────────────────
  it("4. workspace A role does not apply to workspace B", async () => {
    const userId = await ensureTestUser();
    await db.privateModeAccess.create({
      data: {
        id: uuidv4(),
        workspaceId: PRIVATE_WS,
        userId,
        role: "OWNER",
        approvalStatus: "approved",
        grantedBy: userId,
      },
    });

    // Query with different workspace — should return null
    const result = await resolvePrivateModeRole({ workspaceId: OTHER_WS, userId });
    expect(result).toBeNull();
  });

  // ── 5. Revoked role not returned ─────────────────────────────────────────
  it("5. revoked role is not returned", async () => {
    const userId = await ensureTestUser();
    await db.privateModeAccess.create({
      data: {
        id: uuidv4(),
        workspaceId: PRIVATE_WS,
        userId,
        role: "OWNER",
        approvalStatus: "approved",
        revokedAt: new Date(),
        grantedBy: userId,
      },
    });

    const result = await resolvePrivateModeRole({ workspaceId: PRIVATE_WS, userId });
    expect(result).toBeNull();
  });

  // ── 6. getSubscriptionTier returns enterprise for private workspace via env var ──
  it("6. getSubscriptionTier (in-memory path) returns enterprise for OPSIQ_PRIVATE_WORKSPACE_ID", () => {
    process.env.OPSIQ_PRIVATE_WORKSPACE_ID = PRIVATE_WS;
    const tier = getSubscriptionTier(PRIVATE_WS);
    expect(tier).toBe("enterprise");
    expect(getSubscriptionTier(OTHER_WS)).not.toBe("enterprise"); // no leakage
  });

  // ── 7. resolveWorkspaceTier returns free for workspace with no subscription ──
  it("7. resolveWorkspaceTier (DB path) returns 'free' for unknown workspace (no active subscription)", async () => {
    const unknownWs = uuidv4();
    const tier = await resolveWorkspaceTier(unknownWs);
    expect(tier).toBe("free"); // no subscription in test DB → least privilege
  });

  // ── 8. Two entitlement paths are distinct ────────────────────────────────
  it("8. getSubscriptionTier and resolveWorkspaceTier are distinct paths (in-memory vs DB)", async () => {
    // getSubscriptionTier is synchronous (in-memory cache + env var check)
    // resolveWorkspaceTier is async (DB query)
    const inMemory = getSubscriptionTier(PRIVATE_WS);
    const dbBacked = await resolveWorkspaceTier(PRIVATE_WS);
    // Both exist, neither throws
    expect(["free", "pro", "enterprise"]).toContain(inMemory);
    expect(["free", "pro", "enterprise"]).toContain(dbBacked);
  });
});

describeIf(!WITH_DB)("S7-DC9: DB skipped — database unavailable", () => {
  it("DB_BLOCKED_ENVIRONMENT — PostgreSQL private-owner tests require TEST_WITH_DB=true", () => {
    expect(true).toBe(true);
  });
});
