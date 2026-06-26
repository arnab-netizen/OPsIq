/**
 * C2 — Domain signal aggregator (pure).
 *
 * Collects the D1–D24 domain outputs into one indexed set WITHOUT flattening: it
 * preserves each domain's severity, confidence, evidence, missing data, vetoes, proof
 * and verification rules, side-effect metrics, and harm signals. Low-confidence signals
 * are preserved as-is (never upgraded). Missing domains are flagged, not invented.
 */

import type {
  DomainKey, DomainSignal, DomainSignalInput, SignalStatus,
} from "@/domain/collective-training/collective-types";
import { DOMAIN_REGISTRY, domainMeta } from "@/domain/collective-training/domain-registry";

export interface AggregationResult {
  signals: DomainSignal[];
  byDomain: Map<DomainKey, DomainSignal>;
  presentDomains: DomainKey[];
  missingDomains: DomainKey[];
}

/** True when a domain signal represents a red/critical condition. */
export function isRed(status: SignalStatus, severity: string): boolean {
  return status === "RED" || status === "BLOCKED" || severity === "HIGH" || severity === "CRITICAL";
}

export function isAmber(status: SignalStatus, severity: string): boolean {
  return !isRed(status, severity) && (status === "AMBER" || severity === "MEDIUM");
}

function aggregateOne(input: DomainSignalInput): DomainSignal {
  const meta = domainMeta(input.domain);
  return {
    domain: input.domain,
    domainId: meta.domainId,
    priorityLevel: meta.priorityLevel,
    status: input.status,
    severity: input.severity,
    confidence: input.confidence, // preserved, never upgraded
    evidenceUsed: input.evidenceUsed ?? [],
    missingData: input.missingData ?? [],
    vetoedActions: input.vetoedActions ?? (isRed(input.status, input.severity) ? meta.vetoesWhenRed : []),
    proofRequired: input.proofRequired ?? "",
    verificationMethod: input.verificationMethod ?? "",
    sideEffectMetrics: input.sideEffectMetrics ?? [],
    harmSignals: input.harmSignals ?? [],
    complianceSensitive: input.complianceSensitive ?? meta.complianceSensitive,
  };
}

/** Aggregate raw domain signals, preserving everything and flagging missing domains. */
export function aggregateSignals(inputs: readonly DomainSignalInput[]): AggregationResult {
  const byDomain = new Map<DomainKey, DomainSignal>();
  for (const input of inputs) {
    // Last writer wins per domain, but the union of evidence/missing is preserved.
    const agg = aggregateOne(input);
    const prior = byDomain.get(input.domain);
    if (prior) {
      agg.evidenceUsed = [...new Set([...prior.evidenceUsed, ...agg.evidenceUsed])];
      agg.missingData = [...new Set([...prior.missingData, ...agg.missingData])];
      agg.harmSignals = [...new Set([...prior.harmSignals, ...agg.harmSignals])];
    }
    byDomain.set(input.domain, agg);
  }
  const presentDomains = [...byDomain.keys()];
  const missingDomains = (Object.keys(DOMAIN_REGISTRY) as DomainKey[]).filter((d) => !byDomain.has(d));
  const signals = [...byDomain.values()];
  return { signals, byDomain, presentDomains, missingDomains };
}
