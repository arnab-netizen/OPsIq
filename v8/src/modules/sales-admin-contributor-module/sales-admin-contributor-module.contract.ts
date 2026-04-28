import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const SALES_ADMIN_CONTRIBUTOR_MODULE_MODULE_KEY = 'sales-admin-contributor-module' as const;
export function getSalesAdminContributorModuleModuleContract(): OpsiqModuleSpec { return getOpsiqModule(SALES_ADMIN_CONTRIBUTOR_MODULE_MODULE_KEY); }
export interface SalesAdminContributorModuleImplementationRecord { readonly moduleKey: typeof SALES_ADMIN_CONTRIBUTOR_MODULE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
