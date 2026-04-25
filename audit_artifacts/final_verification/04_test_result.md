
> opsiq@0.1.0 test
> vitest run


 RUN  v4.1.5 /home/user/OPsIq

 ❯ src/auth-guard.test.ts (0 test)
 ❯ src/capability-check.test.ts (0 test)
 ❯ src/errors.test.ts (0 test)
 ❯ src/__tests__/idempotency.test.ts (0 test)
 ❯ src/logger.test.ts (0 test)
 ❯ src/constants/role-labels.test.ts (0 test)
 ❯ src/constants/statuses.test.ts (0 test)
 ❯ src/rate-limit.test.ts (0 test)
 ❯ src/state-transition.test.ts (0 test)
 ❯ src/validation.test.ts (0 test)
 ❯ src/__tests__/visibility.test.ts (0 test)
 ❯ src/services/action.test.ts (0 test)
 ❯ src/services/intervention-state.test.ts (21 tests | 12 failed) 1713ms
       × allows valid transition from assessment to planning 8ms
       × allows valid transition from planning to execution 1ms
       × allows valid transition from execution to review 1ms
       × allows valid transition from review to handover 1ms
       × allows valid transition from handover to closed 1ms
       × allows backward transitions (planning back to assessment) 1ms
       × allows transition from execution to blocked 0ms
       × does not allow invalid transitions (assessment to review) 1ms
       × closed phase has no allowed transitions 1ms
       × includes all required intervention phases 1ms
       × has exactly 6 phases 3ms
       × successfully transitions to allowed phase 2ms
 ❯ src/services/lifecycle.integration.test.ts (10 tests | 10 skipped) 252ms
 ❯ src/services/diagnosis.test.ts (34 tests | 26 failed) 377ms
       × returns critical severity when costs > 125% of revenue 263ms
       × returns high severity when costs > revenue 4ms
       × returns high severity when low_sales with zero customers 5ms
       × returns high severity when low_sales with no customerCount provided 8ms
       × returns medium severity as default when no critical/high conditions met 4ms
       × assigns triage phase for critical severity 4ms
       × assigns stabilization phase for high severity 3ms
       × assigns recovery phase for medium severity 3ms
       × maps low_sales to revenue_generation category 25ms
       × maps high_costs to cost_control category 3ms
       × maps cash_flow to cash_flow_stability category 3ms
       × maps customer_retention to customer_retention category 3ms
       × maps operations to operational_efficiency category 3ms
       × maps unclear to general_business_recovery category 3ms
       × returns complete DiagnosisResult with all required fields 3ms
       × returns at least 5 action plan items 4ms
       × returns action plan items with required fields 3ms
       × returns findings for all diagnosis categories 3ms
       × returns recommendations for all diagnosis categories 2ms
       × completes full diagnosis for critical high_costs scenario 3ms
       × completes full diagnosis for high severity low_sales with no customers 3ms
       × uses orchestrator severity in final diagnosis (critical financial severity) 3ms
       × uses orchestrator category when engine evidence is strong 3ms
       × uses canonical intervention phases from orchestrator 3ms
       × stores engine metadata but final diagnosis uses orchestrator output 3ms
       × mainIssue serves as tiebreaker, not override 3ms
 ❯ src/services/evidence.test.ts (0 test)
 ❯ src/services/evidence-action-lifecycle.test.ts (0 test)
 ❯ src/services/findings.test.ts (0 test)
 ❯ src/services/report-generator.test.ts (0 test)
 ❯ src/services/kpi.test.ts (0 test)
 ❯ src/services/review-cycle.test.ts (0 test)
 ❯ src/services/recommendation.test.ts (0 test)
 ❯ src/services/shock-event.test.ts (0 test)
 ❯ src/services/user.test.ts (0 test)
 ❯ src/services/role-assignment.test.ts (0 test)
 ❯ src/services/visibility.test.ts (0 test)
 ❯ src/lib/__tests__/visibility.test.ts (0 test)
 ❯ src/ui/__tests__/phase9-operator-interface.test.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 26 ⎯⎯⎯⎯⎯⎯

 FAIL  src/auth-guard.test.ts [ src/auth-guard.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/auth-guard.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/64]⎯

 FAIL  src/capability-check.test.ts [ src/capability-check.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/capability-check.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/64]⎯

 FAIL  src/errors.test.ts [ src/errors.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/errors.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/64]⎯

 FAIL  src/logger.test.ts [ src/logger.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/logger.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/64]⎯

 FAIL  src/rate-limit.test.ts [ src/rate-limit.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/rate-limit.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/64]⎯

 FAIL  src/state-transition.test.ts [ src/state-transition.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/state-transition.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/64]⎯

 FAIL  src/validation.test.ts [ src/validation.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/validation.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/64]⎯

 FAIL  src/__tests__/idempotency.test.ts [ src/__tests__/idempotency.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/__tests__/idempotency.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/64]⎯

 FAIL  src/__tests__/visibility.test.ts [ src/__tests__/visibility.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/__tests__/visibility.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/64]⎯

 FAIL  src/constants/role-labels.test.ts [ src/constants/role-labels.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/constants/role-labels.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/64]⎯

 FAIL  src/constants/statuses.test.ts [ src/constants/statuses.test.ts ]
