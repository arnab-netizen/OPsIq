import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const CONNECTOR_FRAMEWORK_MODULE_KEY = 'connector-framework' as const;
export function getConnectorFrameworkModuleContract(): OpsiqModuleSpec { return getOpsiqModule(CONNECTOR_FRAMEWORK_MODULE_KEY); }
export interface ConnectorFrameworkImplementationRecord { readonly moduleKey: typeof CONNECTOR_FRAMEWORK_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
