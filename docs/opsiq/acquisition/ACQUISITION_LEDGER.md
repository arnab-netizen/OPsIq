# OpsIQ Acquisition Ledger

Evidence-only record of the owned-content acquisition loop. Every row cites how
it was verified. Nothing is recorded as done without current evidence; anything
not verifiable is marked **BLOCKED** or **NOT YET OBSERVED**, never assumed.

Measurement model (owner-approved):

- **Lead-level source of truth:** first-party beta-request attribution on
  `beta_requests` (`utm_source/medium/campaign/content/term`, `landing_path`,
  `referrer_host`, `conversion_path`).
- **Traffic:** Vercel Web Analytics page views on public pages only (Hobby plan).
  Custom events (CTA click, modal open) are **deferred by owner decision** —
  Hobby does not support them. UTM breakdowns in Vercel require Web Analytics
  Plus (API returned `402 payment_required`, 2026-09-24) — not purchased; UTM
  attribution is read from `beta_requests` instead.

## 1. Owned surface — published state

| Item | Status | Evidence (2026-09-24, ~16:10 UTC) |
|---|---|---|
| Resource surface on production | LIVE | PR #532 → `main` `8b62d8a7`; Vercel prod deploy `dpl_9d2moX2RdcsVQpSwfmvLYtBQaRbn` |
| Resource #1 published | LIVE | PR #536 → `main` `d51f138be7b9ced700e9874fb1634cdf1a83a27f`; Vercel prod deploy `dpl_G6NxFGcGsWPjuwyfHwXUVsN19QbZ` (READY) |
| Article URL | 200 | `https://opsiq.solutions/resources/profitable-but-short-on-cash` — `x-matched-path` = the article route, not a draft |
| Canonical / OG | PASS | canonical = `https://opsiq.solutions/resources/profitable-but-short-on-cash`; `og:type=article`; `og:image` = site default `/og-image.png` (no resource-specific image) |
| Structured data | PASS | Article JSON-LD, headline matches H1 |
| Content render | PASS | 1 H1, 5 H2, 2 tables in scroll regions, disclaimer callout, CTA |
| Sitemap | PASS | article + `/resources` listed, `lastmod 2026-09-24` |
| Production DB migration | APPLIED | run 36006307835; `_prisma_migrations` finished 13:33:12Z, checksum `ef597d72…66c2` |

### 1a. Production gate — real-browser verification

**Gate: PASS — RESOURCE #1 PUBLISHED AND VERIFIED IN PRODUCTION**

- Live URL: `https://opsiq.solutions/resources/profitable-but-short-on-cash`
- Production deployment: `dpl_G6NxFGcGsWPjuwyfHwXUVsN19QbZ`, commit `d51f138be7b9ced700e9874fb1634cdf1a83a27f`
- Evidence source: completed Claude in Chrome production run (2026-09-24), a real
  browser against production. This supersedes the earlier "live browser checks
  BLOCKED" note (earlier §4) for the checks below; limits are stated per row.

| Check | Result | Limits |
|---|---|---|
| Responsive, real top-level window | PASS — 1039×556 @ DPR 2, no horizontal overflow | Only this top-level size was tested |
| Responsive, 375 / 390 widths | PASS in iframe emulation | Not tested as real top-level windows; exact outer sizes not verified |
| Beta modal open / close | PASS | — |
| Modal keyboard, Escape, focus return to trigger | PASS | — |
| Page keyboard smoke | PASS | — |
| Accessibility | axe BLOCKED by the site CSP; manual DOM audit PASS | No automated axe result exists |
| Console | PASS (limited) — 2 loads, no OpsIQ warnings or errors | Log coverage for the first load was incomplete |
| Network | PASS — 57 requests, all 200/304 | — |
| Analytics client payload | PASS — UTM retained, unrelated params stripped, private routes excluded, no PII in event body | Request headers and cookies not inspected |
| Provider-side UTM breakdown | BLOCKED — `402` / Web Analytics Plus paywall | Not purchased; UTM attribution stays on `beta_requests` |

## 2. Measurement — observed so far

First snapshot (~16:10 UTC), kept as recorded; later figures are in the dated
table below.

| Metric | Value | Source / window |
|---|---|---|
| Page views, `/resources/profitable-but-short-on-cash` | 9 (3 visitors) | Vercel Web Analytics, 2026-09-24 → 09-26 |
| Page views, `/resources` | 14 (3 visitors) | same |
| Other public paths recorded | `/`, `/about`, `/privacy`, `/terms` only | same — no private/admin/API path appears (allowlist working) |
| Referrer hostnames | none (all direct) | same |
| Beta requests since surface went live (14:28Z) | 0 | `beta_requests`, read-only count |
| Beta requests attributed to `/resources*` | 0 | same |

Interpretation: all traffic so far is direct and consistent with owner/verification
visits. **No external distribution has produced measurable traffic or leads yet.**

| Check (UTC) | Article views | Referrers seen | Beta requests since 14:28Z | LinkedIn/Medium-attributed requests |
|---|---|---|---|---|
| 2026-09-24 ~16:10 | 9 (3 visitors) | none (direct only) | 0 | — |
| 2026-09-24 ~16:40 | 9 (3 visitors) | none — no `linkedin.com` / `medium.com` referrer recorded | 0 | 0 (`referrer_host`/`utm_source`) |
| 2026-09-24, after Chrome run | 10 (3 visitors), Sep 24 aggregate | empty referrer only | 0 | 0 |

