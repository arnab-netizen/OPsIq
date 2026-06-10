/**
 * Owner Recovery end-to-end runtime smoke (service layer, real DB).
 *
 * Proves the full owner loop against a LOCAL database:
 *   business -> snapshot -> diagnosis cycle -> findings -> actions ->
 *   execution -> before/after verification -> dashboard -> second linked cycle.
 *
 * SAFETY: refuses to run against anything that is not an explicitly local DB.
 * Run:
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsiq_test?schema=public" \
 *     npx tsx scripts/smoke-owner-recovery-runtime.ts
 *
 * This script proves the SERVICE + PERSISTENCE path. HTTP/UI runtime is proven
 * separately (see OWNER_RECOVERY_RUNTIME_PROOF_REPORT.md).
 */
import { randomUUID } from "crypto";

const url = process.env.DATABASE_URL || "";
const isLocal =
  /@(localhost|127\.0\.0\.1)[:/]/.test(url) && !/neon\.tech|amazonaws|\.aws\./.test(url);
if (!isLocal) {
  console.error("✗ REFUSING TO RUN: DATABASE_URL is not an explicit localhost DB.");
  console.error("  Set DATABASE_URL to a local test database before running this smoke script.");
  process.exit(2);
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { createBusiness, getBusiness } = await import("../src/services/founder-recovery/business.service");
  const { createSnapshot } = await import("../src/services/founder-recovery/snapshot.service");
  const { runCycle } = await import("../src/services/founder-recovery/cycle.service");
  const { updateRecoveryAction } = await import("../src/services/founder-recovery/action.service");
  const { recordVerification } = await import("../src/services/founder-recovery/verification.service");
  const { getRecoveryDashboard } = await import("../src/services/founder-recovery/dashboard.service");

  const workspaceId = randomUUID();
  const actorId = randomUUID();
  let step = "init";
  const ok = (s: string) => console.log(`  ✓ ${s}`);

  try {
    // Seed actor user (audit events enforce actor_id -> users FK).
    step = "1. seed owner user/workspace";
    await db.user.upsert({
      where: { id: actorId },
      update: {},
      create: { id: actorId, email: `smoke-${actorId}@example.com`, name: "Smoke Owner", isActive: true, updatedAt: new Date() },
    });
    ok(step);

    step = "2. create business (Tumbledry Mukundapur Test)";
    const business = await createBusiness(
      { name: "Tumbledry Mukundapur Test", businessType: "laundry_local_service", currency: "INR", b2cSupported: true, b2bSupported: true },
      actorId,
      workspaceId
    );
    if (!business.id || business.currency !== "INR") throw new Error("business not created in INR");
    ok(step);

    step = "3. create period-1 metric snapshot (INR)";
    const snap1 = await createSnapshot(
      business.id,
      { periodStart: "2026-04-01", periodEnd: "2026-04-30", currency: "INR", revenue: 100000, totalCosts: 95000, orderCount: 1000, newCustomers: 70, repeatCustomers: 30, deliveryCost: 12000 } as any,
      actorId,
      workspaceId
    );
    ok(step);

    step = "4. start diagnosis cycle";
    const cycle1 = await runCycle(business.id, snap1.id, actorId, workspaceId);
    if (cycle1.cycleNumber !== 1) throw new Error("cycle 1 number wrong");
    ok(step);

    step = "5. findings include metric/evidence/threshold";
    if (cycle1.findings.length === 0) throw new Error("no findings");
    for (const f of cycle1.findings) {
      if (!f.sourceMetric || !f.evidence || !f.verificationMetric) throw new Error(`finding ${f.code} missing fields`);
    }
    ok(`${step} (${cycle1.findings.map((f: any) => f.code).join(", ")})`);

    step = "6. recovery actions have owner/due/metric/target";
    if (cycle1.actions.length === 0) throw new Error("no actions");
    for (const a of cycle1.actions) {
      if (!a.assignedToRole || !a.dueAt || !a.metricToMove) throw new Error(`action ${a.id} missing fields`);
    }
    const repeatAction: any = cycle1.actions.find((a: any) => a.metricToMove === "repeatCustomerRatePct");
    if (!repeatAction) throw new Error("repeat-rate action missing");
    ok(step);

    step = "7. update one action to in_progress";
    const a1 = await updateRecoveryAction(repeatAction.id, { status: "assigned", version: repeatAction.version }, actorId, workspaceId);
    const a2 = await updateRecoveryAction(repeatAction.id, { status: "in_progress", version: a1.version }, actorId, workspaceId);
    if (a2.status !== "in_progress") throw new Error("not in_progress");
    ok(step);

    step = "8. complete the action with notes";
    const a3 = await updateRecoveryAction(
      repeatAction.id,
      { status: "completed", version: a2.version, completionNotes: "Dormant B2C reactivation campaign sent", actualOutcome: "Repeat orders increased" },
      actorId,
      workspaceId
    );
    if (a3.status !== "completed" || !a3.completedAt) throw new Error("not completed");
    ok(step);

    step = "9. create period-2 after metric snapshot";
    const snap2 = await createSnapshot(
      business.id,
      { periodStart: "2026-05-01", periodEnd: "2026-05-31", currency: "INR", revenue: 120000, totalCosts: 96000, orderCount: 1100, newCustomers: 50, repeatCustomers: 70, deliveryCost: 9000 } as any,
      actorId,
      workspaceId
    );
    ok(step);

    step = "10. verify the action outcome (before/after comparison)";
    const { result } = await recordVerification(repeatAction.id, { afterValue: 60 }, actorId, workspaceId);
    if (result.status !== "verified_improved" || !result.reachedTarget) throw new Error(`verification not improved: ${result.status}`);
    ok(`${step} -> ${result.status}, movement ${result.actualMovement}`);

    step = "11. fetch dashboard";
    const dash = await getRecoveryDashboard(workspaceId, business.id);
    if (!dash.hasData) throw new Error("dashboard has no data");
    ok(step);

    step = "12. dashboard shows verification status and metric movement";
    const dashAction = dash.latestCycle.actions.find((a: any) => a.id === repeatAction.id);
    const ver = dashAction?.verifications?.[0];
    if (!ver || ver.status !== "verified_improved" || ver.afterValue !== 60) throw new Error("dashboard verification not reflected");
    ok(`${step} (baseline ${ver.baselineValue} -> after ${ver.afterValue}, ${ver.status})`);

    step = "13. create second cycle";
    const cycle2 = await runCycle(business.id, snap2.id, actorId, workspaceId);
    if (cycle2.cycleNumber !== 2) throw new Error("cycle 2 number wrong");
    ok(step);

    step = "14. second cycle links to first";
    if (cycle2.previousCycleId !== cycle1.id) throw new Error("cycle 2 not linked to cycle 1");
    const codes2 = cycle2.findings.map((f: any) => f.code);
    if (codes2.includes("WEAK_REPEAT_RATE")) throw new Error("repeat-rate problem should be resolved in cycle 2");
    ok(`${step} (prev=${cycle1.id.slice(0, 8)}, resolved WEAK_REPEAT_RATE)`);

    step = "15. workspace ownership guard";
    let isolated = false;
    try {
      await getBusiness(business.id, randomUUID());
    } catch {
      isolated = true;
    }
    if (!isolated) throw new Error("workspace isolation not enforced");
    ok(step);

    console.log("\n✅ PASS — Owner Recovery end-to-end runtime smoke succeeded (15/15 steps).");
    await db.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ FAIL at step: ${step}`);
    console.error(`   ${err instanceof Error ? err.message : String(err)}`);
    try {
      const { db } = await import("../src/lib/db");
      await db.$disconnect();
    } catch {}
    process.exit(1);
  }
}

main();
