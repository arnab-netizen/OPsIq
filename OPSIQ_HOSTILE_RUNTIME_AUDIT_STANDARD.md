OPSIQ HOSTILE RUNTIME AUDIT STANDARD

Version: 3.0
Status: Mandatory for OpsIQ audits, PR reviews, readiness checks, post-merge reviews, and runtime-remediation verification.

⸻

0. PURPOSE

This file defines the mandatory hostile runtime audit standard for OpsIQ.

It must be used after implementation slices, PRs, major changes, runtime changes, route changes, service changes, schema changes, UI changes, proof-loop changes, ingestion changes, learning changes, value-output changes, governance changes, and readiness claims.

This standard exists because OpsIQ previously passed extensive corpus, DB, browser, mobile, and no-regression checks while still missing real-business runtime blockers:

* real owner ingestion was incomplete;
* critical domains were unwritable;
* CSV/manual intake did not materialize into read models;
* proof loops existed but were production-inert;
* task/proof requirements were not created by real production paths;
* learning/outcome stores wrote data that did not affect future recommendations;
* schema-invalid Prisma queries survived in production services;
* auth/security scanners were non-blocking or quarantined;
* browser tests sometimes proved rendering, not real data causality;
* corpus proof validated judgment on prepared data, not full real owner operation.

This must not happen again.

The central audit question is:

Can a real owner, using the running app with real messy business data, complete the full loop: enter data → receive a correct recommendation → delegate action → require proof → submit proof → update outcome → trigger reassessment → learn from results → see quantified value or exact missing inputs — without fake confidence, unsafe action, data leakage, hidden failure, or overclaiming?

If this is not proven, the slice is not owner-runtime-ready.

⸻

1. EXECUTION MODE ADDENDUM — DO NOT WASTE TIME, DO NOT TRIGGER CI

The full hostile audit standard must not be blindly run at maximum depth after every tiny implementation slice. That wastes time and creates audit theatre.

Instead, every audit must first select the correct audit tier.

The goal is:

1. strict hostile checking after every change;
2. no repeated missed blockers;
3. no unnecessary CI triggering;
4. no broad repo audit after a tiny local change unless risk justifies it;
5. no merge/readiness claim without evidence;
6. no overclaiming;
7. no audit becoming a substitute for real proof.

⸻

1.1 DEFAULT RULE: DO NOT TRIGGER CI

Unless the owner explicitly says to trigger CI, the audit must not:

1. push just to trigger CI;
2. open a PR just to trigger CI;
3. run workflow_dispatch;
4. re-run GitHub Actions;
5. change workflow files;
6. broaden workflow triggers;
7. create dummy commits;
8. merge to force CI;
9. mark missing CI as passed.

Audits may inspect existing CI results if a PR already exists.

Audits may recommend CI.

Audits may prepare the PR body/checklist.

But audits must not trigger CI unless explicitly authorized.

If CI is needed but not running, the audit must say:

CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT

⸻

2. AUDIT TIER SELECTION

At the start of every audit, classify the change into one audit tier.

⸻

2.1 Tier 0 — Micro/Slice Audit

Use after small implementation slices.

Examples:

1. one route wrapper changed;
2. one service query fixed;
3. one validation bug fixed;
4. one DB test added;
5. one UI field wired;
6. one report/doc update;
7. one narrow proof-path fix.

Tier 0 must be strict but fast.

Do not trigger CI.

Do not open PR.

Do not run full corpus.

Do not run all browser/mobile tests unless the change is UI-facing or owner-visible.

Do not create a full evidence ledger unless the slice affects owner-runtime readiness.

Required Tier 0 output:

OPSIQ_<SLICE_NAME>_MICRO_HOSTILE_AUDIT.md

Required checks:

1. changed files reviewed;
2. exact claim identified;
3. production-vs-test path classified;
4. touched route/service/schema/UI path inspected;
5. affected Prisma queries checked against schema;
6. auth/workspace/business isolation checked if route/service/query touched;
7. HTTP status honesty checked if route touched;
8. data lineage checked if data write/read changed;
9. loop closure checked if proof/outcome/learning/reassessment changed;
10. owner-visible output checked if UI/dashboard changed;
11. local targeted tests listed;
12. no overclaim;
13. no gate weakening;
14. no seed-only proof accepted;
15. blockers/majors/minors listed;
16. next required proof listed.

Tier 0 allowed classifications:

1. MICRO_AUDIT_FAILED
2. MICRO_AUDIT_BLOCKED
3. MICRO_AUDIT_PASS_WITH_LIMITATIONS
4. MICRO_AUDIT_PASS_TARGETED_ONLY

Tier 0 may not claim:

1. OWNER_RUNTIME_READY
2. LOOP_CLOSED
3. LIVE_OUTCOME_PROVEN
4. PUBLIC_SAAS_READY

unless the full relevant runtime loop was actually proven.

⸻

2.2 Tier 1 — PR Readiness Audit

Use before opening a PR or before merging a narrow PR.

Examples:

1. a few related route/service fixes;
2. a narrow runtime-remediation slice;
3. an auth wrapper migration batch;
4. a query-sweep batch;
5. a small owner-visible feature.

Tier 1 must be stricter than Tier 0 but still must not manually trigger CI.

Do not trigger CI manually.

If PR exists, inspect existing CI.

If PR does not exist, audit local proof and state which CI must run after PR opening.

Required Tier 1 output:

1. OPSIQ_<SLICE_NAME>_PR_READINESS_AUDIT.md
2. OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json only if the PR claims route/runtime/owner-loop readiness.

Required checks:

1. all Tier 0 checks;
2. claim-to-proof matrix;
3. route/UI/service reachability table for touched features;
4. data lineage table for touched data flows;
5. targeted DB proof;
6. targeted browser/mobile proof if owner-visible;
7. ignored/quarantined tests relevant to touched area identified;
8. workflow/CI requiredness listed only for relevant workflows;
9. merge blockers identified;
10. PR body readiness checked.

Tier 1 allowed classifications:

1. PR_AUDIT_FAILED
2. PR_AUDIT_BLOCKED
3. PR_READY_LOCAL_ONLY
4. PR_READY_PENDING_CI
5. PR_READY_WITH_DEFERRED_DECISIONS

