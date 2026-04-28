import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const OWNER_DASHBOARD_VERTICAL_SLICE_MODULE_KEY = 'owner-dashboard-vertical-slice' as const;
export function getOwnerDashboardVerticalSliceModuleContract(): OpsiqModuleSpec { return getOpsiqModule(OWNER_DASHBOARD_VERTICAL_SLICE_MODULE_KEY); }
export interface OwnerDashboardVerticalSliceImplementationRecord { readonly moduleKey: typeof OWNER_DASHBOARD_VERTICAL_SLICE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
