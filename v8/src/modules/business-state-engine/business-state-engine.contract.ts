import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const BUSINESS_STATE_ENGINE_MODULE_KEY = 'business-state-engine' as const;
export function getBusinessStateEngineModuleContract(): OpsiqModuleSpec { return getOpsiqModule(BUSINESS_STATE_ENGINE_MODULE_KEY); }
export interface BusinessStateEngineImplementationRecord { readonly moduleKey: typeof BUSINESS_STATE_ENGINE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
