import type { ModuleImplementationPlan } from './implementation-plan.types';
import { OPSIQ_FOUNDATION_IMPLEMENTATION_PLAN } from '../foundation/foundation.implementation-plan';
import { OPSIQ_CONFIG_ENV_IMPLEMENTATION_PLAN } from '../config-env/config-env.implementation-plan';
import { OPSIQ_OBSERVABILITY_HEALTH_IMPLEMENTATION_PLAN } from '../observability-health/observability-health.implementation-plan';
import { OPSIQ_DATABASE_PRISMA_CORE_IMPLEMENTATION_PLAN } from '../database-prisma-core/database-prisma-core.implementation-plan';
import { OPSIQ_AUTH_IDENTITY_IMPLEMENTATION_PLAN } from '../auth-identity/auth-identity.implementation-plan';
import { OPSIQ_RBAC_POLICY_ENFORCEMENT_IMPLEMENTATION_PLAN } from '../rbac-policy-enforcement/rbac-policy-enforcement.implementation-plan';
import { OPSIQ_MIDDLEWARE_SYSTEM_IMPLEMENTATION_PLAN } from '../middleware-system/middleware-system.implementation-plan';
import { OPSIQ_SHARED_DOMAIN_CONTRACTS_IMPLEMENTATION_PLAN } from '../shared-domain-contracts/shared-domain-contracts.implementation-plan';
import { OPSIQ_ORGANIZATION_WORKSPACE_CORE_IMPLEMENTATION_PLAN } from '../organization-workspace-core/organization-workspace-core.implementation-plan';
import { OPSIQ_DIAGNOSIS_ENGINE_IMPLEMENTATION_PLAN } from '../diagnosis-engine/diagnosis-engine.implementation-plan';
import { OPSIQ_BUSINESS_STATE_ENGINE_IMPLEMENTATION_PLAN } from '../business-state-engine/business-state-engine.implementation-plan';
import { OPSIQ_VARIABLE_REGISTRY_SIGNAL_SYSTEM_IMPLEMENTATION_PLAN } from '../variable-registry-signal-system/variable-registry-signal-system.implementation-plan';
import { OPSIQ_TRIGGER_RULES_ENGINE_IMPLEMENTATION_PLAN } from '../trigger-rules-engine/trigger-rules-engine.implementation-plan';
import { OPSIQ_ACTION_ORCHESTRATION_ENGINE_IMPLEMENTATION_PLAN } from '../action-orchestration-engine/action-orchestration-engine.implementation-plan';
import { OPSIQ_FINDINGS_RECOMMENDATIONS_EXPLANATIONS_IMPLEMENTATION_PLAN } from '../findings-recommendations-explanations/findings-recommendations-explanations.implementation-plan';
import { OPSIQ_OWNER_DASHBOARD_VERTICAL_SLICE_IMPLEMENTATION_PLAN } from '../owner-dashboard-vertical-slice/owner-dashboard-vertical-slice.implementation-plan';
import { OPSIQ_REPORT_A_CHANGE_FLOW_IMPLEMENTATION_PLAN } from '../report-a-change-flow/report-a-change-flow.implementation-plan';
import { OPSIQ_WEEKLY_CHECKINS_NUDGES_IMPLEMENTATION_PLAN } from '../weekly-checkins-nudges/weekly-checkins-nudges.implementation-plan';
import { OPSIQ_CONTRIBUTOR_WORKSPACE_CORE_IMPLEMENTATION_PLAN } from '../contributor-workspace-core/contributor-workspace-core.implementation-plan';
import { OPSIQ_FINANCE_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN } from '../finance-contributor-module/finance-contributor-module.implementation-plan';
import { OPSIQ_HR_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN } from '../hr-contributor-module/hr-contributor-module.implementation-plan';
import { OPSIQ_SUPERVISOR_OPERATIONS_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN } from '../supervisor-operations-contributor-module/supervisor-operations-contributor-module.implementation-plan';
import { OPSIQ_SALES_ADMIN_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN } from '../sales-admin-contributor-module/sales-admin-contributor-module.implementation-plan';
import { OPSIQ_DOCUMENT_STORAGE_FILE_HANDLING_IMPLEMENTATION_PLAN } from '../document-storage-file-handling/document-storage-file-handling.implementation-plan';
import { OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_IMPLEMENTATION_PLAN } from '../ocr-document-extraction-pipeline/ocr-document-extraction-pipeline.implementation-plan';
import { OPSIQ_HUMAN_REVIEW_QUEUE_IMPLEMENTATION_PLAN } from '../human-review-queue/human-review-queue.implementation-plan';
import { OPSIQ_CONNECTOR_FRAMEWORK_IMPLEMENTATION_PLAN } from '../connector-framework/connector-framework.implementation-plan';
import { OPSIQ_ACCOUNTING_BANK_INTEGRATIONS_IMPLEMENTATION_PLAN } from '../accounting-bank-integrations/accounting-bank-integrations.implementation-plan';
import { OPSIQ_CRM_SALES_POS_INTEGRATIONS_IMPLEMENTATION_PLAN } from '../crm-sales-pos-integrations/crm-sales-pos-integrations.implementation-plan';
import { OPSIQ_EMAIL_INGESTION_CSV_IMPORT_IMPLEMENTATION_PLAN } from '../email-ingestion-csv-import/email-ingestion-csv-import.implementation-plan';
import { OPSIQ_NOTIFICATIONS_DIGEST_SYSTEM_IMPLEMENTATION_PLAN } from '../notifications-digest-system/notifications-digest-system.implementation-plan';
import { OPSIQ_SCENARIO_ASSUMPTION_ENGINE_IMPLEMENTATION_PLAN } from '../scenario-assumption-engine/scenario-assumption-engine.implementation-plan';
import { OPSIQ_CONFIDENCE_DATA_QUALITY_SYSTEM_IMPLEMENTATION_PLAN } from '../confidence-data-quality-system/confidence-data-quality-system.implementation-plan';
import { OPSIQ_AUDIT_LOG_TRANSPARENCY_CENTER_IMPLEMENTATION_PLAN } from '../audit-log-transparency-center/audit-log-transparency-center.implementation-plan';
import { OPSIQ_SECURITY_PRIVACY_CONTROLS_IMPLEMENTATION_PLAN } from '../security-privacy-controls/security-privacy-controls.implementation-plan';
import { OPSIQ_BACKGROUND_JOBS_ASYNC_PROCESSING_IMPLEMENTATION_PLAN } from '../background-jobs-async-processing/background-jobs-async-processing.implementation-plan';
import { OPSIQ_ADMIN_CONTROL_CENTER_IMPLEMENTATION_PLAN } from '../admin-control-center/admin-control-center.implementation-plan';
import { OPSIQ_TESTING_PACK_IMPLEMENTATION_PLAN } from '../testing-pack/testing-pack.implementation-plan';
import { OPSIQ_CI_CD_RELEASE_OPERATIONS_IMPLEMENTATION_PLAN } from '../ci-cd-release-operations/ci-cd-release-operations.implementation-plan';
import { OPSIQ_SEED_DATA_DEMO_ORG_FIXTURES_IMPLEMENTATION_PLAN } from '../seed-data-demo-org-fixtures/seed-data-demo-org-fixtures.implementation-plan';
import { OPSIQ_WALKING_SKELETON_VERTICAL_SLICE_IMPLEMENTATION_PLAN } from '../walking-skeleton-vertical-slice/walking-skeleton-vertical-slice.implementation-plan';
import { OPSIQ_ADVANCED_UX_POLISH_INFORMATION_ARCHITECTURE_IMPLEMENTATION_PLAN } from '../advanced-ux-polish-information-architecture/advanced-ux-polish-information-architecture.implementation-plan';
import { OPSIQ_EXPORT_PORTABILITY_IMPLEMENTATION_PLAN } from '../export-portability/export-portability.implementation-plan';
import { OPSIQ_RECOVERY_RESILIENCE_TOOLKIT_IMPLEMENTATION_PLAN } from '../recovery-resilience-toolkit/recovery-resilience-toolkit.implementation-plan';
import { OPSIQ_BUSINESS_DEVELOPMENT_GROWTH_TOOLKIT_IMPLEMENTATION_PLAN } from '../business-development-growth-toolkit/business-development-growth-toolkit.implementation-plan';

