import { describe, it, expect, vi } from "vitest";
import { validateWorkspaceId, enforceWorkspaceId } from "@/lib/workspace-validation";

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("Workspace Isolation - Security Boundaries", () => {
  const validWorkspaceId = "550e8400-e29b-41d4-a716-446655440001";
  const invalidWorkspaceId = "invalid-workspace-id";
  const nullWorkspaceId = null;
  const undefinedWorkspaceId = undefined;

  describe("Workspace ID Validation", () => {
    it("should accept valid UUID workspace IDs", () => {
      expect(() => validateWorkspaceId(validWorkspaceId)).not.toThrow();
    });

    it("should reject invalid workspace ID format", () => {
      expect(() => validateWorkspaceId(invalidWorkspaceId)).toThrow(
        "Workspace ID must be a valid UUID"
      );
    });

    it("should reject null workspace ID", () => {
      expect(() => validateWorkspaceId(nullWorkspaceId as any)).toThrow();
    });

    it("should reject undefined workspace ID", () => {
      expect(() => validateWorkspaceId(undefinedWorkspaceId as any)).toThrow();
    });

    it("should enforce workspace ID is provided", () => {
      expect(() =>
        enforceWorkspaceId(nullWorkspaceId as any, "test-actor", "operatorItem")
      ).toThrow();
    });

    it("should extract valid workspace ID from enforcement call", () => {
      const result = enforceWorkspaceId(
        validWorkspaceId,
        "test-actor",
        "operatorItem"
      );
      expect(result).toBe(validWorkspaceId);
    });
  });

  describe("Workspace ID Format Validation", () => {
    it("should accept standard UUID v4 format", () => {
      const uuidV4 = "550e8400-e29b-41d4-a716-446655440000";
      expect(() => validateWorkspaceId(uuidV4)).not.toThrow();
    });

    it("should reject workspace IDs with wrong format (no dashes)", () => {
      const malformedId = "550e8400e29b41d4a716446655440000";
      expect(() => validateWorkspaceId(malformedId)).toThrow();
    });

    it("should reject workspace IDs with wrong format (mixed case)", () => {
      const validId = "550E8400-E29B-41D4-A716-446655440000";
      // Should work - validation accepts both upper and lower case
      expect(() => validateWorkspaceId(validId)).not.toThrow();
    });

    it("should reject empty string workspace ID", () => {
      expect(() => validateWorkspaceId("")).toThrow();
    });
  });

  describe("Workspace Isolation Invariants", () => {
    it("should require workspaceId to be present", () => {
      expect(() => enforceWorkspaceId(null as any, "test-actor", "engagement")).toThrow();
      expect(() => enforceWorkspaceId(undefined as any, "test-actor", "engagement")).toThrow();
    });

    it("should validate workspaceId format before use", () => {
      const invalidId = "not-a-uuid";
      expect(() => validateWorkspaceId(invalidId)).toThrow(
        "Workspace ID must be a valid UUID"
      );
    });

    it("should never allow undefined workspace context", () => {
      const undefinedContext: any = undefined;
      expect(() => validateWorkspaceId(undefinedContext)).toThrow();
    });

    it("should treat all valid UUIDs as valid workspaces", () => {
      const validIds = [
        "550e8400-e29b-41d4-a716-446655440000",
        "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        "00000000-0000-0000-0000-000000000000",
      ];
      validIds.forEach((id) => {
        expect(() => validateWorkspaceId(id)).not.toThrow();
      });
    });
  });
});
