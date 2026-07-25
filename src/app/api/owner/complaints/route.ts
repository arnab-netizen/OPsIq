/**
 * Bundle 3.5 — Customer Complaint and Service Recovery surface.
 *
 * POST /api/owner/complaints          — create complaint (idempotent via idempotencyKey).
 * GET  /api/owner/complaints          — list complaints (optional ?status=&severity=&slaBreachedOnly=true).
 * PATCH /api/owner/complaints         — state transitions: triage | add_recovery_action | resolve | close | reopen.
 *
 * Auth: OWNER_MANAGE. Workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  createComplaint,
  triageComplaint,
  addRecoveryAction,
  resolveComplaint,
  closeComplaint,
  reopenComplaint,
  listComplaints,
} from "@/services/owner-mode/customer-complaint.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  channel: z.enum(["DIRECT", "REFERRAL", "ONLINE", "PHONE", "EMAIL"]).optional(),
  reportedBy: z.string().trim().optional(),
  businessId: z.string().uuid().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("triage"),
    complaintId: z.string().uuid(),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    triageNotes: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("add_recovery_action"),
    complaintId: z.string().uuid(),
    description: z.string().trim().min(1),
    assignedTo: z.string().trim().optional(),
    dueAt: z.string().datetime().optional(),
  }),
  z.object({
    action: z.literal("resolve"),
    complaintId: z.string().uuid(),
    resolutionSummary: z.string().trim().min(1),
    resolutionEvidenceId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("close"),
    complaintId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("reopen"),
    complaintId: z.string().uuid(),
    reason: z.string().trim().min(1),
  }),
]);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, createSchema);
    const dto = await createComplaint({
      ...input,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
    });
    return canonicalJson(dto, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const status = url.searchParams.get("status") ?? undefined;
    const severity = url.searchParams.get("severity") ?? undefined;
    const slaBreachedOnly = url.searchParams.get("slaBreachedOnly") === "true";

    const complaints = await listComplaints({
      workspaceId: ctx.verifiedWorkspaceId,
      status,
      severity,
      slaBreachedOnly,
    });
    return canonicalJson({ complaints }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);
    const ws = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "triage") {
      const dto = await triageComplaint({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }
    if (input.action === "add_recovery_action") {
      const dto = await addRecoveryAction({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }
    if (input.action === "resolve") {
      const dto = await resolveComplaint({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }
    if (input.action === "close") {
      const dto = await closeComplaint({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }
    const dto = await reopenComplaint({ ...input, workspaceId: ws, actorId });
    return canonicalJson(dto, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
