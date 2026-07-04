/**
 * [db]-gated Wave 7 (M1) proof — the verified-session snapshot now records REAL workspace/membership state instead
 * of the old hardcoded `workspace.isActive: true` / workspace-id-as-name / `now` join date / `planId:"default"`.
 * Drives the real `resolveWorkspaceSnapshotFacts` (the DB lookup the auth wrapper uses) + the real
 * `CanonicalVerifiedSessionBuilder`, and proves:
 *   - an ACTIVE workspace → snapshot.workspace.isActive === true and workspace.name === the real name (not the id)
 *   - a DEACTIVATED workspace → snapshot.workspace.isActive === false (no longer hardcoded true)
 *   - membership.joinedAt === the real membership.addedAt
 *   - entitlements are honestly unresolved (resolved:false, planId:null) — not a fabricated "default" plan
 *   - role grant timestamps are honest null, never a fabricated `now`
 * Requires TEST_WITH_DB=true.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { resolveWorkspaceSnapshotFacts } from "@/lib/canonical-route-enforcement";
import { CanonicalVerifiedSessionBuilder } from "@/lib/canonical-verified-session";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";

const userId = randomUUID();
const activeWs = randomUUID();
const inactiveWs = randomUUID();
const ADDED_AT = new Date("2026-02-03T00:00:00Z");

function buildSnapshot(workspaceId: string, facts: { workspaceName: string; workspaceIsActive: boolean; membershipIsActive: boolean; membershipJoinedAt: Date }) {
  const sessionInfo: SessionInfo = {
    user: { id: userId, email: `m1-${userId}@example.com`, name: "M1", isActive: true },
    sessionId: randomUUID(),
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  };
  const policyContext: PolicyContext = {
    userId,
    roles: [{ role: "WORKSPACE_ADMIN", scope: "workspace", scopeId: workspaceId }],
    engagementMemberships: [],
  };
  return new CanonicalVerifiedSessionBuilder({
    traceId: "t", correlationId: "c", sessionInfo, policyContext, workspaceId,
    capabilities: new Set(), ...facts,
  }).finalize();
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 7 M1 — verified-session snapshot reads real workspace/membership facts", () => {
  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `m1-${userId}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: activeWs, name: "Active Workspace", slug: `active-${activeWs.substring(0, 8)}`, isActive: true } });
    await db.workspace.create({ data: { id: inactiveWs, name: "Inactive Workspace", slug: `inactive-${inactiveWs.substring(0, 8)}`, isActive: false } });
    await db.workspaceMembership.create({ data: { userId, workspaceId: activeWs, role: "admin", isActive: true, addedAt: ADDED_AT } });
    await db.workspaceMembership.create({ data: { userId, workspaceId: inactiveWs, role: "admin", isActive: true, addedAt: ADDED_AT } });
  });
  afterAll(async () => {
    await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
    await db.workspace.deleteMany({ where: { id: { in: [activeWs, inactiveWs] } } }).catch(() => undefined);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  it("[db] an ACTIVE workspace → snapshot.workspace.isActive true + real name (not the id)", async () => {
    const facts = await resolveWorkspaceSnapshotFacts(activeWs, userId);
    expect(facts.workspaceIsActive).toBe(true);
    expect(facts.workspaceName).toBe("Active Workspace");
    expect(facts.membershipJoinedAt.getTime()).toBe(ADDED_AT.getTime());

    const snap = buildSnapshot(activeWs, facts);
    expect(snap.workspace.isActive).toBe(true);
    expect(snap.workspace.name).toBe("Active Workspace");
    expect(snap.workspace.name).not.toBe(activeWs); // no longer the id
  });

  it("[db] a DEACTIVATED workspace → snapshot.workspace.isActive false (not hardcoded true)", async () => {
    const facts = await resolveWorkspaceSnapshotFacts(inactiveWs, userId);
    expect(facts.workspaceIsActive).toBe(false);

    const snap = buildSnapshot(inactiveWs, facts);
    expect(snap.workspace.isActive).toBe(false);
  });

  it("[db] membership.joinedAt is the real addedAt; entitlements + role grants are honest (not fabricated)", async () => {
    const facts = await resolveWorkspaceSnapshotFacts(activeWs, userId);
    const snap = buildSnapshot(activeWs, facts);
    expect(snap.workspace.membership.joinedAt.getTime()).toBe(ADDED_AT.getTime());
    // entitlements honestly unresolved — NOT a fabricated "default" plan / limits.
    expect(snap.entitlements.resolved).toBe(false);
    expect(snap.entitlements.planId).toBeNull();
    // role grant timestamps honest null, never a fabricated `now`.
    expect(snap.roles.every((r) => r.grantedAt === null)).toBe(true);
    expect(snap.workspace.membership.roles.every((r) => r.grantedAt === null)).toBe(true);
  });

  it("[db] resolveWorkspaceSnapshotFacts throws honestly when no membership exists (no fabricated defaults)", async () => {
    await expect(resolveWorkspaceSnapshotFacts(activeWs, randomUUID())).rejects.toThrow();
  });
});
