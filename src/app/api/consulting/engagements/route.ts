/**
 * Bundle 6 — Consulting Engagement API.
 *
 * GET  /api/consulting/engagements           — list engagements for workspace
 * GET  /api/consulting/engagements?id=       — get single engagement by id
 * POST /api/consulting/engagements           — create engagement
 * POST /api/consulting/engagements/phase     — advance consulting phase
 * POST /api/consulting/engagements/findings  — create finding (evidence required)
 * POST /api/consulting/engagements/recommendations — generate recommendation (finding required)
 * POST /api/consulting/engagements/actions   — assign consulting action
 * POST /api/consulting/engagements/close     — close engagement (critical actions gate)
 *
 * Auth: CONSULTING_WRITE (create/advance/assign/close), CONSULTING_READ (list/get)
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  CreateEngagementSchema,
  AdvancePhaseSchema,
  CreateFindingSchema,
  GenerateRecommendationSchema,
  AssignConsultingActionSchema,
  CloseEngagementSchema,
} from "@/domain/consulting/consulting-contracts";
import {
  createConsultingEngagement,
  getConsultingEngagement,
  listConsultingEngagements,
  advanceConsultingPhase,
  createConsultingFinding,
  generateConsultingRecommendation,
  assignConsultingAction,
  closeConsultingEngagement,
} from "@/services/consulting/consulting-engagement.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const id = url.searchParams.get("id");
    const forConsultant = url.searchParams.get("view") !== "client";

    if (id) {
      const engagement = await getConsultingEngagement(
        { engagementId: id, workspaceId: ctx.verifiedWorkspaceId },
        forConsultant
      );
      return canonicalJson({ engagement }, { status: 200 });
    }

    const engagements = await listConsultingEngagements(
      { workspaceId: ctx.verifiedWorkspaceId },
      forConsultant
    );
    return canonicalJson({ engagements }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_READ], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const action = url.searchParams.get("action") ?? "create";
    const body = await ctx.request!.json();

    switch (action) {
      case "create": {
        const parsed = CreateEngagementSchema.safeParse(body);
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const engagement = await createConsultingEngagement(
          { ...parsed.data, workspaceId: ctx.verifiedWorkspaceId },
          ctx.verifiedActorId
        );
        return canonicalJson({ engagement }, { status: 201 });
      }

      case "advance_phase": {
        const parsed = AdvancePhaseSchema.safeParse({
          ...body,
          workspaceId: ctx.verifiedWorkspaceId,
        });
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const engagement = await advanceConsultingPhase(
          {
            engagementId: parsed.data.engagementId,
            workspaceId: ctx.verifiedWorkspaceId,
            targetPhase: parsed.data.targetPhase,
            rationale: parsed.data.rationale,
          },
          ctx.verifiedActorId
        );
        return canonicalJson({ engagement }, { status: 200 });
      }

      case "create_finding": {
        const parsed = CreateFindingSchema.safeParse(body);
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const finding = await createConsultingFinding(
          { ...parsed.data, workspaceId: ctx.verifiedWorkspaceId },
          ctx.verifiedActorId
        );
        return canonicalJson({ finding }, { status: 201 });
      }

      case "generate_recommendation": {
        const parsed = GenerateRecommendationSchema.safeParse(body);
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const recommendation = await generateConsultingRecommendation(
          { ...parsed.data, workspaceId: ctx.verifiedWorkspaceId },
          ctx.verifiedActorId
        );
        return canonicalJson({ recommendation }, { status: 201 });
      }

      case "assign_action": {
        const parsed = AssignConsultingActionSchema.safeParse(body);
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const consultingAction = await assignConsultingAction(
          { ...parsed.data, workspaceId: ctx.verifiedWorkspaceId },
          ctx.verifiedActorId
        );
        return canonicalJson({ action: consultingAction }, { status: 201 });
      }

      case "close": {
        const parsed = CloseEngagementSchema.safeParse(body);
        if (!parsed.success) {
          return canonicalJson({ error: parsed.error.flatten() }, { status: 422 });
        }
        const engagement = await closeConsultingEngagement(
          { ...parsed.data, workspaceId: ctx.verifiedWorkspaceId },
          ctx.verifiedActorId
        );
        return canonicalJson({ engagement }, { status: 200 });
      }

      default:
        return canonicalJson({ error: "Unknown action" }, { status: 400 });
    }
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_WRITE], requireWorkspace: true }
);
