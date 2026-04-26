import type { OpsiqModuleSpec } from './types';

export const OPSIQ_MODULE_CATALOG = [
  {
    "packNumber": 1,
    "key": "foundation",
    "name": "Repo Foundation",
    "status": "implemented_by_existing_repo",
    "purpose": "Application shell, shared UI, errors, constants, base repo conventions",
    "dependencies": [],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 2,
    "key": "config-env",
    "name": "Config and Environment System",
    "status": "planned",
    "purpose": "Validated environment, feature flags, staged rollout settings",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 3,
    "key": "observability-health",
    "name": "Observability and Health",
    "status": "partial",
    "purpose": "Structured logging, health and ready endpoints, domain event bridge",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 4,
    "key": "database-prisma-core",
    "name": "Database and Prisma Core",
    "status": "planned",
    "purpose": "Prisma schema, migrations, seeds, DB helpers",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 5,
    "key": "auth-identity",
    "name": "Auth and Identity",
    "status": "planned",
    "purpose": "Authentication, sessions, user and org identity resolution",
    "dependencies": [
      "foundation",
      "config-env",
      "database-prisma-core"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 6,
    "key": "rbac-policy-enforcement",
    "name": "RBAC and Policy Enforcement",
    "status": "planned",
    "purpose": "Roles, permissions, policy guards, scoped access checks",
    "dependencies": [
      "auth-identity",
      "organization-workspace-core",
      "shared-domain-contracts"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 7,
    "key": "middleware-system",
    "name": "Middleware System",
    "status": "planned",
    "purpose": "Root middleware and modular helpers for request protection",
    "dependencies": [
      "auth-identity",
      "organization-workspace-core",
      "shared-domain-contracts"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 8,
    "key": "shared-domain-contracts",
    "name": "Shared Domain Contracts",
    "status": "partial",
    "purpose": "Enums, DTOs, API envelopes, shared validation contracts",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 9,
    "key": "organization-workspace-core",
    "name": "Organization and Workspace Core",
    "status": "planned",
    "purpose": "Organization CRUD, workspace settings, currency and timezone settings",
    "dependencies": [
      "auth-identity",
      "database-prisma-core",
      "shared-domain-contracts"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 10,
    "key": "diagnosis-engine",
    "name": "Diagnosis Engine",
    "status": "implemented_v6",
    "purpose": "Multi-domain diagnosis pipeline and persisted diagnosis route",
    "dependencies": [
      "shared-domain-contracts",
      "organization-workspace-core",
      "database-prisma-core",
      "observability-health"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 11,
    "key": "business-state-engine",
    "name": "Business State Engine",
    "status": "implemented_v6",
    "purpose": "Current truth model, freshness, domain health and history",
    "dependencies": [
      "diagnosis-engine",
      "shared-domain-contracts",
      "database-prisma-core"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 12,
    "key": "variable-registry-signal-system",
    "name": "Variable Registry and Signal System",
    "status": "implemented_v6_partial",
    "purpose": "Variables, freshness rules, dependencies and propagation metadata",
    "dependencies": [
      "diagnosis-engine",
      "shared-domain-contracts",
      "database-prisma-core"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 13,
    "key": "trigger-rules-engine",
    "name": "Trigger and Rules Engine",
    "status": "implemented_v6_partial",
    "purpose": "Change significance, recalculation, alert and replan trigger logic",
    "dependencies": [
      "diagnosis-engine",
      "shared-domain-contracts",
      "database-prisma-core"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 14,
    "key": "action-orchestration-engine",
    "name": "Action Orchestration Engine",
    "status": "implemented_v6_partial",
    "purpose": "Action plans, sequencing, dependencies, success metrics",
    "dependencies": [
      "diagnosis-engine",
      "shared-domain-contracts",
      "database-prisma-core"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 15,
    "key": "findings-recommendations-explanations",
    "name": "Findings Recommendations and Explanations",
    "status": "implemented_v6_partial",
    "purpose": "Findings, recommendations, explanation and change rationale",
    "dependencies": [
      "diagnosis-engine",
      "shared-domain-contracts",
      "database-prisma-core"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 16,
    "key": "owner-dashboard-vertical-slice",
    "name": "Owner Dashboard Vertical Slice",
    "status": "planned",
    "purpose": "Owner overview, health cards, next action and details drawer",
    "dependencies": [
      "business-state-engine",
      "action-orchestration-engine",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 17,
    "key": "report-a-change-flow",
    "name": "Report-a-Change Flow",
    "status": "planned",
    "purpose": "Low-friction event reporting and impact preview",
    "dependencies": [
      "business-state-engine",
      "action-orchestration-engine",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 18,
    "key": "weekly-checkins-nudges",
    "name": "Weekly Check-ins and Nudges",
    "status": "planned",
    "purpose": "Freshness prompts, snooze and reminder completion tracking",
    "dependencies": [
      "business-state-engine",
      "action-orchestration-engine",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 19,
    "key": "contributor-workspace-core",
    "name": "Contributor Workspace Core",
    "status": "planned",
    "purpose": "Restricted contributor inbox and layout",
    "dependencies": [
      "rbac-policy-enforcement",
      "organization-workspace-core"
    ],
    "mergeRisk": "medium",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 20,
    "key": "finance-contributor-module",
    "name": "Finance Contributor Module",
    "status": "planned",
    "purpose": "Cash, costs, invoice exceptions and period close signals",
    "dependencies": [
      "rbac-policy-enforcement",
      "contributor-workspace-core",
      "variable-registry-signal-system"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 21,
    "key": "hr-contributor-module",
    "name": "HR Contributor Module",
    "status": "planned",
    "purpose": "Headcount, absence, staffing pressure and HR-sensitive signals",
    "dependencies": [
      "rbac-policy-enforcement",
      "contributor-workspace-core",
      "variable-registry-signal-system"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 22,
    "key": "supervisor-operations-contributor-module",
    "name": "Supervisor Operations Contributor Module",
    "status": "planned",
    "purpose": "Throughput, downtime, incidents and operations KPI quick entry",
    "dependencies": [
      "rbac-policy-enforcement",
      "contributor-workspace-core",
      "variable-registry-signal-system"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 23,
    "key": "sales-admin-contributor-module",
    "name": "Sales Admin Contributor Module",
    "status": "planned",
    "purpose": "Lost deals, new customers, complaints, retention and pipeline events",
    "dependencies": [
      "rbac-policy-enforcement",
      "contributor-workspace-core",
      "variable-registry-signal-system"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 24,
    "key": "document-storage-file-handling",
    "name": "Document Storage and File Handling",
    "status": "planned",
    "purpose": "Upload, signed URLs, metadata, retention and deletion workflows",
    "dependencies": [
      "security-privacy-controls",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 25,
    "key": "ocr-document-extraction-pipeline",
    "name": "OCR and Document Extraction Pipeline",
    "status": "planned",
    "purpose": "OCR adapters, classification, extraction schema and retry handling",
    "dependencies": [
      "document-storage-file-handling",
      "security-privacy-controls",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 26,
    "key": "human-review-queue",
    "name": "Human Review Queue",
    "status": "planned",
    "purpose": "Low-confidence routing, reviewer UI contracts and correction history",
    "dependencies": [
      "document-storage-file-handling",
      "security-privacy-controls",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 27,
    "key": "connector-framework",
    "name": "Connector Framework",
    "status": "planned",
    "purpose": "Integration connection model, providers, sync jobs and health state",
    "dependencies": [
      "background-jobs-async-processing",
      "security-privacy-controls"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 28,
    "key": "accounting-bank-integrations",
    "name": "Accounting and Bank Integrations",
    "status": "planned",
    "purpose": "Financial connectors, transaction mapping and conflict handling",
    "dependencies": [
      "connector-framework",
      "background-jobs-async-processing",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 29,
    "key": "crm-sales-pos-integrations",
    "name": "CRM Sales POS Integrations",
    "status": "planned",
    "purpose": "Customer, deal, renewal and demand signal mapping",
    "dependencies": [
      "connector-framework",
      "background-jobs-async-processing",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 30,
    "key": "email-ingestion-csv-import",
    "name": "Email Ingestion and CSV Import",
    "status": "planned",
    "purpose": "Inbound email, attachments, CSV mapping and import audit",
    "dependencies": [
      "connector-framework",
      "background-jobs-async-processing",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 31,
    "key": "notifications-digest-system",
    "name": "Notifications and Digest System",
    "status": "planned",
    "purpose": "Notification rules, digest builder, preferences and escalation",
    "dependencies": [
      "trigger-rules-engine",
      "background-jobs-async-processing"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 32,
    "key": "scenario-assumption-engine",
    "name": "Scenario and Assumption Engine",
    "status": "implemented_v6_partial",
    "purpose": "Scenario cases, assumption sets and robustness comparison",
    "dependencies": [
      "business-state-engine",
      "variable-registry-signal-system",
      "diagnosis-engine"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 33,
    "key": "confidence-data-quality-system",
    "name": "Confidence and Data Quality System",
    "status": "implemented_v6_partial",
    "purpose": "Freshness, reliability, completeness and false-certainty control",
    "dependencies": [
      "business-state-engine",
      "variable-registry-signal-system",
      "diagnosis-engine"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "implemented-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 34,
    "key": "audit-log-transparency-center",
    "name": "Audit Log and Transparency Center",
    "status": "partial",
    "purpose": "Audit event builder plus planned append-only log and UI",
    "dependencies": [
      "database-prisma-core",
      "observability-health"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 35,
    "key": "security-privacy-controls",
    "name": "Security and Privacy Controls",
    "status": "planned",
    "purpose": "Redaction, retention, access reviews and privacy workflows",
    "dependencies": [
      "observability-health",
      "database-prisma-core",
      "rbac-policy-enforcement"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 36,
    "key": "background-jobs-async-processing",
    "name": "Background Jobs and Async Processing",
    "status": "planned",
    "purpose": "Queue abstraction, worker runner, retries, schedules and dead letters",
    "dependencies": [
      "database-prisma-core",
      "observability-health",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 37,
    "key": "admin-control-center",
    "name": "Admin Control Center",
    "status": "planned",
    "purpose": "Admin UI contracts for roles, flags, connectors, thresholds and reviews",
    "dependencies": [
      "database-prisma-core",
      "observability-health",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 38,
    "key": "testing-pack",
    "name": "Testing Pack",
    "status": "partial",
    "purpose": "Diagnosis tests plus planned unit, integration and e2e test matrix",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 39,
    "key": "ci-cd-release-operations",
    "name": "CI/CD and Release Operations",
    "status": "planned",
    "purpose": "CI, migration gates, seed steps, release and rollback checks",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 40,
    "key": "seed-data-demo-org-fixtures",
    "name": "Seed Data Demo Orgs and Fixtures",
    "status": "planned",
    "purpose": "Demo orgs, users, diagnosis fixtures and audit history",
    "dependencies": [
      "foundation"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 41,
    "key": "walking-skeleton-vertical-slice",
    "name": "Walking Skeleton Vertical Slice",
    "status": "planned",
    "purpose": "End-to-end login to diagnosis, dashboard, change, action and audit path",
    "dependencies": [
      "auth-identity",
      "diagnosis-engine",
      "business-state-engine",
      "owner-dashboard-vertical-slice",
      "report-a-change-flow",
      "action-orchestration-engine",
      "audit-log-transparency-center"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 42,
    "key": "advanced-ux-polish-information-architecture",
    "name": "Advanced UX Polish and Information Architecture",
    "status": "planned",
    "purpose": "5-second clarity UX patterns, drawers, empty states and mobile tuning",
    "dependencies": [
      "owner-dashboard-vertical-slice",
      "shared-domain-contracts"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 43,
    "key": "export-portability",
    "name": "Export and Portability",
    "status": "planned",
    "purpose": "CSV, JSON, audit, diagnosis, document metadata and data package exports",
    "dependencies": [
      "audit-log-transparency-center",
      "security-privacy-controls",
      "database-prisma-core"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 44,
    "key": "recovery-resilience-toolkit",
    "name": "Recovery and Resilience Toolkit",
    "status": "partial",
    "purpose": "Risk and contingency logic plus planned continuity toolkit",
    "dependencies": [
      "business-state-engine",
      "variable-registry-signal-system",
      "diagnosis-engine"
    ],
    "mergeRisk": "low",
    "runtimePolicy": "existing-or-partial-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  },
  {
    "packNumber": 45,
    "key": "business-development-growth-toolkit",
    "name": "Business Development and Growth Toolkit",
    "status": "planned",
    "purpose": "Demand health, retention, pricing pressure and growth actions",
    "dependencies": [
      "business-state-engine",
      "variable-registry-signal-system",
      "diagnosis-engine"
    ],
    "mergeRisk": "medium-high",
    "runtimePolicy": "contract-only-do-not-call-at-runtime",
    "requiredBeforeImplementation": [
      "read existing repo conventions",
      "confirm Prisma model impact",
      "confirm route namespace",
      "add tests before wiring route"
    ],
    "acceptanceCriteria": [
      "exports typed service and repository ports before implementation",
      "does not bypass RBAC, audit logging, or tenant scoping",
      "has unit tests before production route exposure",
      "uses API envelope and AppError conventions",
      "has explicit migration decision recorded when persistence changes"
    ],
    "defaultRoutes": [],
    "defaultDataStores": []
  }
] as const satisfies readonly OpsiqModuleSpec[];

export type OpsiqModuleKey = (typeof OPSIQ_MODULE_CATALOG)[number]['key'];