Tier 1 may recommend opening a PR, but must say:

CI not triggered by this audit. CI must be evaluated after PR opening or existing PR update.

⸻

2.3 Tier 2 — Major Runtime Gate Audit

Use after major changes or before merging high-risk PRs.

Trigger Tier 2 if any of these changed:

1. ingestion;
2. owner whole-business plan;
3. proof/task/work-order loop;
4. outcome/learning/reassessment;
5. finance/value/profit output;
6. auth/session/enforcement;
7. workspace/business isolation;
8. Prisma schema or migration;
9. route wrapper policy;
10. dashboard owner command center;
11. scheduler/background jobs;
12. notification/escalation semantics;
13. scenario/corpus generation or proof harness;
14. CI/gate/workflow configuration.

Tier 2 uses the full hostile audit standard, but still must not manually trigger CI unless explicitly authorized.

Required Tier 2 output:

1. OPSIQ_<SLICE_NAME>_HOSTILE_AUDIT.md
2. OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json
3. OPSIQ_RUNTIME_READINESS_REMEDIATION_TRACKER.md if blockers/majors exist.

Required checks:

1. full claim-to-proof matrix;
2. full route/UI/service inventory for changed features;
3. full data lineage for changed flows;
4. real owner runtime loop proof;
5. ingestion proof if relevant;
6. proof/task/execution proof if relevant;
7. outcome/learning/reassessment proof if relevant;
8. value/profit output proof if relevant;
9. schema query validity scan for touched and adjacent services;
10. auth/workspace/business isolation proof;
11. HTTP semantics proof;
12. desktop/mobile proof if owner-visible;
13. ignored/quarantined relevant tests check;
14. existing CI status inspection if PR exists;
15. no overclaim;
16. remediation queue for unresolved issues.

Tier 2 allowed classifications:

1. HOSTILE_AUDIT_FAILED
2. HOSTILE_AUDIT_BLOCKED
3. MAJOR_RUNTIME_GATE_PARTIAL
4. MAJOR_RUNTIME_GATE_READY_PENDING_CI
5. MAJOR_RUNTIME_GATE_READY

Tier 2 may not mark MAJOR_RUNTIME_GATE_READY unless local proof is complete and existing CI, if present, is green.

If CI has not been triggered, classification must be:

MAJOR_RUNTIME_GATE_READY_PENDING_CI

⸻

2.4 Tier 3 — Post-Merge / Milestone Audit

Use after:

1. a major remediation chain is merged;
2. multiple PRs land;
3. corpus/milestone completion;
4. schema/auth/runtime gate change;
5. any blocker class is discovered;
6. before live pilot readiness;
7. before public SaaS readiness.

Tier 3 is the full standard plus whole-repo consistency audit.

Do not trigger CI manually unless explicitly authorized.

Required Tier 3 output:

1. OPSIQ_<MILESTONE>_POST_MERGE_HOSTILE_AUDIT.md
2. OPSIQ_<MILESTONE>_EVIDENCE_LEDGER.json
3. updated remediation tracker;
4. updated audit standard if a new missed blocker class is found.

Required checks:

1. all Tier 2 checks;
2. merged PR list;
3. final main HEAD;
4. whole-repo changed-risk review;
5. cumulative blockers;
6. repeated blocker class check;
7. ignored/quarantined critical test review;
8. required CI status review from existing runs;
9. runtime readiness classification;
10. next remediation sequence.

Tier 3 allowed classifications:

1. POST_MERGE_AUDIT_FAILED
2. POST_MERGE_AUDIT_BLOCKED
3. MILESTONE_ACCOUNTING_VERIFIED
4. MILESTONE_RUNTIME_PARTIAL
5. MILESTONE_RUNTIME_READY_PENDING_CI
6. MILESTONE_RUNTIME_READY

⸻

3. AUDIT DEPTH DECISION TABLE

Use this table before running an audit.

Change Type	Default Audit Tier	CI Trigger Allowed?	Browser/Mobile Required?	Evidence Ledger Required?
Docs only	Tier 0	No	No	No
Test only	Tier 0	No	No	No
One service query fix	Tier 0	No	No, unless owner-visible	No, unless runtime claim
One route wrapper fix	Tier 0 or 1	No	No, unless owner-visible	If route-readiness claimed
Narrow DB/service runtime fix	Tier 1	No	If owner-visible	Yes if runtime claim
Owner-visible UI/dashboard change	Tier 1 or 2	No	Yes	Yes
Ingestion/materialization change	Tier 2	No	Yes if owner-facing	Yes
Proof/task/work-order change	Tier 2	No	Yes if owner-facing	Yes
Outcome/learning/reassessment change	Tier 2	No	Yes if owner-facing	Yes
Finance/value/profit output change	Tier 2	No	Yes	Yes
Auth/session/enforcement change	Tier 2	No	If route owner-facing	Yes
Prisma schema/migration	Tier 2	No	If owner-facing	Yes
CI/workflow/gate change	Tier 2	No	No	Yes
Multi-PR chain completion	Tier 3	No	As relevant	Yes
Live pilot readiness claim	Tier 3	No unless owner explicitly authorizes	Yes	Yes

⸻

4. NO-CI LOCAL AUDIT COMMAND POLICY

During Tier 0, Tier 1, and Tier 2 audits, Claude may run local commands only.

Allowed local commands include:

1. git status
2. git diff
3. git log
4. git grep
5. rg
6. npm run typecheck or equivalent if already local
7. targeted unit tests
8. targeted DB tests if local DB is available
9. targeted Playwright tests only if owner-visible behavior changed
10. Prisma validate
11. lint/ratchet if local and already part of normal proof

Forbidden unless explicitly authorized:

1. gh workflow run
2. gh run rerun
3. manual GitHub Actions dispatch
4. dummy commit to trigger CI
5. opening PR solely to trigger CI
6. pushing audit-only changes solely to trigger CI
7. changing workflow triggers
8. marking missing CI as green.

If CI is needed but not running, the audit must say:

CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT

⸻

5. ABSOLUTE AUDIT LAW

5.1 Evidence beats claims

