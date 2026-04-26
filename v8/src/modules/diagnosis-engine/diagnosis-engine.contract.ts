import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const DIAGNOSIS_ENGINE_MODULE_KEY = 'diagnosis-engine' as const;
export function getDiagnosisEngineModuleContract(): OpsiqModuleSpec { return getOpsiqModule(DIAGNOSIS_ENGINE_MODULE_KEY); }
export interface DiagnosisEngineImplementationRecord { readonly moduleKey: typeof DIAGNOSIS_ENGINE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
