/**
 * /api/owner/sop-intelligence — Process Intelligence and SOP Management (Bundle 3.9).
 *
 * POST  — assign training | create non-compliance alert (action discriminated)
 * GET   — list training assignments | compliance summary | list alerts (mode query param)
 * PATCH — record training completion
 *
 * Auth: SOP_MANAGE capability, workspace-scoped.
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { z } from "zod";
import {
  assignTraining,
  recordTrainingCompletion,
  calculateComplianceRate,
  createNonComplianceAlert,
  listTrainingAssignments,
  listNonComplianceAlerts,
} from "@/services/owner-mode/sop-process-intelligence.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const AssignTrainingSchema = z.object({
  action: z.literal("assign_training"),
  sopDocumentId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  dueDate: z.string().datetime().optional(),
});

const CreateAlertSchema = z.object({
  action: z.literal("create_alert"),
  sopDocumentId: z.string().uuid(),
  alertWindow: z.string().min(1),
  complianceRate: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1).optional(),
});

const PostSchema = z.discriminatedUnion("action", [AssignTrainingSchema, CreateAlertSchema]);

const CompleteTrainingSchema = z.object({
  assignmentId: z.string().uuid(),
  evidenceUrl: z.string().min(1),
  evidenceNote: z.string().optional(),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();
    const parsed = PostSchema.safeParse(body);
    if (!parsed.success) {
      return canonicalJson({ error: parsed.error.flatten() }, { status: 400 });
    }

    if (parsed.data.action === "assign_training") {
      const result = await assignTraining({
        workspaceId: ctx.verifiedWorkspaceId,
        actorId: ctx.verifiedActorId,
        sopDocumentId: parsed.data.sopDocumentId,
        assignedTo: parsed.data.assignedTo,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      });
      return canonicalJson(result, { status: 201 });
    }

    // create_alert
    const result = await createNonComplianceAlert({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      sopDocumentId: parsed.data.sopDocumentId,
      alertWindow: parsed.data.alertWindow,
      complianceRate: parsed.data.complianceRate,
      threshold: parsed.data.threshold,
    });
    return canonicalJson(result, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.SOP_MANAGE], requireWorkspace: true },
);

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const mode = url.searchParams.get("mode") ?? "training";
    const sopDocumentId = url.searchParams.get("sopDocumentId") ?? undefined;
    const assignedTo = url.searchParams.get("assignedTo") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const acknowledged = url.searchParams.get("acknowledged");

    if (mode === "compliance" && sopDocumentId) {
      const result = await calculateComplianceRate({
        workspaceId: ctx.verifiedWorkspaceId,
        sopDocumentId,
      });
      return canonicalJson(result, { status: 200 });
    }

    if (mode === "alerts") {
      const result = await listNonComplianceAlerts({
        workspaceId: ctx.verifiedWorkspaceId,
        sopDocumentId,
        acknowledged: acknowledged !== null ? acknowledged === "true" : undefined,
      });
      return canonicalJson(result, { status: 200 });
    }

    // default: training assignments
    const result = await listTrainingAssignments({
      workspaceId: ctx.verifiedWorkspaceId,
      sopDocumentId,
      status,
      assignedTo,
    });
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.SOP_MANAGE], requireWorkspace: true },
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();
    const parsed = CompleteTrainingSchema.safeParse(body);
    if (!parsed.success) {
      return canonicalJson({ error: parsed.error.flatten() }, { status: 400 });
    }
    const result = await recordTrainingCompletion({
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      assignmentId: parsed.data.assignmentId,
      evidenceUrl: parsed.data.evidenceUrl,
      evidenceNote: parsed.data.evidenceNote,
    });
    return canonicalJson(result, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.SOP_MANAGE], requireWorkspace: true },
);
