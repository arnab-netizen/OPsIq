import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const HUMAN_REVIEW_QUEUE_MODULE_KEY = 'human-review-queue' as const;
export function getHumanReviewQueueModuleContract(): OpsiqModuleSpec { return getOpsiqModule(HUMAN_REVIEW_QUEUE_MODULE_KEY); }
export interface HumanReviewQueueImplementationRecord { readonly moduleKey: typeof HUMAN_REVIEW_QUEUE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
