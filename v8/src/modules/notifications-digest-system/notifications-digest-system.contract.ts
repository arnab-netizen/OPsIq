import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const NOTIFICATIONS_DIGEST_SYSTEM_MODULE_KEY = 'notifications-digest-system' as const;
export function getNotificationsDigestSystemModuleContract(): OpsiqModuleSpec { return getOpsiqModule(NOTIFICATIONS_DIGEST_SYSTEM_MODULE_KEY); }
export interface NotificationsDigestSystemImplementationRecord { readonly moduleKey: typeof NOTIFICATIONS_DIGEST_SYSTEM_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
