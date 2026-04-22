import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";

export interface CreateKPIInput {
  engagementId: string;
  name: string;
  description?: string;
  metricType: string; // revenue | cost | efficiency | satisfaction | other
  baselineValue: number;
  targetValue: number;
  unit: string; // percentage | dollars | count | rating | other
  direction: "up" | "down";
  visibilityStatus?: "internal" | "client_visible";
}

export interface KPI {
  id: string;
  engagementId: string;
  name: string;
  description?: string;
  metricType: string;
  baselineValue: number;
  currentValue: number;
  targetValue: number;
  unit: string;
  direction: string;
  createdAt: Date;
}

export interface KPIProgress {
  currentValue: number;
  targetValue: number;
  baselineValue: number;
  progressPercent: number; // 0-100
  onTrack: boolean;
  direction: "up" | "down";
}

export async function createKPI(
  input: CreateKPIInput,
  actorId: string
): Promise<KPI> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: input.engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", input.engagementId);

  // Validate direction
  if (!["up", "down"].includes(input.direction)) {
    throw new ValidationError("Direction must be 'up' or 'down'");
  }

  // Validate values
  if (input.baselineValue === input.targetValue) {
    throw new ValidationError("Baseline and target values cannot be the same");
  }

  const created = await db.kPI.create({
    data: {
      engagementId: input.engagementId,
      name: input.name,
      description: input.description,
      metricType: input.metricType,
      baselineValue: input.baselineValue,
      currentValue: input.baselineValue,
      targetValue: input.targetValue,
      unit: input.unit,
      direction: input.direction,
      visibilityStatus: input.visibilityStatus || "internal",
      createdBy: actorId,
    },
    select: {
      id: true,
      engagementId: true,
      name: true,
      description: true,
      metricType: true,
      baselineValue: true,
      currentValue: true,
      targetValue: true,
      unit: true,
      direction: true,
      createdAt: true,
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_DEFINED,
    actorId,
    entityType: "KPI",
    entityId: created.id,
    payload: {
      engagementId: input.engagementId,
      name: input.name,
      baselineValue: input.baselineValue,
      targetValue: input.targetValue,
      direction: input.direction,
    },
  });

  return created as KPI;
}

export async function recordKPISnapshot(
  kpiId: string,
  value: number,
  actorId: string
): Promise<{ kpiId: string; snapshotValue: number; currentValue: number }> {
  // Get KPI to check current value
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    select: {
      id: true,
      engagementId: true,
      currentValue: true,
      direction: true,
      targetValue: true,
      baselineValue: true,
    },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  // Record snapshot
  const snapshot = await db.kPISnapshot.create({
    data: {
      kpiId,
      value,
      recordedAt: new Date(),
    },
    select: {
      id: true,
    },
  });

  // Update current value
  const updated = await db.kPI.update({
    where: { id: kpiId },
    data: {
      currentValue: value,
      version: { increment: 1 },
      updatedAt: new Date(),
    },
    select: {
      currentValue: true,
    },
  });

  // Emit snapshot recorded event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.KPI_SNAPSHOT_RECORDED,
    actorId,
    entityType: "KPISnapshot",
    entityId: snapshot.id,
    payload: {
      kpiId,
      value,
      engagementId: kpi.engagementId,
    },
  });

  // Check if deteriorated (significant movement away from target)
  const progress = calculateProgress(kpi, value);
  const wasOnTrack = calculateProgress(kpi, kpi.currentValue).onTrack;
  const isOnTrack = progress.onTrack;

  if (wasOnTrack && !isOnTrack) {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.KPI_DETERIORATED,
      actorId,
      entityType: "KPI",
      entityId: kpiId,
      payload: {
        engagementId: kpi.engagementId,
        previousValue: kpi.currentValue,
        newValue: value,
        direction: kpi.direction,
      },
    });

    // Trigger re-evaluation on deterioration
    await triggerReEvaluation({
      changeType: "kpi_deterioration",
      entityType: "KPI",
      entityId: kpiId,
      engagementId: kpi.engagementId,
      severity: "high",
      description: `KPI deteriorated from ${kpi.currentValue} to ${value}`,
      triggeredBy: actorId,
    });
  }

  return {
    kpiId,
    snapshotValue: value,
    currentValue: updated.currentValue,
  };
}

