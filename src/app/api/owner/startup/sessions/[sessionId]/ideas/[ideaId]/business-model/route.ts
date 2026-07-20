/**
 * POST /api/owner/startup/sessions/[sessionId]/ideas/[ideaId]/business-model — persist business model.
 * GET  — retrieve latest business model.
 */
import { z } from "zod/v4";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { parseRequestBody } from "@/lib/validation";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const businessModelSchema = z.object({
  customerSegment: z.string().max(500),
  customerProblem: z.string().max(2000),
  valueProposition: z.string().max(2000),
  deliveryMethod: z.string().max(500),
  revenueModel: z.string().max(500),
  pricingHypothesis: z.string().max(500),
  costStructure: z.record(z.string(), z.unknown()).optional(),
  acquisitionChannels: z.array(z.string()).optional(),
  fulfilmentProcess: z.string().max(2000).optional(),
  suppliersAndDependencies: z.array(z.unknown()).optional(),
  keyCapabilities: z.array(z.string()).optional(),
  keyMetrics: z.array(z.string()).optional(),
  retentionMechanism: z.string().max(1000).optional(),
  workingCapitalCycle: z.string().max(1000).optional(),
  regulatoryRequirements: z.array(z.unknown()).optional(),
  qualityControlRequirements: z.array(z.unknown()).optional(),
  failureModes: z.array(z.unknown()).optional(),
  defensibilityNotes: z.string().max(2000).optional(),
  scaleConstraints: z.string().max(1000).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, businessModelSchema);
    const { sessionId, ideaId } = params;

    const existing = await db.startupBusinessModel.findFirst({
      where: { ideaId, workspaceId: ctx.verifiedWorkspaceId, supersededById: null },
      orderBy: { version: "desc" },
    });

    const newVersion = existing ? existing.version + 1 : 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = await (db.$transaction as (fn: (tx: any) => Promise<any>) => Promise<any>)(async (tx) => {
      const created = await tx.startupBusinessModel.create({
        data: {
          workspaceId: ctx.verifiedWorkspaceId,
          ideaId,
          startupSessionId: sessionId,
          version: newVersion,
          customerSegment: body.customerSegment,
          customerProblem: body.customerProblem,
          valueProposition: body.valueProposition,
          deliveryMethod: body.deliveryMethod,
          revenueModel: body.revenueModel,
          pricingHypothesis: body.pricingHypothesis,
          costStructure: body.costStructure ?? {},
          acquisitionChannels: body.acquisitionChannels ?? [],
          fulfilmentProcess: body.fulfilmentProcess ?? null,
          suppliersAndDependencies: body.suppliersAndDependencies ?? [],
          keyCapabilities: body.keyCapabilities ?? [],
          keyMetrics: body.keyMetrics ?? [],
          retentionMechanism: body.retentionMechanism ?? null,
          workingCapitalCycle: body.workingCapitalCycle ?? null,
          regulatoryRequirements: body.regulatoryRequirements ?? [],
          qualityControlRequirements: body.qualityControlRequirements ?? [],
          failureModes: body.failureModes ?? [],
          defensibilityNotes: body.defensibilityNotes ?? null,
          scaleConstraints: body.scaleConstraints ?? null,
        },
      });
      if (existing) {
        await tx.startupBusinessModel.update({
          where: { id: existing.id },
          data: { supersededById: created.id },
        });
      }
      return created;
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.STARTUP_IDEA_ADDED,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      entityType: "StartupBusinessModel",
      entityId: model.id,
      payload: { sessionId, ideaId, version: newVersion },
    });

    return canonicalJson({ modelId: model.id }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const model = await db.startupBusinessModel.findFirst({
      where: { ideaId: params.ideaId, workspaceId: ctx.verifiedWorkspaceId, supersededById: null },
      orderBy: { version: "desc" },
    });
    return canonicalJson({ model }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
