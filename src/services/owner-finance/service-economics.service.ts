/**
 * Module 6 — per-service/segment unit-economics persistence.
 *
 * Computes a service line's contribution margin + profit-per-resource via the
 * proven unit-economics domain and persists a workspace-scoped record. DI for
 * unit-testability; production resolves the real client.
 */

import {
  summarizeSegment,
  totalDirectCost,
  contributionMargin,
  profitPerLabourHour,
  profitPerMachineHour,
  isLossMaking,
  type OrderEconomicsInput,
  type ResourceUsageInput,
} from "@/domain/owner-finance/unit-economics";

export interface ServiceEconomicsInput {
  workspaceId: string;
  businessId?: string | null;
  serviceLine: string;
  segment?: string | null;
  orders: OrderEconomicsInput[];
  /** Aggregate resource usage across the orders (for profit-per-resource). */
  usage?: ResourceUsageInput;
  createdByUserId?: string;
}

export interface PersistedServiceEconomics {
  workspaceId: string;
  serviceLine: string;
  segment: string | null;
  revenue: number;
  directCost: number;
  contributionMargin: number;
  contributionMarginPct: number;
  profitPerLabourHour: number | null;
  profitPerMachineHour: number | null;
  lossMaking: boolean;
}

interface SEDb {
  ownerServiceEconomics: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    findMany(args: { where: { workspaceId: string }; orderBy?: unknown }): Promise<PersistedServiceEconomics[]>;
  };
}

export interface SEDeps {
  db: SEDb;
  uuid: () => string;
}

async function resolveDefaultDeps(): Promise<SEDeps> {
  const { db } = await import("@/lib/db");
  const { randomUUID } = await import("crypto");
  return { db: db as unknown as SEDb, uuid: () => randomUUID() };
}

/** Compute the per-service economics summary from orders + usage (pure, reusable). */
export function computeServiceEconomics(input: ServiceEconomicsInput): PersistedServiceEconomics {
  const segmentSummary = summarizeSegment(input.serviceLine, input.orders);
  // Aggregate order for resource-based profit + direct cost.
  const aggregate: OrderEconomicsInput = input.orders.reduce<OrderEconomicsInput>(
    (acc, o) => ({
      revenue: (acc.revenue ?? 0) + (o.revenue ?? 0),
      labourCost: (acc.labourCost ?? 0) + (o.labourCost ?? 0),
      materialCost: (acc.materialCost ?? 0) + (o.materialCost ?? 0),
      deliveryCost: (acc.deliveryCost ?? 0) + (o.deliveryCost ?? 0),
      reworkCost: (acc.reworkCost ?? 0) + (o.reworkCost ?? 0),
      refundCost: (acc.refundCost ?? 0) + (o.refundCost ?? 0),
      otherDirectCost: (acc.otherDirectCost ?? 0) + (o.otherDirectCost ?? 0),
    }),
    { revenue: 0 }
  );
  const usage = input.usage ?? {};
  return {
    workspaceId: input.workspaceId,
    serviceLine: input.serviceLine,
    segment: input.segment ?? null,
    revenue: aggregate.revenue ?? 0,
    directCost: totalDirectCost(aggregate),
    contributionMargin: contributionMargin(aggregate),
    contributionMarginPct: segmentSummary.contributionMarginPct,
    profitPerLabourHour: profitPerLabourHour(aggregate, usage),
    profitPerMachineHour: profitPerMachineHour(aggregate, usage),
    lossMaking: isLossMaking(aggregate),
  };
}

/** Compute + persist a per-service economics record (workspace-scoped). */
export async function saveServiceEconomics(input: ServiceEconomicsInput, injected?: SEDeps): Promise<PersistedServiceEconomics> {
  const deps = injected ?? (await resolveDefaultDeps());
  const computed = computeServiceEconomics(input);
  await deps.db.ownerServiceEconomics.create({
    data: {
      id: deps.uuid(),
      workspaceId: computed.workspaceId,
      businessId: input.businessId ?? null,
      serviceLine: computed.serviceLine,
      segment: computed.segment,
      revenue: computed.revenue,
      directCost: computed.directCost,
      contributionMargin: computed.contributionMargin,
      contributionMarginPct: computed.contributionMarginPct,
      profitPerLabourHour: computed.profitPerLabourHour,
      profitPerMachineHour: computed.profitPerMachineHour,
      lossMaking: computed.lossMaking,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
  return computed;
}

/** List persisted per-service economics for a workspace (scoped). */
export async function listServiceEconomics(workspaceId: string, injected?: SEDeps): Promise<PersistedServiceEconomics[]> {
  const deps = injected ?? (await resolveDefaultDeps());
  return deps.db.ownerServiceEconomics.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
}
