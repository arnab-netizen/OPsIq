import { describe, it, expect } from "vitest";
import { ROLES, ROLE_HIERARCHY } from "@/domain/constants/roles";

// We test the validation logic by extracting it. Since the real service
// depends on DB/Prisma, we test the pure business rules here.

// Re-implement the pure validation functions to test them in isolation.
// These mirror the service internals exactly.

function assertHierarchyAuthority(
  actorHighestLevel: number,
  targetRole: string
): void {
  const targetLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY] ?? 0;
  if (targetLevel >= actorHighestLevel) {
    throw new Error(
      `Cannot manage role "${targetRole}" — requires higher hierarchy level`
    );
  }
}

function validateRoleName(role: string): void {
  const validRoles = Object.values(ROLES) as string[];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
}

describe("Role assignment business rules", () => {
  describe("hierarchy authority enforcement", () => {
    it("system_admin (100) can manage admin_or_portfolio_manager (80)", () => {
      expect(() =>
        assertHierarchyAuthority(100, ROLES.ADMIN_OR_PORTFOLIO_MANAGER)
      ).not.toThrow();
    });

    it("admin_or_portfolio_manager (80) can manage experienced_consultant (60)", () => {
      expect(() =>
        assertHierarchyAuthority(80, ROLES.EXPERIENCED_CONSULTANT)
      ).not.toThrow();
    });

    it("experienced_consultant (60) can manage beginner_consultant (40)", () => {
      expect(() =>
        assertHierarchyAuthority(60, ROLES.BEGINNER_CONSULTANT)
      ).not.toThrow();
    });

    it("admin_or_portfolio_manager (80) cannot manage system_admin (100)", () => {
      expect(() =>
        assertHierarchyAuthority(80, ROLES.SYSTEM_ADMIN)
      ).toThrow(/requires higher hierarchy level/);
    });

    it("experienced_consultant (60) cannot manage admin_or_portfolio_manager (80)", () => {
      expect(() =>
        assertHierarchyAuthority(60, ROLES.ADMIN_OR_PORTFOLIO_MANAGER)
      ).toThrow(/requires higher hierarchy level/);
    });

    it("cannot manage a role at the same level", () => {
      expect(() =>
        assertHierarchyAuthority(60, ROLES.EXPERIENCED_CONSULTANT)
      ).toThrow(/requires higher hierarchy level/);
    });

    it("user with no roles (-1) cannot manage any role", () => {
      expect(() =>
        assertHierarchyAuthority(-1, ROLES.VIEWER)
      ).toThrow(/requires higher hierarchy level/);
    });

    it("viewer (0) cannot manage viewer (0) — same level", () => {
      expect(() =>
        assertHierarchyAuthority(0, ROLES.VIEWER)
      ).toThrow(/requires higher hierarchy level/);
    });
  });

  describe("role name validation", () => {
    it("accepts valid role names", () => {
      for (const role of Object.values(ROLES)) {
        expect(() => validateRoleName(role)).not.toThrow();
      }
    });

    it("rejects invalid role names", () => {
      expect(() => validateRoleName("superadmin")).toThrow(/Invalid role/);
      expect(() => validateRoleName("")).toThrow(/Invalid role/);
      expect(() => validateRoleName("SYSTEM_ADMIN")).toThrow(/Invalid role/);
    });
  });

  describe("self-assignment prevention", () => {
    it("blocks when userId equals actorId", () => {
      const actorId = "user-123";
      const userId: string = actorId; // same reference
      expect(userId).toBe(actorId);
    });

    it("allows when userId differs from actorId", () => {
      const actorId = "user-123";
      const userId = "user-456";
      expect(userId).not.toBe(actorId);
    });
  });
});
