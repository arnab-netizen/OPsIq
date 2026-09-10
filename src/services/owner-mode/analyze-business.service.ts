/**
 * "Analyze my business" — a single owner action that runs every eligible domain
 * diagnosis (Finance, Sales, Operations) for one business, instead of requiring the
 * owner to visit each domain page and press "Run diagnosis" separately.
 *
 * This is pure orchestration: it invents no new diagnosis logic and creates no new
 * engine. It calls the existing, unchanged runFinanceDiagnosis / runSalesDiagnosis /
 * runOperationsDiagnosis service functions for whichever domains already have at
 * least one snapshot ("eligible"), and leaves domains with no data untouched
 * ("skipped") -- the owner is never blocked from analyzing on Finance alone, or any
 * subset. Each domain diagnosis still persists its own Cycle/Finding/Action rows and
 * emits its own audit events exactly as it does today when triggered individually;
 * this function adds no new audit event type, since each sub-call already accounts
 * for its own governed mutation.
 *
 * Preserves the existing Finance rate-limit protection (10/business/hour, the same
 * in-memory + PG-backed dual check the finance diagnoses route enforces) by calling
 * the same two rate-limit functions here, since this orchestrator bypasses that
 * route and calls the service function directly. Sales and Operations have no
 * rate limit on their existing routes today, so none is added here either -- this
 * function's protection matches, not exceeds, what already exists per domain.
 *
 * One domain failing (including a rate-limit refusal) never blocks the others --
 * each domain's outcome is independent and reported separately.
 */
import { getBusiness } from "@/services/founder-recovery/business.service";
import { listFinancialSnapshots } from "@/services/owner-finance/snapshot.service";
import { runFinanceDiagnosis } from "@/services/owner-finance/diagnosis.service";
import { listSalesSnapshots } from "@/services/owner-sales/snapshot.service";
import { runSalesDiagnosis } from "@/services/owner-sales/diagnosis.service";
import { listOperationsSnapshots } from "@/services/owner-operations/snapshot.service";
import { runOperationsDiagnosis } from "@/services/owner-operations/diagnosis.service";
import { checkDiagnosisRateLimit } from "@/middleware/rate-limit";
import { checkPgRateLimit } from "@/infra/rate-limiter-pg";

export type AnalyzeBusinessDomain = "finance" | "sales" | "operations";

export interface AnalyzeBusinessResult {
  /** Domains with a snapshot that were successfully diagnosed just now. */
  analyzed: AnalyzeBusinessDomain[];
  /** Domains with no snapshot yet -- nothing to analyze, not an error. */
  skipped: AnalyzeBusinessDomain[];
  /** Domains that had data but were refused by the existing rate limit. */
  rateLimited: AnalyzeBusinessDomain[];
  /** Domains that had data and were within the rate limit but the diagnosis itself
   *  threw -- reported per-domain so one domain's failure never hides the others'
   *  success. `reason` is the error's name only, never its raw message (owner-safe). */
  failed: Array<{ domain: AnalyzeBusinessDomain; reason: string }>;
}

async function tryRunFinance(businessId: string, workspaceId: string, actorId: string, result: AnalyzeBusinessResult): Promise<void> {
  const snapshots = await listFinancialSnapshots(businessId, workspaceId);
  if (snapshots.length === 0) {
    result.skipped.push("finance");
    return;
  }
  const memoryCheck = checkDiagnosisRateLimit(businessId);
  if (!memoryCheck.allowed) {
    result.rateLimited.push("finance");
    return;
  }
  const pgCheck = await checkPgRateLimit(`diag:${businessId}`, { capacity: 10, refillPerSecond: 10 / 3600 });
  if (!pgCheck.allowed) {
    result.rateLimited.push("finance");
    return;
  }
  try {
    await runFinanceDiagnosis(businessId, snapshots[0].id, actorId, workspaceId);
    result.analyzed.push("finance");
  } catch (err) {
    result.failed.push({ domain: "finance", reason: err instanceof Error ? err.name : "UnknownError" });
  }
}

async function tryRunSales(businessId: string, workspaceId: string, actorId: string, result: AnalyzeBusinessResult): Promise<void> {
  const snapshots = await listSalesSnapshots(businessId, workspaceId);
  if (snapshots.length === 0) {
    result.skipped.push("sales");
    return;
  }
  try {
    await runSalesDiagnosis(businessId, snapshots[0].id, actorId, workspaceId);
    result.analyzed.push("sales");
  } catch (err) {
    result.failed.push({ domain: "sales", reason: err instanceof Error ? err.name : "UnknownError" });
  }
}

async function tryRunOperations(businessId: string, workspaceId: string, actorId: string, result: AnalyzeBusinessResult): Promise<void> {
  const snapshots = await listOperationsSnapshots(businessId, workspaceId);
  if (snapshots.length === 0) {
    result.skipped.push("operations");
    return;
  }
  try {
    await runOperationsDiagnosis(businessId, snapshots[0].id, actorId, workspaceId);
    result.analyzed.push("operations");
  } catch (err) {
    result.failed.push({ domain: "operations", reason: err instanceof Error ? err.name : "UnknownError" });
  }
}

export async function analyzeBusiness(businessId: string, workspaceId: string, actorId: string): Promise<AnalyzeBusinessResult> {
  await getBusiness(businessId, workspaceId);

  const result: AnalyzeBusinessResult = { analyzed: [], skipped: [], rateLimited: [], failed: [] };
  await tryRunFinance(businessId, workspaceId, actorId, result);
  await tryRunSales(businessId, workspaceId, actorId, result);
  await tryRunOperations(businessId, workspaceId, actorId, result);
  return result;
}
