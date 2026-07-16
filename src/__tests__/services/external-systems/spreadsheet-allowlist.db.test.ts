/**
 * Phase 6: Google Sheets Spreadsheet Allowlist — DB proof
 *
 * `[db]`-gated. Proves: allowlist entries persist; conflict on duplicate add;
 * revocation is soft-delete (revokedAt set, entry preserved); re-add after revocation
 * reactivates the entry; isSpreadsheetAllowed returns correct state; workspace isolation.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/external-systems/spreadsheet-allowlist.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  addSpreadsheetToAllowlist,
  isSpreadsheetAllowed,
  revokeSpreadsheetFromAllowlist,
  listAllowedSpreadsheets,
} from "@/services/external-systems/spreadsheet-allowlist.service";
import { ConflictError, NotFoundError } from "@/infra/errors";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

const SHEET_ID_1 = "1BxiMVs0XRA5nFMon9QV6-xH03ywWD3e";
const SHEET_ID_2 = "1CyiNWt1YSB6nGNpo0RW7-yI14xwWE4f";

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: {
      id: actor,
      email: `allowlist-${actor}@example.com`,
      name: "Allowlist Test",
      isActive: true,
      updatedAt: new Date(),
    },
  });

  for (const wsId of [wsA, wsB]) {
    await db.workspace.upsert({
      where: { id: wsId },
      update: {},
      create: {
        id: wsId,
        name: `Allowlist WS ${wsId}`,
        slug: `allowlist-ws-${wsId}`,
        updatedAt: new Date(),
      },
    });
  }
});

afterAll(async () => {
  await db.externalSpreadsheetAllowlist.deleteMany({
    where: { workspaceId: { in: [wsA, wsB] } },
  });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Phase 6 — Spreadsheet Allowlist persistence", () => {
  it("[db] adds a spreadsheet and persists all fields", async () => {
    const entryId = await addSpreadsheetToAllowlist({
      workspaceId: wsA,
      spreadsheetId: SHEET_ID_1,
      name: "Sales Pipeline Q3",
      addedBy: actor,
    });

    expect(entryId).toBeTruthy();
    const row = await db.externalSpreadsheetAllowlist.findFirst({ where: { id: entryId } });
    expect(row).toBeTruthy();
    expect((row as any).workspaceId).toBe(wsA);
    expect((row as any).spreadsheetId).toBe(SHEET_ID_1);
    expect((row as any).name).toBe("Sales Pipeline Q3");
    expect((row as any).addedBy).toBe(actor);
    expect((row as any).revokedAt).toBeNull();
  });

  it("[db] isSpreadsheetAllowed returns true for an active entry", async () => {
    const allowed = await isSpreadsheetAllowed(wsA, SHEET_ID_1);
    expect(allowed).toBe(true);
  });

  it("[db] isSpreadsheetAllowed returns false for unknown spreadsheet", async () => {
    const allowed = await isSpreadsheetAllowed(wsA, "UnknownSpreadsheetID99");
    expect(allowed).toBe(false);
  });

  it("[db] throws ConflictError when adding duplicate active entry", async () => {
    await expect(
      addSpreadsheetToAllowlist({
        workspaceId: wsA,
        spreadsheetId: SHEET_ID_1,
        name: "Duplicate attempt",
        addedBy: actor,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("[db] revokes a spreadsheet (soft delete — revokedAt set)", async () => {
    const entryId = await addSpreadsheetToAllowlist({
      workspaceId: wsA,
      spreadsheetId: SHEET_ID_2,
      name: "Revenue Tracker",
      addedBy: actor,
    });

    await revokeSpreadsheetFromAllowlist(entryId, wsA, actor);

    const row = await db.externalSpreadsheetAllowlist.findFirst({ where: { id: entryId } });
    expect((row as any).revokedAt).toBeTruthy();
    expect((row as any).revokedBy).toBe(actor);
  });

  it("[db] isSpreadsheetAllowed returns false after revocation", async () => {
    const allowed = await isSpreadsheetAllowed(wsA, SHEET_ID_2);
    expect(allowed).toBe(false);
  });

  it("[db] re-adding a revoked spreadsheet reactivates it", async () => {
    const entryId = await addSpreadsheetToAllowlist({
      workspaceId: wsA,
      spreadsheetId: SHEET_ID_2,
      name: "Revenue Tracker (reactivated)",
      addedBy: actor,
    });

    expect(entryId).toBeTruthy();
    const allowed = await isSpreadsheetAllowed(wsA, SHEET_ID_2);
    expect(allowed).toBe(true);
  });

  it("[db] revokeSpreadsheetFromAllowlist throws NotFoundError for wrong workspace", async () => {
    const entryId = await addSpreadsheetToAllowlist({
      workspaceId: wsB,
      spreadsheetId: SHEET_ID_1,
      name: "WS-B Sheet",
      addedBy: actor,
    });

    await expect(
      revokeSpreadsheetFromAllowlist(entryId, wsA, actor),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("[db] listAllowedSpreadsheets returns only active entries for workspace", async () => {
    const entries = await listAllowedSpreadsheets(wsA);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    entries.forEach((e) => {
      expect(e.workspaceId).toBe(wsA);
      expect(e.revokedAt).toBeNull();
    });
  });

  it("[db] listAllowedSpreadsheets isolates by workspace — wsB entries not in wsA list", async () => {
    const wsBEntries = await listAllowedSpreadsheets(wsB);
    const wsAEntries = await listAllowedSpreadsheets(wsA);

    const wsBIds = wsBEntries.map((e) => e.id);
    const wsAIds = wsAEntries.map((e) => e.id);

    wsBIds.forEach((id) => expect(wsAIds).not.toContain(id));
  });
});
