import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const TESTING_PACK_MODULE_KEY = 'testing-pack' as const;
export function getTestingPackModuleContract(): OpsiqModuleSpec { return getOpsiqModule(TESTING_PACK_MODULE_KEY); }
export interface TestingPackImplementationRecord { readonly moduleKey: typeof TESTING_PACK_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
