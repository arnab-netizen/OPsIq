/**
 * Phase 7: Governed Operating Policy Registry
 *
 * Owner-configurable per-workspace policies that gate expenditure and growth decisions.
 * Policy evaluation returns ALLOW / WARN / BLOCK with explanation and override path.
 *
 * Two built-in policy keys:
 *   "high_cost_low_payback"   — warns/blocks when payback period exceeds threshold months
 *   "growth_before_capacity"  — blocks marketing/growth when capacity utilisation exceeds threshold %
 *
 * All mutations emit audit events transactionally. Compliance/safety spend is exempt
 * from high_cost_low_payback by default (category-level exemption in the caller).
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ConflictError, UnauthorizedError } from "@/infra/errors";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PolicyDecision = "ALLOW" | "WARN" | "BLOCK";

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  policyKey: string;
  message?: string;
  recommendation?: string;
  blockReason?: string;
  overridePath?: string;
  activeOverride?: {
    overriddenBy: string;
    reason: string;
    expiresAt: Date | null;
  };
}

export interface OperatingPolicyRecord {
  id: string;
  workspaceId: string;
  policyKey: string;
  category: string;
  description: string;
  threshold: number;
  thresholdUnit: string;
  hardBlock: boolean;
  overrideAuthorityRole: string;
  overrideReasonRequired: boolean;
  expiryAfterOverrideMinutes: number | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyOverrideRecord {
  id: string;
  policyId: string;
  workspaceId: string;
  overriddenBy: string;
  reason: string;
  context: Record<string, unknown>;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdAt: Date;
}

export interface CreateOverrideInput {
  policyId: string;
  workspaceId: string;
  overriddenBy: string;
  reason: string;
  context?: Record<string, unknown>;
}

export interface UpdatePolicyInput {
  threshold?: number;
  hardBlock?: boolean;
  isActive?: boolean;
  expiryAfterOverrideMinutes?: number | null;
}

// ─── Default policy definitions ─────────────────────────────────────────────

const DEFAULT_POLICIES: ReadonlyArray<Omit<OperatingPolicyRecord, "id" | "createdAt" | "updatedAt" | "workspaceId" | "createdBy">> = [
  {
    policyKey: "high_cost_low_payback",
    category: "COST_CONTROL",
    description:
      "Warn or block expenditures where the estimated payback period exceeds the threshold. " +
      "Compliance and safety spending is exempt from this policy.",
    threshold: 6,
    thresholdUnit: "MONTHS",
    hardBlock: false,
    overrideAuthorityRole: "OWNER",
    overrideReasonRequired: true,
    expiryAfterOverrideMinutes: 1440,
    isActive: true,
  },
  {
    policyKey: "growth_before_capacity",
    category: "GROWTH_GATING",
    description:
      "Block marketing and growth expenditure when operational capacity utilisation exceeds " +
      "the threshold percentage. Prevents over-committing to growth the business cannot deliver.",
    threshold: 80,
    thresholdUnit: "PERCENT",
    hardBlock: true,
    overrideAuthorityRole: "OWNER",
    overrideReasonRequired: true,
    expiryAfterOverrideMinutes: 2880,
    isActive: true,
  },
];

// ─── Seed / ensure defaults ───────────────────────────────────────────────

/** Create default policies for a workspace if they don't already exist. Idempotent. */
export async function ensureDefaultPolicies(
  workspaceId: string,
  createdBy: string,
): Promise<void> {
  for (const policy of DEFAULT_POLICIES) {
    const existing = await db.operatingPolicy.findFirst({
      where: { workspaceId, policyKey: policy.policyKey },
      select: { id: true },
    });
    if (!existing) {
      const id = randomUUID();
      await db.$transaction([
        db.operatingPolicy.create({
          data: {
            id,
            workspaceId,
            policyKey: policy.policyKey,
            category: policy.category,
            description: policy.description,
            threshold: policy.threshold,
            thresholdUnit: policy.thresholdUnit,
            hardBlock: policy.hardBlock,
            overrideAuthorityRole: policy.overrideAuthorityRole,
            overrideReasonRequired: policy.overrideReasonRequired,
            expiryAfterOverrideMinutes: policy.expiryAfterOverrideMinutes ?? null,
            isActive: policy.isActive,
            createdBy,
            updatedAt: new Date(),
          },
        }),
        db.auditEvent.create({
          data: {
            id: randomUUID(),
            eventName: AUDIT_EVENTS.OPERATING_POLICY_CREATED,
            actorId: createdBy,
            workspaceId,
            entityType: "OperatingPolicy",
            entityId: id,
            payload: { policyKey: policy.policyKey, threshold: policy.threshold, hardBlock: policy.hardBlock },
          },
        }),
      ]);
    }
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function getPolicy(
  workspaceId: string,
  policyKey: string,
): Promise<OperatingPolicyRecord | null> {
  const row = (await db.operatingPolicy.findFirst({
    where: { workspaceId, policyKey },
  })) as OperatingPolicyRecord | null;
  return row;
}

export async function listPolicies(workspaceId: string): Promise<OperatingPolicyRecord[]> {
  return (await db.operatingPolicy.findMany({
    where: { workspaceId },
    orderBy: { policyKey: "asc" },
  })) as OperatingPolicyRecord[];
}

/** Owner configures threshold or hardBlock for an existing policy. */
export async function updatePolicy(
  workspaceId: string,
  policyKey: string,
  updates: UpdatePolicyInput,
  updatedBy: string,
): Promise<OperatingPolicyRecord> {
  const existing = (await db.operatingPolicy.findFirst({
    where: { workspaceId, policyKey },
  })) as OperatingPolicyRecord | null;
  if (!existing) throw new NotFoundError("OperatingPolicy", policyKey);

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.threshold !== undefined) updateData.threshold = updates.threshold;
  if (updates.hardBlock !== undefined) updateData.hardBlock = updates.hardBlock;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
  if ("expiryAfterOverrideMinutes" in updates) {
    updateData.expiryAfterOverrideMinutes = updates.expiryAfterOverrideMinutes ?? null;
  }

  const [updated] = await db.$transaction([
    db.operatingPolicy.update({
      where: { id: existing.id },
      data: updateData,
    }),
    db.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: AUDIT_EVENTS.OPERATING_POLICY_UPDATED,
        actorId: updatedBy,
        workspaceId,
        entityType: "OperatingPolicy",
        entityId: existing.id,
        payload: { policyKey, ...updates },
      },
    }),
  ]);

  return updated as OperatingPolicyRecord;
}

