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
  // A ProcessExecutionTask version of this demo record was removed: it surfaced on Home's
  // "Execution lifecycle" section with a raw "PROPOSED" badge (a pre-existing, undiscovered
  // raw-token leak in ExecutionLifecycleSection) -- worth fixing separately, but not needed here
  // since neither Priorities nor Actions reads from ProcessExecutionTask.

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

  console.log(`[design-demo] risk ${riskId} + delegated task ${delegatedTaskId} seeded (isFixtureRecord: false)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
