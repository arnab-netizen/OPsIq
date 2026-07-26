import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";

const PO_STATUSES = ["DRAFT", "REVIEWED", "APPROVED", "ISSUED", "DELIVERED", "CANCELLED"] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export const lineItemSchema = z.object({
  stockItemId: z.string().uuid().optional(),
  sku: z.string().max(100).optional(),
  description: z.string().min(1).max(300),
  qty: z.number().min(0),
  unitPrice: z.number().min(0).optional(),
  unit: z.string().max(50).optional(),
});

export const createPurchaseOrderSchema = z.object({
  businessId: z.string().uuid(),
  poNumber: z.string().min(1).max(100),
  vendorId: z.string().uuid().nullable().optional(),
  vendorName: z.string().max(200).nullable().optional(),
  lineItems: z.array(lineItemSchema).min(1).max(100),
  totalAmount: z.number().min(0).nullable().optional(),
  currency: z.string().max(10).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = createPurchaseOrderSchema
  .omit({ businessId: true, poNumber: true })
  .partial();
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

const VALID_TRANSITIONS: Record<POStatus, POStatus[]> = {
  DRAFT: ["REVIEWED", "CANCELLED"],
  REVIEWED: ["APPROVED", "DRAFT", "CANCELLED"],
  APPROVED: ["ISSUED", "CANCELLED"],
  ISSUED: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  actorId: string,
  workspaceId: string,
) {
  const record = await db.purchaseOrder.create({
    data: {
      workspaceId,
      businessId: input.businessId,
      poNumber: input.poNumber,
      vendorId: input.vendorId ?? null,
      vendorName: input.vendorName ?? null,
      status: "DRAFT",
      lineItems: input.lineItems as object[],
      totalAmount: input.totalAmount ?? null,
      currency: input.currency ?? "USD",
      notes: input.notes ?? null,
      createdBy: actorId,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_PURCHASE_ORDER_CREATED,
    actorId,
    workspaceId,
    entityType: "PurchaseOrder",
    entityId: record.id,
    payload: { poNumber: record.poNumber, businessId: record.businessId },
  });
  return record;
}

export async function listPurchaseOrders(
  workspaceId: string,
  businessId: string,
  opts?: { status?: string; limit?: number; offset?: number },
) {
  const where: Record<string, unknown> = { workspaceId, businessId };
  if (opts?.status) where.status = opts.status;
  return db.purchaseOrder.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
  });
}

export async function getPurchaseOrder(workspaceId: string, poId: string) {
  return db.purchaseOrder.findFirst({ where: { workspaceId, id: poId } });
}

export async function transitionPurchaseOrder(
  workspaceId: string,
  poId: string,
  toStatus: POStatus,
  actorId: string,
) {
  let capturedFrom: string | undefined;

  const record = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.purchaseOrder.findFirst({ where: { workspaceId, id: poId } });
    if (!existing) return null;

    // Idempotent: already in desired state — return as-is without re-emitting audit event
    if (existing.status === toStatus) return existing;

    const allowed = VALID_TRANSITIONS[existing.status as POStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new Error(`Invalid transition: ${existing.status} → ${toStatus}`);
    }

    capturedFrom = existing.status;
    const now = new Date();
    return tx.purchaseOrder.update({
      where: { id: poId, workspaceId },
      data: {
        status: toStatus,
        ...(toStatus === "APPROVED" && { approvedById: actorId, approvedAt: now }),
        ...(toStatus === "ISSUED" && { issuedAt: now }),
        ...(toStatus === "DELIVERED" && { deliveredAt: now }),
      },
    });
  });

  if (record && capturedFrom !== undefined) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_PURCHASE_ORDER_STATUS_CHANGED,
      actorId,
      workspaceId,
      entityType: "PurchaseOrder",
      entityId: record.id,
      payload: { poId, from: capturedFrom, to: toStatus },
    });
  }
  return record;
}
