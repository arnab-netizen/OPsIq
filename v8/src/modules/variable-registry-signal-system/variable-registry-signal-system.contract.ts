import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const VARIABLE_REGISTRY_SIGNAL_SYSTEM_MODULE_KEY = 'variable-registry-signal-system' as const;
export function getVariableRegistrySignalSystemModuleContract(): OpsiqModuleSpec { return getOpsiqModule(VARIABLE_REGISTRY_SIGNAL_SYSTEM_MODULE_KEY); }
export interface VariableRegistrySignalSystemImplementationRecord { readonly moduleKey: typeof VARIABLE_REGISTRY_SIGNAL_SYSTEM_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
