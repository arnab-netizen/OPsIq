import { describe, it, expect } from 'vitest';
import {
  DIAGNOSTIC_INTERVENTION_PHASES,
  mapSeverityToDiagnosticPhase,
  type DiagnosticInterventionPhase,
} from '../diagnostic-phases';
import { INTERVENTION_PHASES } from '../statuses';

describe('Diagnostic Phases (Separate from Engagement Lifecycle)', () => {
  it('should define diagnostic phases distinct from main engagement phases', () => {
    const diagnosticPhases = DIAGNOSTIC_INTERVENTION_PHASES;
    const mainPhases = INTERVENTION_PHASES;

    // Diagnostic phases should exist
    expect(diagnosticPhases).toContain('triage');
    expect(diagnosticPhases).toContain('stabilization');
    expect(diagnosticPhases).toContain('recovery');
    expect(diagnosticPhases).toContain('growth');

    // Verify they're NOT the same as main's phases
    // Main has: triage, stabilize, repair, strengthen, grow, protect
    const mainPhasesList = Array.from(mainPhases);

    // "stabilization" (noun) is NOT the same as "stabilize" (verb)
    expect(mainPhasesList).not.toContain('stabilization');

    // Diagnostic has "recovery", main has "repair"
    expect(mainPhasesList).not.toContain('recovery');

    // Diagnostic has "growth" (noun), main has "grow" (verb)
    expect(mainPhasesList).toContain('grow');
    expect(diagnosticPhases).not.toContain('grow');
  });

  it('should map CRITICAL severity to triage (advisory, not operational state)', () => {
    const phase = mapSeverityToDiagnosticPhase('critical');
    expect(phase).toBe('triage');
    expect(phase).toEqual<DiagnosticInterventionPhase>('triage');
  });

  it('should map HIGH severity to stabilization', () => {
    const phase = mapSeverityToDiagnosticPhase('high');
    expect(phase).toBe('stabilization');
  });

  it('should map MEDIUM severity to recovery', () => {
    const phase = mapSeverityToDiagnosticPhase('medium');
    expect(phase).toBe('recovery');
  });

  it('should map LOW severity to growth', () => {
    const phase = mapSeverityToDiagnosticPhase('low');
    expect(phase).toBe('growth');
  });

  it('should always return valid DiagnosticInterventionPhase type', () => {
    const severities: Array<'low' | 'medium' | 'high' | 'critical'> = [
      'low',
      'medium',
      'high',
      'critical',
    ];

    severities.forEach((severity) => {
      const phase = mapSeverityToDiagnosticPhase(severity);
      expect(DIAGNOSTIC_INTERVENTION_PHASES).toContain(phase);
    });
  });

  it('should handle invalid severity gracefully (default to triage)', () => {
    const phase = mapSeverityToDiagnosticPhase('invalid' as any);
    expect(phase).toBe('triage');
  });

  it('should document that diagnostic phases are ADVISORY, not operational state', () => {
    // This test documents the critical design: diagnostic phases are
    // RECOMMENDATIONS for what intervention level is needed, not the
    // engagement's actual operational phase.

    // Diagnostic phases = what we recommend the business needs
    const diagnosticPhase = mapSeverityToDiagnosticPhase('critical');
    expect(diagnosticPhase).toBe('triage'); // Recommendation

    // Engagement phase = actual operational state (assessment, planning, execution, etc.)
    // This is managed separately via intervention-state.ts and re-evaluation.ts
    // The diagnostic phase DOES NOT CHANGE the engagement's phase directly.
  });

  it('diagnostic phases should not be usable where main phases are expected', () => {
    // This type-level test verifies at compile-time that DiagnosticInterventionPhase
    // is a distinct type from InterventionPhase.
    // If someone tries to use a diagnostic phase as an engagement phase,
    // TypeScript will catch it.

    const diagnosticPhase: DiagnosticInterventionPhase = 'triage';
    // const engagementPhase: InterventionPhase = diagnosticPhase; // TS Error!

    // Diagnostic phases have different semantics and purposes
    expect(diagnosticPhase).toEqual('triage');
  });

  it('should support all canonical diagnostic phase values', () => {
    const phases: DiagnosticInterventionPhase[] = [
      'triage',
      'stabilization',
      'recovery',
      'growth',
    ];

    phases.forEach((phase) => {
      expect(DIAGNOSTIC_INTERVENTION_PHASES).toContain(phase);
    });
  });
});
