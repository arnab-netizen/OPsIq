/**
 * Module 41 wiring — supplier/inventory risk snapshot persistence.
 *
 * Computes supplier reliability + stockout risk via the proven M23 supplier-inventory
 * domain and persists a workspace-scoped snapshot the Owner Now View reads as a live
 * signal. DI for unit-testability. No parallel engine — wraps M23.
 */

import {
  stockoutRisk,
  isStockout,
  isBelowReorderPoint,
  classifySupplier,
  supplyCutoffRisk,
  type StockItemInput,
  type SupplierInput,
  type StockoutRisk,
} from "@/domain/execution/supplier-inventory";

export interface SupplierInventorySnapshotInput {
  workspaceId: string;
  businessId?: string | null;
  items: StockItemInput[];
  suppliers: SupplierInput[];
}

export interface PersistedSupplierInventory {
  workspaceId: string;
  worstStockoutRisk: StockoutRisk;
  belowReorderCount: number;
  stockoutCount: number;
  unreliableSupplierCount: number;
  supplyCutoffRisk: boolean;
  riskScore: number;
}

interface SIDb {
  ownerSupplierInventorySnapshot: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findFirst(args: unknown): Promise<PersistedSupplierInventory | null>;
  };
}

export interface SIDeps {
  db: SIDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<SIDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as SIDb, uuid: () => randomUUID() };
}

const RISK_RANK: Record<StockoutRisk, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, STOCKOUT: 4 };

/** Pure: roll a set of items/suppliers up into a single risk summary (0..1 score). */
export function computeSupplierInventoryRisk(input: SupplierInventorySnapshotInput): PersistedSupplierInventory {
  let worst: StockoutRisk = "NONE";
  let belowReorderCount = 0;
  let stockoutCount = 0;
  for (const item of input.items) {
    const r = stockoutRisk(item);
    if (RISK_RANK[r] > RISK_RANK[worst]) worst = r;
    if (isBelowReorderPoint(item)) belowReorderCount += 1;
    if (isStockout(item)) stockoutCount += 1;
  }
  const unreliableSupplierCount = input.suppliers.filter((s) => classifySupplier(s) === "UNRELIABLE").length;
  const cutoff = input.suppliers.some((s) => supplyCutoffRisk(s));

  // 0..1 risk score: worst stockout dominates; suppliers + cutoff add weight.
  const stockComponent = RISK_RANK[worst] / 4;
  const supplierComponent = input.suppliers.length > 0 ? unreliableSupplierCount / input.suppliers.length : 0;
  const riskScore = Math.min(1, Math.max(stockComponent, 0.5 * supplierComponent + (cutoff ? 0.4 : 0)));

  return {
    workspaceId: input.workspaceId,
    worstStockoutRisk: worst,
    belowReorderCount,
    stockoutCount,
    unreliableSupplierCount,
    supplyCutoffRisk: cutoff,
    riskScore,
  };
}

/** Compute + persist a supplier/inventory risk snapshot (workspace-scoped). */
export async function saveSupplierInventorySnapshot(
  input: SupplierInventorySnapshotInput,
  injected?: SIDeps
): Promise<PersistedSupplierInventory> {
  const deps = injected ?? (await resolveDefaultDeps());
  const summary = computeSupplierInventoryRisk(input);
  await deps.db.ownerSupplierInventorySnapshot.create({
    data: {
      id: deps.uuid(),
      workspaceId: input.workspaceId,
      businessId: input.businessId ?? null,
      worstStockoutRisk: summary.worstStockoutRisk,
      belowReorderCount: summary.belowReorderCount,
      stockoutCount: summary.stockoutCount,
      unreliableSupplierCount: summary.unreliableSupplierCount,
      supplyCutoffRisk: summary.supplyCutoffRisk,
      riskScore: summary.riskScore,
    },
  });
  return summary;
}

/** Latest supplier/inventory snapshot for a workspace (scoped), or null. */
export async function getLatestSupplierInventory(
  workspaceId: string,
  injected?: SIDeps
): Promise<PersistedSupplierInventory | null> {
  const deps = injected ?? (await resolveDefaultDeps());
  return deps.db.ownerSupplierInventorySnapshot.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}
