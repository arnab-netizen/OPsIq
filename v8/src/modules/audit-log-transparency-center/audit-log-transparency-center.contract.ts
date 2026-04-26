import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const AUDIT_LOG_TRANSPARENCY_CENTER_MODULE_KEY = 'audit-log-transparency-center' as const;
export function getAuditLogTransparencyCenterModuleContract(): OpsiqModuleSpec { return getOpsiqModule(AUDIT_LOG_TRANSPARENCY_CENTER_MODULE_KEY); }
export interface AuditLogTransparencyCenterImplementationRecord { readonly moduleKey: typeof AUDIT_LOG_TRANSPARENCY_CENTER_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
