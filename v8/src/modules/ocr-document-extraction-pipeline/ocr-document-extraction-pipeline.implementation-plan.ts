import type { ModuleImplementationPlan } from '../module-readiness/implementation-plan.types';

export const OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_IMPLEMENTATION_PLAN: ModuleImplementationPlan = {
  "moduleKey": "ocr-document-extraction-pipeline",
  "packNumber": 25,
  "moduleName": "OCR and Document Extraction Pipeline",
  "objective": "OCR adapters, classification, extraction schema and retry handling",
  "dependencies": [
    "document-storage-file-handling",
    "security-privacy-controls",
    "audit-log-transparency-center"
  ],
  "requiredArtifacts": [
    "src/modules/ocr-document-extraction-pipeline/ocr-document-extraction-pipeline.service.ts",
    "src/modules/ocr-document-extraction-pipeline/ocr-document-extraction-pipeline.repository.ts",
    "src/modules/ocr-document-extraction-pipeline/ocr-document-extraction-pipeline.validation.ts",
    "src/modules/ocr-document-extraction-pipeline/__tests__/ocr-document-extraction-pipeline.service.test.ts",
    "prisma/schema.prisma migration block"
  ],
  "recommendedDataModels": [
    "ExtractionJob",
    "ExtractedField",
    "DocumentClassification"
  ],
  "featureFlags": [
    "OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_ENABLED",
    "OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_READ_ONLY_MODE"
  ],
  "permissionKeys": [
    "ocr_document_extraction_pipeline:read",
    "ocr_document_extraction_pipeline:write",
    "ocr_document_extraction_pipeline:admin"
  ],
  "enterpriseGates": [
    "Tenant scoping cannot be optional.",
    "RBAC/policy gate must be executed before state mutation or sensitive read.",
    "All public API output must use the standard response envelope.",
    "Every state mutation must produce an audit event or explicit no-audit rationale.",
    "All persistence changes require migration review and rollback notes.",
    "Tests must cover success, unauthorized, invalid input, and tenant-isolation cases."
  ],
  "implementationPhases": [
    "contract_present",
    "schema_designed",
    "repository_implemented",
    "service_implemented",
    "routes_wired",
    "tests_green",
    "production_enabled"
  ],
  "runtimeExposure": "none"
} as const;

export function getOcrDocumentExtractionPipelineImplementationPlan(): ModuleImplementationPlan {
  return OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_IMPLEMENTATION_PLAN;
}
