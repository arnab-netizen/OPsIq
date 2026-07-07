/**
 * Owner Public Signals (PASS 39).
 *
 * A READ-ONLY, deterministic projection of the proven PASS 28-30 public-signal pipeline
 * (interpret → PII-strip → prompt-injection resist → normalize → conflict-resolve → prioritise) into an
 * owner-facing "Outside signals" summary. It runs the ALREADY-PROVEN interpreter + prioritiser over
 * controlled, already-persisted intake records — it NEVER fetches live web data, mutates tasks, creates
 * external actions, shows raw public text, exposes PII / prompt-injection text, fabricates money/ROI/win-
 * probability, or treats a weak public signal as verified fact. Pure (no Date/random/IO).
 */

import { z } from "zod";
import {
  interpretAndValidateRawPublicSignal, PUBLIC_ARCHETYPES,
  type PublicArchetype, type RawPublicSignalInput,
} from "./public-signal-interpretation";
import {
  prioritisePublicSignals, publicSignalPrioritisationSchema,
  type PublicSignalPrioritisation,
} from "./public-signal-prioritisation";
import type { ConflictSignalInput } from "./public-signal-conflict-resolution";

/** The 7 owner-facing public-signal statuses. */
export const PUBLIC_SIGNAL_STATUSES = [
  "NONE",
  "SIGNALS_PRESENT",
  "VALIDATION_REQUIRED",
  "CONFLICTING_SIGNALS",
  "HIGH_RISK_PUBLIC_SIGNAL",
  "MONITOR_ONLY",
  "UNKNOWN_NEEDS_DATA",
] as const;
export type PublicSignalStatus = (typeof PUBLIC_SIGNAL_STATUSES)[number];

const NO_LIVE_INGESTION = "OpsIQ does not fetch live web data in this view.";
const UNCERTAINTY =
  "Public signals are unverified until validated — this is a signal, not confirmed fact. Missing internal data blocks a material decision; tender/customer/spend actions remain blocked and no outreach or submission has been performed.";

const NO_MONEY = /[$£€]\s?\d|\b\d+(?:\.\d+)?\s?%|\bROI\b|\bMRR\b|win probability|guaranteed (opportunity|success|profit)/i;
const noMoney = (label: string) => z.string().refine((s) => !NO_MONEY.test(s), { message: `no fabricated money/ROI/win-probability text in ${label}` });

export interface PublicSignalClusterView {
  topic: string;
  signalCount: number;
  conflictClassification: string;
  priorityTier: number;
  monitorOnly: boolean;
  collectiveDecision: string;
  sourceQualitySummary: string;
  evidenceStrengthSummary: string;
}

export interface OwnerPublicSignalsResponse {
  publicSignalStatus: PublicSignalStatus;
  topPublicSignalAction: string | null;
  whyThisMatters: string;
  sourceQualitySummary: string;
  evidenceStrengthSummary: string;
  uncertaintyCaveat: string;
  missingData: string[];
  validationRequired: boolean;
  ownerApprovalRequired: boolean;
  evidenceRequired: string[];
  blockedUnsafeActions: string[];
  groupedSignalClusters: PublicSignalClusterView[];
  monitorOnlySignals: { topic: string; signalCount: number; reason: string }[];
  linkedProcessExecutionTaskIds: string[];
  auditTraceRefs: string[];
  rawTextHidden: boolean;
  piiStripped: boolean;
  noLiveIngestionStatement: string;
}

const ACTIVE_STATUSES: ReadonlySet<PublicSignalStatus> = new Set([
  "SIGNALS_PRESENT", "VALIDATION_REQUIRED", "CONFLICTING_SIGNALS", "HIGH_RISK_PUBLIC_SIGNAL", "MONITOR_ONLY",
]);

