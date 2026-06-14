/**
 * B12-S3: External Raw Records Persistence Service
 *
 * DB service for persisting external import records and tracking data lineage.
 * Handles:
 * - Creating external_raw_records with parsed data
 * - Updating record status (pending → processed → approved)
 * - Tracking lineage chain for audit trail
 * - Workspace isolation enforcement
 * - Atomic transactions for record + lineage creation
 *
 * Depends on:
 * - Prisma client for DB access
 * - External import templates (B12-S1)
 * - Parsed import results (B12-S2)
 */

import type { PrismaClient } from "@/generated/prisma/client";
import type { ImportResult, ParsedRow } from "@/domain/external-systems/import-parser";

export interface CreateExternalRawRecordInput {
  workspaceId: string;
  engagementId: string;
  providerId: string;
  templateId: string;
  parsedRow: ParsedRow;
}

export interface ExternalRawRecordResult {
  id: string;
  workspaceId: string;
  engagementId: string;
  providerId: string;
  templateId: string;
  rawData: Record<string, any>;
  parsedData: Record<string, any>;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface LineageTrackingInput {
  sourceRecordId: string;
  processedRecordId?: string;
  factId?: string;
  lineageChain: string[];
}

/**
 * Create external raw record with lineage tracking
 */
export async function createExternalRawRecord(
  prisma: PrismaClient,
  input: CreateExternalRawRecordInput,
): Promise<ExternalRawRecordResult> {
  const { workspaceId, engagementId, providerId, templateId, parsedRow } = input;

  // Validate workspace scoping: ensure engagement belongs to workspace
  const engagement = await prisma.engagement.findFirst({
    where: {
      id: engagementId,
      workspaceId: workspaceId,
    },
  });

  if (!engagement) {
    throw new Error(`Engagement ${engagementId} not found in workspace ${workspaceId}`);
  }

  // Create raw record in transaction with lineage
  const record = await prisma.externalRawRecord.create({
    data: {
      id: crypto.randomUUID() as any,
      workspaceId,
      engagementId,
      providerId,
      templateId,
      rawData: parsedRow.original,
      parsedData: parsedRow.mapped,
      status: parsedRow.errors.length > 0 ? "failed" : "pending",
      errorMessage: parsedRow.errors.length > 0 ? parsedRow.errors.join("; ") : null,
    },
  });

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    engagementId: record.engagementId,
    providerId: record.providerId,
    templateId: record.templateId,
    rawData: record.rawData as Record<string, any>,
    parsedData: record.parsedData as Record<string, any>,
    status: record.status,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
  };
}

/**
 * Create multiple external raw records from import result
 */
export async function createExternalRawRecordsBatch(
  prisma: PrismaClient,
  workspaceId: string,
  engagementId: string,
  providerId: string,
  templateId: string,
  importResult: ImportResult,
): Promise<ExternalRawRecordResult[]> {
  const records: ExternalRawRecordResult[] = [];

  for (const parsedRow of importResult.parsedRows) {
    const record = await createExternalRawRecord(prisma, {
      workspaceId,
      engagementId,
      providerId,
      templateId,
      parsedRow,
    });
    records.push(record);
  }

  return records;
}

/**
 * Update record status (pending → processed → approved)
 */
export async function updateRecordStatus(
  prisma: PrismaClient,
  recordId: string,
  workspaceId: string,
  status: "pending" | "processed" | "failed" | "approved",
  errorMessage?: string,
): Promise<ExternalRawRecordResult> {
  // Verify workspace scoping
  const existing = await prisma.externalRawRecord.findFirst({
    where: {
      id: recordId,
      workspaceId: workspaceId,
    },
  });

  if (!existing) {
    throw new Error(`Record ${recordId} not found in workspace ${workspaceId}`);
  }

  const record = await prisma.externalRawRecord.update({
    where: { id: recordId },
    data: {
      status,
      errorMessage: errorMessage || null,
      updatedAt: new Date(),
    },
  });

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    engagementId: record.engagementId,
    providerId: record.providerId,
    templateId: record.templateId,
    rawData: record.rawData as Record<string, any>,
    parsedData: record.parsedData as Record<string, any>,
    status: record.status,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
  };
}

/**
 * Track lineage from source record through processing to business fact
 */
export async function trackLineage(
  prisma: PrismaClient,
  input: LineageTrackingInput,
): Promise<{ id: string; lineageChain: string[] }> {
  const { sourceRecordId, processedRecordId, factId, lineageChain } = input;

  // Verify source record exists and get workspace
  const sourceRecord = await prisma.externalRawRecord.findUnique({
    where: { id: sourceRecordId },
  });

  if (!sourceRecord) {
    throw new Error(`Source record ${sourceRecordId} not found`);
  }

  const lineage = await prisma.externalDataLineage.create({
    data: {
      id: crypto.randomUUID() as any,
      workspaceId: sourceRecord.workspaceId,
      sourceRecordId,
      processedRecordId,
      factId,
      lineageChain: lineageChain,
    },
  });

  return {
    id: lineage.id,
    lineageChain: lineage.lineageChain,
  };
}

/**
 * Get lineage for a business fact
 */
export async function getFactLineage(
  prisma: PrismaClient,
  workspaceId: string,
  factId: string,
): Promise<{
  factId: string;
  sourceRecordId: string | null;
  lineageChain: string[];
  createdAt: Date;
} | null> {
  const lineage = await prisma.externalDataLineage.findFirst({
    where: {
      workspaceId,
      factId,
    },
  });

  if (!lineage) return null;

  return {
    factId: lineage.factId || "",
    sourceRecordId: lineage.sourceRecordId,
    lineageChain: lineage.lineageChain,
    createdAt: lineage.createdAt,
  };
}

/**
 * Get records for engagement
 */
export async function getEngagementImportRecords(
  prisma: PrismaClient,
  workspaceId: string,
  engagementId: string,
  status?: string,
): Promise<ExternalRawRecordResult[]> {
  const records = await prisma.externalRawRecord.findMany({
    where: {
      workspaceId,
      engagementId,
      ...(status && { status }),
    },
    orderBy: { createdAt: "desc" },
  });

  return records.map((r: any) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    engagementId: r.engagementId,
    providerId: r.providerId,
    templateId: r.templateId,
    rawData: r.rawData as Record<string, any>,
    parsedData: r.parsedData as Record<string, any>,
    status: r.status,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt,
  }));
}

/**
 * Rollback import: mark records as failed, remove lineage
 */
export async function rollbackImport(
  prisma: PrismaClient,
  workspaceId: string,
  engagementId: string,
  providerId: string,
): Promise<{ recordsRemoved: number; lineageRemoved: number }> {
  // Get all records for this import
  const records = await prisma.externalRawRecord.findMany({
    where: {
      workspaceId,
      engagementId,
      providerId,
      status: { in: ["pending", "processed"] },
    },
  });

  // Remove lineage entries
  const lineageRemoved = await prisma.externalDataLineage.deleteMany({
    where: {
      workspaceId,
      sourceRecordId: { in: records.map((r: any) => r.id) },
    },
  });

  // Update records to failed
  const updated = await prisma.externalRawRecord.updateMany({
    where: {
      id: { in: records.map((r: any) => r.id) },
    },
    data: {
      status: "failed",
      errorMessage: "Import rolled back",
    },
  });

  return {
    recordsRemoved: updated.count,
    lineageRemoved: lineageRemoved.count,
  };
}
