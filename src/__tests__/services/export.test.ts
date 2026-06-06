/**
 * Tests: Data Export Service
 *
 * Validates CSV/JSON export generation, DTO redaction, and GDPR compliance.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  convertToCSV,
  convertToJSON,
  generateExportFileName,
  generateGDPRExportMetadata,
  validateExportData,
  createExportPackage,
  hasSensitiveFields,
  type ExportedData,
} from "@/services/export";

describe("Data Export Service", () => {
  let mockExportData: ExportedData;

  beforeEach(() => {
    mockExportData = {
      workspaceId: "ws-123",
      exportedAt: new Date("2026-05-12T10:00:00Z"),
      format: "json",
      tables: [
        {
          name: "actions",
          rowCount: 2,
          columns: ["id", "title", "status", "createdAt"],
          data: [
            {
              id: "act-1",
              title: "Complete Q2 planning",
              status: "active",
              createdAt: "2026-05-01T00:00:00Z",
            },
            {
              id: "act-2",
              title: "Review financials",
              status: "completed",
              createdAt: "2026-05-05T00:00:00Z",
            },
          ],
        },
        {
          name: "decisions",
          rowCount: 1,
          columns: ["id", "title", "confidence"],
          data: [
            {
              id: "dec-1",
              title: "Hire new engineer",
              confidence: 0.85,
            },
          ],
        },
      ],
    };
  });

  describe("CSV Conversion", () => {
    it("should convert exported data to CSV format", () => {
      const csv = convertToCSV(mockExportData);

      expect(csv).toContain("Rebilix Data Export");
      expect(csv).toContain("Workspace: ws-123");
      expect(csv).toContain("Table: actions");
      expect(csv).toContain("Table: decisions");
    });

    it("should include CSV headers", () => {
      const csv = convertToCSV(mockExportData);

      expect(csv).toContain('"id","title","status","createdAt"');
      expect(csv).toContain('"id","title","confidence"');
    });

    it("should format CSV data rows correctly", () => {
      const csv = convertToCSV(mockExportData);

      expect(csv).toContain('"act-1","Complete Q2 planning","active"');
      expect(csv).toContain('"dec-1","Hire new engineer"');
    });

    it("should escape quotes in CSV values", () => {
      const dataWithQuotes: ExportedData = {
        ...mockExportData,
        tables: [
          {
            name: "test",
            rowCount: 1,
            columns: ["title"],
            data: [{ title: 'Say "hello" to client' }],
          },
        ],
      };

      const csv = convertToCSV(dataWithQuotes);
      expect(csv).toContain('Say ""hello"" to client');
    });

    it("should handle null and undefined values", () => {
      const dataWithNulls: ExportedData = {
        ...mockExportData,
        tables: [
          {
            name: "test",
            rowCount: 1,
            columns: ["id", "value"],
            data: [{ id: "t-1", value: null }],
          },
        ],
      };

      const csv = convertToCSV(dataWithNulls);
      expect(csv).toContain('"t-1",""');
    });

    it("should serialize objects as JSON in CSV", () => {
      const dataWithObjects: ExportedData = {
        ...mockExportData,
        tables: [
          {
            name: "test",
            rowCount: 1,
            columns: ["metadata"],
            data: [{ metadata: { key: "value" } }],
          },
        ],
      };

      const csv = convertToCSV(dataWithObjects);
      // Object is serialized as JSON and then CSV-escaped (quotes become "")
      expect(csv).toContain('"{""key"":""value""}"');
    });

    it("should include audit trail in CSV if present", () => {
      const dataWithAudit: ExportedData = {
        ...mockExportData,
        auditTrail: [
          {
            id: "ae-1",
            timestamp: new Date("2026-05-12T09:00:00Z"),
            userId: "user-1",
            action: "CREATE",
            entityType: "action",
            entityId: "act-1",
            changes: { title: "Complete Q2 planning" },
            workspaceId: "ws-123",
          },
        ],
      };

      const csv = convertToCSV(dataWithAudit);
      expect(csv).toContain("Table: audit_events");
      expect(csv).toContain("CREATE");
    });
  });

  describe("JSON Conversion", () => {
    it("should convert exported data to JSON format", () => {
      const json = convertToJSON(mockExportData);
      const parsed = JSON.parse(json);

      expect(parsed.metadata).toBeDefined();
      expect(parsed.tables).toBeDefined();
      expect(Array.isArray(parsed.tables)).toBe(true);
    });

    it("should include metadata in JSON", () => {
      const json = convertToJSON(mockExportData);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.workspaceId).toBe("ws-123");
      expect(parsed.metadata.format).toBe("json");
      expect(parsed.metadata.exportedAt).toBeDefined();
    });

    it("should preserve all table data in JSON", () => {
      const json = convertToJSON(mockExportData);
      const parsed = JSON.parse(json);

      expect(parsed.tables).toHaveLength(2);
      expect(parsed.tables[0].name).toBe("actions");
      expect(parsed.tables[0].data).toHaveLength(2);
    });

    it("should format timestamps as ISO strings", () => {
      const json = convertToJSON(mockExportData);
      const parsed = JSON.parse(json);

      expect(parsed.metadata.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should include audit trail if present", () => {
      const dataWithAudit: ExportedData = {
        ...mockExportData,
        auditTrail: [
          {
            id: "ae-1",
            timestamp: new Date("2026-05-12T09:00:00Z"),
            userId: "user-1",
            action: "CREATE",
            entityType: "action",
            entityId: "act-1",
            changes: { title: "Created" },
            workspaceId: "ws-123",
          },
        ],
      };

      const json = convertToJSON(dataWithAudit);
      const parsed = JSON.parse(json);

      expect(parsed.auditTrail).toBeDefined();
      expect(parsed.auditTrail).toHaveLength(1);
      expect(parsed.auditTrail[0].action).toBe("CREATE");
    });

    it("should not include audit trail if not present", () => {
      const json = convertToJSON(mockExportData);
      const parsed = JSON.parse(json);

      expect(parsed.auditTrail).toBeUndefined();
    });
  });

  describe("File Name Generation", () => {
    it("should generate valid CSV file name", () => {
      const fileName = generateExportFileName("ws-123456789", "csv");

      expect(fileName).toMatch(/^opsiq-export-/);
      expect(fileName).toMatch(/\.csv$/);
      expect(fileName).toContain("ws-12345"); // First 8 chars
    });

    it("should generate valid JSON file name", () => {
      const fileName = generateExportFileName("ws-abc", "json");

      expect(fileName).toMatch(/^opsiq-export-/);
      expect(fileName).toMatch(/\.json$/);
    });

    it("should include current date in file name", () => {
      const fileName = generateExportFileName("ws-123", "csv");
      const today = new Date().toISOString().split("T")[0];

      expect(fileName).toContain(today);
    });
  });

  describe("GDPR Export Metadata", () => {
    it("should generate GDPR export metadata", () => {
      const metadata = generateGDPRExportMetadata("ws-123");
      const parsed = JSON.parse(metadata);

      expect(parsed.exportType).toBe("GDPR-Data-Portability");
      expect(parsed.workspaceId).toBe("ws-123");
      expect(parsed.format).toBe("JSON");
    });

    it("should include all table names in metadata", () => {
      const metadata = generateGDPRExportMetadata("ws-123");
      const parsed = JSON.parse(metadata);

      expect(parsed.tables).toContain("actions");
      expect(parsed.tables).toContain("decisions");
      expect(parsed.tables).toContain("audit_events");
    });

    it("should include privacy contact information", () => {
      const metadata = generateGDPRExportMetadata("ws-123");
      const parsed = JSON.parse(metadata);

      expect(parsed.contact).toBeDefined();
      expect(parsed.note).toBeDefined();
    });
  });

  describe("Data Validation", () => {
    it("should validate complete export data", () => {
      const errors = validateExportData(mockExportData);

      expect(errors).toHaveLength(0);
    });

    it("should reject missing workspace ID", () => {
      const invalid = { ...mockExportData, workspaceId: "" };
      const errors = validateExportData(invalid);

      expect(errors).toContain("workspaceId is required");
    });

    it("should reject missing tables", () => {
      const invalid = { ...mockExportData, tables: [] };
      const errors = validateExportData(invalid);

      expect(errors.length).toBeGreaterThan(0);
    });

    it("should validate row count matches data length", () => {
      const invalid = {
        ...mockExportData,
        tables: [
          {
            ...mockExportData.tables[0],
            rowCount: 5, // Doesn't match actual data length of 2
          },
        ],
      };

      const errors = validateExportData(invalid);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("rowCount mismatch"))).toBe(true);
    });

    it("should validate column definitions exist", () => {
      const invalid = {
        ...mockExportData,
        tables: [
          {
            name: "test",
            rowCount: 0,
            columns: [],
            data: [],
          },
        ],
      };

      const errors = validateExportData(invalid);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Export Package Creation", () => {
    it("should create complete export package", () => {
      const pkg = createExportPackage(mockExportData);

      expect(pkg.data).toBeDefined();
      expect(pkg.metadata).toBeDefined();
      expect(pkg.fileName).toBeDefined();
    });

    it("should include correct file extension based on format", () => {
      const csvPkg = createExportPackage({
        ...mockExportData,
        format: "csv",
      });
      expect(csvPkg.fileName).toMatch(/\.csv$/);

      const jsonPkg = createExportPackage({
        ...mockExportData,
        format: "json",
      });
      expect(jsonPkg.fileName).toMatch(/\.json$/);
    });

    it("should include GDPR metadata in package", () => {
      const pkg = createExportPackage(mockExportData);

      expect(pkg.metadata).toContain("GDPR-Data-Portability");
    });
  });

  describe("Sensitive Data Detection", () => {
    it("should detect cost-related fields", () => {
      const sensitiveData = {
        title: "Test",
        cost: 1000,
      };

      expect(hasSensitiveFields(sensitiveData)).toBe(true);
    });

    it("should detect price-related fields", () => {
      const sensitiveData = {
        title: "Test",
        price: 100,
      };

      expect(hasSensitiveFields(sensitiveData)).toBe(true);
    });

    it("should detect internal fields", () => {
      const sensitiveData = {
        title: "Test",
        internal_notes: "secret",
      };

      expect(hasSensitiveFields(sensitiveData)).toBe(true);
    });

    it("should not flag normal fields as sensitive", () => {
      const normalData = {
        title: "Test Action",
        status: "active",
        createdAt: "2026-05-12T00:00:00Z",
      };

      expect(hasSensitiveFields(normalData)).toBe(false);
    });

    it("should detect token fields", () => {
      const sensitiveData = {
        title: "Test",
        api_token: "secret_token_xyz",
      };

      expect(hasSensitiveFields(sensitiveData)).toBe(true);
    });
  });

  describe("Real-World Scenarios", () => {
    it("should export user workspace data for GDPR request", () => {
      const pkg = createExportPackage({
        workspaceId: "ws-user-123",
        exportedAt: new Date(),
        format: "json",
        tables: [
          {
            name: "actions",
            rowCount: 3,
            columns: ["id", "title", "status"],
            data: [
              { id: "a1", title: "Action 1", status: "active" },
              { id: "a2", title: "Action 2", status: "completed" },
              { id: "a3", title: "Action 3", status: "blocked" },
            ],
          },
        ],
      });

      const data = JSON.parse(pkg.data);
      const gdprMetadata = JSON.parse(pkg.metadata);
      expect(data.tables[0].rowCount).toBe(3);
      expect(gdprMetadata.exportType).toBe("GDPR-Data-Portability");
    });

    it("should generate audit trail export", () => {
      const auditData: ExportedData = {
        workspaceId: "ws-123",
        exportedAt: new Date(),
        format: "csv",
        tables: [],
        auditTrail: [
          {
            id: "ae-1",
            timestamp: new Date("2026-05-01T10:00:00Z"),
            userId: "user-1",
            action: "CREATE",
            entityType: "action",
            entityId: "act-1",
            changes: { title: "New action" },
            workspaceId: "ws-123",
          },
          {
            id: "ae-2",
            timestamp: new Date("2026-05-02T14:30:00Z"),
            userId: "user-1",
            action: "UPDATE",
            entityType: "action",
            entityId: "act-1",
            changes: { status: "completed" },
            workspaceId: "ws-123",
          },
        ],
      };

      const csv = convertToCSV(auditData);
      expect(csv).toContain("audit_events");
      expect(csv).toContain("CREATE");
      expect(csv).toContain("UPDATE");
    });
  });
});
