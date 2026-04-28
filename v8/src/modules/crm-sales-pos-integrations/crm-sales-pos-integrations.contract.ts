import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CRM_SALES_POS_INTEGRATIONS_MODULE_KEY = 'crm-sales-pos-integrations' as const;
export function getCrmSalesPosIntegrationsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CRM_SALES_POS_INTEGRATIONS_MODULE_KEY); }
export interface CrmSalesPosIntegrationsImplementationRecord { readonly moduleKey: typeof CRM_SALES_POS_INTEGRATIONS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
