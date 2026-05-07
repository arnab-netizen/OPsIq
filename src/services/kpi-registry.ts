// Service for managing canonical KPI formula registry
// Phase 2 Acceptance Criterion #7: "KPI formulas are canonicalized"

import {
  CreateKPIFormulaRequest,
  CreateKPIFormulaRequestSchema,
  KPIFormula,
  KPIFormulaSchema,
  KPIFormulaType,
  STANDARD_KPI_FORMULAS,
} from '../domain/kpi-registry';

export class KPIRegistryService {
  /**
   * Get canonical formula by type
   */
  static getCanonicalFormula(formulaType: KPIFormulaType): Omit<KPIFormula, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'> | null {
    const formula = STANDARD_KPI_FORMULAS.find((f) => f.formulaType === formulaType);
    return formula || null;
  }

  /**
   * Get all available standard formulas
   */
  static getAllStandardFormulas(): Omit<KPIFormula, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>[] {
    return STANDARD_KPI_FORMULAS;
  }

  /**
   * Validate that a KPI conforms to a known formula type
   */
  static validateKPIConformance(kpiName: string, formulaType: KPIFormulaType): boolean {
    const canonical = this.getCanonicalFormula(formulaType);
    if (!canonical) return false;

    // Name should be reasonable (not empty, has at least 3 chars)
    if (!kpiName || kpiName.length < 3) return false;

    return true;
  }

  /**
   * Assess formula completeness (has all required inputs?)
   */
  static assessFormulaCompleteness(formula: KPIFormula): {
    isComplete: boolean;
    missingParameters: string[];
  } {
    if (!formula.inputParameters || formula.inputParameters.length === 0) {
      return { isComplete: true, missingParameters: [] };
    }

    const requiredParams = formula.inputParameters.filter((p) => p.required);
    const missingParameters: string[] = [];

    // If no values provided, check which are required
    if (requiredParams.length > 0) {
      missingParameters.push(...requiredParams.map((p) => p.paramName));
    }

    return {
      isComplete: missingParameters.length === 0,
      missingParameters,
    };
  }

  /**
   * Calculate expected direction interpretation (is higher better?)
   */
  static getDirectionInterpretation(
    formulaType: KPIFormulaType
  ): 'higher_is_better' | 'lower_is_better' | 'unknown' {
    const formula = this.getCanonicalFormula(formulaType);
    if (!formula) return 'unknown';

    return formula.direction === 'up' ? 'higher_is_better' : 'lower_is_better';
  }

  /**
   * Assess if a KPI value is healthy based on standard thresholds
   */
  static assessKPIHealth(
    formulaType: KPIFormulaType,
    currentValue: number
  ): 'healthy' | 'acceptable' | 'warning' | 'critical' | 'unknown' {
    const formula = this.getCanonicalFormula(formulaType);
    if (!formula || !formula.standardThreshold) return 'unknown';

    const { good, acceptable, warning, critical } = formula.standardThreshold;

    if (formula.direction === 'up') {
      // Higher is better: good > acceptable > warning > critical
      if (good !== null && currentValue >= good) return 'healthy';
      if (acceptable !== null && currentValue >= acceptable) return 'acceptable';
      if (warning !== null && currentValue >= warning) return 'warning';
      return 'critical';
    } else {
      // Lower is better: critical < warning < acceptable < good
      if (good !== null && currentValue <= good) return 'healthy';
      if (acceptable !== null && currentValue <= acceptable) return 'acceptable';
      if (warning !== null && currentValue <= warning) return 'warning';
      if (critical !== null && currentValue <= critical) return 'critical';
      return 'critical'; // Beyond critical threshold
    }
  }

  static validateRequest(request: unknown): CreateKPIFormulaRequest {
    return CreateKPIFormulaRequestSchema.parse(request);
  }

  static validateFormula(formula: unknown): KPIFormula {
    return KPIFormulaSchema.parse(formula);
  }
}
