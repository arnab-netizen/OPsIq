/**
 * Phase 4: Waste / Leakage Detection Service
 *
 * Persists detected operational, financial, and quality leakage events.
 * Each event moves through: detected → investigating → confirmed → recovering → verified.
 * Recovery savings are recorded only after owner verification — never assumed.
 *
 * Workspace isolation is enforced at every query (workspaceId required on all reads).
 * Materiality threshold is owner-configured: events below threshold are still recorded
 * but flagged as sub-threshold so the owner can tune the signal-to-noise ratio.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";

export type WasteCategory =
  | "DISCOUNT_LEAK"
  | "REWORK"
  | "OVERDUE_PAYMENT"
  | "UNDERPRICING"
  | "IDLE_CAPACITY"
  | "SUPPLIER_OVERCHARGE"
  | "OTHER";

export type LeakageSource = "finance" | "operations" | "quality" | "supplier" | "sales";

export type LeakageStatus =
  | "detected"
  | "investigating"
  | "confirmed"
  | "recovering"
  | "verified"
  | "dismissed";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RecordLeakageInput {
  workspaceId: string;
  actorId: string;
  category: WasteCategory;
  source: LeakageSource;
  amount?: number | null;
  currency?: string;
  evidenceId?: string | null;
  detectedAt: Date;
  materialityThreshold?: number | null;
  confidenceLevel?: ConfidenceLevel;
  description?: string | null;
}

export interface UpdateLeakageStatusInput {
  workspaceId: string;
  actorId: string;
  newStatus: LeakageStatus;
  dismissalReason?: string | null;
  recoveryAmount?: number | null;
}

export interface WasteLeakageSummary {
  totalDetected: number;
  totalConfirmed: number;
  totalVerifiedRecovery: number;
  currency: string;
  topSources: Array<{ category: WasteCategory; count: number; estimatedAmount: number | null }>;
}

/** Record a new waste/leakage detection event. Returns the created event id. */
export async function recordLeakageEvent(input: RecordLeakageInput): Promise<string> {
  const id = randomUUID();
  await db.wasteLeakageEvent.create({
    data: {
      id,
      workspaceId: input.workspaceId,
      category: input.category,
      source: input.source,
      amount: input.amount ?? null,
      currency: input.currency ?? "USD",
      evidenceId: input.evidenceId ?? null,
      detectedAt: input.detectedAt,
      status: "detected",
      materialityThreshold: input.materialityThreshold ?? null,
      confidenceLevel: input.confidenceLevel ?? "LOW",
      description: input.description ?? null,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.WASTE_LEAKAGE_DETECTED,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    entityType: "WasteLeakageEvent",
    entityId: id,
    payload: { category: input.category, source: input.source, amount: input.amount ?? null, confidenceLevel: input.confidenceLevel ?? "LOW" },
  });

  return id;
}

/** Advance a leakage event through its lifecycle. */
export async function updateLeakageStatus(
  eventId: string,
  input: UpdateLeakageStatusInput,
): Promise<void> {
  const event = await db.wasteLeakageEvent.findFirst({
    where: { id: eventId, workspaceId: input.workspaceId },
  });
  if (!event) throw new NotFoundError("WasteLeakageEvent", eventId);

  if (input.newStatus === "verified" && input.recoveryAmount == null) {
    throw new ValidationError("recoveryAmount is required when verifying recovery");
  }

  const now = new Date();
  await db.wasteLeakageEvent.update({
    where: { id: eventId },
    data: {
      status: input.newStatus,
      dismissalReason: input.newStatus === "dismissed" ? (input.dismissalReason ?? null) : undefined,
      recoveryAmount: input.newStatus === "verified" ? (input.recoveryAmount ?? null) : undefined,
      verifiedAt: input.newStatus === "verified" ? now : undefined,
      verifiedBy: input.newStatus === "verified" ? input.actorId : undefined,
      updatedAt: now,
    },
  });

  const eventName = input.newStatus === "confirmed"
    ? AUDIT_EVENTS.WASTE_LEAKAGE_CONFIRMED
    : input.newStatus === "dismissed"
    ? AUDIT_EVENTS.WASTE_LEAKAGE_DISMISSED
    : input.newStatus === "verified"
    ? AUDIT_EVENTS.WASTE_LEAKAGE_RECOVERY_VERIFIED
    : AUDIT_EVENTS.WASTE_LEAKAGE_DETECTED; // fallback for intermediate states

  await emitAuditEvent({
    eventName,
    actorId: input.actorId,
    workspaceId: input.workspaceId,
    entityType: "WasteLeakageEvent",
    entityId: eventId,
    payload: { newStatus: input.newStatus, recoveryAmount: input.recoveryAmount ?? null },
  });
}

/** Increment the recurrence counter when the same category reappears. */
export async function incrementRecurrence(
  eventId: string,
  workspaceId: string,
): Promise<void> {
  const event = await db.wasteLeakageEvent.findFirst({
    where: { id: eventId, workspaceId },
  });
  if (!event) throw new NotFoundError("WasteLeakageEvent", eventId);

  await db.wasteLeakageEvent.update({
    where: { id: eventId },
    data: { recurrenceCount: { increment: 1 }, updatedAt: new Date() },
  });
}

/** List active (non-dismissed) leakage events for a workspace, newest first. */
export async function listLeakageEvents(workspaceId: string) {
  return db.wasteLeakageEvent.findMany({
    where: { workspaceId, status: { not: "dismissed" } },
    orderBy: { detectedAt: "desc" },
  });
}

/** Get workspace leakage summary for Now View: total, top-3 sources, verified recovery. */
export async function getLeakageSummary(workspaceId: string): Promise<WasteLeakageSummary> {
  type LeakRow = {
    category: string;
    amount: number | null;
    status: string;
    recoveryAmount: number | null;
    currency: string;
  };

  const events = (await db.wasteLeakageEvent.findMany({
    where: { workspaceId },
    select: { category: true, amount: true, status: true, recoveryAmount: true, currency: true },
  })) as LeakRow[];

  const confirmed = events.filter((e) => ["confirmed", "recovering", "verified"].includes(e.status));
  const verified = events.filter((e) => e.status === "verified");

  const totalVerifiedRecovery = verified.reduce(
    (sum, e) => sum + (e.recoveryAmount ?? 0),
    0,
  );

  // Aggregate by category across non-dismissed events
  const categoryMap = new Map<string, { count: number; amount: number | null }>();
  for (const e of events.filter((e) => e.status !== "dismissed")) {
    const existing = categoryMap.get(e.category) ?? { count: 0, amount: null };
    categoryMap.set(e.category, {
      count: existing.count + 1,
      amount: e.amount != null ? (existing.amount ?? 0) + e.amount : existing.amount,
    });
  }

  const topSources = [...categoryMap.entries()]
    .map(([category, data]) => ({
      category: category as WasteCategory,
      count: data.count,
      estimatedAmount: data.amount,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const currency = events[0]?.currency ?? "USD";

  return {
    totalDetected: events.filter((e) => e.status !== "dismissed").length,
    totalConfirmed: confirmed.length,
    totalVerifiedRecovery,
    currency,
    topSources,
  };
}
