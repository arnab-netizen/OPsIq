/**
 * POST /api/owner/profit-leak — Waste & Profit-Leak Analysis (Module W1).
 *
 * Accepts owner-supplied business signals and returns a ranked list of profit
 * leaks (discount leaks, margin compression, capacity underuse, rework cost,
 * owner-bottleneck cost, pricing undercharge, etc.) with the single top leak
 * surfaced for immediate action.
 *
 * Pure analysis — no persistence. workspaceId is taken from the canonical
 * session context (never from the request body) so tenants cannot read
 * each other's analysis.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 * Body: validated via Zod (profitLeakSignalsBodySchema).
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { profitLeakSignalsBodySchema } from "@/domain/owner-mode/profit-leak-radar.validation";
import { identifyProfitLeaks } from "@/domain/owner-mode/profit-leak-radar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, profitLeakSignalsBodySchema);

    // Workspace ID always comes from the canonical session — body field ignored.
    const signals = { ...body, workspaceId: ctx.verifiedWorkspaceId };
    return identifyProfitLeaks(signals);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
