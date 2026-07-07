/**
 * Owner Recovery Status service (PASS 37).
 *
 * READ-ONLY. Composes the existing, proven Owner Now View (live persisted signals) into a conservative
 * CrisisInput, runs the already-proven PASS 32 survival planner + PASS 33 recovery milestone machine via the
 * pure owner-recovery-status projection, and returns a governed, fail-closed recovery status for the owner.
 *
 * It MUTATES NOTHING, creates no tasks, fabricates no money, and never opens the thrive gate without proven
 * stabilization. Workspace isolation is inherited from getOwnerNowView / getPersistedProcessTasks (both
 * workspace-scoped). No proven milestone outcomes are persisted for the PASS 33 ladder yet, so the read path
 * conservatively reports crisis/in-progress state and never fabricates milestone completion.
 */

import { getOwnerNowView, type GuidanceDeps } from "@/services/owner-guidance/owner-now-view.service";
import { getPersistedProcessTasks } from "@/services/owner-mode/process-execution-bridge.service";
import { PUBLIC_ARCHETYPES, type PublicArchetype } from "@/domain/owner-mode/public-signal-interpretation";
import {
  buildOwnerRecoveryStatus, deriveCrisisInput, type OwnerRecoveryStatusResponse,
} from "@/domain/owner-mode/owner-recovery-status";

const QUALITY_FINDING = /QUALITY|REWORK/i;

function severityOf(x: { severity?: unknown } | null | undefined): string | null {
  return x && typeof x.severity === "string" ? x.severity : null;
}

/** Read-only recovery status for the owner. Server-authoritative workspace scope; no mutation. */
export async function getOwnerRecoveryStatus(
  workspaceId: string,
  businessId: string | null,
  injected?: GuidanceDeps,
): Promise<{ ok: true; status: OwnerRecoveryStatusResponse } | { ok: false; issues: string[] }> {
  const nowView = await getOwnerNowView(workspaceId, businessId, injected);

  // Conservative signal severities from the live now-view. Only REAL signals feed the crisis:
  //   - DATA_INSUFFICIENT findings are a data gap, never a crisis (mirrors now-view's hasRealActivity gate).
  //   - cash/profit + workload analyses are already null unless there is real activity.
  //   - the process-execution bridge route is NOT used as a severity source (it defaults to a generic task
  //     even on an empty workspace), so an empty/data-only workspace reads NONE — no fabricated crisis.
  const pi = nowView.processIntelligence;
  const rawFinding = pi?.topFinding ?? null;
  const piFinding = rawFinding && String(rawFinding.findingType ?? "") !== "DATA_INSUFFICIENT" ? rawFinding : null;
  const isQuality = !!piFinding && QUALITY_FINDING.test(String(piFinding.findingType ?? ""));
  const archetype = (PUBLIC_ARCHETYPES as readonly string[]).includes(String(nowView.archetype))
    ? (nowView.archetype as unknown as PublicArchetype)
    : ("laundry_local_service" as PublicArchetype);

  const crisis = deriveCrisisInput({
    caseId: `rc:${workspaceId}${businessId ? ":" + businessId : ""}`,
    archetype,
    cashSeverity: severityOf(nowView.cashProfitProtection?.topSignal),
    qualitySeverity: isQuality ? severityOf(piFinding) : null,
    operationalSeverity: piFinding && !isQuality ? severityOf(piFinding) : null,
    workloadSeverity: severityOf(nowView.ownerWorkloadReduction?.topFinding),
    customerSeverity: null,
    missingData: nowView.view?.missingDataRequests ?? [],
  });

  // Linked governed tasks — same-workspace only (getPersistedProcessTasks is workspace-scoped).
  let linkedProcessExecutionTaskIds: string[] = [];
  if (crisis) {
    const tasks = await getPersistedProcessTasks(workspaceId).catch(() => []);
    // getPersistedProcessTasks is workspace-scoped, so every taskKey here belongs to this workspace only.
    linkedProcessExecutionTaskIds = tasks.map((t) => t.taskKey).slice(0, 20);
  }

  // No proven PASS 33 milestone outcomes are persisted yet → conservative: no fabricated completion.
  return buildOwnerRecoveryStatus({ crisis, outcomes: [], linkedProcessExecutionTaskIds });
}
