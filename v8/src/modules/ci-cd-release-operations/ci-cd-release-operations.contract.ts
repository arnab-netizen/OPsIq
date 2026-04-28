import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CI_CD_RELEASE_OPERATIONS_MODULE_KEY = 'ci-cd-release-operations' as const;
export function getCiCdReleaseOperationsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CI_CD_RELEASE_OPERATIONS_MODULE_KEY); }
export interface CiCdReleaseOperationsImplementationRecord { readonly moduleKey: typeof CI_CD_RELEASE_OPERATIONS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
