/**
 * Owner Public Signals service (PASS 39).
 *
 * READ-ONLY. Reads the workspace's ALREADY-PERSISTED, controlled external-signal intake records (no live
 * fetch, no connectors), runs the proven PASS 28-30 interpret → PII-strip → conflict-resolve → prioritise
 * pipeline via the pure owner-public-signals projection, and returns a governed, fail-closed "Outside
 * signals" summary. It MUTATES NOTHING, never fetches the internet, never shows raw text/PII, and never
 * fabricates signals or money. Workspace isolation is inherited from getActiveExternalOpportunitySignals
 * (workspace-scoped intake) / getPersistedProcessTasks (workspace-scoped, ADDITIONALLY business-scoped here
 * via the businessId threaded below — D1 fix, see process-execution-bridge.service.ts). If no intake records
 * exist, it returns NONE.
 */

import { getActiveExternalOpportunitySignals } from "@/services/owner-mode/external-opportunity-intake.service";
import { getPersistedProcessTasks } from "@/services/owner-mode/process-execution-bridge.service";
import type { PublicArchetype } from "@/domain/owner-mode/public-signal-interpretation";
import {
  buildOwnerPublicSignals, persistedRowToRawInput, type OwnerPublicSignalsResponse,
} from "@/domain/owner-mode/owner-public-signals";

/** Read-only public-signal summary for the owner. Server-authoritative workspace scope; no mutation, no fetch. */
export async function getOwnerPublicSignals(
  workspaceId: string,
  businessId: string | null,
): Promise<{ ok: true; summary: OwnerPublicSignalsResponse } | { ok: false; issues: string[] }> {
  // ExternalOpportunityIntakeRecord (getActiveExternalOpportunitySignals) has no businessId column — those
  // intake rows genuinely are workspace-scoped only, so businessId is not usable for filtering that query.
  // Controlled, already-persisted intake records only — never a live web fetch. Empty on missing table.
  const rows = await getActiveExternalOpportunitySignals(workspaceId).catch(() => []);

  // Archetype is not asserted at read time (the intake rows do not carry a proven archetype); 'unknown' is the
  // safe default and the interpreter only ever downgrades from it — it never fabricates a stronger context.
  const archetype: PublicArchetype = "unknown";
  const rawInputs = rows.map((r) => persistedRowToRawInput(
    { rawDescription: r.rawDescription, rawSignalType: String(r.rawSignalType), sourceQuality: String(r.sourceQuality), sourceRef: r.sourceRef ?? null },
    archetype,
  ));

  let linkedProcessExecutionTaskIds: string[] = [];
  if (rawInputs.length > 0) {
    // businessId threaded through (D1 fix): a task belonging to a DIFFERENT business in the same workspace
    // must never be linked into this business's public-signals summary.
    const tasks = await getPersistedProcessTasks(workspaceId, undefined, businessId).catch(() => []);
    linkedProcessExecutionTaskIds = tasks.map((t) => t.taskKey).slice(0, 20);
  }

  return buildOwnerPublicSignals({ workspaceArchetype: archetype, rawInputs, linkedProcessExecutionTaskIds });
}
