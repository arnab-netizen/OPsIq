import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  listFindingsForEngagement,
  getFindingDetail,
  linkEvidenceToFinding,
  unlinkEvidenceFromFinding,
} from "@/services/findings";
import { NotFoundError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import type { ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

/**
 * Phase 6A F1 — findings.ts invalid-select cluster (owner-facing raw 500) regression proof.
 *
 * The Finding model has NO `linkedEvidence`/`description`/`findingType`/`provisionalFlag` columns and
 * Evidence has no `relatedFindingId`/`visibility` column. The service selected them, so
 * `GET /api/engagements/[id]/findings`, `GET /api/findings/[id]`, and evidence link/unlink threw
 * PrismaClientValidationError → raw 500 on every call. Fix: select only real columns; persist linked
 * evidence in the real `Finding.metadata` JSON; derive description/findingType/provisionalFlag from real
 * columns. This proves the failure and the fix against a REAL database (no Prisma mocks).
 *
 * DB-backed; gated by SHOULD_RUN_DB_TESTS / TEST_WITH_DB=true.
 */
describe.skipIf(!SHOULD_RUN_DB_TESTS)(
  "[db] Phase 6A F1 — findings endpoints survive (no invalid-select raw 500)",
  () => {
    const stamp = randomUUID().substring(0, 8);
    const workspaceId = randomUUID();
    const otherWorkspaceId = randomUUID();
    const userId = randomUUID();
    const clientId = randomUUID();
    const engagementId = randomUUID();
    const evidence1Id = randomUUID();
    const evidence2Id = randomUUID();
    const findingId = randomUUID();

    const auth: ServiceAuthEnvelope = {
      verifiedActorId: userId,
      verifiedActorType: "user",
      verifiedWorkspaceId: workspaceId,
      verifiedCapabilities: new Set<string>([
        CAPABILITIES.FINDING_VIEW,
        CAPABILITIES.FINDING_UPDATE,
        CAPABILITIES.FINDING_VALIDATE,
      ]),
      hasInternalAccess: false,
    };

    beforeAll(async () => {
      await db.workspace.create({ data: { id: workspaceId, name: "P6A WS", slug: `p6a-${stamp}` } });
      await db.workspace.create({
        data: { id: otherWorkspaceId, name: "P6A Other WS", slug: `p6a-other-${stamp}` },
      });
      // Real actor row so emitAuditEvent's `audit_events_actor_id_fkey` FK is satisfied on link/unlink.
      await db.user.create({
        data: { id: userId, email: `p6a-${stamp}@test.local`, isActive: true, updatedAt: new Date() },
      });
      await db.clientAccount.create({
        data: { id: clientId, name: "P6A Client", workspaceId, updatedAt: new Date() },
      });
      await db.engagement.create({
        data: {
          id: engagementId,
          code: `P6A-${stamp}`,
          title: "P6A Engagement",
          clientId,
          serviceTier: "standard",
          engagementMode: "advisory",
          workspaceId,
          updatedAt: new Date(),
        },
      });
      for (const [id, vis] of [
        [evidence1Id, "internal"],
        [evidence2Id, "client_visible"],
      ] as const) {
        await db.evidence.create({
          data: {
            id,
            engagementId,
            title: `Evidence ${id.substring(0, 4)}`,
            description: "evidence",
            source: "owner",
            status: "validated",
            metadata: { visibility: vis },
            updatedAt: new Date(),
          },
        });
      }
      await db.finding.create({
        data: {
          id: findingId,
          engagementId,
          primaryEvidenceId: evidence1Id,
          title: "P6A Finding",
          summary: "A finding summary",
          severity: "high",
          impactArea: "revenue",
          updatedAt: new Date(),
        },
      });
    });

    afterAll(async () => {
      try {
        await db.auditEvent.deleteMany({ where: { workspaceId } });
        await db.finding.deleteMany({ where: { engagementId } });
        await db.evidence.deleteMany({ where: { engagementId } });
        await db.engagement.deleteMany({ where: { id: engagementId } });
        await db.clientAccount.deleteMany({ where: { id: clientId } });
        await db.user.deleteMany({ where: { id: userId } });
        await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
      } catch {
        // best-effort cleanup (ephemeral CI database)
      }
    });

    it("[db] proves the defect class: the OLD phantom `linkedEvidence` select throws on a real DB", async () => {
      let threw = false;
      try {
        // The exact invalid select the service used before the fix. Cast because the field does not
        // exist on the Prisma type either — it never has.
        await db.finding.findMany({
          where: { engagementId },
          select: { id: true, linkedEvidence: true } as never,
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    it("[db] listFindingsForEngagement returns findings without a raw 500", async () => {
      const findings = await listFindingsForEngagement(engagementId, undefined, undefined, workspaceId);
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.some((f) => f.id === findingId)).toBe(true);
    });

    it("[db] getFindingDetail returns a mapped DTO without a raw 500", async () => {
      const detail = await getFindingDetail(findingId, undefined, undefined, workspaceId);
      expect(detail.id).toBe(findingId);
      expect(detail.description).toBe("A finding summary"); // description ← summary
      expect(typeof detail.findingType).toBe("string"); // derived from impactArea
      expect(Array.isArray(detail.linkedEvidence)).toBe(true);
      expect(detail.linkedEvidence).toEqual([]); // none linked yet
      expect(detail.provisionalFlag).toBe(false);
    });

    it("[db] link then unlink evidence persists via metadata, no raw 500", async () => {
      await linkEvidenceToFinding(findingId, evidence2Id, auth);
      const afterLink = await getFindingDetail(findingId, undefined, undefined, workspaceId);
      expect(afterLink.linkedEvidence).toContain(evidence2Id);

      await unlinkEvidenceFromFinding(findingId, evidence2Id, auth);
      const afterUnlink = await getFindingDetail(findingId, undefined, undefined, workspaceId);
      expect(afterUnlink.linkedEvidence).not.toContain(evidence2Id);
    });

    it("[db] a foreign workspace cannot read the finding (tenant isolation preserved)", async () => {
      await expect(
        getFindingDetail(findingId, undefined, undefined, otherWorkspaceId)
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  }
);
