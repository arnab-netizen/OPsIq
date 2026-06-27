/* eslint-disable @typescript-eslint/no-explicit-any -- Prisma `db` proxy rows are untyped at the persistence boundary */
/**
 * Archetype Operational Metrics service (Dynamic Budget archetype-metrics slice).
 *
 * Persists manual / import-ready operational metrics (NOT a live feed) and derives the
 * archetype-pack signal inputs for the Dynamic Budget reassessment flow. It does NOT
 * contain a second budget/archetype engine — it loads metrics and runs the pure
 * `deriveArchetypeSignalsFromMetrics`, returning the `archetypeSignals` shape the existing
 * plan composer already understands. All reads/writes are workspace-scoped.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { ValidationError } from "@/infra/errors";
import { resolveBudgetArchetype } from "@/domain/owner-budget/archetype-packs";
import {
  isValidMetricType,
  deriveArchetypeSignalsFromMetrics,
  type ArchetypeMetricRow,
} from "@/domain/owner-budget/archetype-metrics";
import type { BudgetAssessmentInput } from "@/domain/owner-budget/types";

export interface ArchetypeMetricInput {
  archetype: "laundry" | "housekeeping" | "generic";
  metricType: string;
  metricDate: string;
  value: number;
  unit?: string | null;
  sourceType?: string;
  sourceRef?: string | null;
}

/** Persist a manual / import-ready archetype operational metric (workspace-scoped, audited). */
export async function recordArchetypeMetric(
  businessId: string,
  input: ArchetypeMetricInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId); // ownership guard (throws if foreign)
  if (!isValidMetricType(input.metricType)) {
    throw new ValidationError(`Unknown archetype metric type: ${input.metricType}`);
  }
  const id = randomUUID();
  const metric = await db.ownerArchetypeMetric.create({
    data: {
      id, workspaceId, businessId,
      archetype: input.archetype,
      metricType: input.metricType,
      metricDate: new Date(input.metricDate),
      value: input.value,
      unit: input.unit ?? null,
      sourceType: input.sourceType ?? "MANUAL",
      sourceRef: input.sourceRef ?? null,
      confidenceState: "unverified", // manual/import data is never auto-verified
      createdBy: actorId,
      updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_ARCHETYPE_METRIC_RECORDED,
    actorId, workspaceId, entityType: "OwnerArchetypeMetric", entityId: id,
    payload: { businessId, archetype: input.archetype, metricType: input.metricType, sourceType: input.sourceType ?? "MANUAL" },
  });
  return metric;
}

/** List archetype metrics for a business (workspace-scoped; foreign workspace denied). */
export async function listArchetypeMetrics(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.ownerArchetypeMetric.findMany({
    where: { workspaceId, businessId },
    orderBy: { metricDate: "desc" },
  });
}

/**
 * Derive the archetype signal inputs for reassessment from persisted metrics.
 * Returns null when there are no usable (non-stale, mapped) metrics — so the archetype
 * pack falls back honestly to `archetype_data_insufficient` rather than fabricating.
 */
export async function deriveArchetypeSignalsForReassessment(
  workspaceId: string,
  businessId: string,
  industryTemplate: string | null | undefined,
  asOf: Date
): Promise<BudgetAssessmentInput["archetypeSignals"] | null> {
  const archetype = resolveBudgetArchetype(industryTemplate);
  if (archetype === "generic") return null;

  const rows = await db.ownerArchetypeMetric.findMany({ where: { workspaceId, businessId, archetype } });
  if (rows.length === 0) return null;

  const metricRows: ArchetypeMetricRow[] = rows.map((r: any) => ({
    archetype: r.archetype,
    metricType: r.metricType,
    value: r.value,
    metricDate: r.metricDate,
    sourceType: r.sourceType,
  }));

  const derived = deriveArchetypeSignalsFromMetrics(archetype, metricRows, asOf);
  if (!derived.laundry && !derived.housekeeping) return null;
  return { laundry: derived.laundry ?? null, housekeeping: derived.housekeeping ?? null };
}
