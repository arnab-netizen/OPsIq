/**
 * Phase 4 — Business Objective routes.
 *
 * GET  /api/owner/objectives — list all objectives for the workspace
 * POST /api/owner/objectives — create or update a business objective
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createObjective,
  updateObjective,
  listObjectives,
  addDependency,
  removeDependency,
} from "@/services/owner-mode/business-objective.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  action: z.enum(["CREATE", "UPDATE", "ADD_DEPENDENCY", "REMOVE_DEPENDENCY"]).default("CREATE"),
  objectiveId: z.string().trim().uuid().nullish(),
  // Explicit only -- the caller (the owner's currently active business in the UI) must state which
  // business this objective belongs to, or omit/null it for a deliberate workspace-level objective.
  // Never inferred server-side. See business-objective.service.ts's CreateObjectiveInput.
  businessId: z.string().trim().uuid().nullish(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(2000).nullish(),
  objectiveType: z.enum(["REVENUE", "COST_REDUCTION", "QUALITY", "COMPLIANCE", "GROWTH", "RESILIENCE", "STRATEGIC"]).optional(),
  parentId: z.string().trim().uuid().nullish(),
  linkedGoalId: z.string().trim().uuid().nullish(),
  priorityScore: z.number().int().min(0).max(100).optional(),
  targetValue: z.number().nullish(),
  currentValue: z.number().nullish(),
  unit: z.string().trim().max(50).nullish(),
  deadline: z.string().datetime().nullish(),
  resourceBudget: z.record(z.string(), z.unknown()).nullish(),
  // For dependency management
  blockingObjectiveId: z.string().trim().uuid().nullish(),
  blockedObjectiveId: z.string().trim().uuid().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const objectives = await listObjectives(ctx.verifiedWorkspaceId);
    return canonicalJson({ objectives }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "ADD_DEPENDENCY") {
      if (!input.blockingObjectiveId || !input.blockedObjectiveId) {
        return canonicalJson({ error: "blockingObjectiveId and blockedObjectiveId required" }, { status: 400 });
      }
      const dep = await addDependency(workspaceId, actorId, input.blockingObjectiveId, input.blockedObjectiveId);
      return canonicalJson({ dependency: dep }, { status: 200 });
    }

    if (input.action === "REMOVE_DEPENDENCY") {
      if (!input.blockingObjectiveId || !input.blockedObjectiveId) {
        return canonicalJson({ error: "blockingObjectiveId and blockedObjectiveId required" }, { status: 400 });
      }
      await removeDependency(workspaceId, input.blockingObjectiveId, input.blockedObjectiveId);
      return canonicalJson({ ok: true }, { status: 200 });
    }

    if (input.action === "UPDATE") {
      if (!input.objectiveId) {
        return canonicalJson({ error: "objectiveId required for UPDATE" }, { status: 400 });
      }
      const updated = await updateObjective({
        workspaceId,
        actorId,
        objectiveId: input.objectiveId,
        title: input.title,
        description: input.description,
        priorityScore: input.priorityScore,
        targetValue: input.targetValue,
        currentValue: input.currentValue,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        resourceBudget: input.resourceBudget as Record<string, unknown> | undefined,
        linkedGoalId: input.linkedGoalId,
      });
      return canonicalJson({ objective: updated }, { status: 200 });
    }

    // Default: CREATE
    if (!input.title || !input.objectiveType) {
      return canonicalJson({ error: "title and objectiveType required for CREATE" }, { status: 400 });
    }
    const objective = await createObjective({
      workspaceId,
      actorId,
      businessId: input.businessId,
      title: input.title,
      description: input.description,
      objectiveType: input.objectiveType,
      parentId: input.parentId,
      linkedGoalId: input.linkedGoalId,
      priorityScore: input.priorityScore ?? 50,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      unit: input.unit,
      deadline: input.deadline ? new Date(input.deadline) : undefined,
      resourceBudget: input.resourceBudget as Record<string, unknown> | undefined,
    });
    return canonicalJson({ objective }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
