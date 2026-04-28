import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CONFIG_ENV_MODULE_KEY = 'config-env' as const;
export function getConfigEnvModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CONFIG_ENV_MODULE_KEY); }
export interface ConfigEnvImplementationRecord { readonly moduleKey: typeof CONFIG_ENV_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
