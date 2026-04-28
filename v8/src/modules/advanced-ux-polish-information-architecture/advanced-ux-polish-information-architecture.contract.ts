import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const ADVANCED_UX_POLISH_INFORMATION_ARCHITECTURE_MODULE_KEY = 'advanced-ux-polish-information-architecture' as const;
export function getAdvancedUxPolishInformationArchitectureModuleContract(): OpsiqModuleSpec { return getOpsiqModule(ADVANCED_UX_POLISH_INFORMATION_ARCHITECTURE_MODULE_KEY); }
export interface AdvancedUxPolishInformationArchitectureImplementationRecord { readonly moduleKey: typeof ADVANCED_UX_POLISH_INFORMATION_ARCHITECTURE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
