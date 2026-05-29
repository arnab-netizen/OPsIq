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

  // PROBE 01: Minimal count
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
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
      driverAdapterErrorCode: safe.driverAdapterErrorCode,
      driverAdapterErrorMessage: safe.driverAdapterErrorMessage as string | undefined,
      safeMessage: safe.safeMessage as string | undefined,
      safeMetaKeys: safe.safeMetaKeys as unknown[] | undefined,
    });
  }

  // Log results
  logger.info("P2007 probe results", { results });

  return NextResponse.json({
    diagnostic: "P2007 engagement probes",
    workspaceId,
    probes: results,
  });
};
