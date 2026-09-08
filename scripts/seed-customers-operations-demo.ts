/**
 * One-time, local-only realistic dataset for Customers + Operations design/screenshot work.
 * Not a fixture -- isFixtureRecord semantics don't apply to these two models, but every row here
 * is a REAL row in the local dev DB's trust-journey-repro workspace, created the same way a real
 * owner would (through the real snapshot+diagnosis services for Operations; direct CustomerRecord
 * rows -- there is no diagnosis engine for customers -- matching the real schema exactly).
 *
 * Customer records go on Riverside Cafe, NOT Trinity Services: tests/browser/trust-journey.spec.ts
 * asserts Trinity has zero customer records as its fixture-isolation/honest-empty-state check
 * ("Trinity has zero customer records seeded -- the page must say so honestly"). Seeding customers
 * onto Trinity broke that real regression test the first time this script ran. Operations data
 * stays on Trinity -- no test asserts Trinity has zero operations data.
 *
 * Safe to delete/re-seed at any time. Never run against a production DATABASE_URL. Re-run this
 * AFTER scripts/seed-trust-journey-repro.ts on any workspace reset -- that script deletes and
 * recreates both businesses fresh, which cascades away everything seeded here.
 */
import { randomUUID } from "crypto";

const WORKSPACE_ID = "61000000-0000-0000-0000-0000000000a1";
const USER_ID = "60000000-0000-0000-0000-0000000000a1";
const TRINITY_NAME = "Trinity Services";
const RIVERSIDE_NAME = "Riverside Cafe";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  if (/neon\.tech|\.us-east|\.ap-south/.test(databaseUrl) && !databaseUrl.includes("localhost")) {
    throw new Error("Refusing to run against a non-local DATABASE_URL");
  }
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const trinity = await prisma.ownerBusiness.findFirst({
    where: { workspaceId: WORKSPACE_ID, name: TRINITY_NAME },
    orderBy: { createdAt: "desc" },
  });
  if (!trinity) throw new Error(`${TRINITY_NAME} not found in workspace ${WORKSPACE_ID} -- run scripts/seed-trust-journey-repro.ts first`);
  const riverside = await prisma.ownerBusiness.findFirst({
    where: { workspaceId: WORKSPACE_ID, name: RIVERSIDE_NAME },
    orderBy: { createdAt: "desc" },
  });
  if (!riverside) throw new Error(`${RIVERSIDE_NAME} not found in workspace ${WORKSPACE_ID} -- run scripts/seed-trust-journey-repro.ts first`);

  // ── Customers (on Riverside Cafe -- see file header for why not Trinity) ────────────────────
  // Six realistic repeat-cafe customers: enough spread in lastPurchaseDate, ltv, and tags to give
  // the Customers redesign real signal for concentration, activity, and (via one customer's own
  // free-text `notes`, the only field this schema has for it) payment behaviour.
  await prisma.customerRecord.deleteMany({ where: { workspaceId: WORKSPACE_ID, businessId: riverside.id, tags: { has: "design-demo" } } });
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  // Riverside Cafe is B2C-only (b2bSupported: false in its own business record), so every
  // customer here is a plausible individual/VIP patron, not a B2B account.
  const customers = [
    { name: "Ramesh Traders (catering account)", segment: "VIP", ltv: 180000, lastPurchaseDate: daysAgo(6), tags: ["design-demo", "repeat-customer"], notes: null },
    { name: "Priya Sharma", segment: "B2C", ltv: 45000, lastPurchaseDate: daysAgo(3), tags: ["design-demo", "repeat-customer"], notes: null },
    { name: "Anjali Verma", segment: "B2C", ltv: 12000, lastPurchaseDate: daysAgo(5), tags: ["design-demo", "repeat-customer"], notes: null },
    { name: "Deepak Kumar", segment: "B2C", ltv: 9500, lastPurchaseDate: daysAgo(9), tags: ["design-demo", "repeat-customer"], notes: null },
    { name: "Sunita Patel", segment: "B2C", ltv: 15000, lastPurchaseDate: daysAgo(4), tags: ["design-demo"], notes: "Invoice #1042 overdue by 45 days -- ₹3,200 outstanding." },
    { name: "Vikram Singh", segment: "AT_RISK", ltv: 8000, lastPurchaseDate: daysAgo(95), tags: ["design-demo"], notes: "No visits since the spring — last order was a large catering order." },
  ];
  for (const c of customers) {
    await prisma.customerRecord.create({
      data: { id: randomUUID(), workspaceId: WORKSPACE_ID, businessId: riverside.id, updatedAt: new Date(), ...c },
    });
  }
  console.log(`[design-demo] ${customers.length} customer records seeded for ${RIVERSIDE_NAME} (${riverside.id})`);

  // ── Operations ───────────────────────────────────────────────────────────────────────────
  // A real OwnerOperationsSnapshot + a real diagnosis run through the actual services, so the
  // resulting cycle/findings/actions are exactly what a real owner submitting this data would
  // see -- nothing about the diagnosis engine's output is hand-written.
  const { createOperationsSnapshot } = await import("../src/services/owner-operations/snapshot.service");
  const { runOperationsDiagnosis } = await import("../src/services/owner-operations/diagnosis.service");

  const periodStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  const snapshot = await createOperationsSnapshot(
    trinity.id,
    {
      periodStart: isoDate(periodStart),
      periodEnd: isoDate(periodEnd),
      currency: "INR",
      businessModel: "service",
      industryTemplate: "laundry_local_service",
      ordersReceived: 420,
      ordersCompleted: 395,
      ordersDelayed: 38,
      reworkCount: 12,
      complaints: 5,
      staffHours: 680,
      machineCapacityUnits: 500,
      idleHours: 40,
      deliveryAttempts: 180,
      deliveryFailures: 9,
      inventoryShortages: 3,
      sopChecks: 60,
      sopMisses: 7,
      notes: "Design-demo operations snapshot -- realistic laundry-service figures for one reporting month.",
    },
    USER_ID,
    WORKSPACE_ID,
  );
  const cycle = await runOperationsDiagnosis(trinity.id, snapshot.id, USER_ID, WORKSPACE_ID);
  console.log(`[design-demo] operations snapshot ${snapshot.id} + cycle ${cycle.id} (state: ${cycle.operationsState}) seeded for ${TRINITY_NAME}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
