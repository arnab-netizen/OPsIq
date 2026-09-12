# Minimal Per-Event Complaint / Rework Model + Proof Linkage — REPORT

**Classification:** `COMPLAINT_REWORK_EVENT_LINKAGE_REAL_AND_OWNER_VISIBLE`
(+ `PROOF_OUTCOME_INTEGRITY_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `PROFIT_LEAK_RADAR_STRENGTHENED`)
**Branch:** `claude/complaint-rework-event-linkage-depth-pass` · **Base:** `origin/main` @ `9381efab`

## A. Files created
- `src/domain/execution/complaint-rework.ts` — categories, validation, category→risk map, linkage analysis.
- `src/services/execution/complaint-rework.service.ts` — record/link/get (governed, audited, fail-closed).
- `src/app/api/complaint-rework/route.ts` — minimal record/link API.
- `prisma/migrations/20260705140000_operational_event/migration.sql` — the OperationalEvent table.
- `src/__tests__/execution/complaint-rework.test.ts` (7 unit), `complaint-rework.service.test.ts` (8 unit), `complaint-rework-simulation.db.test.ts` (4 DB).
- The six docs in this folder.

## B. Files changed
- `prisma/schema.prisma` — `OperationalEvent` model.
- `src/domain/constants/audit-events.ts` — `operational_event.recorded` / `.linked`.
- `src/domain/owner-mode/proof-outcome-linkage.ts` (+ service) — linked complaint/rework flips proof→complaint/rework to LINKED + into the integrity measurement.
- `src/domain/owner-mode/evidence-credibility-graph.ts` — `ACCEPTED_PROOF_WITH_COMPLAINT` / `_WITH_REWORK`.
- `src/domain/owner-mode/profit-leak-radar.ts` — measured-impact support on dispute/linked leaks.
- `src/services/owner-guidance/owner-now-view.service.ts` — `complaintRework` dep; feed engines + credibility; `complaintReworkLinks` on payload.
- 2 existing test files (message assertions updated as behaviour changed), `docs/CURRENT_OPSIQ_STATUS.md`.

## C. Schema changes
One additive, backfill-safe, non-destructive table: `operational_events` (+ two indexes). No change to existing tables.

## D. Backend logic
- Validate (category + description required; conservative category vocabulary) → create OperationalEvent + atomic audit.
- Link to a workspace-verified proof (idempotent) + audit.
- Read: join linked events to their accepted proofs → measurable proof→complaint/rework, per-submitter attribution, aggregates (+ measured impact only when supplied).

## E. Frontend logic
None (no UI). Owner-callable via `POST /api/complaint-rework`; results surface on `/api/owner/now-view`.

## F. Acceptance criteria
- [x] complaint + rework events recorded with required fields; workspace-scoped linkage; wrong-workspace/missing-category/description fail closed.
- [x] proof→complaint / proof→rework measurable.
- [x] credibility consumes the linked event; Profit-Leak Radar (COMPLAINT_REVENUE_RISK / REWORK_REDO_COST) + Constraint Engine consume it; PROOF_OUTCOME_INTEGRITY consumes it.
- [x] owner now-view exposes the implication; reassessment idempotent.
- [x] tests + realistic simulation pass; isolation tested; no fake complaint/rework/financial impact.

## G. Known limitations
- Financial impact is qualitative unless a real amount is supplied on the event (impactConfidence NEEDS_DATA).
- DELIVERY / PRICING complaint constraints feed the radar but only QUALITY is fed into the constraint engine's dispute-quality input this pass (delivery/pricing constraint wiring is future).
- No UI; browser E2E unchanged. Direct fake-proof→anti-gaming link still future.

## H. Manual verification
`POST /api/complaint-rework { action:"record", eventType, category, description, relatedProofId? }` then `{ action:"link", eventId, proofId }`. See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
record/link complaint or rework → `operational_event.recorded`/`.linked` audit → next now-view read: proof→complaint/rework measurable, credibility, `PROOF_OUTCOME_INTEGRITY`, profit leak, constraint.

## J. Failure modes covered
Missing category/description, invalid eventType/category pair, cross-workspace proof, missing proof, idempotent re-link, absent table (P2021 → empty), no measured amount (qualitative), clean workspace (no fabrication).

## K. Events emitted
New: `operational_event.recorded`, `operational_event.linked`.

## L. Automated tests added
7 domain + 8 service + 4 DB simulation + 1 radar measured-impact case = **20 new tests** (plus 2 existing assertions updated).