export const OPSIQ_MODULE_IMPLEMENTATION_PLANS: readonly ModuleImplementationPlan[] = [
  OPSIQ_FOUNDATION_IMPLEMENTATION_PLAN,
  OPSIQ_CONFIG_ENV_IMPLEMENTATION_PLAN,
  OPSIQ_OBSERVABILITY_HEALTH_IMPLEMENTATION_PLAN,
  OPSIQ_DATABASE_PRISMA_CORE_IMPLEMENTATION_PLAN,
  OPSIQ_AUTH_IDENTITY_IMPLEMENTATION_PLAN,
  OPSIQ_RBAC_POLICY_ENFORCEMENT_IMPLEMENTATION_PLAN,
  OPSIQ_MIDDLEWARE_SYSTEM_IMPLEMENTATION_PLAN,
  OPSIQ_SHARED_DOMAIN_CONTRACTS_IMPLEMENTATION_PLAN,
  OPSIQ_ORGANIZATION_WORKSPACE_CORE_IMPLEMENTATION_PLAN,
  OPSIQ_DIAGNOSIS_ENGINE_IMPLEMENTATION_PLAN,
  OPSIQ_BUSINESS_STATE_ENGINE_IMPLEMENTATION_PLAN,
  OPSIQ_VARIABLE_REGISTRY_SIGNAL_SYSTEM_IMPLEMENTATION_PLAN,
  OPSIQ_TRIGGER_RULES_ENGINE_IMPLEMENTATION_PLAN,
  OPSIQ_ACTION_ORCHESTRATION_ENGINE_IMPLEMENTATION_PLAN,
  OPSIQ_FINDINGS_RECOMMENDATIONS_EXPLANATIONS_IMPLEMENTATION_PLAN,
  OPSIQ_OWNER_DASHBOARD_VERTICAL_SLICE_IMPLEMENTATION_PLAN,
  OPSIQ_REPORT_A_CHANGE_FLOW_IMPLEMENTATION_PLAN,
  OPSIQ_WEEKLY_CHECKINS_NUDGES_IMPLEMENTATION_PLAN,
  OPSIQ_CONTRIBUTOR_WORKSPACE_CORE_IMPLEMENTATION_PLAN,
  OPSIQ_FINANCE_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN,
  OPSIQ_HR_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN,
  OPSIQ_SUPERVISOR_OPERATIONS_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN,
  OPSIQ_SALES_ADMIN_CONTRIBUTOR_MODULE_IMPLEMENTATION_PLAN,
  OPSIQ_DOCUMENT_STORAGE_FILE_HANDLING_IMPLEMENTATION_PLAN,
  OPSIQ_OCR_DOCUMENT_EXTRACTION_PIPELINE_IMPLEMENTATION_PLAN,
  OPSIQ_HUMAN_REVIEW_QUEUE_IMPLEMENTATION_PLAN,
  OPSIQ_CONNECTOR_FRAMEWORK_IMPLEMENTATION_PLAN,
  OPSIQ_ACCOUNTING_BANK_INTEGRATIONS_IMPLEMENTATION_PLAN,
  OPSIQ_CRM_SALES_POS_INTEGRATIONS_IMPLEMENTATION_PLAN,
  OPSIQ_EMAIL_INGESTION_CSV_IMPORT_IMPLEMENTATION_PLAN,
  OPSIQ_NOTIFICATIONS_DIGEST_SYSTEM_IMPLEMENTATION_PLAN,
  OPSIQ_SCENARIO_ASSUMPTION_ENGINE_IMPLEMENTATION_PLAN,
  OPSIQ_CONFIDENCE_DATA_QUALITY_SYSTEM_IMPLEMENTATION_PLAN,
  OPSIQ_AUDIT_LOG_TRANSPARENCY_CENTER_IMPLEMENTATION_PLAN,
  OPSIQ_SECURITY_PRIVACY_CONTROLS_IMPLEMENTATION_PLAN,
  OPSIQ_BACKGROUND_JOBS_ASYNC_PROCESSING_IMPLEMENTATION_PLAN,
  OPSIQ_ADMIN_CONTROL_CENTER_IMPLEMENTATION_PLAN,
  OPSIQ_TESTING_PACK_IMPLEMENTATION_PLAN,
  OPSIQ_CI_CD_RELEASE_OPERATIONS_IMPLEMENTATION_PLAN,
  OPSIQ_SEED_DATA_DEMO_ORG_FIXTURES_IMPLEMENTATION_PLAN,
  OPSIQ_WALKING_SKELETON_VERTICAL_SLICE_IMPLEMENTATION_PLAN,
  OPSIQ_ADVANCED_UX_POLISH_INFORMATION_ARCHITECTURE_IMPLEMENTATION_PLAN,
  OPSIQ_EXPORT_PORTABILITY_IMPLEMENTATION_PLAN,
  OPSIQ_RECOVERY_RESILIENCE_TOOLKIT_IMPLEMENTATION_PLAN,
  OPSIQ_BUSINESS_DEVELOPMENT_GROWTH_TOOLKIT_IMPLEMENTATION_PLAN,
] as const;

export function getModuleImplementationPlan(moduleKey: string): ModuleImplementationPlan {
  const plan = OPSIQ_MODULE_IMPLEMENTATION_PLANS.find((candidate) => candidate.moduleKey === moduleKey);
  if (!plan) throw new Error(`Unknown OPSIQ implementation plan: ${moduleKey}`);
  return plan;
}
