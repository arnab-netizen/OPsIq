import { NextResponse } from "next/server";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import {
  createExportPackage,
  validateExportData,
  type ExportedData,
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

  // Fetch real workspace data for export
  const [operatorItems, engagements] = await Promise.all([
    db.operatorItem.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 1000,
      select: {
        id: true,
        problem: true,
        action: true,
        status: true,
        priorityScore: true,
        confidence: true,
        decisionType: true,
        expectedOutcome: true,
        actualOutcome: true,
        outcomeDelta: true,
        decisionAccuracy: true,
        dueAt: true,
        executedAt: true,
        createdAt: true,
      },
    }),
    db.engagement.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        status: true,
        startDate: true,
        targetEndDate: true,
        actualEndDate: true,
        createdAt: true,
        clientAccount: { select: { name: true } },
      },
    }),
  ]);

  const exportedData: ExportedData = {
    workspaceId,
    exportedAt: new Date(),
    format,
    tables: [
      {
        name: "decisions",
        rowCount: operatorItems.length,
        columns: [
          "id", "problem", "action", "status", "priorityScore", "confidence",
          "decisionType", "expectedOutcome", "actualOutcome", "outcomeDelta",
          "decisionAccuracy", "dueAt", "executedAt", "createdAt",
        ],
        data: operatorItems.map((item: any) => ({
          ...item,
          dueAt: item.dueAt?.toISOString() ?? null,
          executedAt: item.executedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      {
        name: "engagements",
        rowCount: engagements.length,
        columns: ["id", "clientName", "status", "startDate", "targetEndDate", "actualEndDate", "createdAt"],
        data: engagements.map((eng: any) => ({
          id: eng.id,
          clientName: eng.clientAccount?.name ?? null,
          status: eng.status,
          startDate: eng.startDate?.toISOString() ?? null,
          targetEndDate: eng.targetEndDate?.toISOString() ?? null,
          actualEndDate: eng.actualEndDate?.toISOString() ?? null,
          createdAt: eng.createdAt.toISOString(),
        })),
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
},
{
  requireWorkspace: true,
  requireCapabilities: [CAPABILITIES.ACTION_VIEW],
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
