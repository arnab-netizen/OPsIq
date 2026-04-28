import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const MIDDLEWARE_SYSTEM_MODULE_KEY = 'middleware-system' as const;
export function getMiddlewareSystemModuleContract(): OpsiqModuleSpec { return getOpsiqModule(MIDDLEWARE_SYSTEM_MODULE_KEY); }
export interface MiddlewareSystemImplementationRecord { readonly moduleKey: typeof MIDDLEWARE_SYSTEM_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
