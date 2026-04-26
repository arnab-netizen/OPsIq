import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const ACTION_ORCHESTRATION_ENGINE_MODULE_KEY = 'action-orchestration-engine' as const;
export function getActionOrchestrationEngineModuleContract(): OpsiqModuleSpec { return getOpsiqModule(ACTION_ORCHESTRATION_ENGINE_MODULE_KEY); }
export interface ActionOrchestrationEngineImplementationRecord { readonly moduleKey: typeof ACTION_ORCHESTRATION_ENGINE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
