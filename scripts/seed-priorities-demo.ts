/**
 * One-time, local-only addition of REAL (non-fixture) risk + task records to the trust-journey
 * repro workspace, so Priorities and Actions have real content to design/screenshot against.
 * Not a fixture -- isFixtureRecord: false throughout. Safe to delete/re-seed at any time; this
 * script only touches the local dev DB's trust-journey-repro workspace.
 */
import { randomUUID } from "crypto";

const WORKSPACE_ID = "61000000-0000-0000-0000-0000000000a1";
const USER_ID = "60000000-0000-0000-0000-0000000000a1";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.businessRiskEntry.deleteMany({ where: { workspaceId: WORKSPACE_ID, riskCode: "design_demo_key_person_dependency" } });
  // A ProcessExecutionTask version of this demo record was previously removed because it exposed
  // a raw "PROPOSED" badge on Home's "Execution lifecycle" section (ExecutionLifecycleSection
  // rendered item.status directly, no label map). That leak is now fixed (STATUS_LABEL covers
  // PROPOSED/ACKNOWLEDGED/NEEDS_DATA/IN_PROGRESS/BLOCKED/COMPLETED/OUTCOME_*) -- this record is
  // kept deliberately, in PROPOSED state, as a live regression check that the fix holds.
  await prisma.processExecutionTask.deleteMany({ where: { workspaceId: WORKSPACE_ID, taskKey: "design_demo_confirm_client_renewal" } });
  const processTaskId = randomUUID();
  await prisma.processExecutionTask.create({
    data: {
      id: processTaskId,
      workspaceId: WORKSPACE_ID,
      taskKey: "design_demo_confirm_client_renewal",
      sourceFamily: "OWNER_LED",
      sourceFindingKey: "design_demo_finding_client_renewal",
      executionRoute: "OWNER_LED",
      actionOwner: USER_ID,
      approvalLevel: "OWNER",
      status: "PROPOSED",
      completionCriteria: "Signed renewal confirmation from the client on file.",
      reassessmentTrigger: "WEEKLY_REVIEW",
      riskIfIgnored: "The contract may lapse without a renewed agreement, interrupting billing.",
      ownerVisibleSummary: "Confirm the Q4 contract renewal with the client before it lapses",
      severity: "HIGH",
      priorityRank: 1,
      isFixtureRecord: false,
      updatedAt: new Date(),
    },
  });

  const riskId = randomUUID();
  await prisma.businessRiskEntry.create({
    data: {
      id: riskId,
      workspaceId: WORKSPACE_ID,
      riskCode: "design_demo_key_person_dependency",
      title: "Delivery depends entirely on one senior contractor",
      description: "All active client work routes through a single contractor with no documented handover process.",
      category: "OPERATIONAL",
      likelihood: 65,
      impact: 80,
      severity: 52,
      status: "IDENTIFIED",
      mitigationAction: "Document the delivery process and cross-train a second team member.",
      identifiedBy: USER_ID,
      isFixtureRecord: false,
      updatedAt: new Date(),
    },
  });

  await prisma.delegatedTask.deleteMany({ where: { workspaceId: WORKSPACE_ID, title: "Confirm Q4 contract renewal with the client" } });
  const delegatedTaskId = randomUUID();
  await prisma.delegatedTask.create({
    data: {
      id: delegatedTaskId,
      workspaceId: WORKSPACE_ID,
      title: "Confirm Q4 contract renewal with the client",
      description: "Get the client's signed confirmation on file before the current contract term ends.",
      status: "ASSIGNED",
      priority: "HIGH",
      assignedUserId: USER_ID,
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    },
  });

  console.log(`[design-demo] risk ${riskId} + process task ${processTaskId} + delegated task ${delegatedTaskId} seeded (isFixtureRecord: false)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
