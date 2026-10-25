/**
 * The acceptance fixture role is workspace-scoped by the REAL policy-context loader (real Session row,
 * real getPolicyContext; only the cookie jar is stubbed): a role row scoped to workspace A is invisible
 * in workspace B, and a revoked or inactive row is never loaded.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/api/admin/acceptance-fixture-role-scoping.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { randomUUID } from "crypto";

const cookieHolder = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined),
  }),
}));

import { db } from "@/lib/db";
import { getPolicyContext } from "@/services/auth";
import { ROLES } from "@/domain/constants/roles";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { hasCapability } from "@/policies/capability-check";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] acceptance fixture role scoping (real getPolicyContext)", () => {
  let userId: string; let wsA: string; let wsB: string;
  beforeEach(async () => {
    userId = randomUUID(); wsA = randomUUID(); wsB = randomUUID();
    cookieHolder.token = `fx-scope-${userId}`;
    await db.user.create({ data: { id: userId, email: `fx-scope-${userId}@example.com`, isActive: true, updatedAt: new Date() } });
    for (const ws of [wsA, wsB]) {
      await db.workspace.create({ data: { id: ws, name: "scope ws", slug: `fx-scope-${ws.substring(0, 8)}` } });
      await db.workspaceMembership.create({ data: { id: randomUUID(), userId, workspaceId: ws, role: "owner" } });
    }
    await db.session.create({ data: { id: randomUUID(), token: cookieHolder.token, userId, expiresAt: new Date(Date.now() + 3600_000) } });
  });
  afterEach(async () => {
    cookieHolder.token = undefined;
    await db.session.deleteMany({ where: { userId } }).catch(() => undefined);
    await db.userRoleAssignment.deleteMany({ where: { userId } }).catch(() => undefined);
    await db.workspaceMembership.deleteMany({ where: { userId } }).catch(() => undefined);
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } }).catch(() => undefined);
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  const grant = (scopeId: string, extra: Record<string, unknown> = {}) =>
    db.userRoleAssignment.create({ data: { id: randomUUID(), userId, role: ROLES.ACCEPTANCE_FIXTURE_OPERATOR, scope: "workspace", scopeId, isActive: true, ...extra } });
  const has = async (ws: string) => {
    const p = await getPolicyContext(ws);
    expect(p).not.toBeNull();
    return hasCapability(p!, CAPABILITIES.ACCEPTANCE_FIXTURE_WRITE);
  };

  it("a role granted for workspace A confers the capability in A and NOT in B", async () => {
    await grant(wsA);
    expect(await has(wsA)).toBe(true);
    expect(await has(wsB)).toBe(false);
  });

  it("a revoked or inactive assignment confers nothing (revocation takes effect on the next request)", async () => {
    await grant(wsA, { revokedAt: new Date() });
    await grant(wsB, { isActive: false });
    expect(await has(wsA)).toBe(false);
    expect(await has(wsB)).toBe(false);
  });

  it("the grant is live the moment it is made and gone the moment it is revoked", async () => {
    const row = await grant(wsA);
    expect(await has(wsA)).toBe(true);
    await db.userRoleAssignment.update({ where: { id: row.id }, data: { isActive: false, revokedAt: new Date() } });
    expect(await has(wsA)).toBe(false);
  });
});
