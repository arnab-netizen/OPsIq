/**
 * Wave 2 (REAL_OWNER_RUNTIME_LOOP) — S2 DB proof: proof-submit contract is server-authoritative.
 *
 * POST /api/proof/submit previously forwarded the client-supplied proof contract (requirement,
 * proofId, fromStatus, existingHashes, actor) straight into submitProof, so a caller could
 * self-certify a permissive requirement and duplicate detection was inert. `intakeProofSubmission`
 * now loads the task, the latest submittable Proof + its ProofRequirement, and the workspace's
 * existing file hashes from the DB, and derives the actor from the session. These tests prove:
 * a valid submission transitions the real proof to SUBMITTED; a submission missing a DB-required
 * field is rejected even though the client sends no/permissive requirement; a reused file hash is
 * flagged; a foreign-workspace task is not found; and a non-assignee is denied.
 *
 * Run: TEST_WITH_DB=true npx vitest run src/__tests__/services/execution/proof-intake.service.db.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { assignDelegatedTask } from "@/services/execution/task-assignment.service";
import { intakeProofSubmission } from "@/services/execution/proof-intake.service";
import { ProofType, ProofRiskLevel, ProofStatus } from "@/domain/execution/proof";
import { SHOULD_RUN_DB_TESTS } from "@/__tests__/test-helpers/db-test-gate";

interface WS { ownerId: string; empId: string; otherEmpId: string; workspaceId: string; }

async function seedWorkspace(tag: string): Promise<WS> {
  const ownerId = randomUUID(), empId = randomUUID(), otherEmpId = randomUUID(), workspaceId = randomUUID();
  await db.workspace.create({ data: { id: workspaceId, name: `WS ${tag}`, slug: `pi-${workspaceId.substring(0, 8)}` } });
  for (const [uid, role] of [[ownerId, "owner"], [empId, "member"], [otherEmpId, "member"]] as const) {
    await db.user.create({ data: { id: uid, email: `pi-${tag}-${uid}@example.com`, isActive: true, updatedAt: new Date() } });
    await db.workspaceMembership.create({ data: { userId: uid, workspaceId, role, isActive: true } });
  }
  return { ownerId, empId, otherEmpId, workspaceId };
}

async function cleanup(ws: WS) {
  await db.proof.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.proofRequirement.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.delegatedTask.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.auditEvent.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  await db.workspaceMembership.deleteMany({ where: { workspaceId: ws.workspaceId } }).catch(() => undefined);
  for (const uid of [ws.ownerId, ws.empId, ws.otherEmpId]) await db.user.delete({ where: { id: uid } }).catch(() => undefined);
  await db.workspace.delete({ where: { id: ws.workspaceId } }).catch(() => undefined);
}

/** Assign a task to `empId` requiring a PHOTO proof with a required "note" field. */
async function assignWithProof(ws: WS) {
  return assignDelegatedTask({
    workspaceId: ws.workspaceId, actorId: ws.ownerId, title: "Clean machine", assignedUserId: ws.empId,
    requireProof: { proofType: ProofType.PHOTO, requiredFields: ["note"], riskLevel: ProofRiskLevel.LOW },
  });
}

describe.skipIf(!SHOULD_RUN_DB_TESTS)("[db] Wave 2 S2 — proof-submit contract is server-authoritative", () => {
  let A: WS, B: WS;
  beforeEach(async () => { A = await seedWorkspace("A"); B = await seedWorkspace("B"); });
  afterEach(async () => { await cleanup(A); await cleanup(B); });

  it("[db] a valid submission transitions the real proof PENDING_SUBMISSION → SUBMITTED", async () => {
    const t = await assignWithProof(A);
    const res = await intakeProofSubmission({
      workspaceId: A.workspaceId, actorId: A.empId, taskId: t.taskId,
      submission: { proofType: ProofType.PHOTO, fields: { note: "done" }, fileHash: "hash-ok" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.status).toBe(ProofStatus.SUBMITTED);
    const proof = await db.proof.findUnique({ where: { id: t.proofId! }, select: { status: true } });
    expect(proof?.status).toBe(ProofStatus.SUBMITTED);
  });

  it("[db] the DB requirement is authoritative — a missing required field is rejected regardless of client input", async () => {
    const t = await assignWithProof(A);
    // Client omits the DB-required "note" field (and could previously self-certify a permissive requirement).
    const res = await intakeProofSubmission({
      workspaceId: A.workspaceId, actorId: A.empId, taskId: t.taskId,
      submission: { proofType: ProofType.PHOTO, fields: {}, fileHash: "hash-x" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues?.some((i) => i.includes("MISSING_FIELD"))).toBe(true);
    // The proof stays submittable — the rejection did not advance state.
    const proof = await db.proof.findUnique({ where: { id: t.proofId! }, select: { status: true } });
    expect(proof?.status).toBe(ProofStatus.PENDING_SUBMISSION);
  });

  it("[db] a reused file hash in the workspace is flagged (duplicate detection is live at submit)", async () => {
    // Seed an existing proof in the same workspace carrying the hash we will reuse.
    await db.proof.create({
      data: { id: randomUUID(), workspaceId: A.workspaceId, taskId: null, proofType: ProofType.PHOTO,
        status: ProofStatus.ACCEPTED, fileHash: "dup-hash", updatedAt: new Date() },
    });
    const t = await assignWithProof(A);
    const res = await intakeProofSubmission({
      workspaceId: A.workspaceId, actorId: A.empId, taskId: t.taskId,
      submission: { proofType: ProofType.PHOTO, fields: { note: "done" }, fileHash: "dup-hash" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.duplicateFlagged).toBe(true);
  });

  it("[db] a task in another workspace is not found (isolation)", async () => {
    const t = await assignWithProof(A);
    const res = await intakeProofSubmission({
      workspaceId: B.workspaceId, actorId: B.empId, taskId: t.taskId,
      submission: { proofType: ProofType.PHOTO, fields: { note: "x" }, fileHash: "h" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("not found");
  });

  it("[db] a non-assignee employee is denied task access", async () => {
    const t = await assignWithProof(A);
    await expect(
      intakeProofSubmission({
        workspaceId: A.workspaceId, actorId: A.otherEmpId, taskId: t.taskId,
        submission: { proofType: ProofType.PHOTO, fields: { note: "x" }, fileHash: "h" },
      })
    ).rejects.toThrow();
  });
});
