'use client';

import React, { useState } from 'react';
import { z } from 'zod';

// ============================================================================
// ONBOARDING CONTRACTS
// ============================================================================

/** Onboarding step */
export const OnboardingStepSchema = z.object({
  stepId: z.string(),
  title: z.string(),
  description: z.string(),
  completed: z.boolean().default(false),
  order: z.number(),
  requiredFields: z.array(z.string()).optional(),
});

export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

/** Workspace creation form */
export const WorkspaceFormSchema = z.object({
  workspaceName: z.string().min(1),
  industry: z.string().min(1),
  teamSize: z.enum(['1', '2-10', '11-50', '51-100', '100+']),
  region: z.enum(['US', 'EU', 'APAC']),
});

export type WorkspaceForm = z.infer<typeof WorkspaceFormSchema>;

/** Team member invitation */
export const TeamMemberInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
  invitationId: z.string().optional(),
  invitedAt: z.date().optional(),
  status: z.enum(['pending', 'accepted', 'declined']).default('pending'),
});

export type TeamMemberInvite = z.infer<typeof TeamMemberInviteSchema>;

/** Onboarding progress */
export const OnboardingProgressSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  currentStep: z.number(),
  totalSteps: z.number(),
  percentComplete: z.number().min(0).max(100),
  stepsCompleted: z.array(OnboardingStepSchema),
  workspaceForm: WorkspaceFormSchema.optional(),
  teamMembers: z.array(TeamMemberInviteSchema).optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  skippedSteps: z.array(z.string()).optional(),
});

export type OnboardingProgress = z.infer<typeof OnboardingProgressSchema>;

/** Onboarding session */
export const OnboardingSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  progress: OnboardingProgressSchema,
  status: z.enum(['in_progress', 'completed', 'abandoned']),
  resumeUrl: z.string().optional(),
});

export type OnboardingSession = z.infer<typeof OnboardingSessionSchema>;

// ============================================================================
// MOCK DATA GENERATORS
// ============================================================================

/** Generate onboarding steps */
export function generateOnboardingSteps(): OnboardingStep[] {
  return [
    {
      stepId: 'step_welcome',
      title: 'Welcome to OpsIQ',
      description: 'Let\'s get your workspace set up in just a few minutes',
      completed: false,
      order: 1,
      requiredFields: [],
    },
    {
      stepId: 'step_workspace',
      title: 'Create Workspace',
      description: 'Name your workspace and select your industry',
      completed: false,
      order: 2,
      requiredFields: ['workspaceName', 'industry'],
    },
    {
      stepId: 'step_team',
      title: 'Invite Team Members',
      description: 'Invite colleagues to collaborate on decisions',
      completed: false,
      order: 3,
      requiredFields: [],
    },
    {
      stepId: 'step_basics',
      title: 'Configure Basics',
      description: 'Set communication preferences and notification settings',
      completed: false,
      order: 4,
      requiredFields: [],
    },
    {
      stepId: 'step_complete',
      title: 'You\'re Ready!',
      description: 'Start using OpsIQ to manage your business decisions',
      completed: false,
      order: 5,
      requiredFields: [],
    },
  ];
}

/** Generate mock workspace form data */
export function generateMockWorkspaceForm(overrides?: Partial<WorkspaceForm>): WorkspaceForm {
  return {
    workspaceName: 'My Company Inc',
    industry: 'Technology',
    teamSize: '11-50',
    region: 'US',
    ...overrides,
  };
}

/** Generate mock team member invites */
export function generateMockTeamMembers(count: number = 3): TeamMemberInvite[] {
  const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Emma'];
  const domains = ['example.com', 'company.com', 'work.org'];

  return Array.from({ length: count }, (_, i) => ({
    email: `${firstNames[i % firstNames.length]?.toLowerCase()}.${i}@${domains[i % domains.length]}`,
    role: i === 0 ? 'admin' : 'member',
    invitationId: `inv_${Date.now()}_${i}`,
    invitedAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
    status: ['pending', 'accepted', 'declined'][i % 3] as 'pending' | 'accepted' | 'declined',
  }));
}

/** Generate mock onboarding progress */
export function generateMockOnboardingProgress(partialCompletion: boolean = false): OnboardingProgress {
  const steps = generateOnboardingSteps();
  const completedCount = partialCompletion ? Math.floor(steps.length / 2) : steps.length;

  const stepsCompleted = steps.slice(0, completedCount).map((s) => ({
    ...s,
    completed: true,
  }));

  return {
    workspaceId: `ws_${Date.now()}`,
    userId: 'user_123',
    currentStep: Math.min(completedCount + 1, steps.length),
    totalSteps: steps.length,
    percentComplete: Math.round((completedCount / steps.length) * 100),
    stepsCompleted,
    workspaceForm: generateMockWorkspaceForm(),
    teamMembers: generateMockTeamMembers(3),
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    completedAt: partialCompletion ? undefined : new Date(),
    skippedSteps: partialCompletion ? ['step_basics'] : [],
  };
}

/** Generate mock onboarding session */
export function generateMockOnboardingSession(completed: boolean = false): OnboardingSession {
  const progress = generateMockOnboardingProgress(!completed);

  return {
    sessionId: `session_${Date.now()}`,
    userId: 'user_123',
    progress,
    status: completed ? 'completed' : 'in_progress',
    resumeUrl: completed ? undefined : '/onboarding/workspace',
  };
}

