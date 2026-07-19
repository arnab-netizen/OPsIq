/**
 * Phase 4 — Business Risk Register routes.
 *
 * GET  /api/owner/risks — list active risks for the workspace
 * POST /api/owner/risks — create or update a business risk entry
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { randomUUID } from "crypto";
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { createBusinessRisk, updateBusinessRisk, listBusinessRisks } from "@/services/owner-mode/business-risk.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["CREATE", "UPDATE"]).default("CREATE"),
  riskId: z.string().trim().uuid().nullish(),
  riskCode: z.string().trim().min(1).max(50).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(2000).nullish(),
  category: z.enum(["OPERATIONAL", "FINANCIAL", "MARKET", "COMPLIANCE", "EXECUTION", "STRATEGIC"]).optional(),
  likelihood: z.number().int().min(0).max(100).optional(),
  impact: z.number().int().min(0).max(100).optional(),
  mitigationAction: z.string().trim().max(2000).nullish(),
  linkedObjectiveId: z.string().trim().uuid().nullish(),
  status: z.enum(["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED", "RESOLVED", "CLOSED"]).nullish(),
  residualRisk: z.number().int().min(0).max(100).nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const risks = await listBusinessRisks(ctx.verifiedWorkspaceId);
    return canonicalJson({ risks }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "UPDATE") {
      if (!input.riskId) {
        return canonicalJson({ error: "riskId required for UPDATE" }, { status: 400 });
      }
      const updated = await updateBusinessRisk({
        workspaceId,
        actorId,
        riskId: input.riskId,
        title: input.title,
        description: input.description,
        category: input.category,
        likelihood: input.likelihood,
        impact: input.impact,
        mitigationAction: input.mitigationAction,
        linkedObjectiveId: input.linkedObjectiveId,
        status: input.status ?? undefined,
        residualRisk: input.residualRisk,
      });
      return canonicalJson({ risk: updated }, { status: 200 });
    }

    if (!input.title || !input.category) {
      return canonicalJson({ error: "title and category required for CREATE" }, { status: 400 });
    }
    const riskCode = input.riskCode ?? `RISK-${randomUUID().split("-")[0].toUpperCase()}`;
    const risk = await createBusinessRisk({
      workspaceId,
      actorId,
      riskCode,
      title: input.title,
      description: input.description,
      category: input.category,
      likelihood: input.likelihood,
      impact: input.impact,
      mitigationAction: input.mitigationAction,
      linkedObjectiveId: input.linkedObjectiveId,
    });
    return canonicalJson({ risk }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
