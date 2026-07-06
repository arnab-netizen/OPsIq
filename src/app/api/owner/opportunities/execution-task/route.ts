/**
 * POST /api/owner/opportunities/execution-task — record progress on a governed opportunity execution task
 * (assign / start / complete / block / cancel) with completion evidence.
 *
 * Server-authoritative: workspace + actor from the verified session; OWNER_MANAGE required; validated in the
 * pure domain layer (owner-approval tasks can't auto-complete; evidence-required tasks can't COMPLETE without
 * evidence; forbidden language rejected); persisted with an atomic audit, idempotent on (workspace, taskKey).
 * OpsIQ never submits a tender / contacts a customer / spends — this records human or OpsIQ-draft progress.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { recordExecutionTaskUpdate } from "@/services/owner-mode/opportunity-execution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  taskKey: z.string().trim().min(1).max(300),
  opportunityKey: z.string().trim().min(1).max(200),
  taskType: z.enum([
    "COLLECT_ELIGIBILITY_DATA", "COLLECT_DOCUMENTS", "COLLECT_COST_DATA", "COLLECT_CAPACITY_DATA",
    "PREPARE_BID_DRAFT", "PREPARE_PROOF_PACK", "CONTACT_LEADS_MANUALLY", "RECORD_CUSTOMER_RESPONSES",
    "RECORD_COST_EVIDENCE", "RECORD_VALIDATION_RESULT", "OWNER_APPROVAL_REVIEW", "MANAGER_REVIEW",
    "STAFF_DATA_COLLECTION", "EXTERNAL_ADVISOR_REVIEW",
  ]),
  sourceType: z.enum([
    "PREP_CHECKLIST", "TENDER_READINESS", "PROOF_PACK", "VALIDATION_EXPERIMENT", "PORTFOLIO_DECISION",
    "CAPABILITY_GAP", "MISSING_DATA", "APPROVAL_POLICY", "CASH_PROFIT_GUARDRAIL",
  ]),
  sourceKey: z.string().trim().min(1).max(300),
  nextActionOwner: z.enum(["OWNER", "MANAGER", "STAFF", "OPSIQ_DRAFT", "EXTERNAL_ADVISOR", "NO_ACTION"]),
  approvalLevel: z.enum(["OWNER", "MANAGER", "STAFF"]),
  action: z.enum(["ASSIGN", "START", "COMPLETE", "BLOCK", "CANCEL"]),
  evidenceRefs: z.array(z.string().trim().min(1).max(2000)).max(20).optional(),
  linkedProofIds: z.array(z.string().trim().uuid()).max(20).optional(),
  outcomeSummary: z.string().trim().max(2000).nullish(),
  blockingReason: z.string().trim().max(2000).nullish(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, schema);
    const actorRole = (ctx.verifiedSessionSnapshot as { role?: string } | undefined)?.role ?? null;
    const r = await recordExecutionTaskUpdate({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      actorRole,
      submission: input as Parameters<typeof recordExecutionTaskUpdate>[0]["submission"],
    });
    if (!r.ok) return canonicalJson({ error: r.reason }, { status: 400 });
    return canonicalJson({ taskId: r.taskId, status: r.status, updatesOpportunity: r.updatesOpportunity, deduped: r.deduped }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true },
);
