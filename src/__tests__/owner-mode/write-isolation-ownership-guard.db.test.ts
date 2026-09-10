/**
 * [db] Cross-business write-isolation ownership guard — hostile-review regression proof.
 *
 * Root cause this closes: four owner-mode services accepted an explicit, client-supplied
 * businessId and persisted it verbatim with no ownership check:
 *   - customer-complaint.service.ts   (createComplaint)
 *   - compliance.service.ts           (recordComplianceItem)
 *   - equipment.service.ts            (recordEquipment)
 *   - sop-document.service.ts         (createSopDraft)
 *
 * All four models (CustomerComplaint, OwnerComplianceItem, OwnerEquipment, OwnerSopDocument)
 * declare businessId as a soft FK (no Prisma @relation / DB-level foreign key — see
 * prisma/schema.prisma), matching this domain's existing convention. Nothing stopped a caller
 * from attaching a governed record to a business belonging to a DIFFERENT workspace, to a
 * fixture business, or to a nonexistent id — the exact bug class already fixed once for
 * BusinessObjective.businessId (commit 3bf4ca8e, see business-objective-ownership-guard.db.test.ts
 * for the precedent this file mirrors).
 *
 * Hostile-test findings that motivated this fix (see PR description for full detail):
 *  - CustomerComplaint has no downstream consumer today — currently inert, but still a governed
 *    write-integrity gap worth closing before any future consumer is added.
 *  - OwnerComplianceItem and OwnerEquipment ARE read by owner-action-gate.service.ts's bizScope()
 *    helper, which already excludes a specific foreign businessId from a sibling business's gate
 *    check (its own OR-based design) — but a fabricated row with businessId=null is workspace-wide
 *    by design, so unvalidated content in such a row is still real risk surface.
 *  - OwnerEquipment is ALSO read by recommendation-capacity-safety.service.ts, which queries by
 *    workspaceId only (no businessId filter at all) — a separate, pre-existing business-scoping
 *    gap in that consumer, out of scope for this fix (flagged separately, not bundled here to
 *    avoid scope creep — the ownership guard closes the WRITE-time gap; that consumer's own
 *    missing READ-time businessId filter is a distinct root cause).
 *  - OwnerSopDocument's businessId is read by sop-process-intelligence.service.ts to route a
 *    training/compliance signal to "the business" — a fabricated businessId could misroute that
 *    signal to a sibling business in the same workspace.
 *
 * Fix: each service now verifies, before insert, that a supplied businessId resolves to a real,
 * non-fixture OwnerBusiness in the caller's own workspace — mirroring
 * founder-recovery/business.service.ts:getBusiness and business-objective.service.ts's
 * assertBusinessOwnership() exactly. Fails closed with a plain NotFoundError in every negative
 * case (nonexistent id, cross-workspace id, fixture business), so a caller can never distinguish
 * "no such business" from "that business belongs to someone else" from the response.
 * businessId=null / omitted is unaffected — the guard is skipped entirely.
 *
 * Cases per service (A-E, matching the BusinessObjective precedent):
 *  A. workspace A + business A (same workspace)          -> PASS
 *  B. workspace A + nonexistent businessId                -> REFUSE, zero rows written
 *  C. workspace A + business belonging to workspace B     -> REFUSE, zero rows written anywhere
 *  D. workspace A + fixture business (same workspace)     -> REFUSE, zero rows written
 *  E. businessId=null / omitted                            -> PASS, guard skipped
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/write-isolation-ownership-guard.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createComplaint } from "@/services/owner-mode/customer-complaint.service";
import { recordComplianceItem } from "@/services/owner-mode/compliance.service";
import { recordEquipment } from "@/services/owner-mode/equipment.service";
import { createSopDraft } from "@/services/owner-mode/sop-document.service";
import { NotFoundError } from "@/infra/errors";

const actorId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID(); // belongs to wsB
const fixtureBizA = randomUUID(); // belongs to wsA, but isFixtureBusiness=true

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] cross-business write-isolation ownership guard", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `write-guard-${actorId}@test.local`, name: "Write Guard Test", isActive: true, updatedAt: new Date() },
    });
    for (const [id, label] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `Write Guard WS ${label} ${id.slice(0, 8)}`, slug: `write-guard-ws-${label.toLowerCase()}-${id.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
      });
    }
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: wsA, name: "Write Guard Business A", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: wsB, name: "Write Guard Business B (other workspace)", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: fixtureBizA, workspaceId: wsA, name: "Write Guard Fixture Business", businessType: "cafe", currency: "INR", createdBy: actorId, isFixtureBusiness: true },
    });
  });

  afterAll(async () => {
    await db.customerComplaint.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerComplianceItem.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerEquipment.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerSopDocument.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  describe("customer-complaint.service.ts createComplaint", () => {
    it("[db] A. same-workspace business -> creates successfully", async () => {
      const dto = await createComplaint({
        workspaceId: wsA, actorId, idempotencyKey: `guard-a-${randomUUID()}`,
        title: "Guard case A", description: "same-workspace business", businessId: bizA,
      });
      expect(dto.businessId).toBe(bizA);
    });

    it("[db] B. nonexistent businessId -> refused, nothing written", async () => {
      const bogus = randomUUID();
      const before = await db.customerComplaint.count({ where: { workspaceId: wsA } });
      await expect(
        createComplaint({
          workspaceId: wsA, actorId, idempotencyKey: `guard-b-${randomUUID()}`,
          title: "Guard case B", description: "nonexistent business", businessId: bogus,
        })
      ).rejects.toThrow(NotFoundError);
      expect(await db.customerComplaint.count({ where: { workspaceId: wsA } })).toBe(before);
    });

    it("[db] C. cross-workspace business -> refused, no row written in either workspace", async () => {
      const before = await db.customerComplaint.count({ where: { workspaceId: wsA } });
      await expect(
        createComplaint({
          workspaceId: wsA, actorId, idempotencyKey: `guard-c-${randomUUID()}`,
          title: "Guard case C", description: "cross-workspace business", businessId: bizB,
        })
      ).rejects.toThrow(NotFoundError);
      expect(await db.customerComplaint.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.customerComplaint.count({ where: { businessId: bizB } })).toBe(0);
    });

    it("[db] D. fixture business -> refused, nothing written", async () => {
      const before = await db.customerComplaint.count({ where: { workspaceId: wsA } });
      await expect(
        createComplaint({
          workspaceId: wsA, actorId, idempotencyKey: `guard-d-${randomUUID()}`,
          title: "Guard case D", description: "fixture business", businessId: fixtureBizA,
        })
      ).rejects.toThrow(NotFoundError);
      expect(await db.customerComplaint.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.customerComplaint.count({ where: { businessId: fixtureBizA } })).toBe(0);
    });

    it("[db] E. businessId omitted -> creates successfully, guard skipped", async () => {
      const dto = await createComplaint({
        workspaceId: wsA, actorId, idempotencyKey: `guard-e-${randomUUID()}`,
        title: "Guard case E", description: "no business attached",
      });
      expect(dto.businessId).toBeNull();
    });
  });

  describe("compliance.service.ts recordComplianceItem", () => {
    it("[db] A. same-workspace business -> creates successfully", async () => {
      const id = await recordComplianceItem({ workspaceId: wsA, actorId, businessId: bizA, kind: "licence", name: "Guard case A" });
      const row = await db.ownerComplianceItem.findUnique({ where: { id } });
      expect(row?.businessId).toBe(bizA);
    });

    it("[db] B. nonexistent businessId -> refused, nothing written", async () => {
      const bogus = randomUUID();
      const before = await db.ownerComplianceItem.count({ where: { workspaceId: wsA } });
      await expect(
        recordComplianceItem({ workspaceId: wsA, actorId, businessId: bogus, kind: "licence", name: "Guard case B" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerComplianceItem.count({ where: { workspaceId: wsA } })).toBe(before);
    });

    it("[db] C. cross-workspace business -> refused, no row written in either workspace", async () => {
      const before = await db.ownerComplianceItem.count({ where: { workspaceId: wsA } });
      await expect(
        recordComplianceItem({ workspaceId: wsA, actorId, businessId: bizB, kind: "licence", name: "Guard case C" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerComplianceItem.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerComplianceItem.count({ where: { businessId: bizB } })).toBe(0);
    });

    it("[db] D. fixture business -> refused, nothing written", async () => {
      const before = await db.ownerComplianceItem.count({ where: { workspaceId: wsA } });
      await expect(
        recordComplianceItem({ workspaceId: wsA, actorId, businessId: fixtureBizA, kind: "licence", name: "Guard case D" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerComplianceItem.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerComplianceItem.count({ where: { businessId: fixtureBizA } })).toBe(0);
    });

    it("[db] E. businessId omitted -> creates successfully, guard skipped", async () => {
      const id = await recordComplianceItem({ workspaceId: wsA, actorId, kind: "licence", name: "Guard case E" });
      const row = await db.ownerComplianceItem.findUnique({ where: { id } });
      expect(row?.businessId).toBeNull();
    });
  });

  describe("equipment.service.ts recordEquipment", () => {
    it("[db] A. same-workspace business -> creates successfully", async () => {
      const id = await recordEquipment({ workspaceId: wsA, actorId, businessId: bizA, equipmentType: "oven", name: "Guard case A" });
      const row = await db.ownerEquipment.findUnique({ where: { id } });
      expect(row?.businessId).toBe(bizA);
    });

    it("[db] B. nonexistent businessId -> refused, nothing written", async () => {
      const bogus = randomUUID();
      const before = await db.ownerEquipment.count({ where: { workspaceId: wsA } });
      await expect(
        recordEquipment({ workspaceId: wsA, actorId, businessId: bogus, equipmentType: "oven", name: "Guard case B" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerEquipment.count({ where: { workspaceId: wsA } })).toBe(before);
    });

    it("[db] C. cross-workspace business -> refused, no row written in either workspace", async () => {
      const before = await db.ownerEquipment.count({ where: { workspaceId: wsA } });
      await expect(
        recordEquipment({ workspaceId: wsA, actorId, businessId: bizB, equipmentType: "oven", name: "Guard case C" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerEquipment.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerEquipment.count({ where: { businessId: bizB } })).toBe(0);
    });

    it("[db] D. fixture business -> refused, nothing written", async () => {
      const before = await db.ownerEquipment.count({ where: { workspaceId: wsA } });
      await expect(
        recordEquipment({ workspaceId: wsA, actorId, businessId: fixtureBizA, equipmentType: "oven", name: "Guard case D" })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerEquipment.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerEquipment.count({ where: { businessId: fixtureBizA } })).toBe(0);
    });

    it("[db] E. businessId omitted -> creates successfully, guard skipped", async () => {
      const id = await recordEquipment({ workspaceId: wsA, actorId, equipmentType: "oven", name: "Guard case E" });
      const row = await db.ownerEquipment.findUnique({ where: { id } });
      expect(row?.businessId).toBeNull();
    });
  });

  describe("sop-document.service.ts createSopDraft", () => {
    it("[db] A. same-workspace business -> creates successfully", async () => {
      const id = await createSopDraft({ workspaceId: wsA, actorId, businessId: bizA, process: "opening", title: "Guard case A", steps: [], proofRequirements: [] });
      const row = await db.ownerSopDocument.findUnique({ where: { id } });
      expect(row?.businessId).toBe(bizA);
    });

    it("[db] B. nonexistent businessId -> refused, nothing written", async () => {
      const bogus = randomUUID();
      const before = await db.ownerSopDocument.count({ where: { workspaceId: wsA } });
      await expect(
        createSopDraft({ workspaceId: wsA, actorId, businessId: bogus, process: "opening", title: "Guard case B", steps: [], proofRequirements: [] })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerSopDocument.count({ where: { workspaceId: wsA } })).toBe(before);
    });

    it("[db] C. cross-workspace business -> refused, no row written in either workspace", async () => {
      const before = await db.ownerSopDocument.count({ where: { workspaceId: wsA } });
      await expect(
        createSopDraft({ workspaceId: wsA, actorId, businessId: bizB, process: "opening", title: "Guard case C", steps: [], proofRequirements: [] })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerSopDocument.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerSopDocument.count({ where: { businessId: bizB } })).toBe(0);
    });

    it("[db] D. fixture business -> refused, nothing written", async () => {
      const before = await db.ownerSopDocument.count({ where: { workspaceId: wsA } });
      await expect(
        createSopDraft({ workspaceId: wsA, actorId, businessId: fixtureBizA, process: "opening", title: "Guard case D", steps: [], proofRequirements: [] })
      ).rejects.toThrow(NotFoundError);
      expect(await db.ownerSopDocument.count({ where: { workspaceId: wsA } })).toBe(before);
      expect(await db.ownerSopDocument.count({ where: { businessId: fixtureBizA } })).toBe(0);
    });

    it("[db] E. businessId omitted -> creates successfully, guard skipped", async () => {
      const id = await createSopDraft({ workspaceId: wsA, actorId, process: "opening", title: "Guard case E", steps: [], proofRequirements: [] });
      const row = await db.ownerSopDocument.findUnique({ where: { id } });
      expect(row?.businessId).toBeNull();
    });
  });
});
