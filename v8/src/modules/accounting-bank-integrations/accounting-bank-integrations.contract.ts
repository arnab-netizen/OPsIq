import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const ACCOUNTING_BANK_INTEGRATIONS_MODULE_KEY = 'accounting-bank-integrations' as const;
export function getAccountingBankIntegrationsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(ACCOUNTING_BANK_INTEGRATIONS_MODULE_KEY); }
export interface AccountingBankIntegrationsImplementationRecord { readonly moduleKey: typeof ACCOUNTING_BANK_INTEGRATIONS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
