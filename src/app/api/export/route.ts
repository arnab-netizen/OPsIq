import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextResponse } from "next/server";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  createExportPackage,
  validateExportData,
  type ExportedData,
  type ExportOptions,
} from "@/services/export";

/**
 * GET /api/export
 * Export workspace data (CSV or JSON)
 */
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Get format from query parameters
    const url = new URL(ctx.request?.url || "");
    const format = (url.searchParams.get("format") || "json") as
      | "json"
      | "csv";

  if (format !== "json" && format !== "csv") {
    throw new Error("Invalid format. Use 'json' or 'csv'");
  }

  // Build export data (mock - would query database in real implementation)
  const exportedData: ExportedData = {
    workspaceId,
    exportedAt: new Date(),
    format,
    tables: [
      {
        name: "actions",
        rowCount: 0,
        columns: [
          "id",
          "title",
          "status",
          "priority",
          "dueDate",
          "createdAt",
        ],
        data: [], // Would be populated from database
      },
      {
        name: "decisions",
        rowCount: 0,
        columns: [
          "id",
          "title",
          "status",
          "confidence",
          "createdAt",
        ],
        data: [], // Would be populated from database
      },
      {
        name: "engagements",
        rowCount: 0,
        columns: [
          "id",
          "clientName",
          "status",
          "startDate",
          "endDate",
          "createdAt",
        ],
        data: [], // Would be populated from database
      },
    ],
  };

  // Validate export data
  const errors = validateExportData(exportedData);
  if (errors.length > 0) {
    throw new Error(`Export validation failed: ${errors.join(', ')}`);
  }

  // Create export package
  const exportPackage = createExportPackage(exportedData);

  // Return with appropriate headers
  return new NextResponse(exportPackage.data, {
    status: 200,
    headers: {
      "content-type": format === "csv" ? "text/csv" : "application/json",
      "content-disposition": `attachment; filename="${exportPackage.fileName}"`,
      "cache-control": "no-cache, no-store, must-revalidate",
      "pragma": "no-cache",
      "expires": "0",
    },
  });
});

/**
 * POST /api/export/gdpr
 * Create GDPR data portability export for authenticated user
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await ctx.request!.json();
    const format = body.format || "json";

    if (format !== "json" && format !== "csv") {
      throw new Error("Invalid format");
    }

    const exportedData: ExportedData = {
      workspaceId: ctx.verifiedWorkspaceId,
      exportedAt: new Date(),
      format,
      tables: [
        {
          name: "workspace_data",
          rowCount: 0,
          columns: ["id", "type", "data", "createdAt"],
          data: [],
        },
      ],
    };

    const errors = validateExportData(exportedData);
    if (errors.length > 0) {
      throw new Error(`Export failed: ${errors.join(', ')}`);
    }

    const exportPackage = createExportPackage(exportedData);

    return Response.json({
      success: true,
      exportId: `export_${Date.now()}`,
      format,
      fileName: exportPackage.fileName,
      createdAt: new Date().toISOString(),
      downloadUrl: `/api/export/download?id=export_${Date.now()}`,
    });
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_VIEW],
    requireWorkspace: true,
  }
);
