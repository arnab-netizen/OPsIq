import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CONFIDENCE_DATA_QUALITY_SYSTEM_MODULE_KEY = 'confidence-data-quality-system' as const;
export function getConfidenceDataQualitySystemModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CONFIDENCE_DATA_QUALITY_SYSTEM_MODULE_KEY); }
export interface ConfidenceDataQualitySystemImplementationRecord { readonly moduleKey: typeof CONFIDENCE_DATA_QUALITY_SYSTEM_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
