import { describe, it, expect } from "vitest";
import {
  isSchemaDriftError,
  extractMissingColumn,
  classifyDbRuntimeError,
  isSchemaDriftResponseBody,
  COLUMN_TO_MIGRATION,
} from "@/lib/schema-drift";

/**
 * Phase 4 Item 1 — schema-drift classifier unit tests (pure; no DB, no mocks of DB behaviour).
 * The companion real-DB test (schema-drift.db.test.ts) proves the classifier on an ACTUAL
 * Prisma P2022 thrown by Postgres; these cover the shapes and the migration mapping.
 */

// Shape 1: Prisma P2022 with driver-adapter cause (the exact shape captured in Phase 3).
const p2022DriverAdapter = Object.assign(new Error("\nInvalid `db.workspaceMembership.findFirst()` invocation"), {
  code: "P2022",
  meta: {
    modelName: "WorkspaceMembership",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "42703",
        originalMessage: "column workspace_memberships.primary_auth_method does not exist",
        kind: "ColumnNotFound",
        column: "workspace_memberships.primary_auth_method",
      },
    },
  },
});

// Shape 2: Prisma P2022 with a flat meta.column (no driver adapter).
const p2022Flat = Object.assign(new Error("column does not exist"), {
  code: "P2022",
  meta: { column: "workspace_memberships.allowed_task_types" },
});

// Shape 3: only a message (no structured meta).
const messageOnly = new Error('column "workspace_memberships.designation" does not exist');

describe("schema-drift classifier", () => {
  describe("isSchemaDriftError", () => {
    it("detects P2022 with a driver-adapter ColumnNotFound cause", () => {
      expect(isSchemaDriftError(p2022DriverAdapter)).toBe(true);
    });
    it("detects P2022 with flat meta.column", () => {
      expect(isSchemaDriftError(p2022Flat)).toBe(true);
    });
    it("detects a bare 'column ... does not exist' message", () => {
      expect(isSchemaDriftError(messageOnly)).toBe(true);
    });
    it("detects a 42703 driver-adapter cause even without P2022 code", () => {
      const e = Object.assign(new Error("boom"), {
        meta: { driverAdapterError: { cause: { originalCode: "42703" } } },
      });
      expect(isSchemaDriftError(e)).toBe(true);
    });
    it("returns false for a generic error", () => {
      expect(isSchemaDriftError(new Error("something else failed"))).toBe(false);
    });
    it("returns false for a different Prisma code (P2002 unique constraint)", () => {
      expect(isSchemaDriftError(Object.assign(new Error("unique"), { code: "P2002" }))).toBe(false);
    });
    it("returns false for null/undefined/string", () => {
      expect(isSchemaDriftError(null)).toBe(false);
      expect(isSchemaDriftError(undefined)).toBe(false);
      expect(isSchemaDriftError("plain string")).toBe(false);
    });
  });

  describe("extractMissingColumn", () => {
    it("extracts table+column from driver-adapter cause", () => {
      expect(extractMissingColumn(p2022DriverAdapter)).toEqual({
        table: "workspace_memberships",
        column: "primary_auth_method",
      });
    });
    it("extracts table+column from flat meta.column", () => {
      expect(extractMissingColumn(p2022Flat)).toEqual({
        table: "workspace_memberships",
        column: "allowed_task_types",
      });
    });
    it("extracts table+column from the message", () => {
      expect(extractMissingColumn(messageOnly)).toEqual({
        table: "workspace_memberships",
        column: "designation",
      });
    });
    it("returns null for a non-drift error", () => {
      expect(extractMissingColumn(new Error("nope"))).toBeNull();
    });
  });

  describe("classifyDbRuntimeError", () => {
    it("maps a known missing column to the migration that introduces it", () => {
      const info = classifyDbRuntimeError(p2022DriverAdapter);
      expect(info.kind).toBe("schema_drift");
      expect(info.table).toBe("workspace_memberships");
      expect(info.column).toBe("primary_auth_method");
      expect(info.introducedByMigration).toBe("20260625120000_owner_mode_execution_tables");
      expect(info.summary).toContain("20260625120000_owner_mode_execution_tables");
      // operator-safe: no raw connection strings / secrets
      expect(info.summary.toLowerCase()).not.toContain("postgres://");
      expect(info.summary.toLowerCase()).not.toContain("password");
    });
    it("classifies drift even when the column is not in the manifest (no migration mapping)", () => {
      const e = Object.assign(new Error('column "some_table.unknown_col" does not exist'), { code: "P2022" });
      const info = classifyDbRuntimeError(e);
      expect(info.kind).toBe("schema_drift");
      expect(info.introducedByMigration).toBeUndefined();
      expect(info.summary).toContain("pending migration");
    });
    it("classifies a non-drift error as 'other'", () => {
      const info = classifyDbRuntimeError(new Error("connection refused"));
      expect(info.kind).toBe("other");
    });
  });

  describe("isSchemaDriftResponseBody", () => {
    it("is true when a response body classifies as schema_drift", () => {
      expect(isSchemaDriftResponseBody({ classification: "schema_drift" })).toBe(true);
    });
    it("is false for other classifications or malformed bodies", () => {
      expect(isSchemaDriftResponseBody({ classification: "membership_missing" })).toBe(false);
      expect(isSchemaDriftResponseBody({})).toBe(false);
      expect(isSchemaDriftResponseBody(null)).toBe(false);
    });
  });

  describe("COLUMN_TO_MIGRATION manifest", () => {
    it("covers all workspace_memberships columns added by 20260625120000", () => {
      const expected = [
        "accepted_at",
        "allowed_task_types",
        "authority_limits",
        "created_by_owner_id",
        "designation",
        "invitation_status",
        "invited_at",
        "manager_id",
        "offboarded_at",
        "primary_auth_method",
        "suspended_at",
      ];
      for (const col of expected) {
        expect(COLUMN_TO_MIGRATION[`workspace_memberships.${col}`]).toBe(
          "20260625120000_owner_mode_execution_tables"
        );
      }
    });
  });
});
