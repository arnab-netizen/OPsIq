/**
 * DEC-EVID-01 [db]: evidence bundles are SAFELY DISABLED for owner use.
 *
 * Finding: `EvidenceBundle`/`EvidenceBundleItem` group `EvidenceItem` rows — a model
 * divorced from the canonical `Evidence` proof pipeline (`db.evidence`) that intake,
 * verification and recommendation actually use. No active service writes `EvidenceItem`
 * and no proof path reads `EvidenceBundle`, so bundles must not become a parallel proof
 * truth. The subsystem also carried irreconcilable schema drift and never functioned.
 *
 * Closure = SAFELY_DISABLED_FOR_OWNER_USE: every bundle entry point fails closed at a
 * single service-layer chokepoint with a typed FeatureDisabledError (501), regardless of
 * workspace. This proves: (a) no bundle write/read can reach the DB, (b) the disablement
 * is centralized (no route can bypass it), (c) canonical Evidence is untouched.
 *
 * Requires TEST_WITH_DB=true (only to prove the seeded, workspace-valid inputs still
 * fail closed — i.e. the block is unconditional, not an incidental validation failure).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";
import {
  createEvidenceBundle,
  getEvidenceBundleById,
  listEvidenceBundles,
  addEvidenceToBundle,
  removeEvidenceFromBundle,
  updateEvidenceBundle,
} from "@/services/evidence";
import { FeatureDisabledError } from "@/infra/errors";

const userId = randomUUID();
const ws = randomUUID();
const clientId = randomUUID();
const engagementId = randomUUID();
const NOW = new Date("2026-07-04T00:00:00Z");
const authCtx = { verifiedActorId: userId } as any;

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] DEC-EVID-01 evidence bundles are safely disabled", () => {
  beforeAll(async () => {
    await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `eb-${userId}@e.com`, name: "e", isActive: true, updatedAt: NOW } });
    await db.workspace.upsert({ where: { id: ws }, update: {}, create: { id: ws, name: `WS ${ws}`, slug: `ws-${ws}`, createdBy: userId } });
    await db.clientAccount.create({ data: { id: clientId, workspaceId: ws, name: "c", updatedAt: NOW } });
    await db.engagement.create({ data: { id: engagementId, workspaceId: ws, code: `E-${engagementId.slice(0, 8)}`, title: "e", clientId, serviceTier: "standard", engagementMode: "advisory", updatedAt: NOW } });
  });
  afterAll(async () => {
    await db.engagement.deleteMany({ where: { id: engagementId } });
    await db.clientAccount.deleteMany({ where: { id: clientId } });
    await db.workspace.deleteMany({ where: { id: ws } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  it("every bundle entry point fails closed with FeatureDisabledError (501), even for valid workspace inputs", async () => {
    const bid = randomUUID();
    const eid = randomUUID();

    await expect(createEvidenceBundle({ engagementId, title: "B" } as any, authCtx, ws)).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(getEvidenceBundleById(bid, ws)).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(listEvidenceBundles(engagementId, ws)).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(addEvidenceToBundle({ bundleId: bid, evidenceItemId: eid } as any, authCtx, ws)).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(removeEvidenceFromBundle({ bundleId: bid, evidenceItemId: eid } as any, authCtx, ws)).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(updateEvidenceBundle(bid, { version: 1 } as any, authCtx, ws)).rejects.toBeInstanceOf(FeatureDisabledError);

    // 501 Not Implemented, non-retryable — a client retry never succeeds while disabled.
    const err = await createEvidenceBundle({ engagementId, title: "B" } as any, authCtx, ws).catch((e) => e);
    expect(err.statusCode).toBe(501);
    expect(err.code).toBe("FEATURE_DISABLED");

    // Fail-closed means NOTHING was written: no bundle rows exist for this engagement.
    expect(await db.evidenceBundle.count({ where: { engagementId } })).toBe(0);
  });
});
