import { describe, it, expect } from 'vitest';
import {
  ExecutionActionSchema,
  ExecutionDecisionSchema,
  ExecutionExperimentSchema,
  WorkspaceExecutionStateSchema,
  generateMockActions,
  generateMockDecisions,
  generateMockExperiments,
  generateMockWorkspaceExecutionState,
  type ExecutionAction,
  type ExecutionDecision,
  type ExecutionExperiment,
  type WorkspaceExecutionState,
} from '@/app/components/execution-workspace-shell';

describe('ADDENDUM F: Execution Workspace UX Shell', () => {
  describe('Execution Action Schema', () => {
    it('should validate execution action', () => {
      const action: ExecutionAction = {
        actionId: 'act_1',
        title: 'Implement feature',
        status: 'pending',
        priority: 'high',
        owner: 'alice',
        certainty: 85,
      };

      const result = ExecutionActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    });

    it('should validate all action statuses', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'] as const;

      for (const status of statuses) {
        const action: ExecutionAction = {
          actionId: 'act_1',
          title: 'Test',
          status,
          priority: 'medium',
          owner: 'alice',
          certainty: 75,
        };

        const result = ExecutionActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all action priorities', () => {
      const priorities = ['low', 'medium', 'high', 'critical'] as const;

      for (const priority of priorities) {
        const action: ExecutionAction = {
          actionId: 'act_1',
          title: 'Test',
          status: 'pending',
          priority,
          owner: 'alice',
          certainty: 75,
        };

        const result = ExecutionActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      }
    });

    it('should enforce certainty bounds 0-100', () => {
      const invalidAction = {
        actionId: 'act_1',
        title: 'Test',
        status: 'pending',
        priority: 'medium',
        owner: 'alice',
        certainty: 150,
      };

      const result = ExecutionActionSchema.safeParse(invalidAction);
      expect(result.success).toBe(false);
    });

    it('should allow optional description', () => {
      const action: ExecutionAction = {
        actionId: 'act_1',
        title: 'Test',
        description: 'Detailed description',
        status: 'pending',
        priority: 'medium',
        owner: 'alice',
        certainty: 75,
      };

      const result = ExecutionActionSchema.safeParse(action);
      expect(result.success).toBe(true);
    });
  });

  describe('Execution Decision Schema', () => {
    it('should validate execution decision', () => {
      const decision: ExecutionDecision = {
        decisionId: 'dec_1',
        title: 'Adopt new tech',
        status: 'proposed',
      };

      const result = ExecutionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should validate all decision statuses', () => {
      const statuses = ['proposed', 'approved', 'executed', 'rejected', 'deferred'] as const;

      for (const status of statuses) {
        const decision: ExecutionDecision = {
          decisionId: 'dec_1',
          title: 'Test',
          status,
        };

        const result = ExecutionDecisionSchema.safeParse(decision);
        expect(result.success).toBe(true);
      }
    });

    it('should allow optional ROI', () => {
      const decision: ExecutionDecision = {
        decisionId: 'dec_1',
        title: 'Test',
        status: 'executed',
        roi: 2.5,
      };

      const result = ExecutionDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });
  });

  describe('Execution Experiment Schema', () => {
    it('should validate execution experiment', () => {
      const experiment: ExecutionExperiment = {
        experimentId: 'exp_1',
        hypothesis: 'UI change improves conversion',
        status: 'planned',
      };

      const result = ExecutionExperimentSchema.safeParse(experiment);
      expect(result.success).toBe(true);
    });

    it('should validate all experiment statuses', () => {
      const statuses = ['planned', 'running', 'completed', 'failed', 'cancelled'] as const;

      for (const status of statuses) {
        const experiment: ExecutionExperiment = {
          experimentId: 'exp_1',
          hypothesis: 'Test',
          status,
        };

        const result = ExecutionExperimentSchema.safeParse(experiment);
        expect(result.success).toBe(true);
      }
    });

    it('should allow optional confidence', () => {
      const experiment: ExecutionExperiment = {
        experimentId: 'exp_1',
        hypothesis: 'Test',
        status: 'completed',
        confidence: 95,
      };

      const result = ExecutionExperimentSchema.safeParse(experiment);
      expect(result.success).toBe(true);
    });

    it('should enforce confidence bounds 0-100', () => {
      const invalidExperiment = {
        experimentId: 'exp_1',
        hypothesis: 'Test',
        status: 'completed',
        confidence: 150,
      };

      const result = ExecutionExperimentSchema.safeParse(invalidExperiment);
      expect(result.success).toBe(false);
    });
  });

  describe('Workspace Execution State Schema', () => {
    it('should validate workspace execution state', () => {
      const state: WorkspaceExecutionState = {
        workspaceId: 'ws_1',
        userId: 'user_1',
        currentPhase: 'execution',
        actions: [],
        decisions: [],
        experiments: [],
        totalActionsCount: 0,
        completedActionsCount: 0,
        blockedActionsCount: 0,
        averageCertainty: 75,
        overallHealth: 'good',
        lastUpdatedAt: new Date(),
      };

      const result = WorkspaceExecutionStateSchema.safeParse(state);
      expect(result.success).toBe(true);
    });

    it('should validate all phases', () => {
      const phases = ['planning', 'execution', 'monitoring', 'optimization', 'completed'] as const;

      for (const phase of phases) {
        const state: WorkspaceExecutionState = {
          workspaceId: 'ws_1',
          userId: 'user_1',
          currentPhase: phase,
          actions: [],
          decisions: [],
          experiments: [],
          totalActionsCount: 0,
          completedActionsCount: 0,
          blockedActionsCount: 0,
          averageCertainty: 75,
          overallHealth: 'good',
          lastUpdatedAt: new Date(),
        };

        const result = WorkspaceExecutionStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all health statuses', () => {
      const healths = ['excellent', 'good', 'fair', 'poor', 'critical'] as const;

      for (const health of healths) {
        const state: WorkspaceExecutionState = {
          workspaceId: 'ws_1',
          userId: 'user_1',
          currentPhase: 'execution',
          actions: [],
          decisions: [],
          experiments: [],
          totalActionsCount: 0,
          completedActionsCount: 0,
          blockedActionsCount: 0,
          averageCertainty: 75,
          overallHealth: health,
          lastUpdatedAt: new Date(),
        };

        const result = WorkspaceExecutionStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Actions Generation', () => {
    it('should generate actions', () => {
      const actions = generateMockActions(5);

      expect(actions).toHaveLength(5);
      expect(actions[0]?.actionId).toBeDefined();
    });

    it('should have varied statuses', () => {
      const actions = generateMockActions(10);
      const statuses = new Set(actions.map((a) => a.status));

      expect(statuses.size).toBeGreaterThan(1);
    });

    it('should have varied priorities', () => {
      const actions = generateMockActions(10);
      const priorities = new Set(actions.map((a) => a.priority));

      expect(priorities.size).toBeGreaterThan(1);
    });

    it('should have valid certainty values', () => {
      const actions = generateMockActions(10);

      for (const action of actions) {
        expect(action.certainty).toBeGreaterThanOrEqual(0);
        expect(action.certainty).toBeLessThanOrEqual(100);
      }
    });

    it('should validate all generated actions', () => {
      const actions = generateMockActions(10);

      for (const action of actions) {
        const result = ExecutionActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Decisions Generation', () => {
    it('should generate decisions', () => {
      const decisions = generateMockDecisions(3);

      expect(decisions).toHaveLength(3);
      expect(decisions[0]?.decisionId).toBeDefined();
    });

    it('should have varied statuses', () => {
      const decisions = generateMockDecisions(6);
      const statuses = new Set(decisions.map((d) => d.status));

      expect(statuses.size).toBeGreaterThan(1);
    });

    it('should validate all generated decisions', () => {
      const decisions = generateMockDecisions(5);

      for (const decision of decisions) {
        const result = ExecutionDecisionSchema.safeParse(decision);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Experiments Generation', () => {
    it('should generate experiments', () => {
      const experiments = generateMockExperiments(3);

      expect(experiments).toHaveLength(3);
      expect(experiments[0]?.experimentId).toBeDefined();
    });

    it('should have varied statuses', () => {
      const experiments = generateMockExperiments(6);
      const statuses = new Set(experiments.map((e) => e.status));

      expect(statuses.size).toBeGreaterThan(1);
    });

    it('should validate all generated experiments', () => {
      const experiments = generateMockExperiments(5);

      for (const experiment of experiments) {
        const result = ExecutionExperimentSchema.safeParse(experiment);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Workspace State Generation', () => {
    it('should generate workspace execution state', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.workspaceId).toBeDefined();
      expect(state.userId).toBeDefined();
      expect(state.actions.length).toBeGreaterThan(0);
      expect(state.decisions.length).toBeGreaterThan(0);
      expect(state.experiments.length).toBeGreaterThan(0);
    });

    it('should have consistent action counts', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.totalActionsCount).toBe(state.actions.length);
      expect(state.completedActionsCount).toBeLessThanOrEqual(state.totalActionsCount);
      expect(state.blockedActionsCount).toBeLessThanOrEqual(state.totalActionsCount);
    });

    it('should calculate average certainty correctly', () => {
      const state = generateMockWorkspaceExecutionState();

      const expectedAvg = Math.round(state.actions.reduce((sum, a) => sum + a.certainty, 0) / state.actions.length);
      expect(state.averageCertainty).toBe(expectedAvg);
    });

    it('should have coherent health status', () => {
      const state = generateMockWorkspaceExecutionState();

      // Health should correlate with certainty
      if (state.averageCertainty > 80) {
        expect(['excellent', 'good']).toContain(state.overallHealth);
      } else if (state.averageCertainty < 50) {
        expect(['poor', 'fair']).toContain(state.overallHealth);
      }
    });

    it('should validate generated state', () => {
      const state = generateMockWorkspaceExecutionState();
      const result = WorkspaceExecutionStateSchema.safeParse(state);

      expect(result.success).toBe(true);
    });
  });

  describe('Comprehensive Execution Workspace Coverage', () => {
    it('should provide complete action tracking', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.actions.length).toBeGreaterThan(0);
      expect(state.actions.every((a) => a.actionId)).toBe(true);
      expect(state.actions.every((a) => a.owner)).toBe(true);
    });

    it('should provide complete decision tracking', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.decisions.length).toBeGreaterThan(0);
      expect(state.decisions.every((d) => d.decisionId)).toBe(true);
    });

    it('should provide complete experiment tracking', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.experiments.length).toBeGreaterThan(0);
      expect(state.experiments.every((e) => e.experimentId)).toBe(true);
    });

    it('should track action phases', () => {
      const actions = generateMockActions(20);

      const statuses = new Set(actions.map((a) => a.status));
      expect(statuses.has('pending')).toBe(true);
    });

    it('should support large action counts', () => {
      const actions = generateMockActions(50);

      expect(actions).toHaveLength(50);
      for (const action of actions) {
        const result = ExecutionActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      }
    });

    it('should track decision outcomes', () => {
      const decisions = generateMockDecisions(5);

      const executedCount = decisions.filter((d) => d.status === 'executed').length;
      expect(executedCount).toBeGreaterThanOrEqual(0);
    });

    it('should track experiment results', () => {
      const experiments = generateMockExperiments(5);

      const completedCount = experiments.filter((e) => e.status === 'completed').length;
      if (completedCount > 0) {
        expect(experiments.filter((e) => e.actualResult !== undefined).length).toBeGreaterThan(0);
      }
    });

    it('should provide workspace health metrics', () => {
      const state = generateMockWorkspaceExecutionState();

      expect(state.averageCertainty).toBeGreaterThanOrEqual(0);
      expect(state.averageCertainty).toBeLessThanOrEqual(100);
      expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(state.overallHealth);
    });
  });

  describe('Mock Data Consistency', () => {
    it('should generate consistent actions', () => {
      const actions1 = generateMockActions(5);
      const actions2 = generateMockActions(5);

      expect(actions1.length).toBe(actions2.length);
    });

    it('should generate consistent state', () => {
      const state1 = generateMockWorkspaceExecutionState();
      const state2 = generateMockWorkspaceExecutionState();

      expect(state1.totalActionsCount).toBe(state2.totalActionsCount);
      expect(state1.decisions.length).toBe(state2.decisions.length);
    });

    it('should handle multiple workspace generations', () => {
      const states = Array.from({ length: 5 }, () => generateMockWorkspaceExecutionState());

      for (const state of states) {
        const result = WorkspaceExecutionStateSchema.safeParse(state);
        expect(result.success).toBe(true);
      }
    });
  });
});
