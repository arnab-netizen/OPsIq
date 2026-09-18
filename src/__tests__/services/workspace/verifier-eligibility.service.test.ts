/**
 * Unit tests (mocked DB, no Postgres) for hasEligibleIndependentVerifier — PR G.
 *
 * This is the single function that decides whether a solo-operator VERIFY_OUTCOME
 * self-verification exception may apply (see owner-outcome-verification.service.ts).
 * These tests run without a live database and exercise the exact capability-
 * resolution logic (getCapabilitiesForRole / hasCapability) that the real
 * POST /api/owner/process-execution route uses to decide who may call it at all.
 */
import { describe, it, expect, vi } from "vitest";
import { hasEligibleIndependentVerifier, type VerifierEligibilityDb } from "@/services/workspace/verifier-eligibility.service";
import { ROLES } from "@/domain/constants/roles";

function makeDb(overrides: {
  members?: Array<{ userId: string; role: string }>;
  roleAssignments?: Array<{ userId: string; role: string; scope: string | null; scopeId: string | null }>;
}): VerifierEligibilityDb {
  return {
    workspaceMembership: {
      findMany: vi.fn(async () => overrides.members ?? []),
    },
    userRoleAssignment: {
      findMany: vi.fn(async () => overrides.roleAssignments ?? []),
    },
  };
}

const WS = "ws-1";
const RECORDER = "user-recorder";

describe("hasEligibleIndependentVerifier", () => {
  it("returns false when the recorder is the only active workspace member (true solo owner)", async () => {
    const db = makeDb({ members: [] }); // findMany already excludes recorder via `where`
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(false);
    expect(db.workspaceMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS, isActive: true }) })
    );
  });

  it("returns false when another active member exists but holds no capability-granting role assignment", async () => {
    const db = makeDb({
      members: [{ userId: "user-viewer", role: "owner" }],
      roleAssignments: [], // no active UserRoleAssignment at all for this member
    });
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(false);
  });

  it("returns true when another active member holds ADMIN_OR_PORTFOLIO_MANAGER (grants OWNER_MANAGE) with a non-owner workspaceRole", async () => {
    const db = makeDb({
      members: [{ userId: "user-admin", role: "admin" }],
      roleAssignments: [
        { userId: "user-admin", role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WS },
      ],
    });
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(true);
  });

  it("returns true when another active member is themself workspace role 'owner' with the self-serve OWNER_SCOPED_CAPABILITIES narrowing (still includes OWNER_MANAGE)", async () => {
    const db = makeDb({
      members: [{ userId: "user-owner-2", role: "owner" }],
      roleAssignments: [
        { userId: "user-owner-2", role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WS },
      ],
    });
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(true);
  });

  it("returns false when the only other member's role assignment is scoped to a DIFFERENT workspace", async () => {
    const db = makeDb({
      members: [{ userId: "user-other-ws", role: "admin" }],
      roleAssignments: [
        { userId: "user-other-ws", role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: "some-other-ws" },
      ],
    });
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(false);
  });

  it("returns true when at least one of several other members is eligible, even if earlier ones are not", async () => {
    const db = makeDb({
      members: [
        { userId: "user-no-caps", role: "owner" },
        { userId: "user-eligible", role: "admin" },
      ],
      roleAssignments: [
        { userId: "user-eligible", role: ROLES.ADMIN_OR_PORTFOLIO_MANAGER, scope: "workspace", scopeId: WS },
      ],
    });
    const result = await hasEligibleIndependentVerifier(db, WS, RECORDER);
    expect(result).toBe(true);
  });

  it("excludes the recorder from the eligibility query itself", async () => {
    const db = makeDb({ members: [] });
    await hasEligibleIndependentVerifier(db, WS, RECORDER);
    const call = (db.workspaceMembership.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.userId).toEqual({ not: RECORDER });
  });
});
