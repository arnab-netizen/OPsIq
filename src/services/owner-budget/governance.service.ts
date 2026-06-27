/**
 * Owner Budget governance service — owner override + employee/manager budget
 * authority lifecycle (Sections 23, 26). DB-backed, workspace-scoped.
 *
 * Reuses the pure decision logic in `@/domain/owner-budget` (override safety +
 * outcome classification, authority transitions + lawful-action guardrails),
 * persists governed records, emits audit events, and triggers reassessment.
 */
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getBusiness } from "@/services/founder-recovery/business.service";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { reassessBudget } from "@/services/owner-budget/budget.service";
import {
  assertOverrideAllowed,
  classifyOverrideOutcome,
  checkAuthorityTransition,
  recommendAuthorityChange,
  isLawfulAuthorityAction,
  type OverrideOutcomeInput,
  type BudgetAuthorityStatus,
  type AuthorityRecommendationInput,
} from "@/domain/owner-budget";
import { ForbiddenError, ValidationError, NotFoundError } from "@/infra/errors";

// ---------------------------------------------------------------------------
// Owner override
// ---------------------------------------------------------------------------

export interface RecordOverrideInput {
  originalRecommendation: string;
  riskWarning: string;
  reason: string;
  affectedLines?: string[];
  expectedConsequence: string;
  reviewInDays?: number;
  vendorBankUnverified?: boolean;
  statutoryReserveViolation?: boolean;
  unlawfulEmployeeAction?: boolean;
}

export async function recordOwnerOverride(
  businessId: string,
  input: RecordOverrideInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);

  // Hard safety/legal blocks cannot be overridden (Section 26).
  const safety = assertOverrideAllowed({
    vendorBankUnverified: input.vendorBankUnverified,
    statutoryReserveViolation: input.statutoryReserveViolation,
    unlawfulEmployeeAction: input.unlawfulEmployeeAction,
  });
  if (!safety.allowed) {
    throw new ForbiddenError(safety.reason);
  }

  const reviewDate = new Date(Date.now() + (input.reviewInDays ?? 14) * 86400000);
  const override = await db.ownerBudgetOverride.create({
    data: {
      id: randomUUID(),
      workspaceId, businessId,
      originalRecommendation: input.originalRecommendation,
      riskWarning: input.riskWarning,
      reason: input.reason,
      affectedLines: input.affectedLines ?? [],
      expectedConsequence: input.expectedConsequence,
      reviewDate,
      createdBy: actorId,
      updatedAt: new Date(),
    },
  });

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_OVERRIDE_RECORDED,
    actorId, workspaceId, entityType: "OwnerBudgetOverride", entityId: override.id,
    payload: { businessId, reason: input.reason },
  });

  // Owner override must trigger future reassessment (Section 26).
  await reassessBudget(businessId, workspaceId, {
    actorId, kind: "owner_override_recorded", triggerEventId: `override:${override.id}`,
    change: { field: "ownerOverride", newValue: input.reason },
  });

  return override;
}

/** Close an override by recording the verified actual outcome + classification. */
export async function closeOverrideOutcome(
  businessId: string,
  overrideId: string,
  outcome: OverrideOutcomeInput & { note?: string },
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);
  const existing = await db.ownerBudgetOverride.findFirst({ where: { id: overrideId, workspaceId, businessId } });
  if (!existing) throw new NotFoundError("OwnerBudgetOverride", overrideId);

  const outcomeClass = classifyOverrideOutcome(outcome);
  const updated = await db.ownerBudgetOverride.update({
    where: { id: overrideId },
    data: {
      actualOutcome: outcome.outcomeSuccess === null ? "unverified" : outcome.outcomeSuccess ? "success" : "failed",
      outcomeClass,
      outcomeNote: outcome.note ?? null,
      updatedAt: new Date(),
    },
  });
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_OVERRIDE_RECORDED,
    actorId, workspaceId, entityType: "OwnerBudgetOverride", entityId: overrideId,
    payload: { businessId, outcomeClass },
  });
  return updated;
}

// ---------------------------------------------------------------------------
// Budget authority lifecycle
// ---------------------------------------------------------------------------

export interface ChangeAuthorityInput {
  subjectUserId?: string | null;
  subjectRole?: string | null;
  scopeCategory?: string | null;
  toStatus: BudgetAuthorityStatus;
  reason: string;
  signals?: AuthorityRecommendationInput;
  reviewInDays?: number;
}

async function findAuthority(workspaceId: string, businessId: string, subjectUserId?: string | null, subjectRole?: string | null, scopeCategory?: string | null) {
  return db.budgetAuthority.findFirst({
    where: {
      workspaceId, businessId,
      subjectUserId: subjectUserId ?? null,
      subjectRole: subjectRole ?? null,
      scopeCategory: scopeCategory ?? null,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function changeBudgetAuthority(
  businessId: string,
  input: ChangeAuthorityInput,
  actorId: string,
  workspaceId: string
) {
  await getBusiness(businessId, workspaceId);

  const current = await findAuthority(workspaceId, businessId, input.subjectUserId, input.subjectRole, input.scopeCategory);
  const from: BudgetAuthorityStatus = (current?.status as BudgetAuthorityStatus) ?? "NORMAL";

  const transition = checkAuthorityTransition(from, input.toStatus);
  if (!transition.ok) throw new ValidationError(transition.reason);

  // Recommend lawful actions; the engine never emits a forbidden action.
  const rec = recommendAuthorityChange(from, input.signals ?? {});
  const lawfulActions = rec.lawfulActions.filter(isLawfulAuthorityAction);
  const reviewDate = new Date(Date.now() + (input.reviewInDays ?? rec.reviewInDays) * 86400000);

  const data = {
    status: input.toStatus,
    reason: input.reason,
    triggeringEvidence: { ...(input.signals ?? {}), recommendedStatus: rec.recommendedStatus, lawfulActions },
    reviewDate,
    restorationCriteria: rec.restorationCriteria,
    updatedAt: new Date(),
  };

  let row;
  if (current) {
    row = await db.budgetAuthority.update({ where: { id: current.id }, data });
  } else {
    row = await db.budgetAuthority.create({
      data: {
        id: randomUUID(), workspaceId, businessId,
        subjectUserId: input.subjectUserId ?? null,
        subjectRole: input.subjectRole ?? null,
        scopeCategory: input.scopeCategory ?? null,
        createdBy: actorId,
        ...data,
      },
    });
  }

  await emitAuditEvent({
    eventName: AUDIT_EVENTS.OWNER_BUDGET_AUTHORITY_CHANGED,
    actorId, workspaceId, entityType: "BudgetAuthority", entityId: row.id,
    payload: { businessId, from, to: input.toStatus, reason: input.reason },
  });

  await reassessBudget(businessId, workspaceId, {
    actorId, kind: "budget_authority_changed", triggerEventId: `authority:${row.id}:${input.toStatus}`,
    change: { field: "budgetAuthority", previousValue: from, newValue: input.toStatus },
  });

  return { authority: row, recommendation: rec };
}

export async function getBudgetAuthorities(workspaceId: string, businessId: string) {
  await getBusiness(businessId, workspaceId);
  return db.budgetAuthority.findMany({
    where: { workspaceId, businessId },
    orderBy: { updatedAt: "desc" },
  });
}
