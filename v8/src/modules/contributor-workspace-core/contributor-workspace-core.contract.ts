import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CONTRIBUTOR_WORKSPACE_CORE_MODULE_KEY = 'contributor-workspace-core' as const;
export function getContributorWorkspaceCoreModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CONTRIBUTOR_WORKSPACE_CORE_MODULE_KEY); }
export interface ContributorWorkspaceCoreImplementationRecord { readonly moduleKey: typeof CONTRIBUTOR_WORKSPACE_CORE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