No claim is valid unless backed by exact evidence:

1. file path;
2. route path;
3. service path;
4. DB model;
5. test file;
6. test command;
7. test result count;
8. existing CI job, if any;
9. artifact;
10. screenshot or trace if browser/mobile;
11. ledger row if scenario/proof/outcome related.

A statement without evidence is not proof.

5.2 No strongest-link classification

Final readiness classification must be limited by the weakest unproven layer.

Example:

1. pure function proven only → LOGIC_READY;
2. DB proven only → DB_PROVEN;
3. route proven only → ROUTE_READY;
4. browser render proven only → BROWSER_RENDER_PROVEN;
5. full owner loop proven → OWNER_RUNTIME_READY;
6. real live outcome proven → LIVE_OUTCOME_PROVEN.

A PR may not claim a stronger classification than the lowest missing critical proof layer permits.

5.3 No seeded proof for real-owner capability

Seed scripts, fixtures, mocked providers, test-only shortcuts, and direct DB inserts do not prove real owner readiness.

For real owner capability, prove:

UI/API route → auth/enforcement → validation → service → DB write → read model → owner plan/dashboard → action/proof/reassessment behavior

5.4 No write-only loops

A loop is incomplete unless it proves:

write → read back → changes next decision/plan → owner-visible → proof/reassessment

This applies to:

1. ingestion;
2. standing instructions;
3. tasks;
4. proof;
5. work orders;
6. outcomes;
7. learning;
8. reassessment;
9. alerts;
10. budget changes;
11. owner preferences;
12. staff training;
13. SOP/process reviews.

5.5 No overclaiming

Never claim:

1. LIVE_OUTCOME_PROVEN without real before/after business metrics;
2. PUBLIC_SAAS_READY without public-readiness gates;
3. profit improvement without actual financial evidence;
4. unknown-unknowns are solved;
5. legal/tax/compliance advice is final authority;
6. staff fraud is fully prevented;
7. AI is autonomous;
8. scenario proof equals live business proof.

Allowed after corpus proof:

OpsIQ is corpus-proven across broad known-to-unknown simulated business reality and safely manages unknowns through confidence reduction, escalation, blocking, proof, reassessment, and local adjudicated learning.

5.6 Hostile default

Assume every implementation may be passing by:

1. using seeded data;
2. bypassing real routes;
3. relying on mocks;
4. avoiding real Prisma;
5. rendering static/fallback UI;
6. hiding behind ignored tests;
7. swallowing errors;
8. returning empty arrays;
9. converting failures into 200 responses;
10. treating missing data as confidence;
11. documenting instead of enforcing.

The audit must actively try to disprove readiness.

⸻

6. SEVERITY MODEL

Every finding must be classified.

6.1 BLOCKER

A blocker prevents merge or readiness claim.

Examples:

1. real owner cannot reach the feature;
2. required data cannot be entered;
3. production route throws;
4. auth/isolation failure;
5. fake confidence;
6. unsafe proceed;
7. proof loop is inert;
8. learning/outcome loop write-only;
9. service returns 200 on failure;
10. schema-invalid query in production path;
11. critical CI gate red;
12. required proof missing;
13. classification overclaimed.

6.2 MAJOR

A major issue may allow merge only if explicitly outside current readiness claim and documented.

Examples:

1. owner-visible limitation;
2. missing browser/mobile proof for non-critical path;
3. non-critical route unreachable;
4. notification honesty issue where not central to slice;
5. deferred schema/domain decision;
6. performance or reliability risk not blocking current path.

6.3 MINOR

A minor issue is low blast radius and does not affect current claim.

Examples:

1. cosmetic label;
2. typo in report;
3. non-blocking doc mismatch;
4. optional cleanup.

6.4 DEFERRED DECISION

A deferred decision must include:

1. exact file/path;
2. issue;
3. why not fixed now;
4. options;
5. recommended future slice;
6. risk if deferred;
7. owner/product decision needed.

Deferred decisions cannot hide blockers.

⸻

7. REQUIRED AUDIT ARTIFACTS

Artifacts depend on audit tier.

7.1 Tier 0 Required Artifact

OPSIQ_<SLICE_NAME>_MICRO_HOSTILE_AUDIT.md

7.2 Tier 1 Required Artifacts

1. OPSIQ_<SLICE_NAME>_PR_READINESS_AUDIT.md
2. OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json only if the PR claims route/runtime/owner-loop readiness.

7.3 Tier 2 Required Artifacts

1. OPSIQ_<SLICE_NAME>_HOSTILE_AUDIT.md
2. OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json
3. OPSIQ_RUNTIME_READINESS_REMEDIATION_TRACKER.md if blockers/majors exist.

7.4 Tier 3 Required Artifacts

1. OPSIQ_<MILESTONE>_POST_MERGE_HOSTILE_AUDIT.md
2. OPSIQ_<MILESTONE>_EVIDENCE_LEDGER.json
3. updated OPSIQ_RUNTIME_READINESS_REMEDIATION_TRACKER.md
4. updated audit standard if a new missed blocker class is found.

⸻

8. EVIDENCE LEDGER FORMAT

For Tier 1 when required, Tier 2, and Tier 3, every claim must have a ledger row.

OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json

Each row must include:

{
  "claimId": "string",
  "claim": "string",
  "proofLayer": "logic|service|db|route|auth|ui|desktop|mobile|ci|loop|live",
  "files": ["string"],
  "routes": ["string"],
  "services": ["string"],
  "dbModels": ["string"],
  "tests": ["string"],
  "commands": ["string"],
  "ciJobs": ["string"],
  "artifacts": ["string"],
  "result": "pass|fail|partial|not_run|not_applicable",
  "limitations": ["string"],
  "classificationImpact": "string"
}

No required evidence ledger means no merge for Tier 2/Tier 3 changes.

⸻

9. DIFF-SCOPE AUDIT

9.1 Classify every changed file

Classify each changed file as:

1. production runtime;
2. API route;
3. service;
4. DB/schema/migration;
5. UI/component;
6. test;
7. workflow/CI;
8. docs/report;
9. seed/script;
10. generated file;
11. config;
12. ignored/quarantined test.

For every production file, state:

