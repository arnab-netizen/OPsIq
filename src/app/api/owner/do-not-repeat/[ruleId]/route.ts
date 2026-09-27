/**
 * PATCH /api/owner/do-not-repeat/[ruleId] — record what has changed since this do-not-repeat rule was set
 * (the changed-context override the owner action gate honours; recordDoNotRepeatChangedContext).
 * OWNER_MANAGE, workspace-scoped; rule ownership, activity and the reason are validated server-side.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordDoNotRepeatChangedContext } from "@/services/owner-mode/do-not-repeat.service";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  changedContextExplanation: z.string().trim().min(1).max(2000),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const rule = await recordDoNotRepeatChangedContext({
        workspaceId: ctx.verifiedWorkspaceId,
        ruleId: params.ruleId,
        actorId: ctx.verifiedActorId,
        explanation: input.changedContextExplanation,
      });
      return canonicalJson({ rule }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) return canonicalJson({ error: "Do-not-repeat rule not found" }, { status: 404 });
      if (err instanceof ValidationError) return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 422 });
      if (err instanceof ConflictError) return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 409 });
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
