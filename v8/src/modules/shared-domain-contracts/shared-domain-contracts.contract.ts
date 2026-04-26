import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const SHARED_DOMAIN_CONTRACTS_MODULE_KEY = 'shared-domain-contracts' as const;
export function getSharedDomainContractsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(SHARED_DOMAIN_CONTRACTS_MODULE_KEY); }
export interface SharedDomainContractsImplementationRecord { readonly moduleKey: typeof SHARED_DOMAIN_CONTRACTS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
