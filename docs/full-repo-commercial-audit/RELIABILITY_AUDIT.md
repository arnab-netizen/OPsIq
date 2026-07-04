# Reliability Audit — OpsIQ / Rebilix

| # | Area | Class | Evidence / note |
|---|---|---|---|
| 1 | Type safety | ADEQUATE | `tsc --noEmit` clean across ~2,500 files. Caveat: `src/lib/db` is an untyped `Proxy` (`db.ts:112`), so Prisma query shapes are NOT type-checked — this hid GAP-EVIDENCE-DRIFT-01 (queries against non-existent columns). |
| 2 | Runtime error handling | ADEQUATE | Central `classifyOperatorError` / `toOperatorSafeError`; route wrappers normalize errors. 32 frozen raw-`error.message` findings remain (baseline, non-blocking). |
| 3 | DB transaction safety | ADEQUATE | Proof FSM + idempotency use `$transaction`; 27 files use `$transaction`. Gap: operator-item audit emitted outside the mutation txn (GAP-AUDIT-01). |
| 4 | Retry / idempotency | STRONG | `src/services/idempotency.ts`: unique key, payload/operation mismatch rejection, P2002 re-read, in-flight duplicate rejection. |
| 5 | Concurrency | STRONG (proof path) / WEAK (legacy evidence) | Proof-complete is a compare-and-swap; optimistic-lock helpers used on governed updates. Legacy `validateEvidence` lacked a version guard (moot — GAP-EVIDENCE-DRIFT-01). |
| 6 | Data validation | STRONG | Zod schemas on write paths (`src/lib/validation`, `parseRequestBody`, `validation-contracts`). |
| 7 | Zod/schema validation | STRONG | `parseOrThrow`/`parseRequestBody` widely used; request bodies validated before use. |
| 8 | Null/undefined handling | ADEQUATE | Defensive `??`/guards common; owner surfaces render with fallbacks. |
| 9 | Time/date handling | ADEQUATE | ISO serialization at boundaries; staleness gate uses `maxAgeDays`. |
| 10 | Permission failures | STRONG | Fail-closed capability + workspace resolution in the canonical wrapper. |
| 11 | External workflow failure | ADEQUATE | Webhook emit is async/guarded; event-emitter failures logged non-blocking. |
| 12 | Long-running operations | ADEQUATE | UI fetches use a 10s AbortController timeout. |
| 13 | Serverless cold start | ADEQUATE | Prisma client is a lazy global singleton; no auto-init on module load (edge-safe). |
| 14 | DB connection exhaustion | WEAK | pg `Pool` has no explicit `max`/idle/timeout; relies on the documented Neon `-pooler` URL (GAP-REL-01). |
| 15 | Large workspace behavior | ADEQUATE | List routes cap (`take: 100`, `Math.min(limit, 50)`); not load-tested. |
| 16 | Pagination | ADEQUATE | limit/offset present on list services. |
| 17 | Rate limiting | ADEQUATE | `checkRateLimit` in `/api/run` production safety-config path. |
| 18 | Error logging | ADEQUATE | Structured logger; observability event loggers per route. |
| 19 | Owner-visible failure modes | ADEQUATE | Blocked decisions persisted + surfaced; guardrail violations returned with explanations. |
| 20 | Recovery paths | ADEQUATE | Idempotent retries; optimistic-lock conflict surfaces reload-and-retry. |

## Tests run for reliability this audit
- `tsc --noEmit` — clean.
- Full DB-backed suite on base: 802 files / 13,978 tests pass, 1+13 skipped (local Postgres 16).
- Targeted: approval-grant (5), cross-tenant header guard (8), wealth wiring (3), admin-billing + webhooks + business-impact (72) — all pass with the fixes.
- Runtime probes (local DB): confirmed the Prisma tenant middleware is inert (GAP-TEN-01) and the legacy Evidence service throws (GAP-EVIDENCE-DRIFT-01).

## Top reliability risks (ranked)
1. GAP-EVIDENCE-DRIFT-01 (HIGH) — legacy Evidence routes 500 at runtime; masked by untyped `db`.
2. GAP-TEN-01 (HIGH, defense-in-depth) — DB-level tenant backstop inert; route layer is the live control.
3. GAP-AUDIT-01 (MEDIUM) — audit emission can be lost after a committed operator mutation.
4. GAP-REL-01 (LOW) — no explicit pool sizing for serverless.