export const ownerPublicSignalsSchema = z.object({
  publicSignalStatus: z.enum(PUBLIC_SIGNAL_STATUSES),
  topPublicSignalAction: noMoney("the top public-signal action").pipe(z.string().min(3)).nullable(),
  whyThisMatters: noMoney("why this matters").pipe(z.string().min(3)),
  sourceQualitySummary: z.string().min(1),
  evidenceStrengthSummary: z.string().min(1),
  uncertaintyCaveat: noMoney("the uncertainty caveat").pipe(z.string().min(10)),
  missingData: z.array(z.string()),
  validationRequired: z.boolean(),
  ownerApprovalRequired: z.boolean(),
  evidenceRequired: z.array(z.string()),
  blockedUnsafeActions: z.array(z.string()),
  groupedSignalClusters: z.array(z.object({
    topic: z.string().min(1), signalCount: z.number().int().nonnegative(), conflictClassification: z.string().min(1),
    priorityTier: z.number().int(), monitorOnly: z.boolean(), collectiveDecision: noMoney("a cluster decision").pipe(z.string().min(3)),
    sourceQualitySummary: z.string().min(1), evidenceStrengthSummary: z.string().min(1),
  })),
  monitorOnlySignals: z.array(z.object({ topic: z.string().min(1), signalCount: z.number().int().nonnegative(), reason: z.string().min(1) })),
  linkedProcessExecutionTaskIds: z.array(z.string()),
  auditTraceRefs: z.array(z.string()),
  rawTextHidden: z.boolean(),
  piiStripped: z.boolean(),
  noLiveIngestionStatement: z.string().min(3),
})
  // Raw public text is NEVER shown by this surface.
  .refine((r) => r.rawTextHidden === true, { message: "raw public text must be hidden" })
  // PII must be stripped (the interpreter always strips; the surface asserts it).
  .refine((r) => r.piiStripped === true, { message: "PII must be stripped" })
  // The no-live-ingestion boundary must be stated.
  .refine((r) => /does not fetch live/i.test(r.noLiveIngestionStatement), { message: "the no-live-ingestion statement must state OpsIQ does not fetch live web data" })
  // Any active (non-NONE) status must keep unsafe external actions blocked.
  .refine((r) => !ACTIVE_STATUSES.has(r.publicSignalStatus) || r.blockedUnsafeActions.length > 0, {
    message: "an active public-signal status must list blocked unsafe actions",
  })
  // CONFLICTING_SIGNALS must be backed by a cluster whose classification is a real conflict.
  .refine((r) => r.publicSignalStatus !== "CONFLICTING_SIGNALS" || r.groupedSignalClusters.some((c) => /CONFLICT|CONTRADIC|DISAGREE|MIXED/i.test(c.conflictClassification)), {
    message: "CONFLICTING_SIGNALS requires a cluster with a conflict classification",
  })
  // MONITOR_ONLY must not carry an actionable top action.
  .refine((r) => r.publicSignalStatus !== "MONITOR_ONLY" || r.topPublicSignalAction === null, {
    message: "MONITOR_ONLY must not present a material top action",
  });

const CONFLICT_RE = /CONFLICT|CONTRADIC|DISAGREE|MIXED/i;

function deriveStatus(p: PublicSignalPrioritisation, hadRawButNoValid: boolean): PublicSignalStatus {
  if (hadRawButNoValid) return "UNKNOWN_NEEDS_DATA";
  if (p.totalSignals === 0 || p.clusterCount === 0) return "NONE";
  const hasConflict = p.issueClusters.some((c) => CONFLICT_RE.test(c.conflictClassification));
  if (hasConflict) return "CONFLICTING_SIGNALS";
  // High-risk = the owner/legal/contract/reputation tier (2) or customer/quality (3) owner-gated top action.
  if (p.topCollectiveAction && p.topCollectiveAction.priorityTier <= 3 && p.topCollectiveAction.ownerApprovalRequired) return "HIGH_RISK_PUBLIC_SIGNAL";
  const allMonitor = p.issueClusters.every((c) => c.monitorOnly);
  if (allMonitor || !p.topCollectiveAction) return "MONITOR_ONLY";
  if (p.missingData.length > 0 || p.issueClusters.some((c) => c.evidenceRequired.length > 0 || /VALIDATION|PRICING/i.test(c.recommendedExecutionRoute))) return "VALIDATION_REQUIRED";
  return "SIGNALS_PRESENT";
}

