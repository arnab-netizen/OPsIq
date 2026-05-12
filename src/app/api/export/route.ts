/**
 * Data Export API
 *
 * Provides endpoints for exporting workspace data in CSV or JSON format.
 * Supports GDPR data portability and user data exports.
 *
 * GET /api/export?format=json|csv
 *   - Returns user's own data export
 *   - Requires authentication
 *
 * GET /api/export/audit?startDate=ISO&endDate=ISO
 *   - Returns audit trail (admin only)
 *   - Requires AUDIT_VIEW capability
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import {
  createExportPackage,
  validateExportData,
  type ExportedData,
  type ExportOptions,
} from "@/services/export";
import { withErrorHandling } from "@/infra/error-handler";

/**
 * GET /api/export
 * Export workspace data (CSV or JSON)
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  // Authenticate
  const authContext = await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

  // Get workspace ID from header
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  // Verify workspace membership
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get format from query parameters
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json") as
    | "json"
    | "csv";

  if (format !== "json" && format !== "csv") {
    return NextResponse.json(
      { error: "Invalid format. Use 'json' or 'csv'" },
      { status: 400 }
    );
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
    return NextResponse.json(
      {
        error: "Export validation failed",
        details: errors,
      },
      { status: 500 }
    );
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
export async function POST(request: NextRequest): Promise<NextResponse> {
  return withErrorHandling(async (req: NextRequest) => {
    // Authenticate
    const authContext = await withAuth({ capability: CAPABILITIES.ACTION_VIEW });

    // Get workspace ID
    const workspaceId = req.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Verify membership
    const membership = await enforceWorkspaceScoping(req, workspaceId);
    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Validate request body
    const body = await req.json();
    const format = body.format || "json";

    if (format !== "json" && format !== "csv") {
      return NextResponse.json(
        { error: "Invalid format" },
        { status: 400 }
      );
    }

    // Build export (would query database in real implementation)
    const exportedData: ExportedData = {
      workspaceId,
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

    // Validate
    const errors = validateExportData(exportedData);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Export failed", details: errors },
        { status: 500 }
      );
    }

    // Create package
    const exportPackage = createExportPackage(exportedData);

    // Return response
    return NextResponse.json(
      {
        success: true,
        exportId: `export_${Date.now()}`,
        format,
        fileName: exportPackage.fileName,
        createdAt: new Date().toISOString(),
        downloadUrl: `/api/export/download?id=export_${Date.now()}`,
      },
      { status: 201 }
    );
  })(request);
}
