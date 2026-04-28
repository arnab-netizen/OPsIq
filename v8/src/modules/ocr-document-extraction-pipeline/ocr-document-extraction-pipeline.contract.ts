import type { OpsiqModuleSpec } from '../module-readiness/types';
import { getOpsiqModule } from '../module-readiness/module-gate';
export const OCR_DOCUMENT_EXTRACTION_PIPELINE_MODULE_KEY = 'ocr-document-extraction-pipeline' as const;
export function getOcrDocumentExtractionPipelineModuleContract(): OpsiqModuleSpec { return getOpsiqModule(OCR_DOCUMENT_EXTRACTION_PIPELINE_MODULE_KEY); }
export interface OcrDocumentExtractionPipelineImplementationRecord { readonly moduleKey: typeof OCR_DOCUMENT_EXTRACTION_PIPELINE_MODULE_KEY; readonly implementationStage: 'contract' | 'service' | 'repository' | 'route' | 'ui' | 'tested' | 'released'; readonly version: string; readonly changedBy: string; readonly changedAt: string; readonly evidenceRefs: readonly string[]; readonly riskNotes: readonly string[]; }