1. what changed;
2. why it changed;
3. runtime path using it;
4. exact tests proving it;
5. failure mode if wrong.

9.2 Scope creep fail conditions

Fail the audit if unrelated files are touched without explicit approval, especially:

1. public SaaS;
2. billing;
3. Product Hunt;
4. launch;
5. marketing;
6. Lemon Squeezy;
7. Stripe;
8. enterprise polish;
9. external integrations;
10. unrelated dashboard redesign;
11. unrelated schema changes;
12. unrelated auth policy changes.

9.3 Deletion and weakening check

List all deletions and removed assertions.

Fail if:

1. tests were deleted to pass;
2. thresholds were lowered;
3. ratchet baseline was relaxed;
4. scanner was made non-blocking;
5. skipped proof was counted as pass;
6. workflow trigger was narrowed to avoid running.

⸻

10. CLAIM-TO-PROOF MATRIX

Every Tier 1/Tier 2/Tier 3 audit report must include:

Claim	Required Proof Layer	Actual Proof Layer	Evidence	Missing Proof	Verdict

Proof layers:

1. pure logic;
2. service;
3. real Prisma DB;
4. API route;
5. auth/enforcement;
6. workspace/business isolation;
7. UI reachability;
8. desktop browser;
9. mobile browser;
10. existing CI;
11. owner-visible behavior;
12. loop closure;
13. live business outcome.

Fail if actual proof layer is weaker than required proof layer.

Examples:

1. “DB-backed” requires real Prisma test.
2. “Owner can enter it” requires route/UI proof.
3. “Dashboard uses it” requires data lineage to rendered field.
4. “Learning works” requires write/readback/changed future behavior.
5. “Profit improved” requires live before/after financial evidence.

⸻

11. ROUTE / UI / SERVICE REACHABILITY INVENTORY

For every owner-facing or runtime-critical feature, create a table:

Feature	UI Path	API Route	Method	Auth Wrapper	Service	DB Model	Readback Consumer	Desktop Test	Mobile Test	Status

Fail if a required feature has:

1. service but no route;
2. route but no UI/API consumer;
3. route but no auth wrapper;
4. write but no readback;
5. route only used by tests/seeds;
6. UI label not backed by runtime data.

⸻

12. DATA LINEAGE AUDIT

Every feature that writes or imports data must produce a lineage table:

Input Source	Route/UI	Service	DB Write	Read Model	Owner Plan Field	Dashboard Field	Action/Proof/Reassessment Effect	Proof

Fail if lineage stops before owner plan or behavior impact for any claim that says “owner-ready.”

⸻

13. REAL OWNER RUNTIME LOOP AUDIT

Every owner-facing feature must prove the full relevant runtime loop.

13.1 Data-in

Prove:

1. real UI or API route exists;
2. route is authenticated;
3. route is workspace-scoped;
4. route is business-scoped where required;
5. input validation exists;
6. writes to correct DB model;
7. not seed-only;
8. not demo-only;
9. not stored in unused table.

13.2 Materialization

For intake/import/manual entry:

1. confirmed intake materializes into read model;
2. CSV/manual values become snapshots used by owner plan;
3. confirm flag alone does not count;
4. partial mapping does not fake readiness;
5. invalid input does not produce confidence.

13.3 Readback

Same data must be consumed by at least one relevant runtime consumer:

1. owner whole-business plan;
2. AI supervisor summary;
3. action-status policy;
4. dashboard;
5. mobile dashboard;
6. proof/reassessment loop;
7. outcome loop.

13.4 Decision impact

Prove the data affects at least one:

1. confidence;
2. action status;
3. missing-data request;
4. owner/delegate split;
5. do-now;
6. do-not-do;
7. proof requirement;
8. reassessment;
9. value/money/workload impact.

13.5 Owner-visible output

Prove owner can see:

1. what changed;
2. what to do;
3. what not to do;
4. proof required;
5. confidence/missing data;
6. reassessment;
7. expected value or missing inputs.

⸻

14. INGESTION AUDIT

Mandatory for real owner readiness.

14.1 Critical domains

For every critical ingestion domain:

1. write route exists;
2. UI/API path exists;
3. service exists;
4. DB model exists;
5. read model consumes it;
6. owner plan consumes it;
7. missing domain lowers confidence;
8. sufficient domain can improve confidence;
9. scope enforcement proven.

14.2 Permanent need_more_data trap

Test:

1. missing critical data → need_more_data;
2. all critical domains entered through real routes → not structurally stuck at need_more_data;
3. remaining need_more_data reasons are legitimate domain issues, not unreachable data.

Fail if a required domain has no real write path.

14.3 CSV/manual intake

Prove:

1. upload/entry path exists;
2. explicit mapping;
3. confirm materializes into read models;
4. invalid mapping does not fake readiness;
5. confirmed data appears in owner plan;
6. owner can correct mistakes;
7. import scoped by workspace/business.

⸻

15. PROOF / TASK / EXECUTION ACCOUNTABILITY AUDIT

15.1 Production creation

Production code must create:

1. delegated task;
2. proof requirement;
3. proof record;
4. work order, if claimed;
5. assignment record.

Fail if these are only created by tests/seeds.

15.2 Server-authoritative proof

Proof submission must load from DB:

1. task;
2. proof requirement;
3. actor;
4. existing hashes;
5. workspace/business scope.

Never trust client-supplied:

1. requirement type;
2. actor;
3. task status;
4. proof contract;
5. previous hashes;
6. verification state.

15.3 Anti-gaming tests

Test:

1. fake completion does not verify;
2. reused proof detected;
3. stale proof disputed;
4. duplicate hash detected;
5. rubber-stamp does not override proof defect;
6. collusion requires independent verification;
7. contradiction triggers reassessment;
8. no proof-required task completes without proof.

15.4 Loop closure

Prove:

task assigned → proof required → proof submitted → proof evaluated → task status changes → owner dashboard updates → reassessment required

⸻

16. OUTCOME / LEARNING / REASSESSMENT AUDIT

16.1 Outcome loop

Prove:

