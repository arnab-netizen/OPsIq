import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const EMAIL_INGESTION_CSV_IMPORT_MODULE_KEY = 'email-ingestion-csv-import' as const;
export function getEmailIngestionCsvImportModuleContract(): OpsiqModuleSpec { return getOpsiqModule(EMAIL_INGESTION_CSV_IMPORT_MODULE_KEY); }
export interface EmailIngestionCsvImportImplementationRecord { readonly moduleKey: typeof EMAIL_INGESTION_CSV_IMPORT_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
