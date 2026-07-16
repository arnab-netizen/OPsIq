/**
 * Compliance obligation DB proof — provenance metadata, expiry tracking,
 * and workspace isolation.
 *
 * `[db]`-gated. Proves: compliance items persist all obligation metadata fields;
 * getComplianceReviewItems returns expired items (state=expired) and items expiring
 * within windowDays (state=expiring_soon); items with no expiresAt or far-future
 * dates do NOT appear in the review list; workspace isolation prevents cross-workspace
 * reads.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/owner-mode/compliance-obligation.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { recordComplianceItem, getComplianceReviewItems } from "@/services/owner-mode/compliance.service";

const actor = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();

beforeAll(async () => {
  await db.user.upsert({
    where: { id: actor },
    update: {},
    create: { id: actor, email: `compliance-ob-${actor}@example.com`, name: "Compliance Ob Test", isActive: true, updatedAt: new Date() },
  });
});

afterAll(async () => {
  await db.ownerComplianceItem.deleteMany({ where: { createdByUserId: actor } });
  await db.auditEvent.deleteMany({ where: { actorId: actor } });
  await db.user.delete({ where: { id: actor } });
});

describe("[db] Compliance obligation — metadata persistence", () => {
  it("[db] persists all provenance and obligation metadata fields", async () => {
    const id = await recordComplianceItem({
      workspaceId: wsA,
      kind: "licence",
      name: "Health and Safety at Work Licence",
      reference: "HSE-2026-001",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      actorId: actor,
      jurisdiction: "England and Wales",
      legalBasis: "Health and Safety at Work etc. Act 1974",
      obligationOwner: "Site Manager",
      evidenceValidityDays: 365,
      recurrenceMonths: 12,
      penaltyDescription: "Criminal prosecution up to £20,000 fine and/or 2 years imprisonment",
      provenanceSource: "authoritative_document",
    });

    const row = await db.ownerComplianceItem.findFirst({ where: { id } });
    expect(row).toBeTruthy();
    expect(row!.kind).toBe("licence");
    expect(row!.jurisdiction).toBe("England and Wales");
    expect(row!.legalBasis).toBe("Health and Safety at Work etc. Act 1974");
    expect(row!.obligationOwner).toBe("Site Manager");
    expect(row!.evidenceValidityDays).toBe(365);
    expect(row!.recurrenceMonths).toBe(12);
    expect(row!.penaltyDescription).toContain("£20,000");
    expect(row!.provenanceSource).toBe("authoritative_document");
    expect(row!.workspaceId).toBe(wsA);
  });

  it("[db] persists item with minimal fields (no provenance metadata)", async () => {
    const id = await recordComplianceItem({
      workspaceId: wsA,
      kind: "insurance",
      name: "Public Liability Insurance",
      actorId: actor,
    });

    const row = await db.ownerComplianceItem.findFirst({ where: { id } });
    expect(row).toBeTruthy();
    expect(row!.jurisdiction).toBeNull();
    expect(row!.provenanceSource).toBeNull();
    expect(row!.expiresAt).toBeNull();
  });
});

describe("[db] Compliance obligation — review list accuracy", () => {
  it("[db] getComplianceReviewItems returns expired item as state=expired", async () => {
    // Seed an item that expired 5 days ago
    await recordComplianceItem({
      workspaceId: wsA,
      kind: "permit",
      name: "Expired Food Hygiene Permit",
      expiresAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      actorId: actor,
      provenanceSource: "owner_input",
    });

    const items = await getComplianceReviewItems(wsA);
    const expiredItems = items.filter((i) => i.name === "Expired Food Hygiene Permit");
    expect(expiredItems.length).toBe(1);
    expect(expiredItems[0].state).toBe("expired");
  });

  it("[db] getComplianceReviewItems returns item expiring in 15 days as state=expiring_soon", async () => {
    await recordComplianceItem({
      workspaceId: wsA,
      kind: "document",
      name: "Expiring Tax Certificate",
      expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
      actorId: actor,
    });

    const items = await getComplianceReviewItems(wsA);
    const expiring = items.filter((i) => i.name === "Expiring Tax Certificate");
    expect(expiring.length).toBe(1);
    expect(expiring[0].state).toBe("expiring_soon");
  });

  it("[db] item with far-future expiry does NOT appear in default 30-day window", async () => {
    await recordComplianceItem({
      workspaceId: wsA,
      kind: "licence",
      name: "Far Future Licence",
      expiresAt: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000), // 200 days from now
      actorId: actor,
    });

    const items = await getComplianceReviewItems(wsA);
    expect(items.every((i) => i.name !== "Far Future Licence")).toBe(true);
  });

  it("[db] item with no expiresAt does NOT appear in review list", async () => {
    await recordComplianceItem({
      workspaceId: wsA,
      kind: "insurance",
      name: "Open-Ended Insurance",
      actorId: actor,
    });

    const items = await getComplianceReviewItems(wsA);
    expect(items.every((i) => i.name !== "Open-Ended Insurance")).toBe(true);
  });
});

describe("[db] Compliance obligation — workspace isolation", () => {
  it("[db] wsB cannot see wsA compliance items", async () => {
    // Seed an expired item in wsA
    await recordComplianceItem({
      workspaceId: wsA,
      kind: "tax",
      name: "WsA VAT Registration",
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      actorId: actor,
    });

    const wsAItems = await getComplianceReviewItems(wsA);
    const wsBItems = await getComplianceReviewItems(wsB);

    // wsA has at least the expired VAT item
    expect(wsAItems.some((i) => i.name === "WsA VAT Registration")).toBe(true);
    // wsB sees nothing from wsA
    expect(wsBItems.every((i) => i.name !== "WsA VAT Registration")).toBe(true);
  });

  it("[db] wsB items do not leak into wsA review list", async () => {
    await recordComplianceItem({
      workspaceId: wsB,
      kind: "permit",
      name: "WsB Planning Permission",
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      actorId: actor,
    });

    const wsAItems = await getComplianceReviewItems(wsA);
    expect(wsAItems.every((i) => i.name !== "WsB Planning Permission")).toBe(true);
  });
});