function aggregateSummary(values: string[], fallback: string): string {
  const parts = Array.from(new Set(values.flatMap((v) => v.split("+")).map((s) => s.trim()).filter(Boolean)));
  return parts.length ? parts.join("+") : fallback;
}

/** Project a proven prioritisation into the fail-closed owner response (pure). */
export function mapPublicSignals(
  p: PublicSignalPrioritisation | null,
  opts: { hadRawButNoValid: boolean; piiStripped: boolean; linkedProcessExecutionTaskIds: string[] },
): OwnerPublicSignalsResponse {
  if (!p) {
    return {
      publicSignalStatus: opts.hadRawButNoValid ? "UNKNOWN_NEEDS_DATA" : "NONE",
      topPublicSignalAction: null,
      whyThisMatters: opts.hadRawButNoValid
        ? "Public signals were received but could not be safely interpreted — more internal data is needed before any decision."
        : "No outside signals are present for this workspace right now.",
      sourceQualitySummary: "UNKNOWN", evidenceStrengthSummary: "INSUFFICIENT",
      uncertaintyCaveat: UNCERTAINTY, missingData: [], validationRequired: opts.hadRawButNoValid,
      ownerApprovalRequired: false, evidenceRequired: [],
      blockedUnsafeActions: ["No unsafe automation: OpsIQ never contacts customers, submits tenders, spends, or contracts on its own."],
      groupedSignalClusters: [], monitorOnlySignals: [], linkedProcessExecutionTaskIds: [],
      auditTraceRefs: [], rawTextHidden: true, piiStripped: opts.piiStripped, noLiveIngestionStatement: NO_LIVE_INGESTION,
    };
  }
  const status = deriveStatus(p, opts.hadRawButNoValid);
  const monitorTop = status === "MONITOR_ONLY";
  return {
    publicSignalStatus: status,
    topPublicSignalAction: monitorTop ? null : (p.topCollectiveAction?.decision ?? null),
    whyThisMatters: p.topCollectiveAction?.priorityReasons.join(" ") ?? p.antiSpamSummary,
    sourceQualitySummary: aggregateSummary(p.issueClusters.map((c) => c.sourceQualitySummary), "UNKNOWN"),
    evidenceStrengthSummary: aggregateSummary(p.issueClusters.map((c) => c.evidenceStrengthSummary), "INSUFFICIENT"),
    uncertaintyCaveat: UNCERTAINTY,
    missingData: p.missingData,
    validationRequired: status === "VALIDATION_REQUIRED" || p.missingData.length > 0 || p.issueClusters.some((c) => c.evidenceRequired.length > 0),
    ownerApprovalRequired: p.issueClusters.some((c) => c.ownerApprovalRequired) || !!p.topCollectiveAction?.ownerApprovalRequired,
    evidenceRequired: p.evidenceRequirements,
    blockedUnsafeActions: p.blockedUnsafeActions.length ? p.blockedUnsafeActions : ["Tender/customer/spend actions remain blocked; no outreach or submission has been performed."],
    groupedSignalClusters: p.issueClusters.map((c) => ({
      topic: c.topic, signalCount: c.signalCount, conflictClassification: c.conflictClassification,
      priorityTier: c.priorityTier, monitorOnly: c.monitorOnly, collectiveDecision: c.collectiveDecision,
      sourceQualitySummary: c.sourceQualitySummary, evidenceStrengthSummary: c.evidenceStrengthSummary,
    })),
    monitorOnlySignals: p.monitorOnlyItems.map((m) => ({ topic: m.topic, signalCount: m.signalCount, reason: m.reason })),
    linkedProcessExecutionTaskIds: opts.linkedProcessExecutionTaskIds,
    auditTraceRefs: p.auditTrace,
    rawTextHidden: true, piiStripped: opts.piiStripped, noLiveIngestionStatement: NO_LIVE_INGESTION,
  };
}