1. expected outcome recorded;
2. actual outcome recorded;
3. variance computed;
4. disposition computed;
5. next plan reads disposition;
6. failed action not re-recommended unchanged;
7. missing actual blocks success claim;
8. harmful variance triggers reassessment/adjudication.

16.2 Learning loop

Prove:

1. learning written;
2. learning read back;
3. workspace scoped;
4. business scoped where relevant;
5. affects future recommendation;
6. no cross-workspace leakage;
7. no global promotion from one business outcome;
8. no duplicate learning engines.

If multiple learning stores exist, map them.

16.3 Reassessment loop

Prove:

1. event-triggered reassessment works;
2. time-based reassessment works or is honestly labelled not wired;
3. no in-memory fake scheduler;
4. dashboard does not imply auto-reassessment if none exists;
5. reassessment changes plan when evidence changes.

⸻

17. VALUE / PROFIT / GROWTH OUTPUT AUDIT

For every owner recommendation, audit whether it provides:

1. quantified expected cash impact, if data exists;
2. quantified margin impact, if data exists;
3. runway/break-even, if data exists;
4. CAC/LTV/payback, if relevant and data exists;
5. workload impact;
6. customer/service impact;
7. exact missing inputs if value cannot be quantified.

Fail if:

1. placeholder values are owner-facing as real;
2. hardcoded constants appear as real margin/math;
3. generic “increase profit” appears without math or missing inputs;
4. expected impact is presented as actual;
5. live profit is claimed without live data.

Prove:

recommendation → expected value → proof metric → actual result → variance → next recommendation changes

⸻

18. PRISMA / SCHEMA QUERY VALIDITY AUDIT

Mandatory for service/route changes.

18.1 Query scan

Scan touched and adjacent services for:

1. fields not in Prisma schema;
2. wrong field names;
3. direct workspaceId filters on models without workspaceId;
4. direct businessId filters on models without businessId;
5. invalid relation filters;
6. invalid orderBy;
7. invalid enum values;
8. invalid include/select.

18.2 Fix rules

Allowed without schema change:

1. relation-scoped fix where schema-supported and semantically clear.

Not allowed without explicit decision:

1. adding columns;
2. inventing fields;
3. mapping unrelated fields;
4. hiding errors with empty arrays;
5. swallowing Prisma validation errors.

18.3 DB proof

For every fixed query:

1. no PrismaClientValidationError;
2. correct scoped rows returned;
3. cross-workspace rows excluded;
4. cross-business rows excluded;
5. empty legitimate result returns empty, not 500;
6. invalid auth denied;
7. authorized success path works.

⸻

19. AUTH / WORKSPACE / BUSINESS ISOLATION AUDIT

Mandatory for any route/service/query/UI data.

Prove:

1. unauthenticated returns 401;
2. unauthorized returns 403/equivalent;
3. wrong workspace denied;
4. wrong business denied;
5. no mutation on denied request;
6. reads scoped;
7. writes scoped;
8. updates scoped;
9. deletes scoped;
10. imports scoped;
11. learning scoped;
12. proof scoped;
13. background jobs scoped.

19.1 Multi-workspace owners

Prove:

1. deterministic workspace selection;
2. no “first active membership” ambiguity;
3. route wrapper and policy agree;
4. no silent pinning;
5. workspace switcher/context exists where needed.

19.2 Session truth

Fail if verified session fabricates:

1. workspace active;
2. entitlement limits;
3. plan status;
4. role;
5. membership;
6. disabled workspace access.

⸻

20. HTTP SEMANTICS / ERROR HONESTY AUDIT

Fail if:

1. service failure returns 200;
2. validation failure returns 200;
3. auth failure returns 200;
4. route catches and hides real errors;
5. UI says ready when materialization failed;
6. alert says sent when only logged;
7. proof says accepted when unverified;
8. escalation says notified when not sent.

Every route must preserve honest HTTP status.

⸻

21. UI / DASHBOARD / MOBILE AUDIT

21.1 Desktop

Prove:

1. visible in dashboard;
2. not static fallback;
3. not seed-only;
4. tied to runtime data;
5. confidence shown;
6. missing data shown;
7. action status shown;
8. owner/delegate split shown;
9. proof/reassessment shown;
10. value or missing value inputs shown.

21.2 Mobile

Prove:

1. primary issue visible;
2. action status visible;
3. do-now visible;
4. do-not-do visible;
5. proof visible or accessible;
6. missing data visible or accessible;
7. no horizontal overflow;
8. not wall-of-text;
9. blocked does not look like proceed;
10. owner decision required does not look like proceed.

21.3 Five-second owner test

Owner must answer within one screen:

1. what is wrong;
2. what matters most;
3. what to do today;
4. what not to do;
5. who should do it;
6. what proof is needed;
7. what data is missing;
8. what requires owner approval;
9. what is blocked;
10. when to reassess;
11. money/cash/workload impact.

⸻

22. ALERT / ESCALATION / NOTIFICATION HONESTY AUDIT

For any escalation/alert/notification, classify:

1. actually sent;
2. queued;
3. logged only;
4. simulated;
5. not wired.

Fail if logged/simulated notifications are shown as sent.

If provider absent, owner-facing text must say:

Escalation recorded

not:

Notification sent

unless an actual provider sends it.

⸻

23. SCHEDULER / BACKGROUND JOB AUDIT

Fail if production relies on:

1. in-memory scheduler in serverless;
2. uncalled scheduler;
3. unconfigured cron;
4. 0-byte scheduler;
5. processDue never called;
6. background task not registered.

If time-based reassessment is not wired, say so.

Do not fake scheduled behavior.

⸻

24. GOVERNANCE / CI / IGNORED TESTS AUDIT

24.1 Workflow requiredness table

Every Tier 1/Tier 2/Tier 3 audit must include relevant workflow status:

Workflow	Triggered?	Required?	Blocking?	Result	Relevant to Slice?	Verdict

Fail if a slice-critical workflow is skipped or non-blocking without explicit approval.

Do not trigger CI from the audit.

24.2 Ignored/quarantined tests

List tests under:

1. __ignored_tests__;
2. quarantine folders;
3. .skip;
4. non-required scanners.

For each:

Test	Area	Relevant?	Reason Ignored	Must Run?	Verdict

