/**
 * [db] BusinessObjective ownership guard — hostile-review regression proof.
 *
 * Root cause this closes: POST /api/owner/objectives accepts an explicit businessId and
 * _createObjectiveCore persists it directly. BusinessObjective.businessId is a soft FK (no DB-level
 * foreign key, matching this domain's existing convention -- see prisma/schema.prisma), so nothing
 * stopped a caller from attaching a workspace's objective to a business belonging to a DIFFERENT
 * workspace, or to a fixture business. assertBusinessOwnership() (business-objective.service.ts)
 * closes this by proving, inside the same transaction as the insert, that businessId belongs to
 * exactly this workspace and is not a fixture business, before any row is written.
 *
 * Cases (as specified):
 *  A. workspace A + business A            -> PASS
 *  B. workspace A + nonexistent businessId -> REFUSE
 *  C. workspace A + business belonging to workspace B -> REFUSE
 *  D. workspace A + fixture business       -> REFUSE
 *  E. businessId=null workspace-level objective -> PASS
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/owner-mode/business-objective-ownership-guard.db.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import { createObjective, createObjectiveInTx } from "@/services/owner-mode/business-objective.service";
import { NotFoundError } from "@/infra/errors";
import type { Prisma } from "@/generated/prisma/client";

const actorId = randomUUID();
const wsA = randomUUID();
const wsB = randomUUID();
const bizA = randomUUID();
const bizB = randomUUID(); // belongs to wsB
const fixtureBizA = randomUUID(); // belongs to wsA, but isFixtureBusiness=true

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] BusinessObjective ownership guard", () => {
  beforeAll(async () => {
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `bos-guard-${actorId}@test.local`, name: "BOS Guard Test", isActive: true, updatedAt: new Date() },
    });
    for (const [id, label] of [[wsA, "A"], [wsB, "B"]] as const) {
      await db.workspace.upsert({
        where: { id },
        update: {},
        create: { id, name: `BOS Guard WS ${label} ${id.slice(0, 8)}`, slug: `bos-guard-ws-${label.toLowerCase()}-${id.replace(/-/g, "").slice(0, 12)}`, createdBy: actorId },
      });
    }
    await db.ownerBusiness.create({
      data: { id: bizA, workspaceId: wsA, name: "Guard Test Business A", businessType: "laundry_dry_cleaning", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: bizB, workspaceId: wsB, name: "Guard Test Business B (other workspace)", businessType: "cafe", currency: "INR", createdBy: actorId },
    });
    await db.ownerBusiness.create({
      data: { id: fixtureBizA, workspaceId: wsA, name: "Guard Test Fixture Business", businessType: "cafe", currency: "INR", createdBy: actorId, isFixtureBusiness: true },
    });
  });

  afterAll(async () => {
    await db.businessObjective.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.auditEvent.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.ownerBusiness.deleteMany({ where: { workspaceId: { in: [wsA, wsB] } } });
    await db.workspace.deleteMany({ where: { id: { in: [wsA, wsB] } } });
    await db.user.deleteMany({ where: { id: actorId } });
  });

  it("[db] A. workspace A + business A (same workspace) -> creates successfully", async () => {
    const obj = await createObjective({
      workspaceId: wsA, actorId, businessId: bizA,
      title: "Guard case A — same-workspace business", objectiveType: "REVENUE",
    });
    expect(obj.businessId).toBe(bizA);
  });

  it("[db] B. workspace A + nonexistent businessId -> refused, nothing written", async () => {
    const bogusBusinessId = randomUUID();
    const before = await db.businessObjective.count({ where: { workspaceId: wsA } });

    await expect(
      createObjective({
        workspaceId: wsA, actorId, businessId: bogusBusinessId,
        title: "Guard case B — nonexistent business", objectiveType: "REVENUE",
      })
    ).rejects.toThrow(NotFoundError);

    const after = await db.businessObjective.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
  });

  it("[db] C. workspace A + business belonging to workspace B -> refused, no cross-workspace row written", async () => {
    const before = await db.businessObjective.count({ where: { workspaceId: wsA } });

    await expect(
      createObjective({
        workspaceId: wsA, actorId, businessId: bizB,
        title: "Guard case C — cross-workspace business", objectiveType: "REVENUE",
      })
    ).rejects.toThrow(NotFoundError);

    const after = await db.businessObjective.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
    // Zero cross-workspace mutation: bizB's own workspace never received a stray row either.
    const wsBObjectives = await db.businessObjective.count({ where: { workspaceId: wsB } });
    expect(wsBObjectives).toBe(0);
    // And nothing was ever attached to bizB regardless of workspaceId claimed.
    const attachedToBizB = await db.businessObjective.count({ where: { businessId: bizB } });
    expect(attachedToBizB).toBe(0);
  });

  it("[db] D. workspace A + fixture business -> refused, nothing written", async () => {
    const before = await db.businessObjective.count({ where: { workspaceId: wsA } });

    await expect(
      createObjective({
        workspaceId: wsA, actorId, businessId: fixtureBizA,
        title: "Guard case D — fixture business", objectiveType: "REVENUE",
      })
    ).rejects.toThrow(NotFoundError);

    const after = await db.businessObjective.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
    const attachedToFixture = await db.businessObjective.count({ where: { businessId: fixtureBizA } });
    expect(attachedToFixture).toBe(0);
  });

  it("[db] E. businessId=null (explicit workspace-level objective) -> creates successfully, guard skipped", async () => {
    const obj = await createObjective({
      workspaceId: wsA, actorId, businessId: null,
      title: "Guard case E — explicit workspace-level objective", objectiveType: "STRATEGIC",
    });
    expect(obj.businessId).toBeNull();

    // Also omitted entirely (the CreateObjectiveInput.businessId field left undefined) behaves
    // identically — both are "no business attached", never a guard failure.
    const objOmitted = await createObjective({
      workspaceId: wsA, actorId,
      title: "Guard case E2 — businessId omitted entirely", objectiveType: "STRATEGIC",
    });
    expect(objOmitted.businessId).toBeNull();
  });

  it("[db] the guard also protects createObjectiveInTx (the createBlueprint call path), not just the top-level HTTP-facing createObjective", async () => {
    const before = await db.businessObjective.count({ where: { workspaceId: wsA } });

    await expect(
      db.$transaction((tx: Prisma.TransactionClient) =>
        createObjectiveInTx(tx, {
          workspaceId: wsA, actorId, businessId: bizB,
          title: "Guard case — in-tx caller, cross-workspace business", objectiveType: "REVENUE",
        })
      )
    ).rejects.toThrow(NotFoundError);

    const after = await db.businessObjective.count({ where: { workspaceId: wsA } });
    expect(after).toBe(before);
  });
});
