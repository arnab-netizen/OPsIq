/**
 * Phase 4 — Constraint Resolution routes.
 *
 * GET  /api/owner/constraints — list active constraint records for the workspace
 * POST /api/owner/constraints — create a constraint record or update its status
 *
 * Workspace isolation enforced via canonical auth. OWNER_MANAGE required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createConstraintRecord,
  updateConstraintStatus,
  listActiveConstraints,
} from "@/services/owner-mode/constraint-resolution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["CREATE", "ACCEPT", "RESOLVE"]).default("CREATE"),
  recordId: z.string().trim().uuid().nullish(),
  constraintType: z.enum([
    "DEMAND", "CAPACITY", "CASH", "STAFF", "OWNER", "MANAGER", "QUALITY",
    "DELIVERY", "PRICING", "CUSTOMER_RETENTION", "B2B_ACCOUNT", "EQUIPMENT",
    "COMPLIANCE_OR_LOCAL_VERIFICATION", "STARTUP_VALIDATION", "DATA_INSUFFICIENT",
  ]).optional(),
  constraintSource: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  bindingScore: z.number().min(0).max(1).optional(),
  remediationAction: z.string().trim().max(2000).nullish(),
  linkedObjectiveId: z.string().trim().uuid().nullish(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const constraints = await listActiveConstraints(ctx.verifiedWorkspaceId);
    return canonicalJson({ constraints }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "ACCEPT" || input.action === "RESOLVE") {
      if (!input.recordId) {
        return canonicalJson({ error: "recordId required for ACCEPT/RESOLVE" }, { status: 400 });
      }
      const updated = await updateConstraintStatus({
        workspaceId,
        recordId: input.recordId,
        actorId,
        status: input.action === "RESOLVE" ? "RESOLVED" : "ACCEPTED",
        remediationAction: input.remediationAction,
      });
      return canonicalJson({ constraint: updated }, { status: 200 });
    }

    if (!input.constraintType || !input.constraintSource || !input.title || input.bindingScore === undefined) {
      return canonicalJson({ error: "constraintType, constraintSource, title, and bindingScore required" }, { status: 400 });
    }
    const record = await createConstraintRecord({
      workspaceId,
      actorId,
      constraintType: input.constraintType,
      constraintSource: input.constraintSource,
      title: input.title,
      bindingScore: input.bindingScore,
      remediationAction: input.remediationAction,
      linkedObjectiveId: input.linkedObjectiveId,
    });
    return canonicalJson({ constraint: record }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
