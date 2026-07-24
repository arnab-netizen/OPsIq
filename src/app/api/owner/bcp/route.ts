/**
 * Bundle 4.2 — Owner Business Condition Profile (BCP) API surface.
 *
 * GET  /api/owner/bcp?businessId=...             — current condition profile
 * GET  /api/owner/bcp?businessId=...&history=1   — version history (last 50)
 * GET  /api/owner/bcp?id=...                     — profile by id
 * POST /api/owner/bcp                            — create initial profile (idempotent)
 * PATCH /api/owner/bcp                           — re-evaluate profile (new version snapshot)
 *
 * Auth: OWNER_MANAGE. Workspace-scoped. inputFactsJson never returned.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createConditionProfile,
  evaluateConditionProfile,
  getCurrentConditionProfile,
  getConditionProfileById,
  getConditionProfileHistory,
} from "@/services/owner-mode/owner-bcp.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const factsSchema = z.object({
  financialHealthScore: z.number().min(0).max(100),
  operationalHealthScore: z.number().min(0).max(100),
  salesHealthScore: z.number().min(0).max(100),
  sopHealthScore: z.number().min(0).max(100),
  humanExecutionRisk: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  consultingLifecycleStage: z
    .enum(["INTAKE", "DIAGNOSIS", "INTERVENTION", "STABILIZATION", "GROWTH", "MAINTENANCE", "CLOSURE"])
    .optional(),
  interventionPhase: z
    .enum(["TRIAGE", "PLANNING", "EXECUTION", "REVIEW", "MONITORING"])
    .optional(),
});

const createSchema = z.object({
  businessId: z.string().uuid(),
  facts: factsSchema,
  triggerDescription: z.string().trim().min(1).max(500).optional(),
  sourceReassessmentEventId: z.string().uuid().optional(),
});

const patchSchema = z.object({
  businessId: z.string().uuid(),
  facts: factsSchema,
  triggerType: z.enum([
    "EVIDENCE_UPDATE",
    "KPI_CHANGE",
    "BLOCKER_EVENT",
    "SHOCK_EVENT",
    "SIGNAL_REASSESSMENT",
  ]),
  triggerDescription: z.string().trim().min(1).max(500),
  sourceReassessmentEventId: z.string().uuid().optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const id = url.searchParams.get("id");
    const businessId = url.searchParams.get("businessId");
    const history = url.searchParams.get("history");

    if (id) {
      const dto = await getConditionProfileById({
        workspaceId: ctx.verifiedWorkspaceId,
        profileId: id,
      });
      return canonicalJson({ profile: dto }, { status: 200 });
    }

    if (!businessId) {
      return canonicalJson({ error: "businessId or id is required" }, { status: 400 });
    }

    if (history === "1" || history === "true") {
      const profiles = await getConditionProfileHistory({
        workspaceId: ctx.verifiedWorkspaceId,
        businessId,
      });
      return canonicalJson({ profiles }, { status: 200 });
    }

    const profile = await getCurrentConditionProfile({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
    });
    return canonicalJson({ profile }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);
    const dto = await createConditionProfile({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      businessId: input.businessId,
      facts: input.facts,
      triggerDescription: input.triggerDescription,
      sourceReassessmentEventId: input.sourceReassessmentEventId,
    });
    return canonicalJson({ profile: dto }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);
    const dto = await evaluateConditionProfile({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      businessId: input.businessId,
      facts: input.facts,
      triggerType: input.triggerType,
      triggerDescription: input.triggerDescription,
      sourceReassessmentEventId: input.sourceReassessmentEventId,
    });
    return canonicalJson({ profile: dto }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
