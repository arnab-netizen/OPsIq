/**
 * Internal scheduled endpoint — finance learning signal reconciliation.
 *
 * POST /api/internal/finance-learning-reconcile?workspaceId=<id>&actorId=<id>
 *
 * Finds every OwnerFinanceVerification that has a terminal outcome status but no
 * corresponding OwnerFinanceOutcomeSignal (i.e. the bridge failed silently after
 * the verification was persisted) and bridges each one idempotently.
 *
 * Auth: bearer SCHEDULER_INTERNAL_TOKEN — same pattern as /internal/reassessment-scan.
 * Fail-closed: endpoint is disabled (401) when the token env var is absent or weak.
 */
import { timingSafeEqual } from "crypto";
import { reconcileMissingFinanceLearningSignals } from "@/services/owner-finance/learning-bridge.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { AppError, UnauthorizedError, ValidationError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const token = process.env.SCHEDULER_INTERNAL_TOKEN;
  if (!token || token.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (!isAuthorized(req)) {
      throw new UnauthorizedError("Scheduler token missing or invalid.");
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const actorId = searchParams.get("actorId") ?? "system";

    if (!workspaceId) {
      throw new ValidationError("workspaceId query parameter is required.");
    }

    const result = await reconcileMissingFinanceLearningSignals(workspaceId, actorId);
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(error.toJSON(), { status: error.statusCode });
    }
    const governed = classifyOperatorError(
      error instanceof Error ? error : new Error(String(error)),
      { context: "load" }
    );
    const body = { ok: false, error: governed.operatorMessage };
    return Response.json(body, { status: 500 });
  }
}
