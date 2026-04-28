import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const HR_CONTRIBUTOR_MODULE_MODULE_KEY = 'hr-contributor-module' as const;
export function getHrContributorModuleModuleContract(): OpsiqModuleSpec { return getOpsiqModule(HR_CONTRIBUTOR_MODULE_MODULE_KEY); }
export interface HrContributorModuleImplementationRecord { readonly moduleKey: typeof HR_CONTRIBUTOR_MODULE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
