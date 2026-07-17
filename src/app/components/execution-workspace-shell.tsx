'use client';

import { useState } from 'react';
import { z } from 'zod';

// ============================================================================
// EXECUTION WORKSPACE CONTRACTS
// ============================================================================

/** Execution action */
export const ExecutionActionSchema = z.object({
  actionId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  owner: z.string(),
  dueDate: z.date().optional(),
  completedAt: z.date().optional(),
  certainty: z.number().min(0).max(100),
  estimatedImpact: z.number().min(0).max(100).optional(),
});

export type ExecutionAction = z.infer<typeof ExecutionActionSchema>;

/** Execution decision */
export const ExecutionDecisionSchema = z.object({
  decisionId: z.string(),
  title: z.string(),
  context: z.string().optional(),
  status: z.enum(['proposed', 'approved', 'executed', 'rejected', 'deferred']),
  approvedAt: z.date().optional(),
  executedAt: z.date().optional(),
  expectedOutcome: z.string().optional(),
  actualOutcome: z.string().optional(),
  roi: z.number().optional(),
});

export type ExecutionDecision = z.infer<typeof ExecutionDecisionSchema>;

/** Execution experiment */
export const ExecutionExperimentSchema = z.object({
  experimentId: z.string(),
  hypothesis: z.string(),
  testGroup: z.string().optional(),
  controlGroup: z.string().optional(),
  status: z.enum(['planned', 'running', 'completed', 'failed', 'cancelled']),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  successMetric: z.string().optional(),
  successCriteria: z.number().optional(),
  actualResult: z.number().optional(),
  confidence: z.number().min(0).max(100).optional(),
});

export type ExecutionExperiment = z.infer<typeof ExecutionExperimentSchema>;

/** Workspace execution state */
export const WorkspaceExecutionStateSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  currentPhase: z.enum(['planning', 'execution', 'monitoring', 'optimization', 'completed']),
  actions: z.array(ExecutionActionSchema),
  decisions: z.array(ExecutionDecisionSchema),
  experiments: z.array(ExecutionExperimentSchema),
  totalActionsCount: z.number(),
  completedActionsCount: z.number(),
  blockedActionsCount: z.number(),
  averageCertainty: z.number().min(0).max(100),
  overallHealth: z.enum(['excellent', 'good', 'fair', 'poor', 'critical']),
  lastUpdatedAt: z.date(),
  nextReviewDate: z.date().optional(),
});

export type WorkspaceExecutionState = z.infer<typeof WorkspaceExecutionStateSchema>;

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/** Generate mock execution actions */
export function generateMockActions(count: number = 5): ExecutionAction[] {
  const titles = [
    'Implement feature',
    'Review proposal',
    'Launch campaign',
    'Fix critical bug',
    'Conduct user testing',
    'Update documentation',
    'Performance optimization',
    'Team training',
  ];

  const owners = ['alice', 'bob', 'carol', 'david', 'emma'];
  const statuses: Array<ExecutionAction['status']> = ['pending', 'in_progress', 'completed', 'blocked'];

  return Array.from({ length: count }, (_, i) => ({
    actionId: `act_${Date.now()}_${i}`,
    title: titles[i % titles.length]!,
    description: `Action details for item ${i + 1}`,
    status: statuses[i % statuses.length]!,
    priority: (['low', 'medium', 'high', 'critical'] as const)[i % 4]!,
    owner: owners[i % owners.length]!,
    dueDate: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000),
    completedAt: (statuses[i % statuses.length] === 'completed') ? new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000) : undefined,
    certainty: 70 + Math.floor(Math.random() * 30),
    estimatedImpact: 50 + Math.floor(Math.random() * 50),
  }));
}

/** Generate mock execution decisions */
export function generateMockDecisions(count: number = 3): ExecutionDecision[] {
  const titles = [
    'Adopt new tech stack',
    'Expand to new market',
    'Restructure team',
    'Change pricing model',
    'Launch mobile app',
  ];

  const statuses: Array<ExecutionDecision['status']> = ['proposed', 'approved', 'executed'];

  return Array.from({ length: count }, (_, i) => ({
    decisionId: `dec_${Date.now()}_${i}`,
    title: titles[i % titles.length]!,
    context: `Decision context for item ${i + 1}`,
    status: statuses[i % statuses.length]!,
    approvedAt: (i % 2 === 0) ? new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000) : undefined,
    executedAt: (statuses[i % statuses.length] === 'executed') ? new Date(Date.now() - (i + 1) * 3 * 24 * 60 * 60 * 1000) : undefined,
    expectedOutcome: `Expected ${50 + Math.floor(Math.random() * 50)}% improvement`,
    actualOutcome: (statuses[i % statuses.length] === 'executed') ? `Achieved ${40 + Math.floor(Math.random() * 60)}% improvement` : undefined,
    roi: (statuses[i % statuses.length] === 'executed') ? 1.5 + Math.random() * 2.5 : undefined,
  }));
}

