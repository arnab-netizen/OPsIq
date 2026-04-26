import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const DOCUMENT_STORAGE_FILE_HANDLING_MODULE_KEY = 'document-storage-file-handling' as const;
export function getDocumentStorageFileHandlingModuleContract(): OpsiqModuleSpec { return getOpsiqModule(DOCUMENT_STORAGE_FILE_HANDLING_MODULE_KEY); }
export interface DocumentStorageFileHandlingImplementationRecord { readonly moduleKey: typeof DOCUMENT_STORAGE_FILE_HANDLING_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