// ─── Override management ──────────────────────────────────────────────────

export async function createOverride(input: CreateOverrideInput): Promise<string> {
  const policy = (await db.operatingPolicy.findFirst({
    where: { id: input.policyId, workspaceId: input.workspaceId },
  })) as OperatingPolicyRecord | null;
  if (!policy) throw new NotFoundError("OperatingPolicy", input.policyId);

  const id = randomUUID();
  const expiresAt = policy.expiryAfterOverrideMinutes
    ? new Date(Date.now() + policy.expiryAfterOverrideMinutes * 60_000)
    : null;

  await db.$transaction([
    db.operatingPolicyOverride.create({
      data: {
        id,
        policyId: input.policyId,
        workspaceId: input.workspaceId,
        overriddenBy: input.overriddenBy,
        reason: input.reason,
        context: (input.context ?? {}) as object,
        expiresAt,
      },
    }),
    db.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: AUDIT_EVENTS.OPERATING_POLICY_OVERRIDE_CREATED,
        actorId: input.overriddenBy,
        workspaceId: input.workspaceId,
        entityType: "OperatingPolicyOverride",
        entityId: id,
        payload: { policyKey: policy.policyKey, reason: input.reason, expiresAt },
      },
    }),
  ]);

  return id;
}

export async function revokeOverride(
  overrideId: string,
  workspaceId: string,
  revokedBy: string,
): Promise<void> {
  const existing = (await db.operatingPolicyOverride.findFirst({
    where: { id: overrideId, workspaceId },
    select: { id: true, revokedAt: true, policyId: true },
  })) as { id: string; revokedAt: Date | null; policyId: string } | null;
  if (!existing) throw new NotFoundError("OperatingPolicyOverride", overrideId);
  if (existing.revokedAt) return; // Idempotent — already revoked

  await db.$transaction([
    db.operatingPolicyOverride.update({
      where: { id: overrideId },
      data: { revokedAt: new Date(), revokedBy },
    }),
    db.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: AUDIT_EVENTS.OPERATING_POLICY_OVERRIDE_REVOKED,
        actorId: revokedBy,
        workspaceId,
        entityType: "OperatingPolicyOverride",
        entityId: overrideId,
        payload: { policyId: existing.policyId },
      },
    }),
  ]);
}

// ─── Policy evaluation ────────────────────────────────────────────────────

