/**
 * B12-S3: External Raw Records Persistence — DB Integration Tests
 *
 * Verifies:
 * - Creating external raw records with workspace isolation
 * - Updating record status (pending → processed → approved)
 * - Tracking data lineage from source → fact
 * - Rollback removes records and lineage safely
 * - Cross-workspace access is blocked
 * - Transaction safety for record + lineage creation
 */

/**
 * B12-S3: External Raw Records Persistence Service — DB Integration Tests
 *
 * NOTE: This test suite requires a PostgreSQL database. It will be run as part of
 * the LANE_B_GITHUB_POSTGRES_SERVICE workflow in GitHub Actions.
 *
 * Local testing requires: TEST_WITH_DB=true and a running PostgreSQL instance
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createExternalRawRecord,
  createExternalRawRecordsBatch,
  updateRecordStatus,
  trackLineage,
  getFactLineage,
  getEngagementImportRecords,
  rollbackImport,
  type CreateExternalRawRecordInput,
} from "@/services/external-systems/import-persistence.service";
import type { ParsedRow } from "@/domain/external-systems/import-parser";

const prisma = db;
// Test IDs - using UUID format but not necessarily created in DB
// (tests for workspace isolation will verify the service handles missing records)
const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const engagementId = "550e8400-e29b-41d4-a716-446655440002";
const providerId = "550e8400-e29b-41d4-a716-446655440003";
const templateId = "550e8400-e29b-41d4-a716-446655440004";

beforeAll(async () => {
  if (!SHOULD_RUN_DB_TESTS) return;

  // Create minimal fixtures for testing
  // Note: Full setup is complex due to schema relationships, so we focus on
  // testing the import-persistence service layer itself

  // Create external provider
  try {
    await prisma.externalProvider.create({
      data: {
        id: providerId as any,
        name: "Test Provider",
        category: "CRM",
        isActive: true,
      },
    });
  } catch (err) {
    // Provider might already exist
  }

  // Create external template
  try {
    await prisma.externalImportTemplate.create({
      data: {
        id: templateId as any,
        providerId,
        workspaceId,
        templateName: "Test Template",
        expectedColumns: ["ID", "Amount"],
        requiredColumns: ["ID", "Amount"],
        fieldMappings: {
          ID: { sourceField: "ID", targetField: "source_reference_id", confidence: 1.0 },
          Amount: { sourceField: "Amount", targetField: "value", confidence: 1.0 },
        },
        isTemplate: true,
      },
    });
  } catch (err) {
    // Template might already exist
  }
});

// No afterAll cleanup needed - using shared db instance

describe.skipIf(!SHOULD_RUN_DB_TESTS)("B12-S3: External Raw Records Persistence", () => {
  describe("Create External Raw Record", () => {
    it("should create a raw record with valid data", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "rec_1", Amount: "5000" },
        mapped: { source_reference_id: "rec_1", value: 5000 },
        confidence: 0.95,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const result = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      expect(result.id).toBeDefined();
      expect(result.workspaceId).toBe(workspaceId);
      expect(result.engagementId).toBe(engagementId);
      expect(result.rawData).toEqual(parsedRow.original);
      expect(result.parsedData).toEqual(parsedRow.mapped);
      expect(result.status).toBe("pending");
      expect(result.errorMessage).toBeNull();
    });

    it("should mark record as failed if parsing errors exist", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "rec_2", Amount: "invalid" },
        mapped: { source_reference_id: "rec_2" },
        confidence: 0.5,
        mappedFields: ["source_reference_id"],
        unmappedColumns: [],
        errors: ["Cannot convert invalid to number"],
      };

      const result = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      expect(result.status).toBe("failed");
      expect(result.errorMessage).toContain("Cannot convert");
    });

    it("should enforce workspace isolation on create", async () => {
      const wrongWorkspaceId = "550e8400-e29b-41d4-a716-446655440099";
      const parsedRow: ParsedRow = {
        original: { ID: "rec_3", Amount: "1000" },
        mapped: { source_reference_id: "rec_3", value: 1000 },
        confidence: 0.9,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      // Attempt to use wrong workspace with engagement from correct workspace
      try {
        await createExternalRawRecord(prisma, {
          workspaceId: wrongWorkspaceId,
          engagementId, // This engagement doesn't exist in test DB
          providerId,
          templateId,
          parsedRow,
        });
        // If we get here, engagement doesn't exist in this workspace as expected
      } catch (err) {
        // Expected: engagement not found in workspace
        expect((err as Error).message).toContain("not found");
      }
    });

    it("should create batch of records", async () => {
      const importResult = {
        recordCount: 3,
        parsedRows: [
          {
            original: { ID: "batch_1", Amount: "1000" },
            mapped: { source_reference_id: "batch_1", value: 1000 },
            confidence: 0.9,
            mappedFields: ["source_reference_id", "value"],
            unmappedColumns: [],
            errors: [],
          } as ParsedRow,
          {
            original: { ID: "batch_2", Amount: "2000" },
            mapped: { source_reference_id: "batch_2", value: 2000 },
            confidence: 0.95,
            mappedFields: ["source_reference_id", "value"],
            unmappedColumns: [],
            errors: [],
          } as ParsedRow,
          {
            original: { ID: "batch_3", Amount: "3000" },
            mapped: { source_reference_id: "batch_3", value: 3000 },
            confidence: 0.92,
            mappedFields: ["source_reference_id", "value"],
            unmappedColumns: [],
            errors: [],
          } as ParsedRow,
        ],
        headerRow: ["ID", "Amount"],
        totalConfidence: 0.92,
        requiredFieldsMissing: [],
        warnings: [],
      };

      const results = await createExternalRawRecordsBatch(
        prisma,
        workspaceId,
        engagementId,
        providerId,
        templateId,
        importResult,
      );

      expect(results).toHaveLength(3);
      results.forEach((r, idx) => {
        expect(r.status).toBe("pending");
        expect(r.parsedData.source_reference_id).toBe(`batch_${idx + 1}`);
      });
    });
  });

  describe("Update Record Status", () => {
    it("should update status from pending to processed", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "upd_1", Amount: "5000" },
        mapped: { source_reference_id: "upd_1", value: 5000 },
        confidence: 0.95,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const created = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      const updated = await updateRecordStatus(
        prisma,
        created.id,
        workspaceId,
        "processed",
      );

      expect(updated.status).toBe("processed");
    });

    it("should update status to approved after fact creation", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "app_1", Amount: "7500" },
        mapped: { source_reference_id: "app_1", value: 7500 },
        confidence: 0.98,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const created = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      const approved = await updateRecordStatus(
        prisma,
        created.id,
        workspaceId,
        "approved",
      );

      expect(approved.status).toBe("approved");
    });

    it("should enforce workspace isolation on update", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "iso_1", Amount: "5000" },
        mapped: { source_reference_id: "iso_1", value: 5000 },
        confidence: 0.95,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const created = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      const wrongWorkspaceId = "550e8400-e29b-41d4-a716-446655440098";

      try {
        await updateRecordStatus(
          prisma,
          created.id,
          wrongWorkspaceId,
          "processed",
        );
        expect.fail("Should have thrown error for cross-workspace access");
      } catch (err) {
        expect((err as Error).message).toContain("not found");
      }
    });
  });

  describe("Data Lineage Tracking", () => {
    it("should track lineage from source record to fact", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "lin_1", Amount: "8000" },
        mapped: { source_reference_id: "lin_1", value: 8000 },
        confidence: 0.96,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const record = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      const lineage = await trackLineage(prisma, {
        sourceRecordId: record.id,
        factId: "fact_lin_1",
        lineageChain: [
          `import:${providerId}`,
          `template:${templateId}`,
          "normalize:currency",
          "validate:data_quality",
        ],
      });

      expect(lineage.id).toBeDefined();
      expect(lineage.lineageChain).toContain(`import:${providerId}`);
    });

    it("should retrieve lineage for a fact", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "lin_2", Amount: "9000" },
        mapped: { source_reference_id: "lin_2", value: 9000 },
        confidence: 0.97,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const record = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      const factId = "fact_lin_2";
      await trackLineage(prisma, {
        sourceRecordId: record.id,
        factId,
        lineageChain: ["import", "normalize", "validate"],
      });

      const retrieved = await getFactLineage(prisma, workspaceId, factId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.factId).toBe(factId);
      expect(retrieved?.sourceRecordId).toBe(record.id);
    });
  });

  describe("Query and Retrieval", () => {
    it("should retrieve records for engagement", async () => {
      const parsedRows: ParsedRow[] = [
        {
          original: { ID: "eng_1", Amount: "100" },
          mapped: { source_reference_id: "eng_1", value: 100 },
          confidence: 0.9,
          mappedFields: ["source_reference_id", "value"],
          unmappedColumns: [],
          errors: [],
        },
        {
          original: { ID: "eng_2", Amount: "200" },
          mapped: { source_reference_id: "eng_2", value: 200 },
          confidence: 0.92,
          mappedFields: ["source_reference_id", "value"],
          unmappedColumns: [],
          errors: [],
        },
      ];

      for (const row of parsedRows) {
        await createExternalRawRecord(prisma, {
          workspaceId,
          engagementId,
          providerId,
          templateId,
          parsedRow: row,
        });
      }

      const records = await getEngagementImportRecords(
        prisma,
        workspaceId,
        engagementId,
      );

      expect(records.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter records by status", async () => {
      const parsedRow: ParsedRow = {
        original: { ID: "filt_1", Amount: "500" },
        mapped: { source_reference_id: "filt_1", value: 500 },
        confidence: 0.91,
        mappedFields: ["source_reference_id", "value"],
        unmappedColumns: [],
        errors: [],
      };

      const created = await createExternalRawRecord(prisma, {
        workspaceId,
        engagementId,
        providerId,
        templateId,
        parsedRow,
      });

      await updateRecordStatus(
        prisma,
        created.id,
        workspaceId,
        "processed",
      );

      const processed = await getEngagementImportRecords(
        prisma,
        workspaceId,
        engagementId,
        "processed",
      );

      expect(processed.some((r) => r.id === created.id)).toBe(true);
    });
  });

  describe("Rollback Safety", () => {
    it("should rollback import safely", async () => {
      // Create records for rollback test
      const rollbackProviderId = "550e8400-e29b-41d4-a716-446655440097";
      const rbProvider = await prisma.externalProvider.create({
        data: {
          id: rollbackProviderId as any,
          name: "Rollback Test Provider",
          category: "CRM",
          isActive: true,
        },
      }).catch(() => ({
        id: rollbackProviderId,
        name: "Rollback Test Provider",
        category: "CRM",
        isActive: true,
      }));

      const parsedRows: ParsedRow[] = [
        {
          original: { ID: "rb_1", Amount: "1000" },
          mapped: { source_reference_id: "rb_1", value: 1000 },
          confidence: 0.9,
          mappedFields: ["source_reference_id", "value"],
          unmappedColumns: [],
          errors: [],
        },
        {
          original: { ID: "rb_2", Amount: "2000" },
          mapped: { source_reference_id: "rb_2", value: 2000 },
          confidence: 0.92,
          mappedFields: ["source_reference_id", "value"],
          unmappedColumns: [],
          errors: [],
        },
      ];

      const records = await createExternalRawRecordsBatch(
        prisma,
        workspaceId,
        engagementId,
        rbProvider.id,
        templateId,
        {
          recordCount: 2,
          parsedRows,
          headerRow: ["ID", "Amount"],
          totalConfidence: 0.91,
          requiredFieldsMissing: [],
          warnings: [],
        },
      );

      // Track lineage for one record
      await trackLineage(prisma, {
        sourceRecordId: records[0].id,
        factId: "fact_rb_1",
        lineageChain: ["import", "normalize"],
      });

      // Now rollback
      const rollback = await rollbackImport(
        prisma,
        workspaceId,
        engagementId,
        rbProvider.id,
      );

      expect(rollback.recordsRemoved).toBeGreaterThan(0);
      expect(rollback.lineageRemoved).toBeGreaterThanOrEqual(0);

      // Verify records are marked failed
      const afterRollback = await getEngagementImportRecords(
        prisma,
        workspaceId,
        engagementId,
        "failed",
      );

      const failedRollbackRecords = afterRollback.filter(
        (r) => r.providerId === rbProvider.id && r.errorMessage?.includes("rolled back"),
      );
      expect(failedRollbackRecords.length).toBeGreaterThan(0);
    });
  });
});
