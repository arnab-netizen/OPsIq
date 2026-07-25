import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";

export const createCustomerSchema = z.object({
  businessId: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  segment: z.string().max(100).nullable().optional(),
  lastPurchaseDate: z.iso.datetime().nullable().optional(),
  ltv: z.number().min(0).nullable().optional(),
  tags: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.omit({ businessId: true }).partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export async function createCustomer(
  input: CreateCustomerInput,
  actorId: string,
  workspaceId: string,
) {
  const record = await db.customerRecord.create({
    data: {
      workspaceId,
      businessId: input.businessId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      segment: input.segment ?? null,
      lastPurchaseDate: input.lastPurchaseDate ? new Date(input.lastPurchaseDate) : null,
      ltv: input.ltv != null ? input.ltv : null,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CUSTOMER_CREATED,
    actorId,
    workspaceId,
    entityType: "CustomerRecord",
    entityId: record.id,
    payload: { name: record.name, businessId: record.businessId },
  });
  return record;
}

export async function listCustomers(
  workspaceId: string,
  businessId: string,
  opts?: { segment?: string; limit?: number; offset?: number },
) {
  const where: Record<string, unknown> = { workspaceId, businessId };
  if (opts?.segment) where.segment = opts.segment;
  return db.customerRecord.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
  });
}

export async function getCustomer(workspaceId: string, customerId: string) {
  return db.customerRecord.findFirst({
    where: { workspaceId, id: customerId },
  });
}

export async function updateCustomer(
  workspaceId: string,
  customerId: string,
  input: UpdateCustomerInput,
  actorId: string,
) {
  const existing = await db.customerRecord.findFirst({ where: { workspaceId, id: customerId } });
  if (!existing) return null;

  const record = await db.customerRecord.update({
    where: { id: customerId },
    data: {
      ...(input.name != null && { name: input.name }),
      ...(input.email !== undefined && { email: input.email ?? null }),
      ...(input.phone !== undefined && { phone: input.phone ?? null }),
      ...(input.segment !== undefined && { segment: input.segment ?? null }),
      ...(input.lastPurchaseDate !== undefined && {
        lastPurchaseDate: input.lastPurchaseDate ? new Date(input.lastPurchaseDate) : null,
      }),
      ...(input.ltv !== undefined && { ltv: input.ltv ?? null }),
      ...(input.tags != null && { tags: input.tags }),
      ...(input.notes !== undefined && { notes: input.notes ?? null }),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_CUSTOMER_UPDATED,
    actorId,
    workspaceId,
    entityType: "CustomerRecord",
    entityId: record.id,
    payload: { customerId, changes: Object.keys(input) },
  });
  return record;
}
