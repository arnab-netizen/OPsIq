import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const SECURITY_PRIVACY_CONTROLS_MODULE_KEY = 'security-privacy-controls' as const;
export function getSecurityPrivacyControlsModuleContract(): OpsiqModuleSpec { return getOpsiqModule(SECURITY_PRIVACY_CONTROLS_MODULE_KEY); }
export interface SecurityPrivacyControlsImplementationRecord { readonly moduleKey: typeof SECURITY_PRIVACY_CONTROLS_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
