import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { updateFinding } from "@/services/findings";
import { ConflictError, NotFoundError } from "@/infra/errors";
import type { ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * updateFinding optimistic locking — DB proof.
 *
 * Root cause (same pattern as updateAction / updateRecommendation, review finding 3 batch):
 * updateFinding (PATCH /api/findings/[findingId]) compared input.version with a pre-read and
 * then wrote `version = existing.version + 1` with `where: { id }` only. Two writers holding
 * the same version both passed the check and both committed (the second silently overwrote
 * the first). A stale version surfaced as a 400 ValidationError instead of a 409.
 *
 * After the fix the write is compare-and-set on (id, workspace, version); a stale or lost
 * race is ConflictError (409) and the losing write changes nothing.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)("updateFinding — compare-and-set on version", () => {
  const stamp = uuidv4();
  const userId = uuidv4();
  const ws = uuidv4();
  const otherWs = uuidv4();
  const clientId = uuidv4();
  const engagementId = uuidv4();
  const evidenceId = uuidv4();
  const findingId = uuidv4();

  const auth = (workspaceId: string): ServiceAuthEnvelope => ({
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: new Set<string>(),
    hasInternalAccess: true,
  });

  beforeAll(async () => {
    await db.user.create({ data: { id: userId, email: `finding-cas-${stamp}@test.local`, updatedAt: new Date() } });
    await db.workspace.create({ data: { id: ws, name: "Finding CAS WS", slug: `finding-cas-${stamp}` } });
    await db.workspace.create({ data: { id: otherWs, name: "Finding CAS other WS", slug: `finding-cas-o-${stamp}` } });
    await db.clientAccount.create({ data: { id: clientId, name: "Finding CAS client", createdBy: userId, updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementId, code: `FIND-CAS-${stamp}`, title: "Finding CAS engagement", clientId,
        serviceTier: "tier_1", engagementMode: "strategic_planning", workspaceId: ws, updatedAt: new Date(),
      },
    });
    await db.evidence.create({
      data: { id: evidenceId, engagementId, title: "ev", description: "ev", source: "test", status: "validated", updatedAt: new Date() },
    });
    await db.finding.create({
      data: { id: findingId, engagementId, primaryEvidenceId: evidenceId, title: "original", summary: "s", severity: "high", impactArea: "operational", updatedAt: new Date() },
    });
  });

  afterAll(async () => {
    try {
      await db.finding.deleteMany({ where: { id: findingId } });
      await db.evidence.deleteMany({ where: { id: evidenceId } });
      await db.engagement.deleteMany({ where: { id: engagementId } });
      await db.clientAccount.deleteMany({ where: { id: clientId } });
      await db.auditEvent.deleteMany({ where: { workspaceId: { in: [ws, otherWs] } } });
      await db.workspace.deleteMany({ where: { id: { in: [ws, otherWs] } } });
      await db.user.deleteMany({ where: { id: userId } });
    } catch {
      // best-effort cleanup
    }
  });

  const snapshot = () => db.finding.findUniqueOrThrow({ where: { id: findingId }, select: { version: true, title: true } });

  it("[db] a foreign workspace gets NotFound and nothing changes", async () => {
    const before = await snapshot();
    await expect(updateFinding(findingId, { version: before.version, title: "hijack" }, auth(otherWs))).rejects.toBeInstanceOf(NotFoundError);
    expect(await snapshot()).toEqual(before);
  });

  it("[db] two concurrent writers from the same version → exactly one wins, the other gets 409", async () => {
    const before = await snapshot();
    const results = await Promise.allSettled([
      updateFinding(findingId, { version: before.version, title: "writer one" }, auth(ws)),
      updateFinding(findingId, { version: before.version, title: "writer two" }, auth(ws)),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBeInstanceOf(ConflictError);
    expect((await snapshot()).version).toBe(before.version + 1);
  });

  it("[db] a stale version is a 409 ConflictError and nothing changes", async () => {
    const before = await snapshot();
    await expect(updateFinding(findingId, { version: before.version - 1, title: "stale" }, auth(ws))).rejects.toBeInstanceOf(ConflictError);
    expect(await snapshot()).toEqual(before);
  });
});
