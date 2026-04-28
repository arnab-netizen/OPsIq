import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const OBSERVABILITY_HEALTH_MODULE_KEY = 'observability-health' as const;
export function getObservabilityHealthModuleContract(): OpsiqModuleSpec { return getOpsiqModule(OBSERVABILITY_HEALTH_MODULE_KEY); }
export interface ObservabilityHealthImplementationRecord { readonly moduleKey: typeof OBSERVABILITY_HEALTH_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
