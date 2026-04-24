/**
 * Diagnostic intervention phases - separate from engagement lifecycle phases
 *
 * These phases represent the RECOMMENDED diagnostic intervention level,
 * NOT the engagement's operational state.
 *
 * Main engagement phases (assessment → planning → execution → review → handover → closed)
 * are independent and unchanged.
 */

export const DIAGNOSTIC_INTERVENTION_PHASES = [
  "triage",
  "stabilization",
  "recovery",
  "growth",
] as const;

export type DiagnosticInterventionPhase = (typeof DIAGNOSTIC_INTERVENTION_PHASES)[number];

/**
 * Map severity to diagnostic intervention phase
 * This is diagnostic recommendation, not engagement lifecycle state
 */
export function mapSeverityToDiagnosticPhase(
  severity: "low" | "medium" | "high" | "critical"
): DiagnosticInterventionPhase {
  const map: Record<string, DiagnosticInterventionPhase> = {
    critical: "triage",
    high: "stabilization",
    medium: "recovery",
    low: "growth",
  };
  return map[severity] || "triage";
}
