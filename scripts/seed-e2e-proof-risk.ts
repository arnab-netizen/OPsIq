/**
 * Seed ONE deterministic proof-risk finding into the E2E owner workspace so the owner adjudication
 * queue (`/owner/adjudication`) renders at least one adjudicable item in the browser E2E.
 *
 * Run AFTER `scripts/seed-owner-scenarios.ts` (which creates the loginable E2E owner + workspace +
 * role + active businesses). It creates a staff user who both SUBMITS and REVIEWS their own two proofs
 * (self-review — separation of duty bypassed). That surfaces the anti-gaming SELF_REVIEW_ATTEMPT
 * signal as the workspace's top gaming signal, with COMPLETE source completeness + the two supporting
 * proof IDs, so the queue shows one adjudicable finding. Deterministic IDs + idempotent upserts →
 * stable, re-runnable assertions. No fraud/theft label is written; this is a governed review flag.
 */
import { randomUUID } from "crypto";
import { E2E_OWNER, E2E_WORKSPACE_ID } from "../tests/browser/e2e-fixtures";
import { GuidedExecutionPermission } from "../src/domain/workspace/guided-execution-permissions";
import { PrismaPg } from "@prisma/adapter-pg";
import type { PrismaClient as PrismaClientType } from "../src/generated/prisma/client";

// Deterministic fixture IDs (distinct 4xxx/5xxx space so they never collide with scenario seeds).
export const E2E_PROOF_RISK_STAFF_ID = "50000000-0000-4000-8000-0000000000f1";
export const E2E_PROOF_RISK_PROOF_1 = "51000000-0000-4000-8000-0000000000f1";
export const E2E_PROOF_RISK_PROOF_2 = "51000000-0000-4000-8000-0000000000f2";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaClientType;

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  // The self-reviewing staff member (a real user row so the submitter/reviewer id resolves).
  await prisma.user.upsert({
    where: { id: E2E_PROOF_RISK_STAFF_ID },
    update: { name: "E2E Self-Review Staff", isActive: true },
    create: { id: E2E_PROOF_RISK_STAFF_ID, email: "e2e-selfreview@staging.local", name: "E2E Self-Review Staff", isActive: true, updatedAt: now },
  });

  // Two proofs the staff member both submitted AND reviewed (self-review — the pattern the signal catches).
  for (const [id, ago] of [[E2E_PROOF_RISK_PROOF_1, 6], [E2E_PROOF_RISK_PROOF_2, 5]] as const) {
    await prisma.proof.upsert({
      where: { id },
      update: { status: "ACCEPTED", submittedByUserId: E2E_PROOF_RISK_STAFF_ID, reviewedByUserId: E2E_PROOF_RISK_STAFF_ID, reviewedAt: hoursAgo(ago) },
      create: {
        id,
        workspaceId: E2E_WORKSPACE_ID,
        taskId: `52000000-0000-4000-8000-0000000000f${id === E2E_PROOF_RISK_PROOF_1 ? "a" : "b"}`,
        proofType: "photo",
        status: "ACCEPTED",
        submittedByUserId: E2E_PROOF_RISK_STAFF_ID,
        reviewedByUserId: E2E_PROOF_RISK_STAFF_ID,
        submittedAt: hoursAgo(ago + 1),
        reviewedAt: hoursAgo(ago),
        createdAt: hoursAgo(ago + 1),
        updatedAt: hoursAgo(ago),
      },
    });
  }

  // Grant the E2E owner the proof-review permission the adjudicate route requires (the same
  // UserRoleAssignment grant path production uses — role = the permission string, workspace-scoped).
  // Without it the POST /api/proof-risk/adjudicate is correctly denied; a real adjudicating owner holds it.
  await prisma.userRoleAssignment.upsert({
    where: { userId_role_scope_scopeId: { userId: E2E_OWNER.userId, role: GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK, scope: "workspace", scopeId: E2E_WORKSPACE_ID } },
    update: { isActive: true, revokedAt: null },
    create: { id: randomUUID(), userId: E2E_OWNER.userId, role: GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK, scope: "workspace", scopeId: E2E_WORKSPACE_ID, isActive: true },
  });

  // Ensure no stale adjudication suppresses the finding (idempotent re-seed → a clean, active item).
  await prisma.proofRiskAdjudication.deleteMany({
    where: { workspaceId: E2E_WORKSPACE_ID, sourceRef: `SELF_REVIEW_ATTEMPT:${E2E_PROOF_RISK_STAFF_ID}` },
  });

  // Complaint + rework operational events linked to the accepted proofs → a real Process Intelligence
  // breakdown (QUALITY_FAILURE_LOOP / REWORK_LOOP) so the process-intelligence UI renders a top finding.
  const OP_EVENTS: Array<[string, string, string, string]> = [
    ["53000000-0000-4000-8000-0000000000e1", "COMPLAINT", "quality", E2E_PROOF_RISK_PROOF_1],
    ["53000000-0000-4000-8000-0000000000e2", "COMPLAINT", "quality", E2E_PROOF_RISK_PROOF_2],
    ["53000000-0000-4000-8000-0000000000e3", "REWORK", "quality", E2E_PROOF_RISK_PROOF_1],
    ["53000000-0000-4000-8000-0000000000e4", "REWORK", "quality", E2E_PROOF_RISK_PROOF_2],
  ];
  for (const [id, eventType, category, proofId] of OP_EVENTS) {
    await prisma.operationalEvent.upsert({
      where: { id },
      update: { status: "OPEN", relatedProofId: proofId },
      create: {
        id, workspaceId: E2E_WORKSPACE_ID, eventType, category, severity: "MEDIUM", status: "OPEN",
        source: "customer_reported", description: `${category} ${eventType} (E2E process-intelligence fixture)`,
        relatedProofId: proofId, occurredAt: hoursAgo(4), createdAt: hoursAgo(4), updatedAt: hoursAgo(4),
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded E2E proof-risk self-review + process-intelligence fixture for staff ${E2E_PROOF_RISK_STAFF_ID} in workspace ${E2E_WORKSPACE_ID}.`);
  await pool.end();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
