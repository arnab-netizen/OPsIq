/**
 * Internal scheduled-reassessment scan endpoint (M8 runtime-readiness).
 *
 * POST /api/internal/reassessment-scan — runs the DB-backed due-scanner that re-runs the governed `reassessBudget`
 * path for every business with an overdue, still-open budget action. This is the system/cron seam (no external cron
 * engine is built here); the caller's own scheduler hits it. Authorized by a strong bearer token from the
 * `SCHEDULER_INTERNAL_TOKEN` env var (constant-time compared). The endpoint is DISABLED (401) unless that token is
 * configured — there is NO hardcoded credential and no default that would let it run open.
 */
import { timingSafeEqual } from "crypto";
import { scanDueReassessments } from "@/services/owner-budget/due-reassessment.service";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const token = process.env.SCHEDULER_INTERNAL_TOKEN;
  // Fail closed: require a deliberately-configured, strong token. No token ⇒ endpoint is disabled.
  if (!token || token.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(token);
  // Length check first (timingSafeEqual throws on length mismatch); constant-time compare otherwise.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await scanDueReassessments(new Date());
    return Response.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
    return Response.json({ ok: false, error: governed.operatorMessage }, { status: 500 });
  }
}
