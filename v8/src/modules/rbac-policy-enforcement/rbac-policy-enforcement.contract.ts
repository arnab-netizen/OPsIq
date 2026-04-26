import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const RBAC_POLICY_ENFORCEMENT_MODULE_KEY = 'rbac-policy-enforcement' as const;
export function getRbacPolicyEnforcementModuleContract(): OpsiqModuleSpec { return getOpsiqModule(RBAC_POLICY_ENFORCEMENT_MODULE_KEY); }
export interface RbacPolicyEnforcementImplementationRecord { readonly moduleKey: typeof RBAC_POLICY_ENFORCEMENT_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
