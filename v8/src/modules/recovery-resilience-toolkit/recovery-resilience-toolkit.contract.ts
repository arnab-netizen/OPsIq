import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const RECOVERY_RESILIENCE_TOOLKIT_MODULE_KEY = 'recovery-resilience-toolkit' as const;
export function getRecoveryResilienceToolkitModuleContract(): OpsiqModuleSpec { return getOpsiqModule(RECOVERY_RESILIENCE_TOOLKIT_MODULE_KEY); }
export interface RecoveryResilienceToolkitImplementationRecord { readonly moduleKey: typeof RECOVERY_RESILIENCE_TOOLKIT_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
