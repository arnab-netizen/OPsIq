import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const FINDINGS_RECOMMENDATIONS_EXPLANATIONS_MODULE_KEY = 'findings-recommendations-explanations' as const;
export function getFindingsRecommendationsExplanationsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(FINDINGS_RECOMMENDATIONS_EXPLANATIONS_MODULE_KEY); }
export interface FindingsRecommendationsExplanationsImplementationRecord { readonly moduleKey: typeof FINDINGS_RECOMMENDATIONS_EXPLANATIONS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
