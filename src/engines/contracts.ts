/**
 * Engine layer contracts for OpsIQ diagnosis system
 * Engines operate independently and return structured signals
 * The orchestrator synthesizes engine outputs into diagnostic recommendation
 *
 * CRITICAL: This module uses DiagnosticInterventionPhase for the RECOMMENDED
 * intervention level. It does NOT interact with or modify engagement lifecycle phases.
 */

import type { DiagnosticInterventionPhase } from "@/domain/constants/diagnostic-phases";

export interface BusinessAssessment {
  businessName: string;
  businessType: string;
  problemStatement: string;
  mainIssue: string;
  monthlyRevenue?: number;
  monthlyCosts?: number;
  customerCount?: number;
}

export interface EngineSignal {
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  category?: string;
  confidence: number;
  message: string;
  evidence?: string[];
}

export interface EngineResult {
  engine: string;
  signals: EngineSignal[];
  issues: string[];
  metadata: Record<string, any>;
}

export interface OrchestratedDiagnosis {
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  recommendedDiagnosticPhase: DiagnosticInterventionPhase;
  signals: EngineSignal[];
  allEngineResults: EngineResult[];
  issues: string[];
  diagnosticConfidence: number;
}

export interface Engine {
  name: string;
  assess(input: BusinessAssessment): Promise<EngineResult>;
}
