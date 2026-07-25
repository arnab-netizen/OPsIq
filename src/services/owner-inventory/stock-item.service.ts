import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { suggestReorder } from "@/domain/execution/supplier-inventory";
import { z } from "zod/v4";

export const createStockItemSchema = z.object({
  businessId: z.string().uuid(),
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  unit: z.string().max(50).optional(),
  currentQty: z.number().min(0).optional(),
  reorderPoint: z.number().min(0).optional(),
  safetyStock: z.number().min(0).optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  dailyUsage: z.number().min(0).optional(),
  vendorId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateStockItemInput = z.infer<typeof createStockItemSchema>;

export const updateStockItemSchema = createStockItemSchema.omit({ businessId: true }).partial();
export type UpdateStockItemInput = z.infer<typeof updateStockItemSchema>;

export async function createStockItem(
  input: CreateStockItemInput,
  actorId: string,
  workspaceId: string,
) {
  const record = await db.stockItem.create({
    data: {
      workspaceId,
      businessId: input.businessId,
      sku: input.sku,
      name: input.name,
      unit: input.unit ?? "unit",
      currentQty: input.currentQty ?? 0,
      reorderPoint: input.reorderPoint ?? 0,
      safetyStock: input.safetyStock ?? 0,
      leadTimeDays: input.leadTimeDays ?? 0,
      dailyUsage: input.dailyUsage ?? 0,
      vendorId: input.vendorId ?? null,
      notes: input.notes ?? null,
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STOCK_ITEM_CREATED,
    actorId,
    workspaceId,
    entityType: "StockItem",
    entityId: record.id,
    payload: { sku: record.sku, businessId: record.businessId },
  });
  return record;
}

export async function listStockItems(
  workspaceId: string,
  businessId: string,
  opts?: { limit?: number; offset?: number },
) {
  return db.stockItem.findMany({
    where: { workspaceId, businessId },
    orderBy: { updatedAt: "desc" },
    take: opts?.limit ?? 50,
    skip: opts?.offset ?? 0,
  });
}

export async function getStockItem(workspaceId: string, stockItemId: string) {
  return db.stockItem.findFirst({ where: { workspaceId, id: stockItemId } });
}

export async function updateStockItem(
  workspaceId: string,
  stockItemId: string,
  input: UpdateStockItemInput,
  actorId: string,
) {
  const existing = await db.stockItem.findFirst({ where: { workspaceId, id: stockItemId } });
  if (!existing) return null;

  const record = await db.stockItem.update({
    where: { id: stockItemId, workspaceId },
    data: {
      ...(input.sku != null && { sku: input.sku }),
      ...(input.name != null && { name: input.name }),
      ...(input.unit != null && { unit: input.unit }),
      ...(input.currentQty != null && { currentQty: input.currentQty }),
      ...(input.reorderPoint != null && { reorderPoint: input.reorderPoint }),
      ...(input.safetyStock != null && { safetyStock: input.safetyStock }),
      ...(input.leadTimeDays != null && { leadTimeDays: input.leadTimeDays }),
      ...(input.dailyUsage != null && { dailyUsage: input.dailyUsage }),
      ...(input.vendorId !== undefined && { vendorId: input.vendorId ?? null }),
      ...(input.notes !== undefined && { notes: input.notes ?? null }),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_STOCK_ITEM_UPDATED,
    actorId,
    workspaceId,
    entityType: "StockItem",
    entityId: record.id,
    payload: { stockItemId, changes: Object.keys(input) },
  });
  return record;
}

export function getReorderSuggestions(items: Array<{
  id: string;
  sku: string;
  currentQty: number | { toNumber(): number };
  dailyUsage: number | { toNumber(): number };
  leadTimeDays: number;
  safetyStock: number | { toNumber(): number };
}>) {
  return items.map((item) => {
    const toNum = (v: number | { toNumber(): number }) =>
      typeof v === "number" ? v : v.toNumber();
    const suggestion = suggestReorder({
      sku: item.sku,
      currentQty: toNum(item.currentQty),
      dailyUsage: toNum(item.dailyUsage),
      leadTimeDays: item.leadTimeDays,
      safetyStock: toNum(item.safetyStock),
    });
    return { id: item.id, ...suggestion };
  });
}
