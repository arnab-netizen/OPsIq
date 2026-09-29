/**
 * PATCH /api/owner/do-not-repeat/[ruleId] — record, for Owner Mode of ONE business, what has changed since
 * this do-not-repeat rule was set (the business-scoped Owner override; recordOwnerDnrOverride). The shared
 * rule is never modified, so Formal Consulting Mode is unaffected. OWNER_MANAGE, workspace-scoped; the
 * business, the rule's attribution to it, its activity and the reason are validated server-side.
 *
 * A refusal the owner can act on returns 422 with a stable `code` (REASON_TOO_SHORT, RULE_INACTIVE,
 * ALREADY_RECORDED) and governed text; the Owner UI shows the matching actionable message.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { OwnerDnrOverrideRefusedError, recordOwnerDnrOverride } from "@/services/owner-mode/do-not-repeat.service";
import { ConflictError, NotFoundError, ValidationError } from "@/infra/errors";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { MIN_CHANGED_CONTEXT_LENGTH } from "@/domain/owner-mode/decision-memory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const params = z.object({ ruleId: z.string().uuid() });
const schema = z.object({
  businessId: z.string().uuid(),
  changedContextExplanation: z.string().trim().min(1).max(2000),
});

const REFUSAL_TEXT = Object.freeze({
  REASON_TOO_SHORT: `Describe what has changed in at least ${MIN_CHANGED_CONTEXT_LENGTH} characters.`,
  RULE_INACTIVE: "This do-not-repeat rule is no longer active, so it holds nothing back.",
  ALREADY_RECORDED: "What has changed was already recorded on this rule for this business.",
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, routeParams: Record<string, string>) => {
    const id = params.safeParse({ ruleId: routeParams.ruleId });
    if (!id.success) return canonicalJson({ error: "Do-not-repeat rule not found" }, { status: 404 });
    const input = await parseRequestBody(ctx.request!, schema);
    try {
      const rule = await recordOwnerDnrOverride({
        workspaceId: ctx.verifiedWorkspaceId,
        businessId: input.businessId,
        ruleId: id.data.ruleId,
        actorId: ctx.verifiedActorId,
        reason: input.changedContextExplanation,
      });
      return canonicalJson({ rule }, { status: 200 });
    } catch (err) {
      if (err instanceof NotFoundError) return canonicalJson({ error: "Do-not-repeat rule not found for this business" }, { status: 404 });
      if (err instanceof OwnerDnrOverrideRefusedError) return canonicalJson({ error: REFUSAL_TEXT[err.refusal], code: err.refusal }, { status: 422 });
      if (err instanceof ValidationError) return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 422 });
      if (err instanceof ConflictError) return canonicalJson({ error: classifyOperatorError(err, { context: "mutation" }).operatorMessage }, { status: 409 });
      throw err;
    }
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
