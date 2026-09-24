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

## 2. Measurement — observed so far

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

Note: a link click from LinkedIn/Medium can arrive without a referrer (app
browsers, `noreferrer`), so "no referrer" is not proof the posts produced no
visits — it is proof no *attributed* visit or lead exists yet. Tagged links
make future clicks attributable at the lead level.

## 3. Distribution — channel status

| Channel | Status | Cost | Notes / blocker |
|---|---|---|---|
| Owned site (index, footer link, sitemap) | DONE | $0 | Evidence in §1 |
| Google Search Console (URL inspection, sitemap submit) | BLOCKED | $0 | No Search Console access from the agent session; owner action |
| Bing Webmaster Tools / IndexNow | NOT STARTED | $0 | Needs owner account (Bing) or a key file + outbound ping; agent session egress is blocked |
| LinkedIn post (prior run) | OWNER-REPORTED, UNVERIFIED | $0 | `https://www.linkedin.com/feed/update/urn:li:share:7508916807861383168/` — agent session cannot load linkedin.com (egress blocked) to confirm content/link/UTM; do not repost the same copy |
| LinkedIn (OpsIQ page `opsiq-hq`) | READY TO POST | $0 | Copy + tagged link in `RESOURCE_1_DISTRIBUTION_KIT.md`; no posting connector in agent session. Check the prior post above first to avoid duplication |
| Medium article (prior run) | OWNER-REPORTED, UNVERIFIED | $0 | `https://medium.com/@arnab.poddar_72328/profitable-on-paper-short-on-cash-a-worked-example-d0d2f635809e` — medium.com blocked from agent session; confirm it links to the canonical article (ideally with `utm_source=medium&utm_medium=syndication&utm_campaign=resource_1_launch`) |
| X (`@opsiqsolutions`) | READY TO POST | $0 | same |
| Founder personal LinkedIn | READY TO POST | $0 | same |
| Communities (e.g. small-business subreddits, forums) | READY — CHECK RULES FIRST | $0 | Many prohibit self-promotion; post only where rules allow, value-first |
| Newsletter / email to existing contacts | NOT STARTED | $0 | No list/connector available to the agent |
| Paid promotion | NOT PLANNED | — | Out of scope by owner instruction |

## 4. Open items / next steps

1. **Owner:** post the kit's LinkedIn + X copy using the exact tagged links (so
   any resulting beta request is attributed in `beta_requests`).
2. **Owner:** Search Console → inspect the article URL, request indexing, confirm
   `sitemap.xml` is submitted. Record the result here.
3. **Agent (next check-in):** re-query Vercel page views by path/referrer and
   `beta_requests` attribution counts; append a dated row to §2.
4. **Live browser checks** (responsive, modal/keyboard, console, analytics beacon)
   remain BLOCKED from the agent container (egress denies `opsiq.solutions`).
   Page-view arrival in §2 is indirect evidence the beacon works from real browsers.
5. **Low-severity note:** analytics counts 404s under `/resources/*` (one hit on
   an unknown slug recorded). Harmless, but it slightly inflates path lists; fix
   only if it becomes noisy.
6. **Optional:** a resource-specific social image (approved concept: $4,500 / 16%
   profit, $7,000 due, $5,000 gap) — currently the site default image is used.

## 5. Change log

| Date (UTC) | Change | Evidence |
|---|---|---|
| 2026-09-24 | Ledger created; Resource #1 live verification recorded | this file, sources in §1–§2 |
| 2026-09-24 | Prior-run LinkedIn + Medium posts recorded as owner-reported/unverified; second measurement row | PR #537 merged (`96271ce8`); Vercel referrer breakdown; `beta_requests` read-only counts |