Error: No test suite found in file /home/user/OPsIq/src/constants/statuses.test.ts
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/64]⎯

 FAIL  src/services/action.test.ts [ src/services/action.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/action.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/action.test.ts:6:0
  13 |  const __vi_import_2__ = await import("@/lib/db");
  14 |  const __vi_import_3__ = await import("@/infra/audit");
  15 |  const __vi_import_4__ = await import("@/domain/constants/test-ids");
     |                                       ^
  16 |  import { describe, it, expect, beforeEach, vi } from "vitest";
  17 |  
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/64]⎯

 FAIL  src/services/evidence-action-lifecycle.test.ts [ src/services/evidence-action-lifecycle.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/evidence-action-lifecycle.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/evidence-action-lifecycle.test.ts:11:25
  9  |  import { createUser } from "@/services/user";
  10 |  import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
  11 |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  12 |  describe("Evidence → Finding → Recommendation → Action Lifecycle", () => {
  13 |  	let userId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/64]⎯

 FAIL  src/services/evidence.test.ts [ src/services/evidence.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/evidence.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/evidence.test.ts:13:25
  4  |  import { createEngagement } from "./engagement";
  5  |  import { createClient } from "./client-account";
  6  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  7  |  describe("Evidence Service", () => {
  8  |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/64]⎯

 FAIL  src/services/findings.test.ts [ src/services/findings.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/findings.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/findings.test.ts:16:25
  5  |  import { createEngagement } from "./engagement";
  6  |  import { createClient } from "./client-account";
  7  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  8  |  describe("Findings Service", () => {
  9  |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/64]⎯

 FAIL  src/services/kpi.test.ts [ src/services/kpi.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/kpi.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/kpi.test.ts:15:25
  5  |  import { createEngagement } from "./engagement";
  6  |  import { createClient } from "./client-account";
  7  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  8  |  describe("KPI Service", () => {
  9  |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/64]⎯

 FAIL  src/services/lifecycle.integration.test.ts > Evidence → Finding → Recommendation → Action lifecycle
Error: Failed to setup engagement: PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.create()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ setupEngagement src/services/lifecycle.integration.test.ts:49:13
     47|       return { clientId: client.id, engagementId: engagement.id };
     48|     } catch (e) {
     49|       throw new Error(`Failed to setup engagement: ${e}`);
       |             ^
     50|     }
     51|   }
 ❯ src/services/lifecycle.integration.test.ts:67:19

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/64]⎯

 FAIL  src/services/recommendation.test.ts [ src/services/recommendation.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/recommendation.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/recommendation.test.ts:8:25
  5  |  import { createClient } from "./client-account";
  6  |  import { createFinding } from "./findings";
  7  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  8  |  describe("Recommendation Service", () => {
  9  |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/64]⎯

 FAIL  src/services/report-generator.test.ts [ src/services/report-generator.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/report-generator.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/report-generator.test.ts:18:25
  9  |  import { createAction } from "./action";
  10 |  import { defineKPI, recordKPISnapshot } from "./kpi";
  11 |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  12 |  describe("Report Generation Service", () => {
  13 |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/64]⎯

 FAIL  src/services/review-cycle.test.ts [ src/services/review-cycle.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/review-cycle.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/review-cycle.test.ts:14:25
  7  |  import { createClient } from "./client-account";
  8  |  import { createFinding } from "./findings";
  9  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  10 |  describe("Review Cycle Service", () => {
  11 |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/64]⎯

 FAIL  src/services/role-assignment.test.ts [ src/services/role-assignment.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/role-assignment.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/role-assignment.test.ts:3:25
  1  |  import { describe, it, expect } from "vitest";
  2  |  import { ROLES, ROLE_HIERARCHY } from "@/domain/constants/roles";
  3  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  4  |  // We test the validation logic by extracting it. Since the real service
  5  |  // depends on DB/Prisma, we test the pure business rules here.
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/64]⎯

 FAIL  src/services/shock-event.test.ts [ src/services/shock-event.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/shock-event.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/shock-event.test.ts:11:25
  4  |  import { createEngagement } from "./engagement";
  5  |  import { createClient } from "./client-account";
  6  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  7  |  describe("ShockEvent Service", () => {
  8  |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/64]⎯

 FAIL  src/services/user.test.ts [ src/services/user.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/user.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/user.test.ts:2:25
  1  |  import { describe, it, expect } from "vitest";
  2  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  3  |  // Test the pure business validation rules from UserService.
  4  |  // The actual DB-dependent service logic is tested via integration tests;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/64]⎯

 FAIL  src/services/visibility.test.ts [ src/services/visibility.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/services/visibility.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/services/visibility.test.ts:9:25
  7  |  import { createEvidence } from "./evidence";
  8  |  import { createFinding } from "./findings";
  9  |  import { TEST_IDS } from "@/domain/constants/test-ids";
     |                            ^
  10 |  describe("Visibility Enforcement", () => {
  11 |  	let clientId;
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/64]⎯

 FAIL  src/lib/__tests__/visibility.test.ts [ src/lib/__tests__/visibility.test.ts ]
Error: Failed to resolve import "@/domain/constants/test-ids" from "src/lib/__tests__/visibility.test.ts". Does the file exist?
  Plugin: vite:import-analysis
  File: /home/user/OPsIq/src/lib/__tests__/visibility.test.ts:4:0
  12 |  const __vi_import_0__ = await import("@/lib/visibility");
  13 |  const __vi_import_1__ = await import("@/infra/errors");
  14 |  const __vi_import_2__ = await import("@/domain/constants/test-ids");
     |                                       ^
  15 |  const __vi_import_3__ = await import("@/lib/db");
  16 |  import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
 ❯ TransformPluginContext._formatLog node_modules/vite/dist/node/chunks/node.js:30375:39
 ❯ TransformPluginContext.error node_modules/vite/dist/node/chunks/node.js:30372:14
 ❯ normalizeUrl node_modules/vite/dist/node/chunks/node.js:27654:18
 ❯ node_modules/vite/dist/node/chunks/node.js:27717:30
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:27685:4
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:14
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/64]⎯

 FAIL  src/ui/__tests__/phase9-operator-interface.test.ts [ src/ui/__tests__/phase9-operator-interface.test.ts ]
Error: Transform failed with 1 error:

[31m[PARSE_ERROR] Error:[0m Expected `>` but found `Identifier`
    [38;5;246m╭[0m[38;5;246m─[0m[38;5;246m[[0m src/ui/__tests__/phase9-operator-interface.test.ts:35:35 [38;5;246m][0m
    [38;5;246m│[0m
 [38;5;246m35 │[0m [38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249m [0m[38;5;249mr[0m[38;5;249me[0m[38;5;249mn[0m[38;5;249md[0m[38;5;249me[0m[38;5;249mr[0m[38;5;249m([0m[38;5;249m<[0m[38;5;249mR[0m[38;5;249me[0m[38;5;249mc[0m[38;5;249mo[0m[38;5;249mm[0m[38;5;249mm[0m[38;5;249me[0m[38;5;249mn[0m[38;5;249md[0m[38;5;249ma[0m[38;5;249mt[0m[38;5;249mi[0m[38;5;249mo[0m[38;5;249mn[0m[38;5;249ms[0m[38;5;249mV[0m[38;5;249mi[0m[38;5;249me[0m[38;5;249mw[0m[38;5;249m [0mrecommendations[38;5;249m=[0m[38;5;249m{[0m[38;5;249mr[0m[38;5;249me[0m[38;5;249mc[0m[38;5;249mo[0m[38;5;249mm[0m[38;5;249mm[0m[38;5;249me[0m[38;5;249mn[0m[38;5;249md[0m[38;5;249ma[0m[38;5;249mt[0m[38;5;249mi[0m[38;5;249mo[0m[38;5;249mn[0m[38;5;249ms[0m[38;5;249m}[0m[38;5;249m [0m[38;5;249m/[0m[38;5;249m>[0m[38;5;249m)[0m[38;5;249m;[0m
 [38;5;240m   │[0m                                   ───────┬───────  
 [38;5;240m   │[0m                                          ╰───────── `>` expected
[38;5;246m────╯[0m

  Plugin: vite:oxc
  File: /home/user/OPsIq/src/ui/__tests__/phase9-operator-interface.test.ts
 ❯ transformWithOxc node_modules/vite/dist/node/chunks/node.js:3343:19
 ❯ TransformPluginContext.transform node_modules/vite/dist/node/chunks/node.js:3411:26
 ❯ EnvironmentPluginContainer.transform node_modules/vite/dist/node/chunks/node.js:30164:51
 ❯ loadAndTransform node_modules/vite/dist/node/chunks/node.js:24512:26

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[26/64]⎯


⎯⎯⎯⎯⎯⎯ Failed Tests 38 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - severity calculation > returns critical severity when costs > 125% of revenue
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:113:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[27/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - severity calculation > returns high severity when costs > revenue
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:127:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[28/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - severity calculation > returns high severity when low_sales with zero customers
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:140:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[29/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - severity calculation > returns high severity when low_sales with no customerCount provided
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:152:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[30/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - severity calculation > returns medium severity as default when no critical/high conditions met
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:168:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[31/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - phase assignment > assigns triage phase for critical severity
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:184:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[32/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - phase assignment > assigns stabilization phase for high severity
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:196:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[33/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - phase assignment > assigns recovery phase for medium severity
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:208:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[34/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps low_sales to revenue_generation category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:222:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[35/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps high_costs to cost_control category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:234:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[36/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps cash_flow to cash_flow_stability category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:246:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[37/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps customer_retention to customer_retention category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:258:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[38/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps operations to operational_efficiency category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:270:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[39/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis rules - category mapping > maps unclear to general_business_recovery category
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:282:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[40/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis output structure > returns complete DiagnosisResult with all required fields
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:299:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[41/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis output structure > returns at least 5 action plan items
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:326:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[42/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis output structure > returns action plan items with required fields
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:338:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[43/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis output structure > returns findings for all diagnosis categories
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:366:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[44/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis output structure > returns recommendations for all diagnosis categories
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:387:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[45/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis flow - end-to-end > completes full diagnosis for critical high_costs scenario
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:414:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[46/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > diagnosis flow - end-to-end > completes full diagnosis for high severity low_sales with no customers
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:437:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[47/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > engine layer - orchestrator influences final diagnosis > uses orchestrator severity in final diagnosis (critical financial severity)
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:459:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[48/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > engine layer - orchestrator influences final diagnosis > uses orchestrator category when engine evidence is strong
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:477:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[49/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > engine layer - orchestrator influences final diagnosis > uses canonical intervention phases from orchestrator
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:500:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[50/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > engine layer - orchestrator influences final diagnosis > stores engine metadata but final diagnosis uses orchestrator output
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:517:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[51/64]⎯

 FAIL  src/services/diagnosis.test.ts > diagnosis service > engine layer - orchestrator influences final diagnosis > mainIssue serves as tiebreaker, not override
PrismaClientKnownRequestError: 
Invalid `prisma.clientAccount.findFirst()` invocation:


Can't reach database server at 127.0.0.1:5432
 ❯ zr.handleRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:237:12
 ❯ zr.handleAndLogRequestError node_modules/@prisma/client/src/runtime/RequestHandler.ts:183:11
 ❯ zr.request node_modules/@prisma/client/src/runtime/RequestHandler.ts:152:11
 ❯ a node_modules/@prisma/client/src/runtime/getPrismaClient.ts:963:23
 ❯ diagnoseBusiness src/services/diagnosis.ts:655:16
    653|
    654|   // Get or create client
    655|   let client = await db.clientAccount.findFirst({
       |                ^
    656|     where: { name: input.businessName },
    657|   });
 ❯ src/services/diagnosis.test.ts:547:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[52/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows valid transition from assessment to planning
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'stabilize'
 ❯ src/services/intervention-state.test.ts:52:35
     50|       const to = "stabilize" as InterventionPhase;
     51|       expect(INTERVENTION_PHASES).toContain(from);
     52|       expect(INTERVENTION_PHASES).toContain(to);
       |                                   ^
     53|     });
     54|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[53/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows valid transition from planning to execution
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'stabilize'
 ❯ src/services/intervention-state.test.ts:58:35
     56|       const from = "stabilize" as InterventionPhase;
     57|       const to = "repair" as InterventionPhase;
     58|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     59|       expect(INTERVENTION_PHASES).toContain(to);
     60|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[54/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows valid transition from execution to review
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'repair'
 ❯ src/services/intervention-state.test.ts:65:35
     63|       const from = "repair" as InterventionPhase;
     64|       const to = "strengthen" as InterventionPhase;
     65|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     66|       expect(INTERVENTION_PHASES).toContain(to);
     67|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[55/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows valid transition from review to handover
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'strengthen'
 ❯ src/services/intervention-state.test.ts:72:35
     70|       const from = "strengthen" as InterventionPhase;
     71|       const to = "grow" as InterventionPhase;
     72|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     73|       expect(INTERVENTION_PHASES).toContain(to);
     74|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[56/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows valid transition from handover to closed
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'grow'
 ❯ src/services/intervention-state.test.ts:79:35
     77|       const from = "grow" as InterventionPhase;
     78|       const to = "protect" as InterventionPhase;
     79|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     80|       expect(INTERVENTION_PHASES).toContain(to);
     81|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[57/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows backward transitions (planning back to assessment)
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'stabilize'
 ❯ src/services/intervention-state.test.ts:86:35
     84|       const from = "stabilize" as InterventionPhase;
     85|       const to = "triage" as InterventionPhase;
     86|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     87|       expect(INTERVENTION_PHASES).toContain(to);
     88|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[58/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > allows transition from execution to blocked
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'repair'
 ❯ src/services/intervention-state.test.ts:92:35
     90|     it("allows transition from execution to blocked", () => {
     91|       const from = "repair" as InterventionPhase;
     92|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
     93|     });
     94|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[59/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > does not allow invalid transitions (assessment to review)
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'strengthen'
 ❯ src/services/intervention-state.test.ts:100:35
     98|       // These phases exist but are not directly connected
     99|       expect(INTERVENTION_PHASES).toContain(from);
    100|       expect(INTERVENTION_PHASES).toContain(to);
       |                                   ^
    101|     });
    102|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[60/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition validation > closed phase has no allowed transitions
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'protect'
 ❯ src/services/intervention-state.test.ts:105:35
    103|     it("closed phase has no allowed transitions", () => {
    104|       const from = "protect" as InterventionPhase;
    105|       expect(INTERVENTION_PHASES).toContain(from);
       |                                   ^
    106|     });
    107|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[61/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase constants > includes all required intervention phases
AssertionError: expected [ 'triage', 'stabilization', …(2) ] to include 'stabilize'
 ❯ src/services/intervention-state.test.ts:112:35
    110|     it("includes all required intervention phases", () => {
    111|       expect(INTERVENTION_PHASES).toContain("triage");
    112|       expect(INTERVENTION_PHASES).toContain("stabilize");
       |                                   ^
    113|       expect(INTERVENTION_PHASES).toContain("repair");
    114|       expect(INTERVENTION_PHASES).toContain("strengthen");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[62/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase constants > has exactly 6 phases
AssertionError: expected 4 to be 6 // Object.is equality

- Expected
+ Received

- 6
+ 4

 ❯ src/services/intervention-state.test.ts:120:42
    118|
    119|     it("has exactly 6 phases", () => {
    120|       expect(INTERVENTION_PHASES.length).toBe(6);
       |                                          ^
    121|     });
    122|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[63/64]⎯

 FAIL  src/services/intervention-state.test.ts > Intervention State Service > Phase transition > successfully transitions to allowed phase
ValidationError: Invalid target phase: stabilize. Must be one of: triage, stabilization, recovery, growth
 ❯ validatePhaseTransition src/services/intervention-state.ts:53:11
     51|   }
     52|   if (!INTERVENTION_PHASES.includes(to)) {
     53|     throw new ValidationError(
       |           ^
     54|       `Invalid target phase: ${to}. Must be one of: ${INTERVENTION_PHA…
     55|     );
 ❯ transitionPhase src/services/intervention-state.ts:310:3
 ❯ src/services/intervention-state.test.ts:196:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[64/64]⎯


 Test Files  28 failed | 34 passed (62)
      Tests  38 failed | 489 passed | 10 skipped (537)
   Start at  08:39:23
   Duration  30.94s (transform 19.15s, setup 0ms, import 32.83s, tests 4.32s, environment 330.69s)