// ============================================================================
// SELF-SERVE ONBOARDING SHELL COMPONENT
// ============================================================================

interface SelfServeOnboardingShellProps {
  initialStep?: number;
  onComplete?: (session: OnboardingSession) => void;
}

export function SelfServeOnboardingShell({
  initialStep = 1,
  onComplete,
}: SelfServeOnboardingShellProps) {
  const steps = generateOnboardingSteps();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [workspaceForm, setWorkspaceForm] = useState(generateMockWorkspaceForm());
  const [teamMembers, setTeamMembers] = useState(generateMockTeamMembers(3));
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [workspaceId] = useState(() => `ws_${Date.now()}`);
  const [startedAt] = useState(() => new Date());

  const progress: OnboardingProgress = {
    workspaceId,
    userId: 'user_123',
    currentStep,
    totalSteps: steps.length,
    percentComplete: Math.round((completedSteps.length / steps.length) * 100),
    stepsCompleted: steps.filter((s) => completedSteps.includes(s.stepId)),
    workspaceForm,
    teamMembers,
    startedAt,
  };

  const handleNextStep = () => {
    if (currentStep < steps.length) {
      setCompletedSteps([...completedSteps, steps[currentStep - 1]?.stepId || '']);
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkipStep = () => {
    setCompletedSteps([...completedSteps, steps[currentStep - 1]?.stepId || '']);
    handleNextStep();
  };

  const handleComplete = () => {
    const session: OnboardingSession = {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      sessionId: `session_${Date.now().toString()}`,
      userId: 'user_123',
      progress: { ...progress, completedAt: new Date() },
      status: 'completed',
    };

    if (onComplete) {
      onComplete(session);
    }
  };

  const currentStepData = steps[currentStep - 1];

  return (
    <div className="w-full max-w-2xl mx-auto p-8 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Get Started with OpsIQ</h1>
        <p className="text-gray-600">Step {currentStep} of {steps.length}</p>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 mb-8">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${progress.percentComplete}%` }}
        />
      </div>

      {/* Step Indicator */}
      <div className="grid grid-cols-5 gap-2 mb-12">
        {steps.map((step, idx) => (
          <div
            key={step.stepId}
            className={`flex items-center justify-center w-full h-12 rounded-lg text-sm font-semibold transition-colors ${
              idx + 1 <= currentStep
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{currentStepData?.title}</h2>
        <p className="text-gray-600 mb-6">{currentStepData?.description}</p>

        {currentStep === 1 && (
          <div className="bg-blue-50 p-6 rounded-lg">
            <p className="text-gray-700">
              Welcome! OpsIQ helps your business make better decisions through guided analysis and intervention tracking.
            </p>
            <ul className="mt-4 space-y-2 text-gray-700">
              <li className="flex items-center">
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-3" />
                Track business decisions and their outcomes
              </li>
              <li className="flex items-center">
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-3" />
                Collaborate with your team
              </li>
              <li className="flex items-center">
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mr-3" />
                Measure business impact
              </li>
            </ul>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Workspace Name</label>
              <input
                type="text"
                value={workspaceForm.workspaceName}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, workspaceName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Industry</label>
              <input
                type="text"
                value={workspaceForm.industry}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, industry: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Team Size</label>
              <select
                value={workspaceForm.teamSize}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, teamSize: e.target.value as WorkspaceForm['teamSize'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">Just me</option>
                <option value="2-10">2-10 people</option>
                <option value="11-50">11-50 people</option>
                <option value="51-100">51-100 people</option>
                <option value="100+">100+ people</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-1">Region</label>
              <select
                value={workspaceForm.region}
                onChange={(e) => setWorkspaceForm({ ...workspaceForm, region: e.target.value as WorkspaceForm['region'] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="US">United States</option>
                <option value="EU">European Union</option>
                <option value="APAC">Asia Pacific</option>
              </select>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-4">Current team members:</p>
              <ul className="space-y-2">
                {teamMembers.map((member) => (
                  <li key={member.email} className="flex justify-between items-center text-sm">
                    <span className="text-gray-900">{member.email}</span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        member.status === 'accepted'
                          ? 'bg-green-100 text-green-800'
                          : member.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {member.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-3">Configure Notification Preferences</h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="ml-2 text-sm text-gray-700">Email reminders for upcoming actions</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="ml-2 text-sm text-gray-700">Weekly summary reports</span>
                </label>
                <label className="flex items-center">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="ml-2 text-sm text-gray-700">Critical alerts and escalations</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="bg-green-50 p-6 rounded-lg text-center">
            <div className="text-4xl mb-4">✓</div>
            <p className="text-lg font-semibold text-green-900 mb-2">Your workspace is ready!</p>
            <p className="text-green-700">Start by creating your first decision or inviting team members.</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-8 border-t border-gray-200">
        <button
          onClick={handlePrevStep}
          disabled={currentStep === 1}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentStep === 1
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          Back
        </button>

        <div className="flex gap-3">
          {currentStep < steps.length && (
            <button
              onClick={handleSkipStep}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Skip
            </button>
          )}
          {currentStep < steps.length ? (
            <button
              onClick={handleNextStep}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="px-6 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Complete Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
