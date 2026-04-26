import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const BACKGROUND_JOBS_ASYNC_PROCESSING_MODULE_KEY = 'background-jobs-async-processing' as const;
export function getBackgroundJobsAsyncProcessingModuleContract(): OpsiqModuleSpec { return getOpsiqModule(BACKGROUND_JOBS_ASYNC_PROCESSING_MODULE_KEY); }
export interface BackgroundJobsAsyncProcessingImplementationRecord { readonly moduleKey: typeof BACKGROUND_JOBS_ASYNC_PROCESSING_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
