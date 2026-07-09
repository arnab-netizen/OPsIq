import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

/**
 * Phase 5C — owner-facing route 500 sweep, defect #1: `getPolicyContext` schema-drift resilience.
 *
 * `getPolicyContext` (src/services/auth.ts) is the central policy resolver reached by virtually every
 * owner-facing governed route: the canonical route wrapper (`getPolicyContextFact`), `resolveServerRole`
 * (the UI role shown on owner routes), and `requirePolicyContext`. It performs TWO workspace-membership
 * reads. Both previously used a BARE/default select, which reads EVERY `workspace_memberships` column:
 *   1. `findFirst` (deriving the default workspaceId) — only `membership.workspaceId` is consumed.
 *   2. `findUnique` (verifying membership in the target workspace) — only `membership.isActive` is consumed.
 *
 * This is the exact Phase 3 defect class (login `membership_lookup_failed`). When the deployed database is
 * missing any newer nullable `workspace_memberships` column (deploy/migration drift — e.g. the columns
 * added by `20260625120000_owner_mode_execution_tables`), a default-select read throws Prisma P2022
 * ("column ... does not exist") and EVERY owner-facing route that resolves policy 500s — even though only
 * `workspaceId` / `isActive` are needed.
 *
 * Fix: select ONLY the consumed column on each read (`{ workspaceId: true }` / `{ isActive: true }`),
 * making policy resolution resilient to drift on any non-core column. Behavior is preserved.
 *
 * This test proves the failure and the fix against a REAL database (no mocks of DB behaviour):
 *   1. Normal operation: the real `getPolicyContext` resolves a non-null context and returns null with no
 *      session / for a foreign workspace (auth + tenant isolation preserved).
 *   2. The failure class is real: under a genuinely dropped column, the OLD bare-select findFirst AND the
 *      OLD bare-select findUnique both throw P2022 (the exact production trigger).
 *   3. The fix works end-to-end: the REAL `getPolicyContext` still resolves a valid context (does NOT
 *      throw / does NOT 500) while the same column is missing.
 *
 * `next/headers` `cookies()` is mocked to supply the session token (the ONLY mock — the DB is real). The
 * dropped column is restored in try/finally so the schema is always left intact.
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */

const cookieHolder = vi.hoisted(() => ({ token: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "opsiq_session" && cookieHolder.token ? { value: cookieHolder.token } : undefined,
  }),
}));

import { db } from "@/lib/db";
import { getPolicyContext } from "@/services/auth";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 5C — getPolicyContext survives workspace_memberships schema drift",
  () => {
    const stamp = randomUUID().substring(0, 8);

    const userId = randomUUID();
    const email = `p5c-user-${stamp}@test.local`;
    const workspaceId = randomUUID();
    const foreignWorkspaceId = randomUUID();
    const sessionToken = `p5c-token-${stamp}`;

    beforeAll(async () => {
      await db.user.create({
        data: { id: userId, email, isActive: true, updatedAt: new Date() },
      });
      await db.workspace.create({ data: { id: workspaceId, name: "P5C WS", slug: `p5c-${stamp}` } });
      await db.workspace.create({
        data: { id: foreignWorkspaceId, name: "P5C Foreign WS", slug: `p5c-foreign-${stamp}` },
      });
      await db.workspaceMembership.create({
        data: { id: randomUUID(), workspaceId, userId, role: "owner" },
      });
      await db.session.create({
        data: {
          id: randomUUID(),
          token: sessionToken,
          userId,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    });

    afterAll(async () => {
      try {
        await db.session.deleteMany({ where: { userId } });
        await db.workspaceMembership.deleteMany({ where: { userId } });
        await db.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignWorkspaceId] } } });
        await db.user.deleteMany({ where: { id: userId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] returns null when there is no session (auth enforced)", async () => {
      cookieHolder.token = undefined;
      const ctx = await getPolicyContext();
      expect(ctx).toBeNull();
    });

    it("[db] resolves a non-null policy context for a valid member (default workspace)", async () => {
      cookieHolder.token = sessionToken;
      const ctx = await getPolicyContext();
      expect(ctx).not.toBeNull();
      expect(ctx?.userId).toBe(userId);
    });

    it("[db] returns null for a workspace the user has no membership in (tenant isolation)", async () => {
      cookieHolder.token = sessionToken;
      const ctx = await getPolicyContext(foreignWorkspaceId);
      expect(ctx).toBeNull();
    });

    it("[db] proves the drift failure class on BOTH reads and that getPolicyContext survives it", async () => {
      cookieHolder.token = sessionToken;
      // Simulate the production deploy drift: a newer, nullable membership column absent in the DB.
      const DRIFT_COLUMN = "primary_auth_method";
      await db.$executeRawUnsafe(`ALTER TABLE workspace_memberships DROP COLUMN ${DRIFT_COLUMN}`);
      try {
        // 1a. The OLD bare-select findFirst (default workspace derivation) throws P2022 under drift.
        let findFirstThrew = false;
        try {
          await db.workspaceMembership.findFirst({
            where: { userId, isActive: true },
            orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
          });
        } catch (e) {
          findFirstThrew = (e as { code?: string }).code === "P2022";
        }
        expect(findFirstThrew).toBe(true);

        // 1b. The OLD bare-select findUnique (membership verification) throws P2022 under drift.
        let findUniqueThrew = false;
        try {
          await db.workspaceMembership.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
          });
        } catch (e) {
          findUniqueThrew = (e as { code?: string }).code === "P2022";
        }
        expect(findUniqueThrew).toBe(true);

        // 2. The FIXED narrow-select reads still resolve the needed fields.
        const narrowFirst = await db.workspaceMembership.findFirst({
          where: { userId, isActive: true },
          orderBy: [{ addedAt: "asc" }, { workspaceId: "asc" }],
          select: { workspaceId: true },
        });
        expect(narrowFirst?.workspaceId).toBe(workspaceId);
        const narrowUnique = await db.workspaceMembership.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
          select: { isActive: true },
        });
        expect(narrowUnique?.isActive).toBe(true);

        // 3. End-to-end: the REAL getPolicyContext no longer 500s under drift — it resolves a context.
        const ctx = await getPolicyContext();
        expect(ctx).not.toBeNull();
        expect(ctx?.userId).toBe(userId);
      } finally {
        await db.$executeRawUnsafe(
          `ALTER TABLE workspace_memberships ADD COLUMN ${DRIFT_COLUMN} TEXT`
        );
      }
    });
  }
);
