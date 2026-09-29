# Next Implementation Order

## Ordering Principle
Integrate and prove before extending. The repo's last three merges added governed LOGIC, not runtime capability. Therefore: runtime correctness and DB proof come before any new feature or UI; data/proof/isolation come before advanced guidance; Owner Mode before public SaaS; multi-location MODEL correctness before any multi-location dashboard; remote PROOF integrity before remote automation; system-level simulation before any real owner pilot. Do not build new surfaces on top of unwired logic.

## Phase 1 — Must Fix Before Further Feature Build
1. **Restore DB-backed proof** (C3). Make a test/staging Postgres reachable and reproduce `npx prisma migrate status` + the `[db]` test lane; or document the exact passing DB-gated CI runs as the proof of record. Until DB behavior is reproducible, no persistence/isolation claim is valid.
2. **Define the integration contract (ADR)** (C5). Decide explicitly: the collective layer (`runCollective`) consumes the EXISTING `owner-*` runtime services/engines as signal sources — it must NOT re-derive diagnosis/proof/verification. Write `audit/`- or `docs/`-level ADR. This prevents a duplicate engine.
3. **Wire one collective read path end-to-end** (C1, C6, H4). Add an authenticated, workspace-scoped owner route (e.g. `GET /api/owner/command-center`) → a service that gathers existing owner-* domain signals → `runCollective` → returns the packet. Enforce the new owner-mode contract + scope guards in the route. Add ONE E2E test owner→API→collective→packet (auth + workspace isolation + forbidden-access). This is the wiring acceptance gate.
4. **Correct overclaiming status classifications** (C4). Change top-line `..._CAPABILITY_COMPLETE` to `GOVERNANCE_LOGIC_COMPLETE_RUNTIME_INCOMPLETE` in the three `OPSIQ_*_BUILD_STATUS.md` files.

## Phase 2 — Must Fix Before Real Owner Simulation
5. **Add the `Location` model + isolation** (C2). Workspace-scoped `Location` (and minimal `RemoteTask`/proof linkage) Prisma models + migration; enforce workspace+location isolation in a route; `[db]` tests proving cross-location and cross-workspace reads are blocked.
6. **Persist the remote governed records** (M2, H3). Wire `audit-trail` → existing `AuditEvent`; outcome/learning → existing `ControlledLearningCandidate`; back high-risk task transitions with the existing `src/optimistic-lock.ts`/DB; `[db]` concurrency test proving one-completion-wins against real persistence.
7. **One location-scoped runtime slice** (dispatch→ack→proof→supervisor verify→outcome) wired through Owner Mode governance, with persistence and a forbidden-access test. No UI yet.

## Phase 3 — Must Fix Before Real Owner Pilot
8. **System-level adversarial simulation** against the wired runtime (not just libraries): fake proof submitted via the real API is rejected; one location's green cannot hide another's red in the real aggregate; remote owner cannot mark verified without the real verification chain; backdated offline proof rejected at the API boundary.
9. **Minimal owner-visible surfaces** for the wired capabilities (command-center packet view; location risk view). Empty/error/loading states; access control.
10. **Lint debt burn-down plan** (H1) and **status/report consolidation** (H5): archive historical `*.md` under `docs/history/`, keep one source-of-truth.

## Phase 4 — Later / Not Current Priority
- Full multi-terminal UIs (employee/supervisor/manager), cross-location capacity pooling automation, AI live proof review, advanced forecasting, mobile polish.

## Explicitly Frozen
- Public SaaS, billing, Product Hunt, Lemon Squeezy, external integrations, enterprise polish, marketing/launch. These remain FROZEN: Owner Mode runtime command-and-control and multi-location are not yet proven; launching now would ship false-confidence capabilities.
