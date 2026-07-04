/**
 * GAP-EVIDENCE-DRIFT-01 — repaired legacy Evidence service [db].
 *
 * Proves the drifted service now runs against the real schema: create → get →
 * list → validate all succeed (previously every call threw
 * PrismaClientValidationError), evidence is scoped via its engagement, and
 * separation-of-duties + workspace isolation hold.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  createEvidence,
  getEvidenceById,
  listEvidence,
  validateEvidence,
} from "@/services/evidence";
import { ForbiddenError, NotFoundError } from "@/infra/errors";

describe("legacy Evidence service (repaired) [db]", () => {
  let workspaceId: string;
  let engagementId: string;
  let clientId: string;
  let submitterId: string;
  let validatorId: string;

  const authCtx = (userId: string) =>
    ({ verifiedActorId: userId, verifiedWorkspaceId: workspaceId }) as never;

  beforeEach(async () => {
    workspaceId = randomUUID();
    clientId = randomUUID();
    engagementId = randomUUID();
    submitterId = randomUUID();
    validatorId = randomUUID();

    await db.workspace.create({ data: { id: workspaceId, name: "WS", slug: `ws-${workspaceId.slice(0, 8)}`, updatedAt: new Date() } });
    await db.user.create({ data: { id: submitterId, email: `${submitterId}@t.local`, isActive: true, updatedAt: new Date() } });
    await db.user.create({ data: { id: validatorId, email: `${validatorId}@t.local`, isActive: true, updatedAt: new Date() } });
    await db.clientAccount.create({ data: { id: clientId, name: "Test Client", updatedAt: new Date() } });
    await db.engagement.create({
      data: {
        id: engagementId,
        code: `ENG-${engagementId.slice(0, 8)}`,
        title: "Test Engagement",
        clientId,
        serviceTier: "standard",
        engagementMode: "advisory",
        workspaceId,
        updatedAt: new Date(),
      },
    });
  });

  afterEach(async () => {
    await db.evidence.deleteMany({ where: { engagementId } }).catch(() => {});
    await db.engagement.deleteMany({ where: { id: engagementId } }).catch(() => {});
    await db.clientAccount.deleteMany({ where: { id: clientId } }).catch(() => {});
    await db.auditEvent.deleteMany({ where: { workspaceId } }).catch(() => {});
    await db.user.deleteMany({ where: { id: { in: [submitterId, validatorId] } } }).catch(() => {});
    await db.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
  });

  it("createEvidence persists against the real schema", async () => {
    const res = await createEvidence(
      {
        engagementId,
        title: "Bank statement Q3",
        description: "Verified against ledger",
        evidenceType: "document",
        sourceReference: "drive://bank-q3.pdf",
        severity: "high",
      },
      authCtx(submitterId),
      workspaceId,
    );
    expect(res.id).toBeTruthy();

    const row = await db.evidence.findUnique({ where: { id: res.id } });
    expect(row?.source).toBe("drive://bank-q3.pdf");
    expect(row?.severityRating).toBe("high");
    expect(row?.submittedBy).toBe(submitterId);
    expect(row?.status).toBe("submitted");
  });

  it("getEvidenceById returns the evidence scoped via engagement", async () => {
    const { id } = await createEvidence(
      { engagementId, title: "Invoice 42", description: "d", evidenceType: "document" },
      authCtx(submitterId),
      workspaceId,
    );
    const got = await getEvidenceById(id, workspaceId);
    expect(got.id).toBe(id);
    expect(got.engagement?.id).toBe(engagementId);
  });

  it("getEvidenceById enforces workspace isolation", async () => {
    const { id } = await createEvidence(
      { engagementId, title: "Invoice 43", description: "d", evidenceType: "document" },
      authCtx(submitterId),
      workspaceId,
    );
    await expect(getEvidenceById(id, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("listEvidence returns evidence for the engagement", async () => {
    await createEvidence({ engagementId, title: "A", description: "d", evidenceType: "observation" }, authCtx(submitterId), workspaceId);
    await createEvidence({ engagementId, title: "B", description: "d", evidenceType: "observation" }, authCtx(submitterId), workspaceId);
    const res = await listEvidence(workspaceId, { engagementId });
    expect(res.total).toBe(2);
    expect(res.evidence.length).toBe(2);
  });

  it("validateEvidence works and enforces separation of duties", async () => {
    const { id } = await createEvidence(
      { engagementId, title: "Contract", description: "d", evidenceType: "document" },
      authCtx(submitterId),
      workspaceId,
    );
    // Submitter cannot self-validate.
    await expect(
      validateEvidence({ evidenceItemId: id, isValid: true, version: 1 }, submitterId, workspaceId),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // A different actor can validate.
    const updated = await validateEvidence({ evidenceItemId: id, isValid: true, version: 1 }, validatorId, workspaceId);
    expect(updated.status).toBe("validated");
    expect(updated.validatedBy).toBe(validatorId);
  });
});
