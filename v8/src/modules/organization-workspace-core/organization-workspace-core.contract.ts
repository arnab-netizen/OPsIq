import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const ORGANIZATION_WORKSPACE_CORE_MODULE_KEY = 'organization-workspace-core' as const;
export function getOrganizationWorkspaceCoreModuleContract(): OpsiqModuleSpec { return getOpsiqModule(ORGANIZATION_WORKSPACE_CORE_MODULE_KEY); }
export interface OrganizationWorkspaceCoreImplementationRecord { readonly moduleKey: typeof ORGANIZATION_WORKSPACE_CORE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