export interface PublicSignalsInput {
  workspaceArchetype: PublicArchetype;
  rawInputs: RawPublicSignalInput[];
  linkedProcessExecutionTaskIds?: string[];
}

/** Build AND validate the owner public-signal summary from controlled raw inputs (runs the proven pipeline). */
export function buildOwnerPublicSignals(
  input: PublicSignalsInput,
): { ok: true; summary: OwnerPublicSignalsResponse } | { ok: false; issues: string[] } {
  const archetype: PublicArchetype = PUBLIC_ARCHETYPES.includes(input.workspaceArchetype) ? input.workspaceArchetype : "unknown";
  const signals: ConflictSignalInput[] = [];
  let piiEverPresent = false;
  for (const raw of input.rawInputs) {
    const r = interpretAndValidateRawPublicSignal({ ...raw, archetype });
    if (!r.ok) continue; // fail closed per-signal: an uninterpretable signal is dropped, never leaked
    if (r.signal.piiRemoved) piiEverPresent = true;
    signals.push({ signal: r.signal });
  }
  const hadRawButNoValid = input.rawInputs.length > 0 && signals.length === 0;
  const prioritisation = signals.length > 0 ? prioritisePublicSignals({ workspaceArchetype: archetype, signals }) : null;
  // Validate the proven pipeline output itself before projecting (defence in depth).
  if (prioritisation) {
    const pv = publicSignalPrioritisationSchema.safeParse(prioritisation);
    if (!pv.success) {
      const issues = pv.error.issues.map((i) => `prioritisation.${i.path.join(".")}: ${i.message}`);
      return { ok: false, issues };
    }
  }
  const piiStripped = input.rawInputs.length === 0 ? true : (piiEverPresent ? true : true);
  const summary = mapPublicSignals(prioritisation, { hadRawButNoValid, piiStripped, linkedProcessExecutionTaskIds: input.linkedProcessExecutionTaskIds ?? [] });
  const parsed = ownerPublicSignalsSchema.safeParse(summary);
  if (parsed.success) return { ok: true, summary };
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  return { ok: false, issues };
}

// ── Persisted-intake → raw public signal mapping (controlled records only, no live fetch) ───────────────

const SIGNAL_TYPE_TO_SOURCE: Record<string, RawPublicSignalInput["sourceType"]> = {
  PUBLIC_REVIEW: "public_review", COMPLAINT: "public_complaint", SERVICE_PAGE: "public_service_page",
  TENDER: "public_tender_notice", TENDER_NOTICE: "public_tender_notice", RFQ: "public_rfq",
  SAAS_REVIEW: "public_saas_review", SAAS_SUPPORT: "public_saas_support", FRANCHISE: "public_franchise_page",
  PROPERTY_LISTING: "public_property_listing", HOUSEKEEPING: "public_housekeeping", B2B_OPPORTUNITY: "public_b2b_opportunity",
};
const SOURCE_QUALITY_SET = new Set(["VERIFIED_SOURCE", "PUBLIC_SOURCE_UNVERIFIED", "THIRD_PARTY_UNVERIFIED", "LOW_CONFIDENCE", "UNKNOWN"]);

export interface PersistedPublicSignalRow {
  rawDescription: string;
  rawSignalType: string;
  sourceQuality: string;
  sourceRef?: string | null;
}

/** Map a controlled persisted intake row to a raw public-signal input (rawText only; interpreter sanitises). */
export function persistedRowToRawInput(row: PersistedPublicSignalRow, archetype: PublicArchetype): RawPublicSignalInput {
  return {
    rawText: row.rawDescription,
    sourceType: SIGNAL_TYPE_TO_SOURCE[row.rawSignalType?.toUpperCase?.() ?? ""] ?? "unknown",
    archetype,
    sourceRef: row.sourceRef ?? null,
    declaredSourceQuality: SOURCE_QUALITY_SET.has(row.sourceQuality) ? (row.sourceQuality as RawPublicSignalInput["declaredSourceQuality"]) : undefined,
  };
}
