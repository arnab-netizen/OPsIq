import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const REPORT_A_CHANGE_FLOW_MODULE_KEY = 'report-a-change-flow' as const;
export function getReportAChangeFlowModuleContract(): OpsiqModuleSpec { return getOpsiqModule(REPORT_A_CHANGE_FLOW_MODULE_KEY); }
export interface ReportAChangeFlowImplementationRecord { readonly moduleKey: typeof REPORT_A_CHANGE_FLOW_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
