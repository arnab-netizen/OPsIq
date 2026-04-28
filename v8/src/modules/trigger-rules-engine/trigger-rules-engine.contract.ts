import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const TRIGGER_RULES_ENGINE_MODULE_KEY = 'trigger-rules-engine' as const;
export function getTriggerRulesEngineModuleContract(): OpsiqModuleSpec { return getOpsiqModule(TRIGGER_RULES_ENGINE_MODULE_KEY); }
export interface TriggerRulesEngineImplementationRecord { readonly moduleKey: typeof TRIGGER_RULES_ENGINE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