export async function recordActionKPIImpact(
  kpiId: string,
  actionId: string,
  impactAmount: number,
  impactRationale: string,
  actorId: string
): Promise<{ kpiId: string; actionId: string; impactAmount: number }> {
  // Validate KPI and Action exist
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    select: { id: true, engagementId: true, currentValue: true },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  const action = await db.action.findUnique({
    where: { id: actionId },
    select: { id: true, engagementId: true },
  });
  if (!action) throw new NotFoundError("Action", actionId);

  if (kpi.engagementId !== action.engagementId) {
    throw new ValidationError("KPI and Action must belong to the same engagement");
  }

  // Check if impact already recorded
  const existing = await db.kPIImpact.findUnique({
    where: { kpiId_actionId: { kpiId, actionId } },
  });
  if (existing) {
    throw new ValidationError("Impact already recorded for this KPI and Action");
  }

  // Record impact
  const impact = await db.kPIImpact.create({
    data: {
      kpiId,
      actionId,
      impactAmount,
      impactRationale,
      createdBy: actorId,
    },
    select: {
      kpiId: true,
      actionId: true,
      impactAmount: true,
    },
  });

  return {
    kpiId: impact.kpiId,
    actionId: impact.actionId,
    impactAmount: impact.impactAmount,
  };
}

export async function listKPIsForEngagement(
  engagementId: string,
  visibility?: "internal" | "all"
): Promise<Omit<KPI, 'visibilityStatus'>[]> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const kpis = await db.kPI.findMany({
    where: { engagementId },
    select: {
      id: true,
      engagementId: true,
      name: true,
      description: true,
      metricType: true,
      baselineValue: true,
      currentValue: true,
      targetValue: true,
      unit: true,
      direction: true,
      createdAt: true,
      visibilityStatus: true,
    },
  });

  if (visibility === "internal") {
    return kpis
      .filter((k: any) => k.visibilityStatus === "internal")
      .map(({ visibilityStatus, ...k }: any) => k as any);
  }

  return kpis.map(({ visibilityStatus, ...k }: any) => k as any);
}

export async function getKPIDetail(
  kpiId: string,
  visibility?: "internal" | "all"
): Promise<Omit<KPI, 'visibilityStatus'>> {
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    select: {
      id: true,
      engagementId: true,
      name: true,
      description: true,
      metricType: true,
      baselineValue: true,
      currentValue: true,
      targetValue: true,
      unit: true,
      direction: true,
      createdAt: true,
      visibilityStatus: true,
    },
  });

  if (!kpi) throw new NotFoundError("KPI", kpiId);

  // Check visibility
  if (visibility === "internal" && kpi.visibilityStatus === "client_visible") {
    throw new NotFoundError("KPI", kpiId);
  }

  const { visibilityStatus, ...rest } = kpi;
  return rest as any;
}

export async function getKPIProgress(
  kpiId: string
): Promise<KPIProgress> {
  const kpi = await db.kPI.findUnique({
    where: { id: kpiId },
    select: {
      currentValue: true,
      targetValue: true,
      baselineValue: true,
      direction: true,
    },
  });
  if (!kpi) throw new NotFoundError("KPI", kpiId);

  return calculateProgress(kpi, kpi.currentValue);
}

function calculateProgress(
  kpi: {
    currentValue: number;
    targetValue: number;
    baselineValue: number;
    direction: string;
  },
  currentValue: number
): KPIProgress {
  const targetDiff = kpi.targetValue - kpi.baselineValue;
  const currentDiff = currentValue - kpi.baselineValue;
  const progressPercent = targetDiff === 0 ? 0 : Math.abs(currentDiff / targetDiff) * 100;

  let onTrack = false;
  if (kpi.direction === "up") {
    onTrack = currentValue >= kpi.baselineValue && currentValue <= kpi.targetValue
      ? true
      : currentValue > kpi.targetValue || currentValue >= kpi.baselineValue;
  } else {
    onTrack = currentValue <= kpi.baselineValue && currentValue >= kpi.targetValue
      ? true
      : currentValue < kpi.targetValue || currentValue <= kpi.baselineValue;
  }

  return {
    currentValue,
    targetValue: kpi.targetValue,
    baselineValue: kpi.baselineValue,
    progressPercent: Math.min(progressPercent, 100),
    onTrack,
    direction: kpi.direction as "up" | "down",
  };
}

export async function getKPIImpactForAction(
  actionId: string
): Promise<Array<{ kpiId: string; impactAmount: number }>> {
  return (await db.kPIImpact.findMany({
    where: { actionId },
    select: {
      kpiId: true,
      impactAmount: true,
    },
  })) as any[];
}
