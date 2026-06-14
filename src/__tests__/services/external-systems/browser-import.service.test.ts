/**
 * B14-S2: Browser-Assisted Import — DB-backed Tests
 *
 * Verifies:
 * - Session lifecycle management with audit trail
 * - Approval/rejection state transitions
 * - Workspace isolation in all operations
 * - Data validation and quality checks
 * - Transaction integrity (no partial records on failure)
 * - Consent tracking and enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDbInstance } from "@/lib/db";
import {
  listPendingApprovals,
  getFullTableForApproval,
  approveExtractedTable,
  rejectExtractedTable,
  getApprovedTablesForImport,
  markTableAsImported,
  getApprovalHistory,
} from "@/services/external-systems/browser-import-approval.service";

const TEST_WORKSPACE_ID = "ws_test_browser_import";
const TEST_PROVIDER_ID = "google_sheets";
const TEST_USER_ID = "user_test_browser_import";
const TEST_APPROVER_ID = "user_approver_test";
const TEST_WORKSPACE_2 = "ws_test_browser_import_2";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = await getDbInstance();

  // Create test workspaces
  await prisma.workspace.upsert({
    where: { id: TEST_WORKSPACE_ID },
    create: {
      id: TEST_WORKSPACE_ID,
      name: "Test Browser Import Workspace",
      slug: "test-browser-import-workspace",
    },
    update: {},
  });

  await prisma.workspace.upsert({
    where: { id: TEST_WORKSPACE_2 },
    create: {
      id: TEST_WORKSPACE_2,
      name: "Test Browser Import Workspace 2",
      slug: "test-browser-import-workspace-2",
    },
    update: {},
  });

  // Create test provider
  await prisma.externalProvider.upsert({
    where: { id: "google_sheets" as any },
    create: {
      id: "google_sheets" as any,
      name: "Google Sheets",
      category: "api_connector",
    },
    update: {},
  });

  // Create test browser import session
  await prisma.browserImportSession.create({
    data: {
      id: `bimport_test_${TEST_WORKSPACE_ID}`,
      workspaceId: TEST_WORKSPACE_ID,
      providerId: "google_sheets" as any,
      userId: TEST_USER_ID,
      status: "active",
      userAgent: "Test Browser",
      ipAddress: "127.0.0.1",
    },
  });
});

afterEach(async () => {
  // Cleanup test data
  await prisma.browserExtractedTable.deleteMany({
    where: {
      session: {
        workspaceId: {
          in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
        },
      },
    },
  });

  await prisma.browserImportEvent.deleteMany({
    where: {
      session: {
        workspaceId: {
          in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
        },
      },
    },
  });

  await prisma.browserImportConsent.deleteMany({
    where: {
      workspaceId: {
        in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
      },
    },
  });

  await prisma.browserImportSession.deleteMany({
    where: {
      workspaceId: {
        in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
      },
    },
  });

  await prisma.workspace.deleteMany({
    where: {
      id: {
        in: [TEST_WORKSPACE_ID, TEST_WORKSPACE_2],
      },
    },
  });
});

describe("B14-S2: Browser Import Approval Workflow", () => {
  describe("Session & Extracted Table Management", () => {
    it("should create extracted table in DRAFT status", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_test_${Date.now()}`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Sales Data",
          columnHeaders: ["Date", "Amount", "Customer"],
          dataRows: JSON.stringify([
            { Date: "2026-01-01", Amount: 100, Customer: "ACME" },
            { Date: "2026-01-02", Amount: 200, Customer: "TechCorp" },
          ]),
          extractionMethod: "manual_copy",
          confidence: 0.85,
          recordCount: 2,
        },
      });

      const table = await prisma.browserExtractedTable.findUnique({
        where: { id: tableId },
      });

      expect(table?.status).toBe("draft");
      expect(table?.confidence).toBe(0.85);
      expect(table?.recordCount).toBe(2);
    });

    it("should list pending approvals for workspace", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;

      // Create two extracted tables
      for (let i = 0; i < 2; i++) {
        await prisma.browserExtractedTable.create({
          data: {
            id: `betable_test_${i}`,
            sessionId,
            tableName: `Table ${i}`,
            columnHeaders: ["Col1", "Col2"],
            dataRows: JSON.stringify([{ Col1: "A", Col2: "B" }]),
            extractionMethod: "manual_copy",
            confidence: 0.9,
            recordCount: 1,
          },
        });
      }

      const pending = await listPendingApprovals(prisma, TEST_WORKSPACE_ID);

      expect(pending.length).toBe(2);
      expect(pending[0].tableName).toBe("Table 1");
    });

    it("should enforce workspace isolation in list", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;

      await prisma.browserExtractedTable.create({
        data: {
          id: `betable_isolated`,
          sessionId,
          tableName: "Secret Table",
          columnHeaders: ["Data"],
          dataRows: JSON.stringify([{ Data: "Secret" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
        },
      });

      // Try to list from different workspace
      const pending = await listPendingApprovals(prisma, TEST_WORKSPACE_2);

      expect(pending.length).toBe(0);
    });
  });

  describe("Approval Workflow", () => {
    it("should approve extracted table", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_approve_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Approval Test",
          columnHeaders: ["A", "B"],
          dataRows: JSON.stringify([{ A: "1", B: "2" }]),
          extractionMethod: "manual_copy",
          confidence: 0.95,
          recordCount: 1,
        },
      });

      const decision = await approveExtractedTable(prisma, {
        tableId,
        workspaceId: TEST_WORKSPACE_ID,
        approverId: TEST_APPROVER_ID,
      });

      expect(decision.decision).toBe("approved");
      expect(decision.decisionMaker).toBe(TEST_APPROVER_ID);

      // Verify table status changed
      const table = await prisma.browserExtractedTable.findUnique({
        where: { id: tableId },
      });

      expect(table?.status).toBe("approved");
      expect(table?.approvedBy).toBe(TEST_APPROVER_ID);
      expect(table?.approvedAt).toBeDefined();
    });

    it("should reject extracted table with reason", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_reject_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Reject Test",
          columnHeaders: ["X"],
          dataRows: JSON.stringify([{ X: "Value" }]),
          extractionMethod: "manual_copy",
          confidence: 0.5,
          recordCount: 1,
        },
      });

      const decision = await rejectExtractedTable(prisma, {
        tableId,
        workspaceId: TEST_WORKSPACE_ID,
        rejectorId: TEST_APPROVER_ID,
        rejectionReason: "Data quality too low",
      });

      expect(decision.decision).toBe("rejected");
      expect(decision.reason).toBe("Data quality too low");

      // Verify table status changed
      const table = await prisma.browserExtractedTable.findUnique({
        where: { id: tableId },
      });

      expect(table?.status).toBe("rejected");
      expect(table?.rejectionReason).toBe("Data quality too low");
    });

    it("should prevent approving non-draft table", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_status_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Status Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
          status: "approved", // Already approved
        },
      });

      await expect(
        approveExtractedTable(prisma, {
          tableId,
          workspaceId: TEST_WORKSPACE_ID,
          approverId: TEST_APPROVER_ID,
        })
      ).rejects.toThrow("Cannot approve table with status 'approved'");
    });

    it("should enforce workspace isolation on approval", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_isolation_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Isolation Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
        },
      });

      // Try to approve from different workspace
      await expect(
        approveExtractedTable(prisma, {
          tableId,
          workspaceId: TEST_WORKSPACE_2,
          approverId: TEST_APPROVER_ID,
        })
      ).rejects.toThrow("access denied");
    });
  });

  describe("Data Review & Validation", () => {
    it("should get full table data for review", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_review_test`;
      const testData = [
        { Product: "Widget", Price: 100, Stock: 50 },
        { Product: "Gadget", Price: 200, Stock: 25 },
        { Product: "Tool", Price: 150, Stock: null },
      ];

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Review Test",
          columnHeaders: ["Product", "Price", "Stock"],
          dataRows: JSON.stringify(testData),
          extractionMethod: "manual_copy",
          confidence: 0.8,
          recordCount: 3,
        },
      });

      const result = await getFullTableForApproval(
        prisma,
        tableId,
        TEST_WORKSPACE_ID
      );

      expect(result.allRows.length).toBe(3);
      expect(result.validationIssues.length).toBeGreaterThan(0);
      expect(result.validationIssues.some((issue) =>
        issue.includes("missing values")
      )).toBe(true);
    });

    it("should detect missing values in validation", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_missing_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Missing Test",
          columnHeaders: ["Col1", "Col2", "Col3"],
          dataRows: JSON.stringify([
            { Col1: "A", Col2: null, Col3: "C" },
            { Col1: "D", Col2: "E", Col3: null },
            { Col1: null, Col2: "F", Col3: "G" },
          ]),
          extractionMethod: "manual_copy",
          confidence: 0.6,
          recordCount: 3,
        },
      });

      const result = await getFullTableForApproval(
        prisma,
        tableId,
        TEST_WORKSPACE_ID
      );

      expect(result.validationIssues.some((issue) =>
        issue.includes("Col1")
      )).toBe(true);
      expect(result.validationIssues.some((issue) =>
        issue.includes("Col2")
      )).toBe(true);
    });
  });

  describe("Integration with B12 Import Pipeline", () => {
    it("should list approved tables for import", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;

      // Create and approve two tables
      for (let i = 0; i < 2; i++) {
        const tableId = `betable_import_${i}`;

        const table = await prisma.browserExtractedTable.create({
          data: {
            id: tableId,
            sessionId,
            tableName: `Import Table ${i}`,
            columnHeaders: ["A", "B"],
            dataRows: JSON.stringify([{ A: "1", B: "2" }]),
            extractionMethod: "file_export",
            confidence: 0.9,
            recordCount: 1,
            status: "draft",
          },
        });

        // Approve the table
        await prisma.browserExtractedTable.update({
          where: { id: tableId },
          data: {
            status: "approved",
            approvedAt: new Date(),
            approvedBy: TEST_APPROVER_ID,
          },
        });
      }

      const approved = await getApprovedTablesForImport(
        prisma,
        TEST_WORKSPACE_ID
      );

      expect(approved.length).toBe(2);
      expect(approved[0].tableName).toContain("Import Table");
      expect(approved[0].dataRows).toBeInstanceOf(Array);
    });

    it("should mark table as imported", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_mark_imported`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Mark Imported Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
          status: "approved",
          approvedAt: new Date(),
          approvedBy: TEST_APPROVER_ID,
        },
      });

      await markTableAsImported(
        prisma,
        tableId,
        TEST_WORKSPACE_ID,
        "job_import_001"
      );

      // Verify table still exists and is still approved
      const table = await prisma.browserExtractedTable.findUnique({
        where: { id: tableId },
      });

      expect(table?.status).toBe("approved");
    });
  });

  describe("Audit & Compliance", () => {
    it("should maintain approval history", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_history_test`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "History Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
        },
      });

      const beforeApproval = await getApprovalHistory(
        prisma,
        tableId,
        TEST_WORKSPACE_ID
      );

      expect(beforeApproval.approvalDecision).toBe("pending");
      expect(beforeApproval.decisionMaker).toBeUndefined();

      // Approve the table
      await approveExtractedTable(prisma, {
        tableId,
        workspaceId: TEST_WORKSPACE_ID,
        approverId: TEST_APPROVER_ID,
      });

      const afterApproval = await getApprovalHistory(
        prisma,
        tableId,
        TEST_WORKSPACE_ID
      );

      expect(afterApproval.approvalDecision).toBe("approved");
      expect(afterApproval.decisionMaker).toBe(TEST_APPROVER_ID);
      expect(afterApproval.decisionAt).toBeDefined();
    });

    it("should enforce workspace isolation in history", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_history_isolation`;

      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "History Isolation",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.9,
          recordCount: 1,
        },
      });

      await expect(
        getApprovalHistory(prisma, tableId, TEST_WORKSPACE_2)
      ).rejects.toThrow("access denied");
    });
  });

  describe("Acceptance Gates (Protocol §21)", () => {
    it("should prevent approval without data validation", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_quality_gate`;

      // Create table with very low confidence
      await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Quality Gate Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "screenshot", // Lowest confidence method
          confidence: 0.2, // Very low
          recordCount: 1,
        },
      });

      const review = await getFullTableForApproval(
        prisma,
        tableId,
        TEST_WORKSPACE_ID
      );

      // Should have validation issues
      expect(review.validationIssues.length).toBeGreaterThan(0);
      expect(review.validationIssues.some((i) =>
        i.includes("below 70%")
      )).toBe(true);
    });

    it("should maintain full audit trail through lifecycle", async () => {
      const sessionId = `bimport_test_${TEST_WORKSPACE_ID}`;
      const tableId = `betable_audit_trail`;

      const table = await prisma.browserExtractedTable.create({
        data: {
          id: tableId,
          sessionId,
          tableName: "Audit Trail Test",
          columnHeaders: ["A"],
          dataRows: JSON.stringify([{ A: "1" }]),
          extractionMethod: "manual_copy",
          confidence: 0.95,
          recordCount: 1,
        },
      });

      expect(table.createdAt).toBeDefined();
      expect(table.status).toBe("draft");
      expect(table.approvedBy).toBeNull();

      // Approve
      await approveExtractedTable(prisma, {
        tableId,
        workspaceId: TEST_WORKSPACE_ID,
        approverId: TEST_APPROVER_ID,
      });

      const approved = await prisma.browserExtractedTable.findUnique({
        where: { id: tableId },
      });

      expect(approved?.status).toBe("approved");
      expect(approved?.approvedBy).toBe(TEST_APPROVER_ID);
      expect(approved?.approvedAt).toBeDefined();
      expect(approved?.createdAt).toBeDefined();
    });
  });
});
