/**
 * Phase 6: Google Sheets Spreadsheet Allowlist Service
 *
 * Owner must explicitly add each spreadsheet ID before it can be imported.
 * Revocation is soft-delete (revokedAt) — audit history preserved.
 * Workspace isolation enforced at every query.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError } from "@/infra/errors";

export interface AddSpreadsheetInput {
  workspaceId: string;
  spreadsheetId: string;
  name: string;
  addedBy: string;
}

export interface AllowlistEntry {
  id: string;
  workspaceId: string;
  spreadsheetId: string;
  name: string;
  addedBy: string;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Add a spreadsheet to the workspace allowlist. Throws ConflictError if already active. */
export async function addSpreadsheetToAllowlist(input: AddSpreadsheetInput): Promise<string> {
  const existing = (await db.externalSpreadsheetAllowlist.findFirst({
    where: {
      workspaceId: input.workspaceId,
      spreadsheetId: input.spreadsheetId,
      revokedAt: null,
    },
  })) as AllowlistEntry | null;

  if (existing) {
    throw new ConflictError(
      `Spreadsheet ${input.spreadsheetId} is already in the allowlist for this workspace`,
    );
  }

  const result = (await db.externalSpreadsheetAllowlist.upsert({
    where: {
      workspaceId_spreadsheetId: {
        workspaceId: input.workspaceId,
        spreadsheetId: input.spreadsheetId,
      },
    },
    update: {
      name: input.name,
      addedBy: input.addedBy,
      revokedAt: null,
      revokedBy: null,
      updatedAt: new Date(),
    },
    create: {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      spreadsheetId: input.spreadsheetId,
      name: input.name,
      addedBy: input.addedBy,
      updatedAt: new Date(),
    },
    select: { id: true },
  })) as { id: string };

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SPREADSHEET_ALLOWLIST_ADDED,
    actorId: input.addedBy,
    workspaceId: input.workspaceId,
    entityType: "ExternalSpreadsheetAllowlist",
    entityId: result.id,
    payload: { spreadsheetId: input.spreadsheetId, name: input.name },
  });

  return result.id;
}

/** Check if a spreadsheet is in the active allowlist for a workspace. */
export async function isSpreadsheetAllowed(
  workspaceId: string,
  spreadsheetId: string,
): Promise<boolean> {
  const entry = await db.externalSpreadsheetAllowlist.findFirst({
    where: { workspaceId, spreadsheetId, revokedAt: null },
    select: { id: true },
  });
  return entry !== null;
}

/** Revoke a spreadsheet from the allowlist (soft delete). */
export async function revokeSpreadsheetFromAllowlist(
  entryId: string,
  workspaceId: string,
  revokedBy: string,
): Promise<void> {
  const entry = (await db.externalSpreadsheetAllowlist.findFirst({
    where: { id: entryId, workspaceId },
  })) as AllowlistEntry | null;

  if (!entry) throw new NotFoundError("ExternalSpreadsheetAllowlist", entryId);
  if (entry.revokedAt) return; // Already revoked — idempotent

  await db.externalSpreadsheetAllowlist.update({
    where: { id: entryId },
    data: { revokedAt: new Date(), revokedBy, updatedAt: new Date() },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.SPREADSHEET_ALLOWLIST_REVOKED,
    actorId: revokedBy,
    workspaceId,
    entityType: "ExternalSpreadsheetAllowlist",
    entityId: entryId,
    payload: { spreadsheetId: entry.spreadsheetId },
  });
}

/** List active (non-revoked) spreadsheets in the allowlist for a workspace. */
export async function listAllowedSpreadsheets(workspaceId: string): Promise<AllowlistEntry[]> {
  const rows = (await db.externalSpreadsheetAllowlist.findMany({
    where: { workspaceId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  })) as AllowlistEntry[];
  return rows;
}