Any ignored test related to the current slice’s auth, isolation, ingestion, proof, learning, owner plan, value output, money/cash, or route enforcement must run locally if feasible or block/lower readiness.

24.3 Lint/ratchet

Report:

1. lint baseline;
2. new lint errors;
3. baseline changed or not;
4. strict-auth violations;
5. non-blocking scanner issues.

Fail if new violations introduced.

⸻

25. BUSINESS DOMAIN COVERAGE AUDIT

Update/cite coverage matrix for:

1. owner command center;
2. AI supervisor;
3. action-status policy;
4. input quality;
5. confidence;
6. missing data;
7. proof/evidence;
8. reassessment;
9. expected-vs-actual;
10. learning/adjudication;
11. source/privacy;
12. business isolation;
13. dashboard desktop;
14. dashboard mobile;
15. owner/delegate split;
16. owner workload reduction;
17. staff execution;
18. staff training/SOP drift;
19. anti-gaming/proof fraud;
20. finance/cash/capital allocation;
21. revenue/margin/profit;
22. customer experience;
23. vendor/supply chain;
24. market/competition;
25. growth/scaling;
26. local/legal/professional boundary;
27. compliance/safety;
28. crisis/tail-risk;
29. unknown/OOD;
30. shadow-pilot/owner unavailable.

A slice cannot be complete if its core domain is untested.

⸻

26. SCENARIO / CORPUS AUDIT

For scenario packs:

1. exact count;
2. unique IDs;
3. no filler;
4. source-backed;
5. source limitations;
6. independent gold;
7. expected fields;
8. DB-backed;
9. desktop/mobile proof;
10. no skipped counted as pass;
11. action-status distribution;
12. high-risk never proceeds;
13. professional-review never proceeds;
14. no live outcome claims.

⸻

27. CONCURRENCY / TOCTOU AUDIT

For approvals, transitions, execution, proof, and governed decisions, prove:

1. version/status guard;
2. atomic transition;
3. duplicate concurrent approval cannot both succeed;
4. stale transition fails;
5. denied transition does not mutate;
6. audit event correct;
7. no non-existent columns written.

Read-then-update without guard is a risk unless proven harmless.

⸻

28. SECURITY / SECRET / DIAGNOSTIC ROUTE AUDIT

Audit:

1. no committed secrets;
2. no test password in production route;
3. diagnostic routes gated;
4. shared diagnostic key not overbroad;
5. API keys fail closed;
6. no PII in logs;
7. no cross-workspace data in logs;
8. prompt injection defenses;
9. uploaded documents cannot override instructions;
10. source/privacy tests green.

⸻

29. PERFORMANCE / RELIABILITY AUDIT

Prove:

1. no explosive N+1 query;
2. batch bounded;
3. timeout handled honestly;
4. retries do not hide first failure;
5. local/CI duration acceptable for selected tier;
6. serverless durable state not assumed;
7. in-memory Maps not production persistence;
8. durable state exists for long-running jobs or feature is honestly not wired.

⸻

30. OWNER WORKLOAD AUDIT

OpsIQ must reduce owner workload.

Audit:

1. Does it reduce owner work?
2. Does it add data-entry burden?
3. Can staff provide the data?
4. Can owner approve once and reuse?
5. Are only exceptions escalated?
6. Does it avoid alert spam?
7. Does it show top 3 priorities?
8. Does it prepare work for owner approval?
9. Does it automate only within approved thresholds?
10. Does it preserve cash, quality, staff sustainability, and growth?

Fail if it adds owner burden without improving decision quality, proof quality, safety, or profitability.

⸻

31. PRODUCTION-VS-TEST PATH CLASSIFICATION

Every proof must be classified as one:

1. production route;
2. production service direct;
3. production DB direct;
4. test-only fixture;
5. seed-only;
6. mock;
7. provider seam;
8. static fallback;
9. documentation only.

Only production route/service/DB proof can support runtime readiness.

Seed-only, mock, fixture, or documentation-only proof cannot support owner-runtime claims.

⸻

32. FAST BUT STRICT MICRO AUDIT TEMPLATE

Use this for Tier 0.

# OPSIQ MICRO HOSTILE AUDIT
## 1. Scope
- Selected audit tier:
- Why this tier:
- Branch:
- Base HEAD:
- Current HEAD:
- Working tree:
- Slice:
- Files changed:
- Runtime files changed:
- Test files changed:
- Docs changed:
## 2. Claim Being Audited
State the exact claim.
Do not audit a stronger claim than the slice made.
## 3. Production-vs-Test Path Classification
Classify proof as:
- production route;
- production service;
- real Prisma DB;
- UI/browser;
- mobile;
- seed-only;
- mock;
- fixture;
- docs-only.
Seed-only/mock/docs-only cannot prove runtime readiness.
## 4. Touched Path Review
For every touched runtime path:
| File | Function/Route | Runtime Role | Risk | Checked? | Finding |
|---|---|---|---|---|---|
## 5. Schema Query Check
For touched/adjacent Prisma queries:
| File | Model | Queried Field | Exists in Schema? | Relation Scope Needed? | Verdict |
|---|---|---|---:|---:|---|
## 6. Auth / Scope Check
If route/service/query touched:
| Path | Auth Required | Workspace Scope | Business Scope | Deny Path Proven? | Finding |
|---|---:|---:|---:|---:|---|
## 7. Loop Closure Check
If data/proof/outcome/learning/reassessment touched:
| Loop | Write | Readback | Behavior Changed | Owner Visible | Verdict |
|---|---:|---:|---:|---:|---|
## 8. Local Tests / Proof
List exact local commands run.
If not run, say why.
Do not mark not-run as pass.
## 9. Blockers / Majors / Minors
- Blockers:
- Majors:
- Minors:
- Deferred:
## 10. Classification
Allowed:
- MICRO_AUDIT_FAILED
- MICRO_AUDIT_BLOCKED
- MICRO_AUDIT_PASS_WITH_LIMITATIONS
- MICRO_AUDIT_PASS_TARGETED_ONLY
## 11. Next Required Proof
State whether Tier 1, Tier 2, PR CI, browser/mobile, or DB proof is needed next.
## 12. CI Status
State exactly:
- CI was not triggered by this audit.
- Existing CI inspected: yes/no.
- CI required before merge: yes/no.

