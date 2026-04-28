import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const AUTH_IDENTITY_MODULE_KEY = 'auth-identity' as const;
export function getAuthIdentityModuleContract(): OpsiqModuleSpec { return getOpsiqModule(AUTH_IDENTITY_MODULE_KEY); }
export interface AuthIdentityImplementationRecord { readonly moduleKey: typeof AUTH_IDENTITY_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
