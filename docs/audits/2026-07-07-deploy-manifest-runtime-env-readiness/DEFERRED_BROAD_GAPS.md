# Deferred / Broad Gaps — Deploy Manifest + Runtime Env Readiness (PASS 46)

These are deliberately **out of scope** for this pass. They are recorded, not hidden. None block owner
self-use deployment.

## Deferred (intentional, scoped out)

1. **Hard boot-time env gate.** The real boot path (`src/instrumentation.ts` → startup-orchestrator) fails
   open with no throw-on-missing-required-var. This pass enforces the contract via preflight +
   `validate:deployment` + the prechecklist + the consistency test *before* deploy, rather than adding a
   startup throw. A hard gate risks taking a running owner instance down on a transient read and is a
   behavior change; deferred to a future pass if desired. (Risk R-NO-HARD-BOOT-GATE, residual medium.)

2. **Remove dead env-contract modules.** `src/runtime/config/config-validator.ts` (JWT_SECRET /
   ENCRYPTION_KEY) and the unused `getConfig()` in `src/lib/config.ts` (AUTH_SECRET / AUTH_URL) declare
   requirements nothing on the boot path reads. This pass documents them as phantom and asserts they are
   never treated as required; actually deleting/rewiring them is a separate refactor (touches tests) and is
   deferred to avoid scope creep.

3. **Automated post-deploy smoke as a required CI gate against a live owner host.** The smoke plan is
   documented and has scripted helpers (`deployment:smoke`, `smoke:prod`), but wiring a live-host smoke into
   a required gate needs a real deployed URL + credentials, which is owner-environment-specific. Deferred.

## Explicitly NOT done (standing loop boundaries — correct to exclude)

- No automatic deployment, no auto-migration, no secret printed/committed.
- No public SaaS, billing enablement, Product Hunt / public launch, or paid promotion.
- No live integrations, Local Mode, LLM/NLP, autonomous browsing, or autonomous external action.
- No new env vars invented — only variables with real code references are documented.
- No public-readiness claim. This pass narrows restriction R2 (deployment repeatability) for **owner
  self-use only**.

## Broad gaps noted for future passes (not this scope)

- Central typed env accessor actually used by the app (would replace scattered `process.env` reads and give
  one enforcement point) — larger refactor.
- Secret rotation / secret-manager integration docs beyond "use your host's secret manager."
- Multi-environment (staging + prod) promotion pipeline — out of scope for single-owner self-use.
