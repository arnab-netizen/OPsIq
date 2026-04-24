/**
 * Engine layer contracts for OpsIQ diagnosis system
 * Engines operate independently and return structured signals
 * The orchestrator synthesizes engine outputs into final diagnosis
 */

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
  phase: InterventionPhase;
  signals: EngineSignal[];
  allEngineResults: EngineResult[];
  issues: string[];
  diagnosticConfidence: number;
}

export type InterventionPhase =
  | "triage"
  | "stabilize"
  | "repair"
  | "strengthen"
  | "grow"
  | "protect";

export interface Engine {
  name: string;
  assess(input: BusinessAssessment): Promise<EngineResult>;
}
