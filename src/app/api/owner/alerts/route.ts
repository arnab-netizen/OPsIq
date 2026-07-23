/**
 * GET  /api/owner/alerts — list in-app alerts for the authenticated owner
 * POST /api/owner/alerts — create an in-app alert (internal/system use)
 *
 * Workspace-scoped, OWNER_VIEW required.
 */
import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getAlerts, getUnreadAlertCount, createAlert } from "@/services/alerts/alert-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CreateAlertSchema = z.object({
  type: z.enum(["blocked", "threshold_breach", "execution_failure"]),
  channel: z.enum(["in_app", "email"]).default("in_app"),
  message: z.string().trim().min(1).max(1000),
  entityType: z.string().trim().max(100).optional(),
  entityId: z.string().uuid().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  idempotencyKey: z.string().trim().max(255).optional(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;
    const url = new URL(ctx.request!.url);

    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const severityParam = url.searchParams.get("severity") as
      | "low"
      | "medium"
      | "high"
      | "critical"
      | null;

    const [alerts, unreadCount] = await Promise.all([
      getAlerts(workspaceId, userId, {
        unreadOnly,
        limit,
        severity: severityParam ?? undefined,
      }),
      getUnreadAlertCount(workspaceId, userId),
    ]);

    return canonicalJson({ alerts, unreadCount }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;
    const body = await ctx.request!.json();
    const parsed = CreateAlertSchema.parse(body);

    const alert = await createAlert({ workspaceId, userId, ...parsed });
    return canonicalJson({ alert }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
