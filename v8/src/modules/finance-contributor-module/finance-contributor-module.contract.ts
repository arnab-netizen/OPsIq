import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const FINANCE_CONTRIBUTOR_MODULE_MODULE_KEY = 'finance-contributor-module' as const;
export function getFinanceContributorModuleModuleContract(): OpsiqModuleSpec { return getOpsiqModule(FINANCE_CONTRIBUTOR_MODULE_MODULE_KEY); }
export interface FinanceContributorModuleImplementationRecord { readonly moduleKey: typeof FINANCE_CONTRIBUTOR_MODULE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
