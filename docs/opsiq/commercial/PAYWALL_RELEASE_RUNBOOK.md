# OpsIQ paywall release runbook

> `PRODUCTION_PAYMENT_GATE_ENABLED=NO` · `BILLING_PAYWALL_ENFORCEMENT_PRODUCTION=OFF` · `REAL_PADDLE_CHARGES_ENABLED_BY_THIS_PR=NO`

Contract: **first diagnosis free; continuing the OpsIQ loop is Pro.** The gate ships dormant. Production stays unaffected until the owner runs the enable command below on a named, exact commit. Boundary and bypass evidence: `PAYWALL_BOUNDARY.md`.

## 0. What ships dormant

| Item | State |
|---|---|
| `BILLING_PAYWALL_ENFORCEMENT` in Production | not `on` (only the exact string `on` enforces) |
| Enforcement code | merged, inert: every gate returns before any database work when the switch is not `on` |
| Migration | none (the first-diagnosis invariant is derived from existing tables) → `PRODUCTION_MIGRATION_REQUIRED=NO` |
| Paddle | untouched by this change; live approval, price and plan seed are separate owner steps |

## 1. Before enabling (owner steps, all manual)

1. **Decide** every item in `PAYWALL_BOUNDARY.md` section 7 (allowance scope, the 26 classification-pending handlers, the 5 unenforced bypasses, OPEN_BETA grandfathering, final price). Record outcomes in a reviewed commit that also clears `docs/opsiq/commercial/RELEASE_BLOCKERS.json` (`open: []`). The enable tool refuses while anything is open.
2. **Price**: set `PUBLIC_PRICE_DISPLAY` in `src/domain/billing/public-pricing.ts` (the one UI source) to the approved amount. The amount must equal the Paddle live price and the Plan seed (`PADDLE_PLAN_PRICE_MONTHLY`). The sandbox price is test data and must not be reused.
3. **Paddle live**: obtain Paddle's live domain/account approval; create the live price; set Production `PADDLE_ENV=live`, `PADDLE_API_KEY`, `PADDLE_PRICE_ID`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_CLIENT_TOKEN`; run `scripts/seed-commercial-plan.ts` for the live price. Confirm `/pay` no longer says "Payments are not available right now" and `/pricing` no longer says "to be announced".
4. **Audit existing workspaces** (read-only): `DATABASE_URL=<read access> node scripts/release/paywall-beta-audit.mjs`. It reports each workspace as `NO_DIAGNOSIS`, `FIRST_USED_UNPAID`, `MULTI_DIAGNOSIS_UNPAID` or `ENTITLED`. Every workspace that is not `ENTITLED` and already has a diagnosis will be denied on its next continuation step. Decide, per group, whether that is intended; no exemption is built or invented here.
5. **Merge** the release commit through the normal CI-gated PR flow and let Production deploy it with the paywall still off. Note its full 40-character SHA.
6. Write the **approval manifest** (JSON, kept with the release record, no secrets):
   ```json
   {
     "paddleDomainApproved": true,
     "paddleApprovalEvidence": "<ticket or email reference>",
     "approvedBy": "<name>",
     "approvedAt": "<ISO timestamp>",
     "expectedMainSha": "<the 40-char SHA>",
     "livePriceId": "pri_...",
     "ownerDecisionsResolved": true,
     "knownReleaseBlockers": []
   }
   ```

## 2. Enable

Prerequisites in the shell: `VERCEL_TOKEN` (never stored in the repo), and for the plan-seed check a read-only `DATABASE_URL` for the Production database. A clean checkout of the exact SHA (`git checkout <sha>`).

```sh
# Rehearsal: same read-only preflights, zero mutations, prints the exact two requests (no secrets)
npm run billing:paywall:enable -- --expected-main-sha=<40-char SHA> \
  --confirm="ENABLE PRODUCTION PAYWALL" --production-url=https://<production host> \
  --manifest=<path> --dry-run

# Real run
npm run billing:paywall:enable -- --expected-main-sha=<40-char SHA> \
  --confirm="ENABLE PRODUCTION PAYWALL" --production-url=https://<production host> \
  --manifest=<path>
```

Preflights (every one fails closed; a real run also refuses if any check was skipped):

1. repository is `arnab-netizen/OPsIq` · 2. clean working tree · 3. `origin/main` and local `HEAD` equal the expected SHA · 4. Vercel project reachable · 5. flag currently not `on`, present only on the Production target · 6. Production `/api/health` OK · 7. `/api/readiness` ready and migration history current · 8. Production `/api/internal/build-info` serves the expected SHA with environment `production` · 9. `/pricing` no longer says "to be announced" · 10. `/pay` available · 11. all five Paddle variables present for Production · 12. approval manifest complete and bound to this SHA · 13. `PADDLE_ENV` is live · 14. `PADDLE_PRICE_ID` equals the manifest's live price id · 15. exactly one active Plan carries that price id (single READ ONLY query, host must be the Production database) · 16. `RELEASE_BLOCKERS.json` has nothing open.

Mutations (exactly two, in order, nothing else):

1. Set `BILLING_PAYWALL_ENFORCEMENT=on` on the **Production** target only.
2. Create a **Production deployment of the exact Git commit** through the Vercel deployments API with a `gitSource` (`github`, `arnab-netizen/OPsIq`, `ref: main`, `sha: <expected>`). Local files are never uploaded, so a dirty or divergent tree cannot reach Production (`LOCAL_TREE_DEPLOY_RISK=NO`). The tool waits for READY, checks the deployment's Git SHA and target, then checks Production serves the SHA. If step 2 fails, step 1 is restored to its previous value and the tool reports it.

The tool never touches Paddle, the database (beyond the one read-only plan check), subscriptions or billing records, and prints no secret.

Note: the project's `ignoreCommand` (`scripts/vercel-ignore-build.mjs`) fails open (continues the build) when it cannot classify a diff, which is the case for an API-created Git deployment of an unchanged commit; `forceNew=1` is sent so the build is not deduplicated against the existing deployment.

## 3. Verify after enabling

1. `/api/internal/build-info` shows the expected SHA and `production`.
2. With a fresh owner account: signup → onboarding → first diagnosis works; opening the first recommendation works; the next continuation step shows the upgrade notice and the API returns HTTP 402 `PLAN_LIMIT_EXCEEDED`.
3. `/owner/billing` is reachable, price comes from `public-pricing`, cancellation is present.
4. Completing a real checkout (owner's own test purchase) flips the account to entitled after Paddle's verified webhook; the same step then succeeds.

## 4. Emergency rollback

```sh
npm run billing:paywall:disable -- --expected-main-sha=<known-good 40-char SHA> \
  --confirm="DISABLE PRODUCTION PAYWALL" --production-url=https://<production host> [--dry-run]
```

Needs only `VERCEL_TOKEN`. Fewer checks: repository identity, clean tree, the SHA exists on `origin/main`, flag currently `on`. Two mutations only: set the flag to `off` (Production only) and redeploy that exact SHA from Git. It does not change subscriptions, Paddle or billing records; owners who already subscribed keep their subscription. Because disabling turns every gate into a no-op, no data is lost or blocked.

Manual fallback if the tool cannot run: in the Vercel dashboard set `BILLING_PAYWALL_ENFORCEMENT` to `off` for Production, then redeploy the last known-good production deployment.

## 5. Statically undetectable behaviours and monitoring

See `PAYWALL_BOUNDARY.md` section 6. After enabling, watch HTTP 402 volume and `PLAN_LIMIT_EXCEEDED` audit events, and check `MULTI_DIAGNOSIS_UNPAID` owners first: they are the ones a launch would newly block.
