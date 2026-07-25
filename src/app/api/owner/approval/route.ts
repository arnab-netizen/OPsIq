/**
 * Bundle 3.7 — Approval Resolution and Evidence Chain surface.
 *
 * POST  /api/owner/approval  — create approval request (idempotent via idempotencyKey).
 * GET   /api/owner/approval  — list approvals (?businessId=&status=&actionId=).
 * PATCH /api/owner/approval  — submit_evidence | decide | initiate_appeal.
 *
 * Auth: CONSULTING_APPROVE. Workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createApproval,
  submitEvidence,
  makeDecision,
  initiateAppeal,
  listApprovals,
} from "@/services/owner-mode/approval-resolution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVIDENCE_TYPES = ["document", "photo", "data", "testimony"] as const;
const DECISION_STATUSES = ["APPROVED", "REJECTED", "DEFERRED"] as const;

const createSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  businessId: z.string().uuid(),
  actionId: z.string().min(1).max(128).optional(),
  actionDomain: z.string().trim().min(1).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit_evidence"),
    approvalId: z.string().uuid(),
    evidenceType: z.enum(EVIDENCE_TYPES),
    description: z.string().trim().min(1),
    sourceUrl: z.string().url().optional(),
    credibilityScore: z.number().min(0).max(1).optional(),
  }),
  z.object({
    action: z.literal("decide"),
    approvalId: z.string().uuid(),
    decision: z.enum(DECISION_STATUSES),
    rationale: z.string().trim().min(1).optional(),
  }),
  z.object({
    action: z.literal("initiate_appeal"),
    idempotencyKey: z.string().min(1).max(128),
    priorApprovalId: z.string().uuid(),
  }),
]);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);
    const dto = await createApproval({
      ...input,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
    });
    return canonicalJson(dto, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_APPROVE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const businessId = url.searchParams.get("businessId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const actionId = url.searchParams.get("actionId") ?? undefined;

    const approvals = await listApprovals({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      status,
      actionId,
    });
    return canonicalJson({ approvals }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_APPROVE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);
    const ws = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "submit_evidence") {
      const dto = await submitEvidence({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }

    if (input.action === "decide") {
      const dto = await makeDecision({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }

    const dto = await initiateAppeal({ ...input, workspaceId: ws, actorId });
    return canonicalJson(dto, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.CONSULTING_APPROVE], requireWorkspace: true }
);
