export interface PolicyRule {
  id: string;
  condition: (impact: number) => boolean;
  requiresApproval: boolean;
}

export interface PolicyEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  reason?: string;
  violations: string[];
}

export interface CompletionPolicy {
  allowed: boolean;
  reason?: string;
}