/** Find the most recent active (non-expired, non-revoked) override for a policy. */
async function findActiveOverride(
  policyId: string,
  workspaceId: string,
): Promise<PolicyOverrideRecord | null> {
  const now = new Date();
  const rows = (await db.operatingPolicyOverride.findMany({
    where: {
      policyId,
      workspaceId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  })) as PolicyOverrideRecord[];
  return rows[0] ?? null;
}

/**
 * Evaluate a policy against a concrete value.
 *
 * @param workspaceId  — the workspace owning the policy
 * @param policyKey    — e.g. "growth_before_capacity"
 * @param value        — the concrete measurement (e.g. 85 for 85% capacity)
 * @param unit         — must match the policy's thresholdUnit
 */
export async function evaluatePolicy(
  workspaceId: string,
  policyKey: string,
  value: number,
  unit: string,
): Promise<PolicyEvaluationResult> {
  const policy = (await db.operatingPolicy.findFirst({
    where: { workspaceId, policyKey, isActive: true },
  })) as OperatingPolicyRecord | null;

  if (!policy) {
    return { decision: "ALLOW", policyKey, message: "Policy not configured — defaulting to ALLOW" };
  }

  // Check for an active override — owner has explicitly approved proceeding
  const override = await findActiveOverride(policy.id, workspaceId);
  if (override) {
    return {
      decision: "ALLOW",
      policyKey,
      message: `Owner override active: "${override.reason}"`,
      activeOverride: {
        overriddenBy: override.overriddenBy,
        reason: override.reason,
        expiresAt: override.expiresAt,
      },
    };
  }

  const exceeds = value > policy.threshold;

  if (!exceeds) {
    return { decision: "ALLOW", policyKey };
  }

  if (policy.hardBlock) {
    return {
      decision: "BLOCK",
      policyKey,
      blockReason: `${policy.description} — current value ${value}${unit} exceeds limit ${policy.threshold}${unit}`,
      overridePath: `Owner (${policy.overrideAuthorityRole}) may override via POST /api/owner/policies/${policy.id}/overrides with a stated reason`,
      recommendation: `Reduce the value below ${policy.threshold}${unit} or obtain owner approval`,
    };
  }

  return {
    decision: "WARN",
    policyKey,
    message: `${policy.description} — current value ${value}${unit} exceeds advisory threshold ${policy.threshold}${unit}`,
    recommendation: "Review whether this expenditure meets the payback criteria before proceeding",
    overridePath: `Owner may acknowledge and proceed via POST /api/owner/policies/${policy.id}/overrides`,
  };
}

// ─── Cross-domain conflict detection ─────────────────────────────────────

export interface RecommendationCandidate {
  id: string;
  category: "GROWTH" | "EXPENDITURE" | "CASH" | "OPERATIONS" | "COMPLIANCE";
  description: string;
  estimatedCostGbp?: number;
  estimatedPaybackMonths?: number;
  /** Whether this is a marketing or growth-related recommendation */
  isGrowthAction?: boolean;
}

export interface ConflictCheckResult {
  candidateId: string;
  decision: PolicyDecision;
  policyKey?: string;
  blockReason?: string;
  warningMessage?: string;
  overridePath?: string;
  activeOverride?: PolicyEvaluationResult["activeOverride"];
}

/**
 * Run all applicable operating policies against a set of recommendations.
 * Returns a result per candidate — caller should filter/annotate the recommendation list.
 *
 * @param workspaceId       — workspace to evaluate against
 * @param candidates        — recommendations to check
 * @param capacityPercent   — current operational capacity utilisation (0–100)
 */
export async function evaluateCrossDomainConflicts(
  workspaceId: string,
  candidates: RecommendationCandidate[],
  capacityPercent: number,
): Promise<ConflictCheckResult[]> {
  const results: ConflictCheckResult[] = [];

  for (const candidate of candidates) {
    // Compliance and safety are always exempt from COST_CONTROL policies
    const isComplianceOrSafety = candidate.category === "COMPLIANCE";

    // Growth recommendations blocked when capacity is full
    if (candidate.isGrowthAction) {
      const capacityResult = await evaluatePolicy(
        workspaceId,
        "growth_before_capacity",
        capacityPercent,
        "%",
      );
      if (capacityResult.decision !== "ALLOW") {
        results.push({
          candidateId: candidate.id,
          decision: capacityResult.decision,
          policyKey: capacityResult.policyKey,
          blockReason: capacityResult.blockReason,
          warningMessage: capacityResult.message,
          overridePath: capacityResult.overridePath,
          activeOverride: capacityResult.activeOverride,
        });
        continue;
      }
    }

    // High-cost expenditures checked for payback period
    if (
      !isComplianceOrSafety &&
      candidate.category === "EXPENDITURE" &&
      candidate.estimatedPaybackMonths !== undefined
    ) {
      const paybackResult = await evaluatePolicy(
        workspaceId,
        "high_cost_low_payback",
        candidate.estimatedPaybackMonths,
        " months",
      );
      if (paybackResult.decision !== "ALLOW") {
        results.push({
          candidateId: candidate.id,
          decision: paybackResult.decision,
          policyKey: paybackResult.policyKey,
          blockReason: paybackResult.blockReason,
          warningMessage: paybackResult.message,
          overridePath: paybackResult.overridePath,
          activeOverride: paybackResult.activeOverride,
        });
        continue;
      }
    }

    results.push({ candidateId: candidate.id, decision: "ALLOW" });
  }

  return results;
}
