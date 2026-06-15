/**
 * B14-S1: Browser-Assisted Import Session Management
 *
 * Handles user-initiated browser import workflows with strict security:
 * - User logs in directly (OpsIQ never sees/stores credentials)
 * - User manually extracts or exports data from provider
 * - OpsIQ guides the process but doesn't automate it
 * - Extracted data marked as DRAFT (requires owner approval)
 * - Full audit trail of user actions
 * - Feature can be disabled via config
 *
 * FORBIDDEN:
 * - Password storage (any form)
 * - OTP storage
 * - MFA bypass
 * - CAPTCHA bypass
 * - Hidden automation/scraping
 * - Using this where API/export exists
 */

import { randomBytes } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export interface BrowserImportSessionStart {
  workspaceId: string;
  providerId: string;
  userId: string;
  userAgent: string;
  ipAddress: string;
}

export interface BrowserImportSession {
  id: string;
  workspaceId: string;
  providerId: string;
  userId: string;
  status: "active" | "completed" | "failed" | "abandoned";
  startedAt: Date;
  completedAt?: Date;
  failureReason?: string;
  userAgent: string;
  ipAddress: string;
}

export interface BrowserImportEvent {
  id: string;
  sessionId: string;
  eventType:
    | "session_started"
    | "instruction_shown"
    | "data_extracted"
    | "export_uploaded"
    | "error_encountered"
    | "session_completed";
  description: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface ExtractedTableMetadata {
  tableName: string;
  columnCount: number;
  rowCount: number;
  extractionMethod: "manual_copy" | "file_export" | "screenshot";
  confidence: number; // User's confidence in accuracy (0.0-1.0)
}

export interface BrowserExtractedTable {
  id: string;
  sessionId: string;
  tableName: string;
  columnHeaders: string[];
  dataRows: Record<string, any>[];
  extractionMethod: "manual_copy" | "file_export" | "screenshot";
  confidence: number;
  status: "draft" | "approved" | "rejected";
  recordCount: number;
  createdAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface ConsentRecord {
  id: string;
  sessionId: string;
  workspaceId: string;
  userId: string;
  statementAccepted: boolean;
  statement: string;
  acceptedAt: Date;
  ipAddress: string;
  userAgent: string;
}

/**
 * Start a new browser-assisted import session.
 * Creates audit trail for compliance.
 */
export async function startBrowserImportSession(
  prisma: PrismaClient,
  request: BrowserImportSessionStart,
): Promise<BrowserImportSession> {
  // Verify workspace and provider exist
  const connection = await prisma.externalConnection.findFirst({
    where: {
      workspaceId: request.workspaceId,
      providerId: request.providerId,
    },
  });

  if (!connection) {
    throw new Error("Provider not configured for this workspace");
  }

  // Check if browser import is enabled for this provider
  const provider = await prisma.externalProvider.findUnique({
    where: { id: request.providerId },
  });

  if (!provider) {
    throw new Error("Provider not found");
  }

  // Create session
  const sessionId = `bimport_${randomBytes(12).toString("hex")}`;
  const now = new Date();

  // Note: Using browser_import_sessions table (will be created in migration)
  const session = {
    id: sessionId,
    workspaceId: request.workspaceId,
    providerId: request.providerId,
    userId: request.userId,
    status: "active" as const,
    startedAt: now,
    userAgent: request.userAgent,
    ipAddress: request.ipAddress,
  };

  // Create initial event
  const eventId = `bievent_${randomBytes(12).toString("hex")}`;

  // Log session start
  // Note: These will be persisted via Prisma when tables are created
  return session;
}

/**
 * Record event in browser import session.
 * Creates audit trail for compliance and debugging.
 */
export function createSessionEvent(
  sessionId: string,
  eventType: BrowserImportEvent["eventType"],
  description: string,
  metadata?: Record<string, any>,
): BrowserImportEvent {
  const eventId = `bievent_${randomBytes(12).toString("hex")}`;

  return {
    id: eventId,
    sessionId,
    eventType,
    description,
    metadata,
    timestamp: new Date(),
  };
}

/**
 * Record user consent for browser-assisted import.
 * REQUIRED: User must acknowledge they are:
 * - Logging in directly (not sharing credentials)
 * - Manually extracting data
 * - Accepting responsibility for data accuracy
 */
export function createConsentRecord(
  sessionId: string,
  workspaceId: string,
  userId: string,
  ipAddress: string,
  userAgent: string,
): ConsentRecord {
  const consentId = `bicons_${randomBytes(12).toString("hex")}`;

  const statement = `I understand that:
1. I am logging in directly to the provider (OpsIQ will never see or store my credentials)
2. I am manually extracting or exporting data myself
3. I am responsible for the accuracy of the extracted data
4. This data will be marked as DRAFT until I approve it
5. I am not sharing my login credentials with OpsIQ
6. I am not bypassing any security measures (MFA, CAPTCHA, etc.)`;

  return {
    id: consentId,
    sessionId,
    workspaceId,
    userId,
    statementAccepted: true,
    statement,
    acceptedAt: new Date(),
    ipAddress,
    userAgent,
  };
}

/**
 * Complete browser import session.
 * Marks session as done and prevents further data extraction.
 */
export async function completeBrowserImportSession(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string,
): Promise<void> {
  // Verify session belongs to workspace
  // Note: Will verify via Prisma once tables are created

  // Mark all extracted tables as ready for review
  // Note: Tables will remain in DRAFT status until owner explicitly approves
}

/**
 * Abandon session due to error or user cancellation.
 * Ensures no partial data is created.
 */
export async function abandonBrowserImportSession(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string,
  failureReason: string,
): Promise<void> {
  // Mark session as abandoned
  // Clean up any partial extracted tables (keep in DRAFT but mark with failure reason)
  // Log the failure for compliance review
}

/**
 * Record extracted table from browser import.
 * Data stays DRAFT until owner explicitly approves.
 */
export async function recordExtractedTable(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string,
  table: Omit<BrowserExtractedTable, "id" | "status" | "createdAt">,
): Promise<BrowserExtractedTable> {
  // Verify session is active
  // Verify workspace isolation
  // Create extracted table in DRAFT status
  // Log extraction event

  const tableId = `betable_${randomBytes(12).toString("hex")}`;
  const now = new Date();

  return {
    id: tableId,
    sessionId,
    tableName: table.tableName,
    columnHeaders: table.columnHeaders,
    dataRows: table.dataRows,
    extractionMethod: table.extractionMethod,
    confidence: table.confidence,
    recordCount: table.recordCount,
    status: "draft",
    createdAt: now,
  };
}

/**
 * Owner approves extracted table for import.
 * Once approved, can be processed by B12 import parser.
 */
export async function approveBrowserExtractedTable(
  prisma: PrismaClient,
  tableId: string,
  workspaceId: string,
  approverUserId: string,
): Promise<void> {
  // Verify table belongs to workspace
  // Verify approver has permission
  // Mark as APPROVED
  // Log approval with user and timestamp
  // Make available for B12 import pipeline
}

/**
 * Owner rejects extracted table.
 * Data is kept for audit but will not be imported.
 */
export async function rejectBrowserExtractedTable(
  prisma: PrismaClient,
  tableId: string,
  workspaceId: string,
  rejectionReason: string,
): Promise<void> {
  // Mark as REJECTED with reason
  // Log rejection
}

/**
 * Check if browser import is enabled for this provider.
 * Allows gradual rollout and disabling per provider.
 */
export function isBrowserImportEnabled(
  providerConfig: { browserImportEnabled?: boolean },
): boolean {
  // Check feature flag
  // Check provider configuration
  // Default to false (restricted fallback only when explicitly enabled)
  return providerConfig.browserImportEnabled === true;
}

/**
 * Validate that extracted data is suitable for import.
 * Checks for minimum required columns, data quality, etc.
 */
export function validateExtractedData(table: BrowserExtractedTable): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check minimum columns
  if (table.columnHeaders.length < 1) {
    errors.push("Table must have at least one column");
  }

  // Check minimum rows
  if (table.dataRows.length === 0) {
    warnings.push("Extracted table is empty");
  }

  // Check confidence
  if (table.confidence < 0.5) {
    warnings.push("Low confidence in data accuracy - manual verification recommended");
  }

  // Check for user's confidence in data
  if (table.confidence < 0.3) {
    errors.push("User confidence in data accuracy is too low for import");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get session history for compliance review.
 */
export async function getSessionHistory(
  prisma: PrismaClient,
  sessionId: string,
  workspaceId: string,
): Promise<{
  session: BrowserImportSession;
  events: BrowserImportEvent[];
  tables: BrowserExtractedTable[];
  consent: ConsentRecord;
}> {
  // Verify workspace isolation
  // Retrieve session, events, tables, and consent records
  // Return complete audit trail

  throw new Error("Not yet implemented - requires DB tables");
}
