/**
 * Adapter: convert SMB fixture into a format suitable for the OpsIQ diagnosis engine.
 *
 * STATUS: PENDING — integration is not yet connected.
 *
 * WHY SKIPPED:
 * The OpsIQ consulting-engine diagnosis entry point (diagnoseRootCause) accepts
 * EvidenceItem[] — a typed array where each item has a canonical `dimension`
 * (e.g., "financial_health", "market_position", "operational_efficiency"),
 * a structured `finding` string, a `confidence` enum value, and optional
 * numeric `supportingData`.
 *
 * SMB fixtures carry narrative facts (scenario.facts_known_to_owner as a free-form
 * key-value object), symptom strings, and misleading-signal strings — none of
 * which map deterministically to typed EvidenceItem dimensions without either:
 *   (a) Case-specific hardcoded EvidenceItem arrays (out of scope for the harness task), or
 *   (b) An NLP/semantic parsing layer (no external calls permitted).
 *
 * To add real engine integration:
 *   1. For each fixture, author a companion EvidenceItem[] array that faithfully
 *      represents the scenario's pre-decision evidence in the engine's canonical format.
 *   2. Call diagnoseRootCause(evidenceItems, caseId) from this module.
 *   3. Map the returned RootCause type to the fixture's primary_root_cause.
 *   4. Remove the TODO_INTEGRATION_SKIPPED flag below.
 *
 * MISSING ENTRYPOINT:
 * No stable adapter between SMB fixture narrative format and EvidenceItem[] exists.
 * Engine file: src/services/consulting-engine/diagnosis-engine.ts
 * Engine function: diagnoseRootCause(evidence: EvidenceItem[], caseId: string)
 */

import type { SmbFixture } from "./fixtureSchema";

export const TODO_INTEGRATION_SKIPPED = true;

export interface OpsiqAdapterInput {
  caseId: string;
  businessDescription: string;
  knownFacts: Record<string, unknown>;
  symptoms: string[];
  misleadingSignals: string[];
  segment: string;
  systemInstructions: string;
}

export interface OpsiqAdapterOutput {
  skipped: true;
  reason: string;
  adapterInput: OpsiqAdapterInput;
}

export function buildAdapterInput(fixture: SmbFixture): OpsiqAdapterInput {
  return {
    caseId: fixture.case_id,
    businessDescription: fixture.scenario.business,
    knownFacts: fixture.scenario.facts_known_to_owner,
    symptoms: fixture.scenario.symptoms,
    misleadingSignals: fixture.scenario.misleading_signals,
    segment: fixture.segment,
    systemInstructions: [
      "You are OpsIQ, a governed business intervention system.",
      "Based only on the provided business description, known facts, and symptoms:",
      "1. Identify the primary root cause of the business problem.",
      "2. Ask for at least two specific missing inputs you need to confirm your diagnosis.",
      "3. Recommend the single most important first action the owner should take.",
      "4. Do NOT recommend generic growth actions (marketing, hiring, expansion) without first",
      "   diagnosing whether the root problem has been addressed.",
      "5. Do NOT use outcome knowledge — diagnose only from the evidence provided.",
    ].join("\n"),
  };
}

export async function runCaseAgainstOpsiq(fixture: SmbFixture): Promise<OpsiqAdapterOutput> {
  const adapterInput = buildAdapterInput(fixture);
  return {
    skipped: true,
    reason:
      "Engine integration pending: SMB narrative format cannot be deterministically " +
      "converted to EvidenceItem[] without case-specific mappings. " +
      "See TODO_INTEGRATION_SKIPPED in runCaseAgainstOpsiq.ts for resolution path.",
    adapterInput,
  };
}
