/**
 * /api/owner/onboarding-lifecycle — Owner Onboarding and Archetype Seeding (Bundle 3.8).
 *
 * POST   — startOnboarding (idempotent per workspace)
 * GET    — getOnboarding
 * PATCH  — { action: "complete" | "re_onboard" }
 *
 * Auth: OWNER_ONBOARD capability, workspace-scoped.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { z } from "zod";
import {
  startOnboarding,
  completeOnboarding,
  triggerReOnboarding,
  getOnboarding,
} from "@/services/owner-mode/owner-onboarding-lifecycle.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const StartSchema = z.object({
  businessId: z.string().uuid(),
  ownerId: z.string().uuid(),
  businessName: z.string().min(1),
  businessType: z.string().min(1),
  revenueRange: z.string().min(1),
  revenueTrend: z.enum(["DECLINING", "STABLE", "GROWING"]),
  profitability: z.enum(["NEGATIVE", "BREAKEVEN", "POSITIVE"]),
  cashRunwayWeeks: z.number().int().positive().optional(),
  ownerHoursPerWeek: z.number().int().positive().optional(),
  teamSize: z.number().int().positive().optional(),
});

const CompleteSchema = z.object({
  action: z.literal("complete"),
  completionKey: z.string().min(1),
});

const ReOnboardSchema = z.object({
  action: z.literal("re_onboard"),
  reOnboardingReason: z.string().min(1),
});

const PatchSchema = z.discriminatedUnion("action", [CompleteSchema, ReOnboardSchema]);

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();
    const parsed = StartSchema.safeParse(body);
    if (!parsed.success) {
      return canonicalJson({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = await startOnboarding({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      ...parsed.data,
    });
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_ONBOARD], requireWorkspace: true },
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const result = await getOnboarding({ workspaceId: ctx.verifiedWorkspaceId });
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_ONBOARD], requireWorkspace: true },
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return canonicalJson({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "complete") {
      const result = await completeOnboarding({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        completionKey: parsed.data.completionKey,
      });
      return canonicalJson(result, { status: 200 });
    }

    // re_onboard
    const result = await triggerReOnboarding({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      reOnboardingReason: parsed.data.reOnboardingReason,
    });
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_ONBOARD], requireWorkspace: true },
);
