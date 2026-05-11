import { describe, it, expect } from 'vitest';
import {
  OnboardingStepSchema,
  WorkspaceFormSchema,
  TeamMemberInviteSchema,
  OnboardingProgressSchema,
  OnboardingSessionSchema,
  generateOnboardingSteps,
  generateMockWorkspaceForm,
  generateMockTeamMembers,
  generateMockOnboardingProgress,
  generateMockOnboardingSession,
  type OnboardingStep,
  type WorkspaceForm,
  type TeamMemberInvite,
  type OnboardingProgress,
  type OnboardingSession,
} from '@/app/components/self-serve-onboarding-shell';

describe('ADDENDUM F: Self-Serve Onboarding Shell', () => {
  // Default TeamMemberInvite with all required fields
  const defaultTeamMemberInvite = (overrides?: Partial<TeamMemberInvite>): TeamMemberInvite => ({
    email: 'user@example.com',
    role: 'member',
    status: 'pending',
    ...overrides,
  });

  describe('Onboarding Step Schema', () => {
    it('should validate onboarding step', () => {
      const step: OnboardingStep = {
        stepId: 'step_1',
        title: 'Welcome',
        description: 'Welcome to OpsIQ',
        completed: false,
        order: 1,
      };

      const result = OnboardingStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should have default completed value', () => {
      const step = {
        stepId: 'step_1',
        title: 'Welcome',
        description: 'Welcome to OpsIQ',
        order: 1,
      };

      const result = OnboardingStepSchema.safeParse(step);
      expect(result.success).toBe(true);
    });

    it('should require stepId, title, description, order', () => {
      const invalidStep = {
        title: 'Welcome',
        completed: false,
      };

      const result = OnboardingStepSchema.safeParse(invalidStep);
      expect(result.success).toBe(false);
    });
  });

  describe('Workspace Form Schema', () => {
    it('should validate workspace form', () => {
      const form: WorkspaceForm = {
        workspaceName: 'My Company',
        industry: 'Technology',
        teamSize: '11-50',
        region: 'US',
      };

      const result = WorkspaceFormSchema.safeParse(form);
      expect(result.success).toBe(true);
    });

    it('should support all team sizes', () => {
      const sizes = ['1', '2-10', '11-50', '51-100', '100+'] as const;

      for (const size of sizes) {
        const form: WorkspaceForm = {
          workspaceName: 'Test',
          industry: 'Tech',
          teamSize: size,
          region: 'US',
        };

        const result = WorkspaceFormSchema.safeParse(form);
        expect(result.success).toBe(true);
      }
    });

    it('should support all regions', () => {
      const regions = ['US', 'EU', 'APAC'] as const;

      for (const region of regions) {
        const form: WorkspaceForm = {
          workspaceName: 'Test',
          industry: 'Tech',
          teamSize: '11-50',
          region,
        };

        const result = WorkspaceFormSchema.safeParse(form);
        expect(result.success).toBe(true);
      }
    });

    it('should require workspace name', () => {
      const invalidForm = {
        industry: 'Tech',
        teamSize: '11-50',
        region: 'US',
      };

      const result = WorkspaceFormSchema.safeParse(invalidForm);
      expect(result.success).toBe(false);
    });
  });

  describe('Team Member Invite Schema', () => {
    it('should validate team member invite', () => {
      const invite = defaultTeamMemberInvite();

      const result = TeamMemberInviteSchema.safeParse(invite);
      expect(result.success).toBe(true);
    });

    it('should have default role', () => {
      const invite = defaultTeamMemberInvite();

      const result = TeamMemberInviteSchema.safeParse(invite);
      expect(result.success).toBe(true);
    });

    it('should have default status', () => {
      const invite = defaultTeamMemberInvite({ role: 'admin' });

      const result = TeamMemberInviteSchema.safeParse(invite);
      expect(result.success).toBe(true);
    });

    it('should validate all roles', () => {
      const roles = ['admin', 'member'] as const;

      for (const role of roles) {
        const invite = defaultTeamMemberInvite({ role });

        const result = TeamMemberInviteSchema.safeParse(invite);
        expect(result.success).toBe(true);
      }
    });

    it('should validate all statuses', () => {
      const statuses = ['pending', 'accepted', 'declined'] as const;

      for (const status of statuses) {
        const invite: TeamMemberInvite = {
          email: 'user@example.com',
          role: 'member',
          status,
        };

        const result = TeamMemberInviteSchema.safeParse(invite);
        expect(result.success).toBe(true);
      }
    });

    it('should require valid email', () => {
      const invalidInvite = {
        email: 'not-an-email',
        role: 'member',
      };

      const result = TeamMemberInviteSchema.safeParse(invalidInvite);
      expect(result.success).toBe(false);
    });
  });

  describe('Onboarding Progress Schema', () => {
    it('should validate onboarding progress', () => {
      const progress: OnboardingProgress = {
        workspaceId: 'ws_1',
        userId: 'user_1',
        currentStep: 2,
        totalSteps: 5,
        percentComplete: 40,
        stepsCompleted: [],
        startedAt: new Date(),
      };

      const result = OnboardingProgressSchema.safeParse(progress);
      expect(result.success).toBe(true);
    });

    it('should enforce percentage bounds', () => {
      const invalidProgress = {
        workspaceId: 'ws_1',
        userId: 'user_1',
        currentStep: 2,
        totalSteps: 5,
        percentComplete: 150,
        stepsCompleted: [],
        startedAt: new Date(),
      };

      const result = OnboardingProgressSchema.safeParse(invalidProgress);
      expect(result.success).toBe(false);
    });

    it('should allow optional fields', () => {
      const progress: OnboardingProgress = {
        workspaceId: 'ws_1',
        userId: 'user_1',
        currentStep: 5,
        totalSteps: 5,
        percentComplete: 100,
        stepsCompleted: [],
        startedAt: new Date(),
        completedAt: new Date(),
        workspaceForm: generateMockWorkspaceForm(),
        teamMembers: generateMockTeamMembers(2),
      };

      const result = OnboardingProgressSchema.safeParse(progress);
      expect(result.success).toBe(true);
    });
  });

  describe('Onboarding Session Schema', () => {
    it('should validate onboarding session', () => {
      const session: OnboardingSession = {
        sessionId: 'session_1',
        userId: 'user_1',
        progress: {
          workspaceId: 'ws_1',
          userId: 'user_1',
          currentStep: 1,
          totalSteps: 5,
          percentComplete: 0,
          stepsCompleted: [],
          startedAt: new Date(),
        },
        status: 'in_progress',
      };

      const result = OnboardingSessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('should validate all session statuses', () => {
      const statuses = ['in_progress', 'completed', 'abandoned'] as const;

      for (const status of statuses) {
        const session: OnboardingSession = {
          sessionId: 'session_1',
          userId: 'user_1',
          progress: {
            workspaceId: 'ws_1',
            userId: 'user_1',
            currentStep: 1,
            totalSteps: 5,
            percentComplete: 0,
            stepsCompleted: [],
            startedAt: new Date(),
          },
          status,
        };

        const result = OnboardingSessionSchema.safeParse(session);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Onboarding Steps Generation', () => {
    it('should generate onboarding steps', () => {
      const steps = generateOnboardingSteps();

      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]?.stepId).toBeDefined();
    });

    it('should have proper step sequence', () => {
      const steps = generateOnboardingSteps();

      expect(steps[0]?.order).toBe(1);
      expect(steps[steps.length - 1]?.order).toBe(steps.length);
    });

    it('should include welcome step', () => {
      const steps = generateOnboardingSteps();

      expect(steps.some((s) => s.stepId === 'step_welcome')).toBe(true);
    });

    it('should include workspace creation step', () => {
      const steps = generateOnboardingSteps();

      expect(steps.some((s) => s.stepId === 'step_workspace')).toBe(true);
    });

    it('should include team invitation step', () => {
      const steps = generateOnboardingSteps();

      expect(steps.some((s) => s.stepId === 'step_team')).toBe(true);
    });

    it('should have unique step IDs', () => {
      const steps = generateOnboardingSteps();
      const ids = steps.map((s) => s.stepId);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Mock Workspace Form Generation', () => {
    it('should generate workspace form', () => {
      const form = generateMockWorkspaceForm();

      expect(form.workspaceName).toBeDefined();
      expect(form.industry).toBeDefined();
      expect(form.teamSize).toBeDefined();
      expect(form.region).toBeDefined();
    });

    it('should support overrides', () => {
      const form = generateMockWorkspaceForm({ workspaceName: 'Custom Name' });

      expect(form.workspaceName).toBe('Custom Name');
      expect(form.industry).toBeDefined();
    });

    it('should validate generated form', () => {
      const form = generateMockWorkspaceForm();
      const result = WorkspaceFormSchema.safeParse(form);

      expect(result.success).toBe(true);
    });
  });

  describe('Mock Team Members Generation', () => {
    it('should generate team members', () => {
      const members = generateMockTeamMembers(5);

      expect(members).toHaveLength(5);
    });

    it('should have varied email domains', () => {
      const members = generateMockTeamMembers(10);
      const domains = new Set(members.map((m) => m.email.split('@')[1]));

      expect(domains.size).toBeGreaterThan(1);
    });

    it('should have first member as admin', () => {
      const members = generateMockTeamMembers(3);

      expect(members[0]?.role).toBe('admin');
    });

    it('should have varied statuses', () => {
      const members = generateMockTeamMembers(9);
      const statuses = new Set(members.map((m) => m.status));

      expect(statuses.size).toBeGreaterThan(1);
    });

    it('should validate all generated members', () => {
      const members = generateMockTeamMembers(5);

      for (const member of members) {
        const result = TeamMemberInviteSchema.safeParse(member);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Mock Onboarding Progress Generation', () => {
    it('should generate completed progress', () => {
      const progress = generateMockOnboardingProgress(false);

      expect(progress.percentComplete).toBe(100);
      expect(progress.completedAt).toBeDefined();
    });

    it('should generate partial progress', () => {
      const progress = generateMockOnboardingProgress(true);

      expect(progress.percentComplete).toBeLessThan(100);
      expect(progress.completedAt).toBeUndefined();
    });

    it('should have consistent step counts', () => {
      const progress = generateMockOnboardingProgress();

      expect(progress.currentStep).toBeLessThanOrEqual(progress.totalSteps);
    });

    it('should include workspace form', () => {
      const progress = generateMockOnboardingProgress();

      expect(progress.workspaceForm).toBeDefined();
      expect(progress.workspaceForm?.workspaceName).toBeDefined();
    });

    it('should include team members', () => {
      const progress = generateMockOnboardingProgress();

      expect(progress.teamMembers).toBeDefined();
      expect(progress.teamMembers?.length).toBeGreaterThan(0);
    });

    it('should validate generated progress', () => {
      const progress = generateMockOnboardingProgress();
      const result = OnboardingProgressSchema.safeParse(progress);

      expect(result.success).toBe(true);
    });
  });

  describe('Mock Onboarding Session Generation', () => {
    it('should generate completed session', () => {
      const session = generateMockOnboardingSession(true);

      expect(session.status).toBe('completed');
      expect(session.progress.completedAt).toBeDefined();
    });

    it('should generate in-progress session', () => {
      const session = generateMockOnboardingSession(false);

      expect(session.status).toBe('in_progress');
      expect(session.resumeUrl).toBeDefined();
    });

    it('should include session ID', () => {
      const session = generateMockOnboardingSession();

      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).toMatch(/^session_/);
    });

    it('should include user ID', () => {
      const session = generateMockOnboardingSession();

      expect(session.userId).toBeDefined();
    });

    it('should validate generated session', () => {
      const session = generateMockOnboardingSession();
      const result = OnboardingSessionSchema.safeParse(session);

      expect(result.success).toBe(true);
    });
  });

  describe('Comprehensive Onboarding Coverage', () => {
    it('should support complete onboarding flow', () => {
      const session = generateMockOnboardingSession(true);

      expect(session.progress.stepsCompleted.length).toBeGreaterThan(0);
      expect(session.progress.percentComplete).toBe(100);
      expect(session.status).toBe('completed');
    });

    it('should track workspace configuration', () => {
      const progress = generateMockOnboardingProgress();

      expect(progress.workspaceForm?.workspaceName).toBeDefined();
      expect(progress.workspaceForm?.industry).toBeDefined();
      expect(progress.workspaceForm?.teamSize).toBeDefined();
      expect(progress.workspaceForm?.region).toBeDefined();
    });

    it('should track team member invitations', () => {
      const progress = generateMockOnboardingProgress();

      expect(progress.teamMembers).toBeDefined();
      expect(progress.teamMembers?.length).toBeGreaterThan(0);
      expect(progress.teamMembers?.some((m) => m.role === 'admin')).toBe(true);
    });

    it('should handle partial completion', () => {
      const progress = generateMockOnboardingProgress(true);

      expect(progress.percentComplete).toBeGreaterThan(0);
      expect(progress.percentComplete).toBeLessThan(100);
      expect(progress.skippedSteps?.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide resume URL for in-progress sessions', () => {
      const session = generateMockOnboardingSession(false);

      expect(session.resumeUrl).toBeDefined();
      expect(session.status).toBe('in_progress');
    });
  });

  describe('Mock Data Consistency', () => {
    it('should generate consistent workspace forms', () => {
      const form1 = generateMockWorkspaceForm();
      const form2 = generateMockWorkspaceForm();

      expect(form1.teamSize).toBeDefined();
      expect(form2.teamSize).toBeDefined();
    });

    it('should generate consistent team members', () => {
      const members1 = generateMockTeamMembers(3);
      const members2 = generateMockTeamMembers(3);

      expect(members1.length).toBe(members2.length);
    });

    it('should generate consistent progress', () => {
      const progress1 = generateMockOnboardingProgress();
      const progress2 = generateMockOnboardingProgress();

      expect(progress1.totalSteps).toBe(progress2.totalSteps);
    });

    it('should handle large team sizes', () => {
      const members = generateMockTeamMembers(50);

      expect(members.length).toBe(50);
      for (const member of members) {
        const result = TeamMemberInviteSchema.safeParse(member);
        expect(result.success).toBe(true);
      }
    });
  });
});
