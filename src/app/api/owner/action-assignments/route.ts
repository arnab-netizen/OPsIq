/**
 * Bundle 3.6 — Owner Action Assignment and Outcome Tracking surface.
 *
 * POST  /api/owner/action-assignments          — assign action (idempotent via idempotencyKey).
 * GET   /api/owner/action-assignments          — list assignments (?businessId=&status=&assignedTo=&stallOnly=true).
 * PATCH /api/owner/action-assignments          — reassign | record_outcome.
 *
 * Auth: OWNER_MANAGE. Workspace-scoped.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import {
  assignAction,
  reassignAction,
  recordOutcome,
  listAssignments,
  getBottleneckSummary,
} from "@/services/owner-mode/owner-action-assignment-lifecycle.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTION_DOMAINS = [
  "finance", "operations", "sales", "sop", "strategy",
  "cashflow", "budget", "marketing", "general",
] as const;

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const OUTCOME_STATUSES = ["COMPLETED", "FAILED", "STALLED"] as const;

const assignSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  businessId: z.string().uuid(),
  actionId: z.string().min(1).max(128),
  actionDomain: z.enum(ACTION_DOMAINS),
  assignedTo: z.string().trim().min(1),
  priority: z.enum(PRIORITIES).optional(),
  dueAt: z.string().datetime().optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("reassign"),
    assignmentId: z.string().uuid(),
    assignedTo: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    dueAt: z.string().datetime().optional(),
    priority: z.enum(PRIORITIES).optional(),
  }),
  z.object({
    action: z.literal("record_outcome"),
    assignmentId: z.string().uuid(),
    outcome: z.enum(OUTCOME_STATUSES),
    outcomeNote: z.string().trim().optional(),
  }),
]);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, assignSchema);
    const dto = await assignAction({
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
    const mode = url.searchParams.get("mode");
    const businessId = url.searchParams.get("businessId") ?? undefined;

    if (mode === "bottleneck") {
      const summary = await getBottleneckSummary({
        workspaceId: ctx.verifiedWorkspaceId,
        businessId,
      });
      return canonicalJson(summary, { status: 200 });
    }

    const status = url.searchParams.get("status") ?? undefined;
    const assignedTo = url.searchParams.get("assignedTo") ?? undefined;
    const stallOnly = url.searchParams.get("stallOnly") === "true";

    const assignments = await listAssignments({
      workspaceId: ctx.verifiedWorkspaceId,
      businessId,
      status,
      assignedTo,
      stallOnly,
    });
    return canonicalJson({ assignments }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const input = await parseRequestBody(ctx.request!, patchSchema);
    const ws = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    if (input.action === "reassign") {
      const dto = await reassignAction({ ...input, workspaceId: ws, actorId });
      return canonicalJson(dto, { status: 200 });
    }

    const dto = await recordOutcome({ ...input, workspaceId: ws, actorId });
    return canonicalJson(dto, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
