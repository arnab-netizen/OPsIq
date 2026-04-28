import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const WALKING_SKELETON_VERTICAL_SLICE_MODULE_KEY = 'walking-skeleton-vertical-slice' as const;
export function getWalkingSkeletonVerticalSliceModuleContract(): OpsiqModuleSpec { return getOpsiqModule(WALKING_SKELETON_VERTICAL_SLICE_MODULE_KEY); }
export interface WalkingSkeletonVerticalSliceImplementationRecord { readonly moduleKey: typeof WALKING_SKELETON_VERTICAL_SLICE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
