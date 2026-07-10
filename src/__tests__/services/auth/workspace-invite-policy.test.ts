/**
 * Phase 6E — invite privilege escalation fix (CONFIRMED_HIGH).
 *
 * `POST /api/onboarding/invite` gated invites with the boolean
 *   `!userRole || (userRole.role !== "admin" && userRole.isActive === false)`
 * which denies only a missing membership OR a member that is BOTH non-admin AND inactive. An ACTIVE
 * non-admin (role !== "admin" true, isActive === false false → whole condition false) was NOT denied,
 * so any active submitter/approver/viewer could invite members and assign roles (including "admin") —
 * a privilege escalation on a governed multi-tenant action, and it threw a raw Error (→500) on denial.
 *
 * The fix centralizes the decision in `assertCanInviteMembers` (active `admin` only, governed 403) and
 * the route narrows its membership select to `{ role, isActive }`.
 *
 * The pure-policy tests below exercise the real guard. The `[db]` block proves the exact
 * route-equivalent membership lookup (narrow select) against a REAL database drives allow/deny, and
 * that an active non-admin is denied. Full HTTP-route invocation (withAuth/session + withEnforcementFull)
 * has no unit harness here; the authorization decision is the defect and is proven directly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertCanInviteMembers } from "@/services/auth/workspace-invite-policy";
import { ForbiddenError } from "@/infra/errors";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

// The exact role enum the route's InviteSchema validates (src/app/api/onboarding/invite/route.ts).
const inviteRoleSchema = z.enum(["admin", "approver", "submitter", "viewer"]);

describe("Phase 6E — assertCanInviteMembers (invite authorization, fail-closed)", () => {
  it("allows an ACTIVE admin", () => {
    expect(() => assertCanInviteMembers({ role: "admin", isActive: true })).not.toThrow();
  });

  it("denies an ACTIVE non-admin (the escalation the old boolean allowed)", () => {
    for (const role of ["approver", "submitter", "viewer"]) {
      expect(() => assertCanInviteMembers({ role, isActive: true })).toThrow(ForbiddenError);
    }
  });

  it("denies an INACTIVE admin", () => {
    expect(() => assertCanInviteMembers({ role: "admin", isActive: false })).toThrow(ForbiddenError);
  });

  it("denies an inactive non-admin", () => {
    expect(() => assertCanInviteMembers({ role: "viewer", isActive: false })).toThrow(ForbiddenError);
  });

  it("denies a missing membership (null / undefined)", () => {
    expect(() => assertCanInviteMembers(null)).toThrow(ForbiddenError);
    expect(() => assertCanInviteMembers(undefined)).toThrow(ForbiddenError);
  });

  it("denies with a governed ForbiddenError (403), never a raw 500", () => {
    try {
      assertCanInviteMembers({ role: "submitter", isActive: true });
      throw new Error("expected a throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).statusCode).toBe(403);
    }
  });

  it("rejects an invalid role at the schema boundary (route InviteSchema enum)", () => {
    expect(inviteRoleSchema.safeParse("superadmin").success).toBe(false);
    expect(inviteRoleSchema.safeParse("owner").success).toBe(false);
    expect(inviteRoleSchema.safeParse("admin").success).toBe(true);
  });
});

describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6E — invite membership lookup + guard against a real database",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const adminId = randomUUID();
    const submitterId = randomUUID();
    const inactiveAdminId = randomUUID();
    const strangerId = randomUUID();

    async function lookup(userId: string) {
      return db.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { role: true, isActive: true },
      });
    }

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: "6E WS", slug: `p6e-${stamp}` } });
      for (const [id, tag] of [[adminId, "admin"], [submitterId, "sub"], [inactiveAdminId, "ina"], [strangerId, "str"]] as const) {
        await db.user.create({ data: { id, email: `p6e-${tag}-${stamp}@test.local`, isActive: true, updatedAt: new Date() } });
      }
      await db.workspaceMembership.create({ data: { workspaceId, userId: adminId, role: "admin", isActive: true, addedBy: adminId } });
      await db.workspaceMembership.create({ data: { workspaceId, userId: submitterId, role: "submitter", isActive: true, addedBy: adminId } });
      await db.workspaceMembership.create({ data: { workspaceId, userId: inactiveAdminId, role: "admin", isActive: false, addedBy: adminId } });
      // strangerId intentionally has NO membership row.
    });

    afterAll(async () => {
      try {
        await db.workspaceMembership.deleteMany({ where: { workspaceId } });
        await db.user.deleteMany({ where: { id: { in: [adminId, submitterId, inactiveAdminId, strangerId] } } });
        await db.workspace.deleteMany({ where: { id: workspaceId } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] active admin membership is allowed to invite", async () => {
      const m = await lookup(adminId);
      expect(m).toEqual({ role: "admin", isActive: true }); // narrow select returns exactly these
      expect(() => assertCanInviteMembers(m)).not.toThrow();
    });

    it("[db] active submitter is denied (escalation blocked)", async () => {
      const m = await lookup(submitterId);
      expect(m).toEqual({ role: "submitter", isActive: true });
      expect(() => assertCanInviteMembers(m)).toThrow(ForbiddenError);
    });

    it("[db] inactive admin is denied", async () => {
      const m = await lookup(inactiveAdminId);
      expect(m?.isActive).toBe(false);
      expect(() => assertCanInviteMembers(m)).toThrow(ForbiddenError);
    });

    it("[db] a non-member (no membership row) is denied", async () => {
      const m = await lookup(strangerId);
      expect(m).toBeNull();
      expect(() => assertCanInviteMembers(m)).toThrow(ForbiddenError);
    });
  }
);