/** Generate mock execution experiments */
export function generateMockExperiments(count: number = 3): ExecutionExperiment[] {
  const hypotheses = [
    'Simplified UI improves conversion',
    'Email marketing increases retention',
    'A/B testing improves engagement',
    'New onboarding reduces churn',
    'Feature request improves satisfaction',
  ];

  const statuses: Array<ExecutionExperiment['status']> = ['planned', 'running', 'completed'];

  return Array.from({ length: count }, (_, i) => ({
    experimentId: `exp_${Date.now()}_${i}`,
    hypothesis: hypotheses[i % hypotheses.length]!,
    testGroup: `group_${i + 1}_test`,
    controlGroup: `group_${i + 1}_control`,
    status: statuses[i % statuses.length]!,
    startDate: new Date(Date.now() - (count - i) * 14 * 24 * 60 * 60 * 1000),
    endDate: (statuses[i % statuses.length] === 'completed') ? new Date(Date.now() - (count - i - 1) * 14 * 24 * 60 * 60 * 1000) : undefined,
    successMetric: 'conversion_rate',
    successCriteria: 5,
    actualResult: (statuses[i % statuses.length] === 'completed') ? 3 + Math.random() * 6 : undefined,
    confidence: (statuses[i % statuses.length] === 'completed') ? 75 + Math.random() * 20 : undefined,
  }));
}

/** Generate mock workspace execution state */
export function generateMockWorkspaceExecutionState(): WorkspaceExecutionState {
  const actions = generateMockActions(8);
  const decisions = generateMockDecisions(4);
  const experiments = generateMockExperiments(4);

  const completedCount = actions.filter((a) => a.status === 'completed').length;
  const blockedCount = actions.filter((a) => a.status === 'blocked').length;
  const avgCertainty = Math.round(actions.reduce((sum, a) => sum + a.certainty, 0) / actions.length);

  return {
    workspaceId: `ws_${Date.now()}`,
    userId: 'user_123',
    currentPhase: 'execution',
    actions,
    decisions,
    experiments,
    totalActionsCount: actions.length,
    completedActionsCount: completedCount,
    blockedActionsCount: blockedCount,
    averageCertainty: avgCertainty,
    overallHealth: avgCertainty > 80 ? 'excellent' : avgCertainty > 65 ? 'good' : avgCertainty > 50 ? 'fair' : 'poor',
    lastUpdatedAt: new Date(),
    nextReviewDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };
}

// ============================================================================
// EXECUTION WORKSPACE SHELL COMPONENT
// ============================================================================

interface ExecutionWorkspaceShellProps {
  onStateChange?: (state: WorkspaceExecutionState) => void;
}

