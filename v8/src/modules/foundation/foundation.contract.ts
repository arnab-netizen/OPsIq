import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const FOUNDATION_MODULE_KEY = 'foundation' as const;
export function getFoundationModuleContract(): OpsiqModuleSpec { return getOpsiqModule(FOUNDATION_MODULE_KEY); }
export interface FoundationImplementationRecord { readonly moduleKey: typeof FOUNDATION_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