Reconciliation: the top table and the first two rows above are earlier snapshots
and are kept as recorded. Article views went from 9 to 10 while visitors stayed
at 3; the Sep 24 aggregate **includes QA/verification visits** (the Chrome run
among them), so none of it is evidence of external traffic. The latest check is
the one that counts: 10 views, 3 visitors, empty referrer, zero beta requests.

LinkedIn post analytics (LinkedIn-side, from the same run): 2 impressions, 0
clicks, 0 reactions, 1 comment (the owner's own).

Note: a link click from LinkedIn/Medium can arrive without a referrer (app
browsers, `noreferrer`), so "no referrer" is not proof the posts produced no
visits — it is proof no *attributed* visit or lead exists yet. Tagged links
make future clicks attributable at the lead level.

## 3. Distribution — channel status

| Channel | Status | Cost | Notes / blocker |
|---|---|---|---|
| Owned site (index, footer link, sitemap) | DONE | $0 | Evidence in §1 |
| Google Search Console (URL inspection, sitemap submit) | REQUESTED — NOT YET INDEXED | $0 | Chrome run: indexing requests for the article and `/resources` accepted/queued; neither is indexed yet. `sitemap.xml` resubmitted; discovered pages went from 4 to 6. (Earlier status: BLOCKED — no access from the agent session) |
| Bing Webmaster Tools / IndexNow | NOT STARTED | $0 | Needs owner account (Bing) or a key file + outbound ping; agent session egress is blocked |
| LinkedIn company post (prior run) | PUBLISHED (existing) — no new post this pass | $0 | Chrome run shows the existing company LinkedIn post is published: 2 impressions, 0 clicks/reactions, 1 owner comment. Share URL as recorded earlier: `https://www.linkedin.com/feed/update/urn:li:share:7508916807861383168/`. Earlier status: OWNER-REPORTED, UNVERIFIED. Do not repost the same copy |
| Medium article (prior run) | PUBLISHED (existing) — no new post this pass | $0 | `https://medium.com/@arnab.poddar_72328/profitable-on-paper-short-on-cash-a-worked-example-d0d2f635809e`. Earlier status: OWNER-REPORTED, UNVERIFIED. This ledger does not record whether it uses the tagged link (`utm_source=medium&utm_medium=syndication&utm_campaign=resource_1_launch`) |
| Facebook Page post | PREPARED — NOT SENT | $0 | Draft prepared; not published this pass |
| X (`@opsiqsolutions`) | READY TO POST | $0 | Copy + tagged link in `RESOURCE_1_DISTRIBUTION_KIT.md`; no posting connector in agent session |
| Founder personal LinkedIn | READY TO POST | $0 | Copy + tagged link in `RESOURCE_1_DISTRIBUTION_KIT.md`; no posting connector in agent session |
| Communities (e.g. small-business subreddits, forums) | READY — CHECK RULES FIRST | $0 | Many prohibit self-promotion; post only where rules allow, value-first |
| Newsletter / email to existing contacts | NOT STARTED | $0 | No list/connector available to the agent |
| Paid promotion | NOT PLANNED | — | Out of scope by owner instruction |

## 4. Open items / next steps

Constraints held this pass: no beta request submitted, no spend (no paid
promotion, add-on, or Web Analytics Plus), no production change or redeploy.

1. **Owner:** confirm the existing LinkedIn and Medium posts link to the article
   with the tagged links; only tagged clicks are attributable in `beta_requests`.
2. **Owner:** decide whether to send the prepared Facebook Page post (tagged link).
   Remaining unused channels (founder LinkedIn, X, communities) are still
   READY TO POST from `RESOURCE_1_DISTRIBUTION_KIT.md`.
3. **Owner:** recheck Search Console for indexing of the article and `/resources`
   (both requested, queued, not indexed yet); record the result here.
4. **Agent (next check-in):** re-query Vercel page views by path/referrer and
   `beta_requests` attribution counts; append a dated row to §2.
5. **Browser verification gaps** (from §1a): 375/390 widths verified only in iframe
   emulation; axe blocked by the CSP (manual audit only); first-load console
   coverage incomplete; analytics request headers and cookies uninspected.
6. **Low-severity note:** analytics counts 404s under `/resources/*` (one hit on
   an unknown slug recorded). Harmless, but it slightly inflates path lists; fix
   only if it becomes noisy.
7. **Optional:** a resource-specific social image (approved concept: $4,500 / 16%
   profit, $7,000 due, $5,000 gap) — currently the site default image is used.

## 5. Change log

| Date (UTC) | Change | Evidence |
|---|---|---|
| 2026-09-24 | Ledger created; Resource #1 live verification recorded | this file, sources in §1–§2 |
| 2026-09-24 | Prior-run LinkedIn + Medium posts recorded as owner-reported/unverified; second measurement row | PR #537 merged (`96271ce8`); Vercel referrer breakdown; `beta_requests` read-only counts |
| 2026-09-24 | Production gate PASS recorded from the Claude in Chrome run (§1a); third measurement row + reconciliation (9 → 10 views incl. QA); LinkedIn post analytics; Search Console requests/sitemap; LinkedIn + Medium posts moved from owner-reported to published; Facebook post prepared, not sent | Claude in Chrome production run; Vercel Web Analytics Sep 24 aggregate; `beta_requests` count; PR #538 merged (`6feb2931`) |