export function ExecutionWorkspaceShell({ onStateChange }: ExecutionWorkspaceShellProps) {
  const [state, setState] = useState(generateMockWorkspaceExecutionState());
  const [selectedTab, setSelectedTab] = useState<'actions' | 'decisions' | 'experiments'>('actions');

  const handleActionStatusChange = (actionId: string, newStatus: ExecutionAction['status']) => {
    const updatedActions = state.actions.map((action) =>
      action.actionId === actionId ? { ...action, status: newStatus, completedAt: newStatus === 'completed' ? new Date() : undefined } : action,
    );

    const newCompletedCount = updatedActions.filter((a) => a.status === 'completed').length;
    const newBlockedCount = updatedActions.filter((a) => a.status === 'blocked').length;

    const newState = {
      ...state,
      actions: updatedActions,
      completedActionsCount: newCompletedCount,
      blockedActionsCount: newBlockedCount,
      lastUpdatedAt: new Date(),
    };

    setState(newState);
    if (onStateChange) onStateChange(newState);
  };

  const getHealthColor = (health: WorkspaceExecutionState['overallHealth']) => {
    switch (health) {
      case 'excellent':
        return 'bg-green-100 text-green-800';
      case 'good':
        return 'bg-blue-100 text-blue-800';
      case 'fair':
        return 'bg-yellow-100 text-yellow-800';
      case 'poor':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'executed':
      case 'approved':
        return 'bg-green-50 text-green-900';
      case 'in_progress':
      case 'running':
        return 'bg-blue-50 text-blue-900';
      case 'pending':
      case 'planned':
      case 'proposed':
        return 'bg-yellow-50 text-yellow-900';
      case 'blocked':
      case 'failed':
      case 'rejected':
        return 'bg-red-50 text-red-900';
      default:
        return 'bg-gray-50 text-gray-900';
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Execution Workspace</h1>

        {/* Health Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Actions</p>
            <p className="text-2xl font-bold text-gray-900">{state.totalActionsCount}</p>
            <p className="text-xs text-gray-500 mt-1">{state.completedActionsCount} completed</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Decisions</p>
            <p className="text-2xl font-bold text-gray-900">{state.decisions.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {state.decisions.filter((d) => d.status === 'executed').length} executed
            </p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Experiments</p>
            <p className="text-2xl font-bold text-gray-900">{state.experiments.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {state.experiments.filter((e) => e.status === 'completed').length} completed
            </p>
          </div>

          <div className={`p-4 rounded-lg ${getHealthColor(state.overallHealth)}`}>
            <p className="text-sm font-medium">Overall Health</p>
            <p className="text-2xl font-bold mt-1 capitalize">{state.overallHealth}</p>
            <p className="text-xs mt-1">{state.averageCertainty}% certainty</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        {(['actions', 'decisions', 'experiments'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
              selectedTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-4">
        {selectedTab === 'actions' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions ({state.actions.length})</h2>
            <div className="space-y-3">
              {state.actions.map((action) => (
                <div key={action.actionId} className={`p-4 rounded-lg border ${getStatusColor(action.status)}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{action.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{action.description}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        action.priority === 'critical'
                          ? 'bg-red-200 text-red-900'
                          : action.priority === 'high'
                            ? 'bg-orange-200 text-orange-900'
                            : action.priority === 'medium'
                              ? 'bg-yellow-200 text-yellow-900'
                              : 'bg-green-200 text-green-900'
                      }`}
                    >
                      {action.priority}
                    </span>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <div className="flex gap-3 text-sm text-gray-600">
                      <span>Owner: {action.owner}</span>
                      <span>Certainty: {action.certainty}%</span>
                    </div>

                    <select
                      value={action.status}
                      onChange={(e) => handleActionStatusChange(action.actionId, e.target.value as ExecutionAction['status'])}
                      className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'decisions' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Decisions ({state.decisions.length})</h2>
            <div className="space-y-3">
              {state.decisions.map((decision) => (
                <div key={decision.decisionId} className={`p-4 rounded-lg border ${getStatusColor(decision.status)}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{decision.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{decision.context}</p>
                    </div>
                    <span className="px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-900">
                      {decision.status}
                    </span>
                  </div>

                  {decision.roi !== undefined && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-700">
                        <strong>ROI:</strong> {decision.roi.toFixed(1)}x
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'experiments' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Experiments ({state.experiments.length})</h2>
            <div className="space-y-3">
              {state.experiments.map((experiment) => (
                <div key={experiment.experimentId} className={`p-4 rounded-lg border ${getStatusColor(experiment.status)}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{experiment.hypothesis}</h3>
                      <p className="text-sm text-gray-600 mt-1">Metric: {experiment.successMetric}</p>
                    </div>
                    <span className="px-3 py-1 rounded text-xs font-medium bg-gray-200 text-gray-900">
                      {experiment.status}
                    </span>
                  </div>

                  {experiment.actualResult !== undefined && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Success Criteria: {experiment.successCriteria}%</span>
                        <span className="font-medium text-gray-900">Result: {experiment.actualResult.toFixed(1)}%</span>
                      </div>
                      {experiment.confidence !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">Confidence: {experiment.confidence.toFixed(0)}%</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-8 border-t border-gray-200 text-sm text-gray-600">
        <p>Last updated: {state.lastUpdatedAt.toLocaleString()}</p>
        {state.nextReviewDate && <p>Next review: {state.nextReviewDate.toLocaleDateString()}</p>}
      </div>
    </div>
  );
}
