/**
 * GET  /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/market-sizing — latest sizing record.
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/market-sizing — build/update sizing.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { buildAndPersistMarketSizing } from "@/services/owner-strategy/startup-session.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const sizing = await db.startupMarketSizing.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId },
      orderBy: { versionNumber: "desc" },
    });
    if (!sizing) throw new NotFoundError("StartupMarketSizing", params.ideaId);

    // Expose sizingRange as `range` for the wire contract (low / mid / high)
    const { sizingRange, ...rest } = sizing as typeof sizing & { sizingRange: unknown };
    return canonicalJson({ ...rest, range: sizingRange ?? null }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

const postSchema = z.object({
  reachableMarketUnits: z.number().nullable().optional(),
  reachableMarketRevenueCents: z.number().nullable().optional(),
  serviceableUnits: z.number().nullable().optional(),
  serviceableRevenueCents: z.number().nullable().optional(),
  initialCustomerPool: z.number().nullable().optional(),
  capacityLimitedRevenueCents: z.number().nullable().optional(),
  sizingStatus: z.enum(["ESTIMATED", "INSUFFICIENT_EVIDENCE"]).optional(),
  confidence: z.number().min(0).max(100).optional(),
  assumptions: z.array(z.string()).optional(),
  evidence: z.array(z.string()).optional(),
  sizingRange: z
    .object({ low: z.number(), mid: z.number(), high: z.number() })
    .nullable()
    .optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, postSchema);

    const sizingId = await buildAndPersistMarketSizing(
      ctx.verifiedWorkspaceId,
      params.sessionId,
      params.ideaId,
      ctx.verifiedActorId,
      {
        reachableMarketUnits:
          body.reachableMarketUnits != null ? BigInt(Math.round(body.reachableMarketUnits)) : null,
        reachableMarketRevenueCents:
          body.reachableMarketRevenueCents != null
            ? BigInt(Math.round(body.reachableMarketRevenueCents))
            : null,
        serviceableUnits:
          body.serviceableUnits != null ? BigInt(Math.round(body.serviceableUnits)) : null,
        serviceableRevenueCents:
          body.serviceableRevenueCents != null
            ? BigInt(Math.round(body.serviceableRevenueCents))
            : null,
        initialCustomerPool: body.initialCustomerPool ?? null,
        capacityLimitedRevenueCents:
          body.capacityLimitedRevenueCents != null
            ? BigInt(Math.round(body.capacityLimitedRevenueCents))
            : null,
        sizingStatus: body.sizingStatus ?? "ESTIMATED",
        confidence: body.confidence ?? 50,
        assumptions: body.assumptions ?? [],
        evidence: body.evidence ?? [],
        sizingRange: body.sizingRange ?? undefined,
      }
    );

    return canonicalJson({ sizingId }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
