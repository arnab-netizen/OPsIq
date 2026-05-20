/**
 * Test factories for creating mock OperatorItem records
 * Used to eliminate database dependencies in unit tests
 */

export interface MockOperatorItem {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  createdBy: string;
  lastUpdatedBy?: string;
  problem: string;
  action: string;
  impactExpected: number;
  impactLow: number;
  impactHigh: number;
  confidence: number;
  priorityScore: number;
  status: "pending" | "in_progress" | "done" | "failed" | "blocked";
  blockStage?: string | null;
  blockReason?: string | null;
  controlLayerViolations?: unknown;
  gateResult?: unknown;
  guardrailResult?: unknown;
  dueAt?: Date | null;
  decisionType: string;
  problemType?: string | null;
  baselineValue?: number | null;
  projectedWithoutAction?: number | null;
  expectedOutcome?: string | null;
  actualOutcome?: string | null;
  actualOutcomeValue?: number | null;
  outcomeDelta?: number | null;
  decisionAccuracy?: number | null;
  decisionError?: number | null;
  outcomeNotes?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  executionStatus: string;
  firstCompletedAt?: Date | null;
  firstPositiveOutcomeAt?: Date | null;
  firstWinAchieved?: boolean | null;
  explanation?: unknown;
  inputsSnapshot?: unknown;
  decisionHash?: string | null;
  signedHash?: string | null;
  signature?: string | null;
  signatureAlgo?: string | null;
  publicKeyId?: string | null;
  engineVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperatorItemFactoryOptions {
  workspaceId?: string;
  ownerUserId?: string;
  createdBy?: string;
  problem?: string;
  action?: string;
  impactExpected?: number;
  confidence?: number;
  status?: "pending" | "in_progress" | "done" | "failed" | "blocked";
  blockStage?: string | null;
  blockReason?: string | null;
  controlLayerViolations?: unknown;
  gateResult?: unknown;
  guardrailResult?: unknown;
  completedAt?: Date | null;
  startedAt?: Date | null;
  actualOutcomeValue?: number | null;
}

export function createOperatorItem(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  const now = new Date();
  const defaultWorkspaceId = "ws-test-" + Math.random().toString(36).substr(2, 9);
  const defaultUserId = "user-test-" + Math.random().toString(36).substr(2, 9);

  return {
    id: "item-" + Math.random().toString(36).substr(2, 9),
    workspaceId: overrides.workspaceId || defaultWorkspaceId,
    ownerUserId: overrides.ownerUserId || defaultUserId,
    createdBy: overrides.createdBy || defaultUserId,
    problem: overrides.problem || "Test problem",
    action: overrides.action || "Test action",
    impactExpected: overrides.impactExpected ?? 50000,
    impactLow: 40000,
    impactHigh: 60000,
    confidence: overrides.confidence ?? 0.75,
    priorityScore: 5,
    status: overrides.status ?? "pending",
    blockStage: overrides.blockStage ?? null,
    blockReason: overrides.blockReason ?? null,
    controlLayerViolations: overrides.controlLayerViolations,
    gateResult: overrides.gateResult,
    guardrailResult: overrides.guardrailResult,
    decisionType: "general",
    executionStatus: "not_started",
    startedAt: overrides.startedAt,
    completedAt: overrides.completedAt,
    actualOutcomeValue: overrides.actualOutcomeValue,
    engineVersion: "v1.0.0",
    createdAt: new Date(now.getTime() - 86400000), // 1 day ago
    updatedAt: now,
  };
}

export function createBlockedItem(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  return createOperatorItem({
    ...overrides,
    status: "blocked",
  });
}

export function createApprovedItem(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  const now = new Date();
  return createOperatorItem({
    ...overrides,
    status: "done",
    completedAt: overrides.completedAt || now,
    startedAt: overrides.startedAt || new Date(now.getTime() - 3600000),
  });
}

export function createDependencyValidationBlock(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  return createBlockedItem({
    ...overrides,
    blockStage: "dependency_validation",
    blockReason: overrides.blockReason || "missing_required_data",
    controlLayerViolations: overrides.controlLayerViolations || [
      {
        field: "revenue_projection",
        reason: "not_provided",
      },
    ],
  });
}

export function createDecisionGateBlock(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  return createBlockedItem({
    ...overrides,
    blockStage: "decision_gate",
    blockReason: overrides.blockReason || "stale_variables",
    gateResult: overrides.gateResult || {
      staleVariables: ["market_condition"],
      lastRefresh: new Date(Date.now() - 604800000).toISOString(), // 7 days ago
    },
  });
}

export function createGuardrailBlock(overrides: OperatorItemFactoryOptions = {}): MockOperatorItem {
  return createBlockedItem({
    ...overrides,
    blockStage: "guardrails",
    blockReason: overrides.blockReason || "high_impact_approval_required",
    guardrailResult: overrides.guardrailResult || {
      violations: [
        {
          ruleId: "high-impact-approval",
          severity: "block",
          message: "Impact > 100k requires manager approval",
        },
      ],
    },
  });
}

export function createBatch(
  count: number,
  baseFactory: (opts: OperatorItemFactoryOptions) => MockOperatorItem = createOperatorItem,
  overrides: OperatorItemFactoryOptions = {}
): MockOperatorItem[] {
  const items: MockOperatorItem[] = [];
  for (let i = 0; i < count; i++) {
    items.push(baseFactory(overrides));
  }
  return items;
}
