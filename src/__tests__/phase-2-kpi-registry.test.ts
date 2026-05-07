// Phase 2 Slice 8: KPIRegistry - Canonicalize KPI Formulas
// Tests verify canonical KPI formula definitions and interpretations

import { describe, it, expect } from 'vitest';
import { KPIFormulaType } from '../domain/kpi-registry';
import { KPIRegistryService } from '../services/kpi-registry';

describe('Phase 2 Slice 8 — KPIRegistry: Canonical KPI Formulas', () => {
  describe('Contract', () => {
    it('validates KPI formula schema', () => {
      const formula = {
        id: '550e8400-e29b-41d4-a716-446655440700',
        formulaName: 'Revenue Growth %',
        formulaType: 'revenue_growth' as const,
        canonicalDefinition: '((Current - Prior) / Prior) × 100',
        unit: '%',
        direction: 'up' as const,
        inputParameters: [
          { paramName: 'Current', paramType: 'currency' as const, required: true },
          { paramName: 'Prior', paramType: 'currency' as const, required: true },
        ],
        workspaceId: '550e8400-e29b-41d4-a716-446655440000',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const validated = KPIRegistryService.validateFormula(formula);
      expect(validated.formulaName).toBe('Revenue Growth %');
      expect(validated.formulaType).toBe('revenue_growth');
    });

    it('throws on invalid formula data', () => {
      const invalid = {
        formulaName: '',
        formulaType: 'invalid_type',
      };

      expect(() => KPIRegistryService.validateFormula(invalid)).toThrow();
    });
  });

  describe('Behavior - Standard Formula Access', () => {
    it('retrieves canonical formula by type', () => {
      const formula = KPIRegistryService.getCanonicalFormula('revenue_growth');
      expect(formula).toBeDefined();
      expect(formula?.formulaName).toBe('Revenue Growth %');
      expect(formula?.direction).toBe('up');
    });

    it('returns null for unknown formula type', () => {
      const formula = KPIRegistryService.getCanonicalFormula('custom' as KPIFormulaType);
      expect(formula).toBeNull();
    });

    it('retrieves all standard formulas', () => {
      const formulas = KPIRegistryService.getAllStandardFormulas();
      expect(formulas.length).toBeGreaterThan(0);
      expect(formulas.some((f) => f.formulaType === 'revenue_growth')).toBe(true);
      expect(formulas.some((f) => f.formulaType === 'churn_rate')).toBe(true);
    });
  });

  describe('Behavior - KPI Conformance Validation', () => {
    it('validates KPI conforms to known formula', () => {
      const isValid = KPIRegistryService.validateKPIConformance(
        'Monthly Revenue Growth',
        'revenue_growth'
      );
      expect(isValid).toBe(true);
    });

    it('rejects empty KPI name', () => {
      const isValid = KPIRegistryService.validateKPIConformance('', 'revenue_growth');
      expect(isValid).toBe(false);
    });

    it('rejects short KPI name', () => {
      const isValid = KPIRegistryService.validateKPIConformance('RG', 'revenue_growth');
      expect(isValid).toBe(false);
    });

    it('rejects KPI with unknown formula type', () => {
      const isValid = KPIRegistryService.validateKPIConformance(
        'Some Metric',
        'custom' as KPIFormulaType
      );
      expect(isValid).toBe(false);
    });
  });

  describe('Behavior - Direction Interpretation', () => {
    it('interprets revenue_growth as higher-is-better', () => {
      const direction = KPIRegistryService.getDirectionInterpretation('revenue_growth');
      expect(direction).toBe('higher_is_better');
    });

    it('interprets churn_rate as lower-is-better', () => {
      const direction = KPIRegistryService.getDirectionInterpretation('churn_rate');
      expect(direction).toBe('lower_is_better');
    });

    it('interprets cash_burn_rate as lower-is-better', () => {
      const direction = KPIRegistryService.getDirectionInterpretation('cash_burn_rate');
      expect(direction).toBe('lower_is_better');
    });

    it('returns unknown for undefined formula type', () => {
      const direction = KPIRegistryService.getDirectionInterpretation('custom' as KPIFormulaType);
      expect(direction).toBe('unknown');
    });
  });

  describe('Behavior - KPI Health Assessment', () => {
    it('assesses healthy revenue growth (value >= good threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('revenue_growth', 25);
      expect(health).toBe('healthy');
    });

    it('assesses acceptable revenue growth (value >= acceptable threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('revenue_growth', 12);
      expect(health).toBe('acceptable');
    });

    it('assesses warning revenue growth (value >= warning threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('revenue_growth', 7);
      expect(health).toBe('warning');
    });

    it('assesses critical revenue growth (value < critical threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('revenue_growth', -15);
      expect(health).toBe('critical');
    });

    it('assesses healthy churn rate (value <= good threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('churn_rate', 1);
      expect(health).toBe('healthy');
    });

    it('assesses critical churn rate (value >= critical threshold)', () => {
      const health = KPIRegistryService.assessKPIHealth('churn_rate', 20);
      expect(health).toBe('critical');
    });

    it('returns unknown for formula without thresholds', () => {
      const health = KPIRegistryService.assessKPIHealth('custom' as KPIFormulaType, 50);
      expect(health).toBe('unknown');
    });
  });

  describe('Acceptance Criteria #7', () => {
    it('criterion #7 satisfied: KPI formulas are canonicalized', () => {
      // Verify all required standard formulas exist
      const formulas = KPIRegistryService.getAllStandardFormulas();
      const formulaTypes = formulas.map((f) => f.formulaType);

      expect(formulaTypes).toContain('revenue_growth');
      expect(formulaTypes).toContain('customer_acquisition_cost');
      expect(formulaTypes).toContain('churn_rate');
      expect(formulaTypes).toContain('gross_margin');
      expect(formulaTypes).toContain('cash_burn_rate');

      // Verify each formula has canonical definition
      formulas.forEach((formula) => {
        expect(formula.canonicalDefinition).toBeDefined();
        expect(formula.canonicalDefinition.length).toBeGreaterThan(0);
        expect(formula.direction).toMatch(/^(up|down)$/);
        expect(formula.unit).toBeDefined();
      });

      // Verify input parameters are defined
      formulas.forEach((formula) => {
        expect(Array.isArray(formula.inputParameters)).toBe(true);
        formula.inputParameters.forEach((param) => {
          expect(param.paramName).toBeDefined();
          expect(param.paramType).toMatch(/^(number|percentage|currency|date)$/);
        });
      });

      // Verify service can canonicalize any known formula type
      const knownTypes: KPIFormulaType[] = [
        'revenue_growth',
        'customer_acquisition_cost',
        'churn_rate',
      ];
      knownTypes.forEach((type) => {
        const formula = KPIRegistryService.getCanonicalFormula(type);
        expect(formula).toBeDefined();
        expect(formula?.formulaType).toBe(type);
      });
    });
  });
});
