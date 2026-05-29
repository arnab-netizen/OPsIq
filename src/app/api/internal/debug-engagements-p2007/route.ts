/**
 * P2007 Diagnostic Probe Endpoint
 *
 * Isolates exact failing Prisma operation for engagement queries.
 * Runs independent probes to identify which operation/field fails.
 * Protected by OPSIQ_DIAGNOSTIC_KEY.
 * No secrets exposed. No stack traces. No raw SQL.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractSafeKnownError } from "@/infra/classified-error";
import { logger } from "@/infra/logger";
import { Pool } from "pg";

const DIAGNOSTIC_KEY = process.env.OPSIQ_DIAGNOSTIC_KEY;

interface ProbeResult {
  name: string;
  status: "pass" | "fail";
  prismaCode?: string;
  errorName?: string;
  driverAdapterErrorName?: string;
  driverAdapterErrorCode?: string | number;
  driverAdapterErrorMessage?: string;
  safeMessage?: string;
  safeMetaKeys?: unknown[];
}

export const GET = async (req: NextRequest) => {
  // Verify diagnostic key
  const providedKey =
    req.headers.get("x-opsiq-diagnostic-key") ||
    new URL(req.url).searchParams.get("key");

  if (!DIAGNOSTIC_KEY || !providedKey || providedKey !== DIAGNOSTIC_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
  }

  const results: ProbeResult[] = [];
  const workspaceId = "demo"; // Use demo workspace

  // PROBE 00A: No-where count (base model/table test)
  try {
    await db.engagement.count();
    results.push({ name: "probe_00a_count_no_where", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_00a_count_no_where",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 00B: Empty where count
  try {
    await db.engagement.count({ where: {} });
    results.push({ name: "probe_00b_count_empty_where", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_00b_count_empty_where",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 00C: No-where findFirst id only
  try {
    await db.engagement.findFirst({
      select: { id: true },
    });
    results.push({ name: "probe_00c_findFirst_id_no_where", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_00c_findFirst_id_no_where",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 00D: No-where findMany id only
  try {
    await db.engagement.findMany({
      select: { id: true },
      take: 1,
    });
    results.push({ name: "probe_00d_findMany_id_no_where", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_00d_findMany_id_no_where",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 01: Minimal count with workspaceId
  try {
    await db.engagement.count({ where: { workspaceId } });
    results.push({ name: "probe_01_count_minimal", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_01_count_minimal",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 02: findFirst id only
  try {
    await db.engagement.findFirst({
      where: { workspaceId },
      select: { id: true },
    });
    results.push({ name: "probe_02_findFirst_id_only", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_02_findFirst_id_only",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 03: findMany id only
  try {
    await db.engagement.findMany({
      where: { workspaceId },
      select: { id: true },
      take: 1,
    });
    results.push({ name: "probe_03_findMany_id_only", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_03_findMany_id_only",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 04: Core scalars only
  try {
    await db.engagement.findMany({
      where: { workspaceId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        workspaceId: true,
        clientId: true,
        createdAt: true,
      },
      take: 1,
    });
    results.push({ name: "probe_04_core_scalars", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_04_core_scalars",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 05: Current select without relation
  try {
    await db.engagement.findMany({
      where: { workspaceId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        healthStatus: true,
        interventionMode: true,
        serviceTier: true,
        createdAt: true,
      },
      take: 1,
    });
    results.push({ name: "probe_05_select_no_relation", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_05_select_no_relation",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 06: Relation only
  try {
    await db.engagement.findMany({
      where: { workspaceId },
      select: {
        id: true,
        clientAccount: { select: { id: true, name: true } },
      },
      take: 1,
    });
    results.push({ name: "probe_06_relation_only", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_06_relation_only",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // PROBE 07: Full current select
  try {
    await db.engagement.findMany({
      where: { workspaceId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        healthStatus: true,
        interventionMode: true,
        serviceTier: true,
        createdAt: true,
        clientAccount: { select: { id: true, name: true } },
      },
      take: 1,
    });
    results.push({ name: "probe_07_full_select", status: "pass" });
  } catch (error) {
    const safe = extractSafeKnownError(error);
    results.push({
      name: "probe_07_full_select",
      status: "fail",
      prismaCode: safe.prismaCode as string | undefined,
      errorName: safe.errorName as string | undefined,
      driverAdapterErrorName: safe.driverAdapterErrorName as string | undefined,
      driverAdapterErrorCode: safe.driverAdapterErrorCode as string | number | undefined,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // RAW SQL CATALOG PROBES - Direct PostgreSQL inspection
  interface RawCatalogResult {
    name: string;
    status: "pass" | "fail";
    message?: string;
    data?: unknown;
  }

  const rawCatalogResults: RawCatalogResult[] = [];
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    rawCatalogResults.push({
      name: "raw_catalog_initialization",
      status: "fail",
      message: "DATABASE_URL not configured",
    });
  } else {
    const pool = new Pool({ connectionString: databaseUrl });

    try {
      // RAW 01: Connection test
      try {
        const connResult = await pool.query(
          "SELECT current_database(), current_schema()"
        );
        rawCatalogResults.push({
          name: "raw_01_connection",
          status: "pass",
          data: {
            database: connResult.rows[0]?.current_database,
            schema: connResult.rows[0]?.current_schema,
          },
        });
      } catch (error) {
        rawCatalogResults.push({
          name: "raw_01_connection",
          status: "fail",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      // RAW 02: Find engagement tables
      let engagementTables: string[] = [];
      try {
        const tablesResult = await pool.query(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND lower(table_name) LIKE '%engagement%'
           ORDER BY table_name`
        );
        engagementTables = tablesResult.rows.map((r) => r.table_name as string);
        rawCatalogResults.push({
          name: "raw_02_find_engagement_tables",
          status: "pass",
          data: { tables: engagementTables },
        });
      } catch (error) {
        rawCatalogResults.push({
          name: "raw_02_find_engagement_tables",
          status: "fail",
          message: error instanceof Error ? error.message : String(error),
        });
      }

      // RAW 03: Find engagement columns for each table
      if (engagementTables.length > 0) {
        for (const tableName of engagementTables) {
          try {
            const colsResult = await pool.query(
              `SELECT column_name, data_type, udt_name, is_nullable
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = $1
               ORDER BY ordinal_position`,
              [tableName]
            );
            const columns = colsResult.rows.map((r) => ({
              name: r.column_name,
              type: r.data_type,
              udtName: r.udt_name,
              nullable: r.is_nullable === "YES",
            }));
            rawCatalogResults.push({
              name: `raw_03_columns_${tableName}`,
              status: "pass",
              data: { columns },
            });
          } catch (error) {
            rawCatalogResults.push({
              name: `raw_03_columns_${tableName}`,
              status: "fail",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // RAW 04: Count rows in each engagement table
      if (engagementTables.length > 0) {
        for (const tableName of engagementTables) {
          try {
            const countResult = await pool.query(
              `SELECT COUNT(*)::int AS count FROM public."${tableName}"`
            );
            rawCatalogResults.push({
              name: `raw_04_count_${tableName}`,
              status: "pass",
              data: { count: countResult.rows[0]?.count || 0 },
            });
          } catch (error) {
            rawCatalogResults.push({
              name: `raw_04_count_${tableName}`,
              status: "fail",
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // RAW 05: Check workspaceId column variants in main engagement table
      if (engagementTables.length > 0) {
        const mainTable = engagementTables[0];
        try {
          const colsResult = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1`,
            [mainTable]
          );
          const columnNames = colsResult.rows.map((r) => r.column_name as string);
          const workspaceIdVariants = [
            "workspaceId",
            "workspace_id",
            "workspaceid",
            "WorkspaceId",
          ];
          const found = workspaceIdVariants.filter((v) =>
            columnNames.includes(v)
          );
          rawCatalogResults.push({
            name: "raw_05_workspaceId_column_check",
            status: found.length > 0 ? "pass" : "fail",
            data: {
              expected: workspaceIdVariants,
              found,
              allColumns: columnNames,
            },
          });
        } catch (error) {
          rawCatalogResults.push({
            name: "raw_05_workspaceId_column_check",
            status: "fail",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // RAW 06: Check for required engagement columns
      if (engagementTables.length > 0) {
        const mainTable = engagementTables[0];
        try {
          const colsResult = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1`,
            [mainTable]
          );
          const columnNames = colsResult.rows.map((r) => r.column_name as string);
          const requiredFields = [
            "id",
            "workspaceId",
            "clientId",
            "code",
            "title",
            "status",
            "healthStatus",
            "interventionMode",
            "serviceTier",
            "createdAt",
          ];
          const missing = requiredFields.filter((f) => !columnNames.includes(f));
          rawCatalogResults.push({
            name: "raw_06_required_columns_check",
            status: missing.length === 0 ? "pass" : "fail",
            data: {
              table: mainTable,
              required: requiredFields,
              missing,
              actual: columnNames,
            },
          });
        } catch (error) {
          rawCatalogResults.push({
            name: "raw_06_required_columns_check",
            status: "fail",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      await pool.end();
    }
  }

  // Log results
  logger.info("P2007 probe results", { results, rawCatalogResults });

  return NextResponse.json({
    diagnostic: "P2007 engagement probes with raw catalog",
    workspaceId,
    probes: results,
    rawCatalog: rawCatalogResults,
  });
};