⸻

33. PR READINESS AUDIT TEMPLATE

Use this for Tier 1.

# OPSIQ PR READINESS HOSTILE AUDIT
## 1. Scope
- Selected audit tier:
- Why this tier:
- Branch:
- Base HEAD:
- Current HEAD:
- PR:
- Working tree:
- Files changed:
## 2. Claim-to-Proof Matrix
| Claim | Required Proof | Actual Proof | Evidence | Missing | Verdict |
|---|---|---|---|---|---|
## 3. Route/UI/Service Inventory
| Feature | UI Path | API Route | Method | Auth Wrapper | Service | DB Model | Readback | Test | Status |
|---|---|---|---|---|---|---|---|---|---|
## 4. Data Lineage
| Input | Route/UI | Service | DB Write | Read Model | Owner Plan Field | Dashboard Field | Behavior Effect | Proof |
|---|---|---|---|---|---|---|---|---|
## 5. Runtime Risk Checks
- Schema query validity:
- Auth/scope:
- HTTP semantics:
- Loop closure:
- Owner-visible behavior:
- Browser/mobile need:
- Ignored/quarantined relevant tests:
- CI requiredness:
## 6. Local Proof
Commands and results.
## 7. Existing CI Status
Only inspect existing CI.
Do not trigger CI.
If no CI exists, state:
CI_REQUIRED_BUT_NOT_TRIGGERED_BY_AUDIT.
## 8. Findings
- Blockers:
- Majors:
- Minors:
- Deferred decisions:
## 9. Classification
Allowed:
- PR_AUDIT_FAILED
- PR_AUDIT_BLOCKED
- PR_READY_LOCAL_ONLY
- PR_READY_PENDING_CI
- PR_READY_WITH_DEFERRED_DECISIONS
## 10. Merge Recommendation
Do not recommend merge unless existing CI is green or CI is not required for this claim.
If CI required but not run, recommendation must be:
DO_NOT_MERGE_PENDING_CI.

⸻

34. FINAL HOSTILE SELF-AUDIT

Every audit must answer the relevant subset of these questions. Tier 2/Tier 3 must answer all relevant questions.

1. Did we prove production path or only seeded/test path?
2. Can a real owner reach it through UI/API?
3. Does written data reach owner plan?
4. Does it affect confidence/action/recommendation?
5. Does it show on desktop and mobile where owner-visible?
6. Is isolation proven?
7. Are Prisma queries schema-valid?
8. Are denied requests fail-closed?
9. Are service errors honest?
10. Did ignored/quarantined tests cover this area?
11. Are relevant scanners required/blocking?
12. Did we add any, fallback, placeholder, hardcoded constant, or stub?
13. Did we hide errors?
14. Did we create write-only data?
15. Did we close write→readback→changed behavior?
16. Does proof get required and verified?
17. Does learning affect future behavior?
18. Does outcome variance affect next plan?
19. Does reassessment actually run or is it honestly labelled?
20. Does owner see quantified value or exact missing inputs?
21. Did we avoid fake profit/live outcome claims?
22. Did we avoid public SaaS overclaim?
23. Did we avoid AI autonomy?
24. Did we avoid duplicate engines?
25. Did we avoid weakening gates?
26. Did all relevant prior packs/gates remain green where checked?
27. Are limitations explicit?
28. Is final classification fully supported?

Any unfavorable answer must lower classification or block merge.

⸻

35. FINAL CLASSIFICATION RULES

Use only evidence-supported classifications.

General:

1. AUDIT_FAILED
2. LOGIC_READY
3. SERVICE_READY
4. DB_PROVEN
5. ROUTE_READY
6. UI_REACHABLE
7. DESKTOP_PROVEN
8. MOBILE_PROVEN
9. LOOP_PARTIAL
10. LOOP_CLOSED
11. OWNER_RUNTIME_READY
12. CORPUS_PROVEN
13. SHADOW_PILOT_PREPARED
14. LIVE_PILOT_READY
15. LIVE_OUTCOME_PROVEN
16. PUBLIC_SAAS_READY

Tier-specific:

Tier 0:

1. MICRO_AUDIT_FAILED
2. MICRO_AUDIT_BLOCKED
3. MICRO_AUDIT_PASS_WITH_LIMITATIONS
4. MICRO_AUDIT_PASS_TARGETED_ONLY

Tier 1:

1. PR_AUDIT_FAILED
2. PR_AUDIT_BLOCKED
3. PR_READY_LOCAL_ONLY
4. PR_READY_PENDING_CI
5. PR_READY_WITH_DEFERRED_DECISIONS

Tier 2:

1. HOSTILE_AUDIT_FAILED
2. HOSTILE_AUDIT_BLOCKED
3. MAJOR_RUNTIME_GATE_PARTIAL
4. MAJOR_RUNTIME_GATE_READY_PENDING_CI
5. MAJOR_RUNTIME_GATE_READY

Tier 3:

1. POST_MERGE_AUDIT_FAILED
2. POST_MERGE_AUDIT_BLOCKED
3. MILESTONE_ACCOUNTING_VERIFIED
4. MILESTONE_RUNTIME_PARTIAL
5. MILESTONE_RUNTIME_READY_PENDING_CI
6. MILESTONE_RUNTIME_READY

Never use a stronger classification than the weakest missing critical proof layer.

No audit may use final wording that implies CI passed unless CI actually passed.

Use:

1. LOCAL_TARGETED_READY when local targeted proof passes;
2. READY_PENDING_CI when CI is required but not run;
3. CI_GREEN_READY only when existing required CI is green;
4. MERGE_READY only when existing required CI is green, final hostile audit passes, and mergeable state is clean.

If CI is not triggered, say:

CI not triggered by this audit.

If CI is required later, say:

CI required before merge, but not triggered by this audit.

⸻

36. MERGE RULE

A PR may be merged only if:

