export interface Contradiction {
  id: string;
  field1: string;
  field2: string;
  description: string;
  severity: "WARNING" | "ERROR";
  suggestedResolution?: string;
}

export interface ContradictionDetectionResult {
  contractId: string;
  hasContradictions: boolean;
  contradictions: Contradiction[];
  detectedAt: Date;
}
