/**
 * Jarvis 360 owner-flow closure (EH-22/EH-06) — runtime archetype seed (laundry).
 *
 * Persists the validated laundry archetype into the REAL owner models so a realistic
 * owner loop can run end-to-end at the service/API/DB level (capacity + compliance +
 * process + SOP feed the owner-action gate and control center). Composes the existing
 * record* services (no raw inserts → correct field handling, audited). Dev/test only:
 * `assertSeedAllowed` throws in production.
 *
 * Injectable persistence fns for DI tests; the [db] test exercises the real path in CI.
 */

import { buildLaundryArchetypeSeed, type ArchetypeSeed } from "@/infra/owner-archetype-seed";
import { createBusiness } from "@/services/founder-recovery/business.service";
import { recordEquipment } from "@/services/owner-mode/equipment.service";
import { recordComplianceItem } from "@/services/owner-mode/compliance.service";
import { registerProcess } from "@/services/owner-mode/process-review.service";
import { createSopDraft } from "@/services/owner-mode/sop-document.service";

export class SeedNotAllowedError extends Error {
  readonly code = "SEED_NOT_ALLOWED";
  constructor() {
    super("Archetype seeding is disabled in production.");
    this.name = "SeedNotAllowedError";
  }
}

/** Hard production guard — seeding is a dev/test affordance only. */
export function assertSeedAllowed(env: string | undefined = process.env.NODE_ENV): void {
  if (env === "production") throw new SeedNotAllowedError();
}

export interface ArchetypeSeedDeps {
  createBusiness?: typeof createBusiness;
  recordEquipment?: typeof recordEquipment;
  recordComplianceItem?: typeof recordComplianceItem;
  registerProcess?: typeof registerProcess;
  createSopDraft?: typeof createSopDraft;
  now?: () => Date;
}

export interface ArchetypeSeedResult {
  businessId: string;
  equipmentCount: number;
  complianceCount: number;
  processCount: number;
  sopCount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Seed the laundry archetype for a workspace. Validated, production-guarded, audited
 * (each record* service emits its own audit). Returns the created business id + counts.
 */
export async function seedLaundryArchetype(
  ctx: { workspaceId: string; actorId: string; env?: string },
  injected?: ArchetypeSeedDeps
): Promise<ArchetypeSeedResult> {
  assertSeedAllowed(ctx.env);
  const seed: ArchetypeSeed = buildLaundryArchetypeSeed(); // validates at source
  const d = injected ?? {};
  const now = (d.now ?? (() => new Date()))();
  const createBiz = d.createBusiness ?? createBusiness;
  const recEquip = d.recordEquipment ?? recordEquipment;
  const recCompliance = d.recordComplianceItem ?? recordComplianceItem;
  const regProcess = d.registerProcess ?? registerProcess;
  const createSop = d.createSopDraft ?? createSopDraft;

  const business = await createBiz(
    { name: seed.business.name, businessType: "laundry_local_service", currency: seed.business.currency, b2cSupported: true, b2bSupported: true },
    ctx.actorId,
    ctx.workspaceId
  );
  const businessId = business.id;

  for (const e of seed.equipment) {
    await recEquip({
      workspaceId: ctx.workspaceId,
      businessId,
      equipmentType: "laundry_machine",
      name: e.name,
      utilization: e.utilization,
      status: "operational",
      downtimeState: e.downtimeState === "down" ? "down" : "up",
      maintenanceDueAt: new Date(now.getTime() + e.maintenanceDueInDays * DAY_MS),
      actorId: ctx.actorId,
    });
  }

  // A live (non-expired) trade licence so the compliance boundary has real state to read.
  await recCompliance({
    workspaceId: ctx.workspaceId,
    businessId,
    kind: "licence",
    name: "Trade licence",
    expiresAt: new Date(now.getTime() + 365 * DAY_MS),
    actorId: ctx.actorId,
  });
  const complianceCount = 1;

  for (const p of seed.processes) {
    await regProcess({
      workspaceId: ctx.workspaceId,
      businessId,
      name: p.name,
      processType: "operational",
      ownerRole: "owner",
      metric: "throughput",
      reviewFrequencyDays: p.reviewIntervalDays,
      actorId: ctx.actorId,
    });
  }

  for (const s of seed.sops) {
    await createSop({
      workspaceId: ctx.workspaceId,
      businessId,
      process: s.title,
      title: s.title,
      steps: s.steps,
      proofRequirements: ["photo_or_log"],
      actorId: ctx.actorId,
    });
  }

  return {
    businessId,
    equipmentCount: seed.equipment.length,
    complianceCount,
    processCount: seed.processes.length,
    sopCount: seed.sops.length,
  };
}
