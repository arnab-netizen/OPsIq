/**
 * Data Export Service
 *
 * Exports user/workspace data to CSV or JSON format with proper DTO redaction.
 * Used for GDPR compliance, data portability, and backups.
 */

export interface ExportOptions {
  format: "csv" | "json";
  includeAuditTrail?: boolean;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
}

export interface ExportedData {
  workspaceId: string;
  exportedAt: Date;
  format: "csv" | "json";
  tables: ExportedTable[];
  auditTrail?: ExportedAuditEvent[];
}

export interface ExportedTable {
  name: string;
  rowCount: number;
  data: unknown[];
  columns: string[];
}

export interface ExportedAuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  workspaceId: string;
}

/**
 * Convert exported data to CSV format
 */
export function convertToCSV(exportedData: ExportedData): string {
  const lines: string[] = [];

  // Header with metadata
  lines.push(`# Rebilix Data Export`);
  lines.push(`# Workspace: ${exportedData.workspaceId}`);
  lines.push(`# Exported: ${exportedData.exportedAt.toISOString()}`);
  lines.push(``);

  // Export each table
  exportedData.tables.forEach((table) => {
    lines.push(`## Table: ${table.name}`);
    lines.push(`# Rows: ${table.rowCount}`);

    // CSV header
    lines.push(table.columns.map((col) => `"${col}"`).join(","));

    // CSV data rows
    table.data.forEach((row: any) => {
      const values = table.columns.map((col) => {
        const value = row[col];
        if (value === null || value === undefined) {
          return '""';
        }
        if (typeof value === "string") {
          // Escape quotes and wrap in quotes
          return `"${value.replace(/"/g, '""')}"`;
        }
        if (typeof value === "object") {
          // Serialize objects as JSON
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${value}"`;
      });
      lines.push(values.join(","));
    });

    lines.push(""); // Blank line between tables
  });

  // Audit trail if included
  if (exportedData.auditTrail && exportedData.auditTrail.length > 0) {
    lines.push(`## Table: audit_events`);
    lines.push(`# Rows: ${exportedData.auditTrail.length}`);

    const auditColumns = [
      "id",
      "timestamp",
      "userId",
      "action",
      "entityType",
      "entityId",
    ];
    lines.push(auditColumns.map((col) => `"${col}"`).join(","));

    exportedData.auditTrail.forEach((event) => {
      const values = [
        event.id,
        event.timestamp.toISOString(),
        event.userId,
        event.action,
        event.entityType,
        event.entityId,
      ].map((val) => `"${val}"`);
      lines.push(values.join(","));
    });
  }

  return lines.join("\n");
}

/**
 * Convert exported data to JSON format
 */
export function convertToJSON(exportedData: ExportedData): string {
  const output = {
    metadata: {
      workspaceId: exportedData.workspaceId,
      exportedAt: exportedData.exportedAt.toISOString(),
      format: exportedData.format,
    },
    tables: exportedData.tables.map((table) => ({
      name: table.name,
      rowCount: table.rowCount,
      columns: table.columns,
      data: table.data,
    })),
    ...(exportedData.auditTrail && {
      auditTrail: exportedData.auditTrail.map((event) => ({
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        userId: event.userId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        changes: event.changes,
      })),
    }),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Generate export file name
 */
export function generateExportFileName(
  workspaceId: string,
  format: "csv" | "json"
): string {
  const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const sanitizedWorkspaceId = workspaceId.substring(0, 8);
  const ext = format === "csv" ? "csv" : "json";
  return `opsiq-export-${sanitizedWorkspaceId}-${timestamp}.${ext}`;
}

/**
 * Generate GDPR export data package
 */
export function generateGDPRExportMetadata(workspaceId: string): string {
  const metadata = {
    exportType: "GDPR-Data-Portability",
    exportedAt: new Date().toISOString(),
    workspaceId,
    format: "JSON",
    tables: [
      "workspaces",
      "users",
      "actions",
      "decisions",
      "recommendations",
      "experiments",
      "engagements",
      "findings",
      "audit_events",
    ],
    note: "This export contains all personal data associated with the workspace.",
    contact: "privacy@opsiq.app",
    version: "1.0",
  };

  return JSON.stringify(metadata, null, 2);
}

/**
 * Validate export data before conversion
 */
export function validateExportData(data: ExportedData): string[] {
  const errors: string[] = [];

  if (!data.workspaceId) {
    errors.push("workspaceId is required");
  }

  if (!data.tables || data.tables.length === 0) {
    errors.push("At least one table required for export");
  }

  data.tables.forEach((table) => {
    if (!table.name) {
      errors.push("Table name is required");
    }
    if (!Array.isArray(table.columns) || table.columns.length === 0) {
      errors.push(`Table ${table.name}: columns array is required`);
    }
    if (!Array.isArray(table.data)) {
      errors.push(`Table ${table.name}: data array is required`);
    }
    if (table.rowCount !== table.data.length) {
      errors.push(
        `Table ${table.name}: rowCount mismatch (declared ${table.rowCount}, actual ${table.data.length})`
      );
    }
  });

  if (data.auditTrail) {
    if (!Array.isArray(data.auditTrail)) {
      errors.push("auditTrail must be an array");
    }
  }

  return errors;
}

/**
 * Create export package with metadata
 */
export interface ExportPackage {
  data: string; // CSV or JSON content
  metadata: string; // JSON metadata
  fileName: string;
}

export function createExportPackage(
  exportedData: ExportedData
): ExportPackage {
  const format = exportedData.format || "json";
  const data =
    format === "csv" ? convertToCSV(exportedData) : convertToJSON(exportedData);

  return {
    data,
    metadata: generateGDPRExportMetadata(exportedData.workspaceId),
    fileName: generateExportFileName(exportedData.workspaceId, format),
  };
}

/**
 * Check if data contains sensitive fields (cost, internal, etc.)
 */
export function hasSensitiveFields(data: unknown): boolean {
  const sensitivePatterns = [
    /cost/i,
    /price/i,
    /revenue/i,
    /margin/i,
    /internal/i,
    /secret/i,
    /token/i,
    /key/i,
  ];

  const jsonStr = JSON.stringify(data);
  return sensitivePatterns.some((pattern) => pattern.test(jsonStr));
}
