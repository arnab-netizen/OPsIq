import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const BUSINESS_DEVELOPMENT_GROWTH_TOOLKIT_MODULE_KEY = 'business-development-growth-toolkit' as const;
export function getBusinessDevelopmentGrowthToolkitModuleContract(): OpsiqModuleSpec { return getOpsiqModule(BUSINESS_DEVELOPMENT_GROWTH_TOOLKIT_MODULE_KEY); }
export interface BusinessDevelopmentGrowthToolkitImplementationRecord { readonly moduleKey: typeof BUSINESS_DEVELOPMENT_GROWTH_TOOLKIT_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