1. correct-tier hostile audit report exists;
2. evidence ledger exists if required by tier;
3. all required existing CI checks are green, if PR exists and CI is required;
4. no red checks;
5. no pending required checks;
6. expected skips only;
7. branch-related blockers fixed;
8. final hostile audit passes;
9. mergeable_state clean;
10. no overclaim;
11. no gate weakened;
12. runtime loop proven for the claim;
13. limitations documented;
14. remediation tracker updated for unresolved blockers/majors.

If not, do not merge.

⸻

37. FIX POLICY

An audit may identify fixes, but must not automatically start broad coding.

Allowed after Tier 0:

1. fix directly related small defects in the same slice if already authorized;
2. update the micro audit;
3. rerun targeted local proof.

Not allowed after Tier 0:

1. start broad remediation;
2. trigger CI;
3. open PR solely for audit;
4. change schema;
5. change auth policy;
6. refactor unrelated services.

Allowed after Tier 1/Tier 2:

1. create a remediation plan;
2. create a tracker;
3. recommend next slice;
4. fix branch-related blockers if owner already authorized implementation;
5. prepare PR body.

Not allowed unless explicitly authorized:

1. schema reconciliation;
2. workflow changes;
3. broad service sweeps;
4. external integrations;
5. public SaaS/billing/launch work.

⸻

38. FULL HOSTILE AUDIT TRIGGER CONDITIONS

Run Tier 2 or Tier 3 full hostile audit only when:

1. the owner asks for full hostile audit;
2. before merging a major runtime PR;
3. after a major runtime PR lands;
4. after a new blocker class is found;
5. after schema/auth/ingestion/proof/learning/value change;
6. before any readiness classification above local/PR readiness;
7. before live pilot;
8. before public SaaS readiness;
9. when the slice changes multiple domains;
10. when a previous audit found unresolved blockers.

Do not run Tier 2/Tier 3 after every micro-slice unless the micro-slice touches a critical runtime loop.

⸻

39. STANDARD CLAUDE PROMPT — FAST STRICT AUDIT

Use this after normal small slices:

You are auditing this OpsIQ slice using OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md.
Use the audit tiering rules.
Do not trigger CI.
Do not open PR.
Do not merge.
Do not run workflow_dispatch.
Do not rerun GitHub Actions.
Do not create dummy commits.
Select the smallest audit tier that is strict enough for the risk of this slice.
For a small/narrow slice, use Tier 0 Micro Hostile Audit.
For a PR-ready narrow runtime slice, use Tier 1 PR Readiness Audit.
Only use Tier 2/Tier 3 if the change touches major runtime loops, schema, auth, ingestion, proof, learning, value output, CI gates, or a readiness claim.
Audit must still be hostile and skeptical.
Do not accept seeded data as real owner proof.
Do not accept write-only loops.
Do not accept browser rendering as ingestion proof.
Do not accept no-regression as full correctness.
Do not accept mocks as Prisma proof.
Do not accept documentation as implementation.
Do not accept success claims without actual results.
Create the correct audit file for the selected tier.
Include:
1. selected audit tier and why;
2. branch/base/current HEAD;
3. changed files;
4. exact claim audited;
5. production-vs-test proof classification;
6. touched path review;
7. schema query check for touched/adjacent files;
8. auth/scope check if relevant;
9. loop closure check if relevant;
10. owner-visible check if relevant;
11. local tests/checks run;
12. CI status, explicitly saying CI was not triggered;
13. blockers/majors/minors/deferred;
14. final classification;
15. next required proof.
If evidence is missing, lower classification or block.
Final output must be blunt, file-level, and evidence-linked.

⸻

40. STANDARD CLAUDE PROMPT — FULL MAJOR AUDIT

Use this only for major changes or milestone gates:

You are auditing this OpsIQ branch/PR using OPSIQ_HOSTILE_RUNTIME_AUDIT_STANDARD.md.
Use Tier 2 Major Runtime Gate Audit unless this is a post-merge/milestone audit, in which case use Tier 3.
Do not trigger CI.
Do not open PR.
Do not merge.
Do not run workflow_dispatch.
Do not rerun GitHub Actions.
Inspect existing CI only if a PR already exists.
Run local checks only as needed and feasible.
Create:
1. OPSIQ_<SLICE_NAME>_HOSTILE_AUDIT.md
2. OPSIQ_<SLICE_NAME>_EVIDENCE_LEDGER.json
3. OPSIQ_RUNTIME_READINESS_REMEDIATION_TRACKER.md if blockers/majors exist
Audit:
1. diff scope;
2. claim-to-proof matrix;
3. route/UI/service reachability;
4. data lineage;
5. real owner runtime loop;
6. ingestion;
7. proof/task/execution accountability;
8. outcome/learning/reassessment;
9. value/profit output;
10. Prisma/schema query validity;
11. auth/workspace/business isolation;
12. HTTP semantics;
13. dashboard/mobile;
14. alerts/escalations;
15. scheduler/background jobs;
16. governance/CI/ignored tests;
17. business domain coverage;
18. scenario/corpus if applicable;
19. concurrency/TOCTOU;
20. security/diagnostic routes;
21. performance/reliability;
22. owner workload impact;
23. production-vs-test proof classification;
24. final hostile self-audit.
Do not accept seeded data as real owner proof.
Do not accept write-only loops.
Do not accept browser rendering as ingestion proof.
Do not accept no-regression as full correctness.
Do not accept mocks as Prisma proof.
Do not accept documentation as implementation.
If CI is required but not run, classify as READY_PENDING_CI, not READY.
Final output must be blunt, specific, file-level, and evidence-linked.

⸻

41. MAINTENANCE RULE

This standard must be updated whenever a new missed blocker class is discovered.

Every postmortem must answer:

1. why the blocker was missed;
2. which audit section should have caught it;
3. should Tier 0 have caught it?
4. should Tier 1 have caught it?
5. was Tier 2 required but skipped?
6. was the issue hidden behind no CI?
7. was the issue hidden behind no browser/mobile proof?
8. was the issue hidden behind seed/mock/direct DB proof?
9. was the issue hidden behind ignored/quarantined tests?
10. what new targeted check prevents recurrence without forcing full audit after every tiny slice?
11. whether CI must become required;
12. whether ignored tests must be restored;
13. whether a new evidence-ledger field is needed.

No repeated blocker class is acceptable.

END OF STANDARD.