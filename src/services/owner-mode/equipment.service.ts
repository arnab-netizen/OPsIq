/**
 * Jarvis 360 Slice 7 — equipment record service (DI). Owner-entered equipment that
 * feeds the capacity growth gate. Mutations are audited.
 */
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

interface EquipmentDb {
  ownerEquipment: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
}
export interface EquipmentDeps {
  db: EquipmentDb;
  now?: () => Date;
}
async function resolveDefaultDeps(): Promise<EquipmentDeps> {
  const { db } = await import("@/lib/db");
  return { db: db as unknown as EquipmentDb };
}

export interface RecordEquipmentInput {
  workspaceId: string;
  businessId?: string | null;
  equipmentType: string;
  name: string;
  ratedCapacity?: number | null;
  practicalCapacity?: number | null;
  unit?: string | null;
  utilization?: number | null;
  status?: string;
  downtimeState?: string;
  maintenanceDueAt?: Date | null;
  operatorSkill?: string | null;
  actorId: string;
}

export async function recordEquipment(input: RecordEquipmentInput, injected?: EquipmentDeps): Promise<string> {
  const deps = injected ?? (await resolveDefaultDeps());
  const now = (deps.now ?? (() => new Date()))();
  const created = await deps.db.ownerEquipment.create({
    data: {
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      equipmentType: input.equipmentType,
      name: input.name,
      ratedCapacity: input.ratedCapacity ?? null,
      practicalCapacity: input.practicalCapacity ?? null,
      unit: input.unit ?? null,
      utilization: input.utilization ?? null,
      status: input.status ?? "operational",
      downtimeState: input.downtimeState ?? "up",
      maintenanceDueAt: input.maintenanceDueAt ?? null,
      operatorSkill: input.operatorSkill ?? null,
      updatedAt: now,
    },
  });
  await emitAuditEvent({
    workspaceId: input.workspaceId,
    eventName: AUDIT_EVENTS.OWNER_EQUIPMENT_RECORDED,
    actorId: input.actorId,
    actorType: "user",
    entityType: "owner_equipment",
    entityId: created.id,
    payload: { name: input.name, type: input.equipmentType },
  });
  return created.id;
}
