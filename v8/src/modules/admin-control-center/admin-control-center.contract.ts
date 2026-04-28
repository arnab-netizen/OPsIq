import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const ADMIN_CONTROL_CENTER_MODULE_KEY = 'admin-control-center' as const;
export function getAdminControlCenterModuleContract(): OpsiqModuleSpec { return getOpsiqModule(ADMIN_CONTROL_CENTER_MODULE_KEY); }
export interface AdminControlCenterImplementationRecord { readonly moduleKey: typeof ADMIN_CONTROL_CENTER_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
