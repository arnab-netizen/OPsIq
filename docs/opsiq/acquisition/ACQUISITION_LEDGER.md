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

## 0. Experiment ledger (authoritative, from 2026-10-02)

One row per acquisition action. Nothing is published unless it can be reconciled to a row here.
`UNKNOWN` means the value could not be established from current evidence; it is never a guess.
Rows below the line "Historic rows" were reconstructed from the sections that follow and keep their original provenance there.

| ID | Date | Asset | Channel | Audience/problem | Query/problem targeted | Destination | UTM source | UTM medium | UTM campaign | Published | Indexed | Impressions | Visits/clicks | Beta requests | Attribution verified | Result | Next action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RES1-PAGE-001 | 2026-09-24 | Resource #1 article | Owned site / organic search | Owner profitable but short on cash | profit vs cash (VOLUME UNKNOWN) | `/resources/profitable-but-short-on-cash` | n/a | n/a | n/a | YES (ledger §1; live state not re-verified 2026-10-02, container egress blocked) | NO as of 2026-09-24 (request queued); current state UNKNOWN | UNKNOWN (no GSC read yet) | 13 visitors / 24 views, 2026-09-04 to 10-02, includes QA (Vercel) | UNKNOWN | NO (no `beta_requests` read yet) | INSUFFICIENT DATA | GSC URL Inspection (BROWSER_HANDOFF H1/H2) |
| RES1-INDEX-001 | 2026-09-24 | `/resources` index | Owned site | Browsers of resources | n/a | `/resources` | n/a | n/a | n/a | YES (same caveat) | NO as of 2026-09-24; current UNKNOWN | UNKNOWN | 10 visitors / 37 views, same window, includes QA | UNKNOWN | NO | INSUFFICIENT DATA | GSC URL Inspection |
| CALC-PAGE-001 | 2026-09 | Profit margin calculator | Owned site / organic search | Owner wanting margin, markup, target price, profit-vs-cash check | margin / markup / target-margin queries (VOLUME UNKNOWN) | `/tools/profit-margin-calculator` | n/a | n/a | n/a | YES (live state not re-verified, egress blocked) | "Discovered - currently not indexed" per PR #566 body, 2026-10-01; not re-verified | UNKNOWN | **UNKNOWN / NOT MEASURED** (see §2a) | UNKNOWN | NO | NOT MEASURED | Merge PR #572 (measurement) and PR #566 (page); re-inspect in GSC 3-7 days after #566 deploys |
| INTLINK-RES1-CALC-001 | 2026-10-02 | Contextual internal link, Resource #1 to calculator | Owned site (internal link) | Readers of the profit-vs-cash guide | profit vs cash self-check | `/tools/profit-margin-calculator` | n/a (internal link, no UTM by design) | n/a | n/a | NO. PR #573 open at head `cc819cc8c3dc80cf154342020409b8ad3eeb812d`, CI pending, not merged | n/a | n/a | NOT MEASURED until #572 deploys (calculator views were dropped by the analytics allowlist) | UNKNOWN | n/a | INSUFFICIENT DATA | After #572 and #573 are both live, compare calculator views with referrer = guide path; no ranking or indexing effect is claimed |
| HOME-001 | 2026-09 | Homepage | Owned site | General | n/a | `/` | n/a | n/a | n/a | YES | UNKNOWN | UNKNOWN | 23 visitors / 34 views, same window, includes QA | UNKNOWN | NO | INSUFFICIENT DATA | none |
| RES1-LI-001 | UNKNOWN (before 2026-09-24) | Company LinkedIn post, Resource #1 | LinkedIn company page | Owners | profit vs cash | Resource #1 (tagged or untagged: UNKNOWN) | UNKNOWN | UNKNOWN | UNKNOWN | YES (`urn:li:share:7508916807861383168`) | n/a | 2 (2026-09-24, LinkedIn-side) | 0 clicks (LinkedIn-side) | 0 | NO | NO EXPOSURE (provisional: 2 impressions) | Do not repost same copy; change the experiment |
| RES1-MD-001 | UNKNOWN (before 2026-09-24) | Medium article, worked example | Medium | Owners | profit vs cash | Resource #1 (tagged or untagged: UNKNOWN) | UNKNOWN | UNKNOWN | UNKNOWN | YES (URL in §3) | n/a | UNKNOWN | UNKNOWN | 0 attributed (2026-09-24) | NO | INSUFFICIENT DATA | Medium stats read (BROWSER_HANDOFF H6) |
| RES1-FB-001 | 2026-09-24 | Facebook Page post, Resource #1 | Facebook Page | Owners | profit vs cash | Resource #1 tagged link | facebook (planned) | social (planned) | resource_1_launch (planned) | UNKNOWN: ledger said PREPARED, not sent; Vercel shows facebook.com / m.facebook.com referrers (2 visitors, 3 views) which are NOT attributable to a known post | n/a | UNKNOWN | 2 visitors with a facebook referrer (Vercel, 2026-09-04 to 10-02; could be owner/QA) | UNKNOWN | NO | INSUFFICIENT DATA | Verify page state (H4) |
| CALC-FB-001 | UNKNOWN | Facebook post, calculator | Facebook Page | Owners | margin / profit vs cash | `/tools/profit-margin-calculator` | facebook | social | UNKNOWN | UNKNOWN (previous session described it as prepared, unpublished) | n/a | UNKNOWN | UNKNOWN | UNKNOWN | NO | NOT MEASURED | Verify then publish (H4) |
| REF-GOOGLE-001 | 2026-09-04 to 10-02 | Referral observation | Google | UNKNOWN | UNKNOWN | UNKNOWN (path breakdown not pulled) | n/a | n/a | n/a | n/a | n/a | n/a | 3 visitors / 3 views with `google.com` referrer (Vercel) | UNKNOWN | NO | INSUFFICIENT DATA. Not classified as qualified users | Pull path + GSC query for these visits |

### 0a. Result classifications

| Class | Meaning | Response |
|---|---|---|
| NO EXPOSURE | The asset was not shown to anyone measurable (impressions or reach near zero) | Distribution problem. Change the channel or experiment; do not rewrite the landing page |
| EXPOSURE / NO TRAFFIC | It was shown but produced no visits | Message, title or intent mismatch. Compare against the real SERP or channel presentation |
| TRAFFIC / NO CONVERSION | Visits arrived, no beta request | Audit proposition, audience, CTA, trust and friction |
| CONVERSION | At least one attributed beta request | Find the cause; replicate cautiously |
| INSUFFICIENT DATA | Too little time, volume or evidence to classify | Gather more; declare neither success nor failure |
| NOT MEASURED | The measurement system could not have recorded the outcome | Fix measurement first; no inference allowed from absent records |

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

### 2a. Baseline correction — calculator page views are NOT MEASURED (recorded 2026-10-02)

**`/tools/profit-margin-calculator` page views = UNKNOWN / NOT MEASURED. Not zero.**

- **Observed fact:** the public-page analytics allowlist (`src/lib/analytics/public-page-analytics.ts`) did not include `/tools/profit-margin-calculator`, so its `beforeSend` filter dropped every calculator page view before it left the browser. Vercel Web Analytics (queried 2026-10-02 ~06:00 UTC, window 2026-09-04 to 2026-10-02) lists no row for that path.
- **Inference:** the absence of a Vercel record cannot distinguish zero visits from dropped events. No traffic conclusion for this path is valid for the affected period.
- **Affected period:** from the first production deploy that contained the calculator page up to the production deploy of PR #572. Exact start date: UNKNOWN (not established from available evidence; the calculator is in the sitemap as of this repo state, but the first-deploy date was not looked up). End: not yet reached, PR #572 is open and not merged.
- **Measurable paths** (Vercel, 2026-09-04 to 2026-10-02, include QA/verification visits that cannot be separated): `/` 23 visitors / 34 views; `/resources` 10 / 37; `/resources/profitable-but-short-on-cash` 13 / 24. Referrers: direct 31 visitors / 108 views; google.com 3 / 3; vercel.com 3 / 4 (consistent with owner/QA); facebook.com 1 / 1 and m.facebook.com 1 / 2. A country/device split showed India with 10 visitors but 81 views, which looks like owner/QA browsing; this is inference, not fact.
- **Not claimed:** google.com and facebook.com referrals are not classified as qualified users or potential customers. There is no evidence of who they were.

### 2b. Internal-link audit (repository, 2026-10-02)

- **Observed:** the only inbound links to `/tools/profit-margin-calculator` are the site-wide header "Calculators" link (`PublicSiteHeader.tsx`) and the sitemap entry. Resource #1 (`content/resources/profitable-but-short-on-cash.md`) contains no link to the calculator. `/resources` and the homepage have no contextual link either.
- **Inference:** Resource #1 is the page with the most external views, and it sends no reader to the free tool. A contextual link from the guide is the highest-value internal link available. It is its own PR: #573 (not mixed with #566 or #572).
- PR #566 adds links from the calculator back to the guide and `/resources`.

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
| 2026-10-02 | Ledger restructured to the experiment format (§0, §0a); calculator baseline corrected to NOT MEASURED (§2a); internal-link audit (§2b); BROWSER_HANDOFF added (§6); PR #566 and PR #572 gate evidence recorded in §7 | Vercel Web Analytics (2026-10-02 ~06:00 UTC); repo audit; GitHub check runs |

## 6. BROWSER_HANDOFF

Only tasks that need the owner's authenticated browser. Repository work is not repeated here. The container cannot reach `opsiq.solutions` (egress proxy returns 403) and has no login to any of these services.

| # | Service / URL | Data or action required | Why Code cannot do it | Evidence to return | Read-only? |
|---|---|---|---|---|---|
| H1 | Google Search Console, property for opsiq.solutions, Performance | Last 7 and 28 days: clicks, impressions, CTR, avg position; query table, page table, country table (export CSV) | No Google login in the container | Screenshots or CSV exports with the date range visible | Read-only |
| H2 | Search Console, URL Inspection, for `/`, `/resources`, `/resources/profitable-but-short-on-cash`, `/tools/profit-margin-calculator`; Sitemaps page | Indexing state per URL, last crawl, canonical chosen by Google; sitemap status and discovered-URL count. Do NOT press Request Indexing again | Same | Verbatim state text per URL | Read-only |
| H3 | Bing Webmaster Tools | Sign in, add or import the site from Search Console, submit `https://opsiq.solutions/sitemap.xml`, inspect the 3 content URLs | Needs the owner's Microsoft account and site verification | Verification status, sitemap status, URL Inspection result | Mutating (adds site, submits sitemap) |
| H4 | Facebook Page (OpsIQ) | Check whether the calculator post and the Resource #1 post exist, are public, and have the tagged link; if the calculator post is unpublished, publish the prepared copy once with its tagged link; confirm no boost | Needs Page admin session; publishing is an external communication | Permalink, screenshot of public view, confirmation of no paid boost | Read for verification; mutating for publishing |
| H5 | LinkedIn company page analytics (page `urn:li:share:7508916807861383168` and page-level analytics) | Impressions, link clicks, reactions, followers, page visitors, search appearances | Needs admin session | Screenshot with date range | Read-only |
| H6 | Medium stats for the worked-example article | Views, reads, referrers; whether the link in the article is the tagged one | Needs the author login | Screenshot; the exact outbound link href | Read-only |
| H7 | `https://opsiq.solutions/admin/beta-requests` | Aggregated counts only: total, per day, first-touch source, landing path, referrer host, UTM fields. No personal data in the report | Needs the owner's authenticated session and production DB | Aggregated table | Read-only |
| H8 | Production browser verification (until container egress allows `opsiq.solutions`) | After merge: load `/tools/profit-margin-calculator` on desktop and a 375 px mobile window; check title, canonical, one H1, FAQ visible, no console errors; check a Vercel Analytics page view appears for the path | No egress to production | Screenshots, console log, Vercel Analytics path row | Read-only |
| H9 | Production: PR #566 and PR #572 exact-SHA merge decisions | Owner written authorization at the exact SHA | Policy: owner authorization required | The SHA, in writing | Mutating (merge) |
| H10 | Public owner problem threads (Reddit r/smallbusiness and similar, Quora, small-business forums) | Read-only: collect up to ~20 recent public threads where an owner describes profit-but-no-cash, late-paying customers, pricing or margin confusion. Per thread record: URL, date, problem expressed, business type and geography only if stated publicly, subreddit rule on links. Do not post, DM or scrape private data | Container fetch of reddit.com is refused ("unable to fetch"); web search returns advice articles, not owner threads | A table of thread URLs and the stated problems, plus each community's self-promotion rule | Read-only |
| H11 | First-party submission pages: betalist.com, uneed.best, peerpush.net, saashub.com | Read each directory's own eligibility and cost rules; state whether an invite-only free beta qualifies. Do not submit | Container egress blocks all four hosts (EGRESS_BLOCKED) | Quoted eligibility text and current wait time or fee per directory | Read-only (submission itself would be mutating and needs owner approval) |
| H12 | Curator and resource pages: smithtonpl.org business and financial information page, merchantsbank.com business resources, and any similar library, development-centre or accountant resource lists | Read-only: for each, confirm the page lists third-party (non-owned) tools, shows a recent update date, and has a contact or suggestion route; record URL and the evidence. Do not contact anyone | Container egress blocks these hosts | Per page: URL, third-party tools listed (yes/no), last-updated date, contact route | Read-only |

## 7. Gate evidence (2026-10-02)

**PR #566** head `66c3464d355ba1d7a97b81ec846821fb119ad595` (branch merged forward from `main` `4cec36a`, no conflicts): build-and-test (20.x) success, branch-protection success, Classify change risk success, actionlint success, Vercel Preview Comments success, DB Verification skipped (expected, no DB-touching change). Local on the same head: `vitest run` on the resources, tools and analytics suites 183/183 pass; eslint and `tsc --noEmit` clean; local `next dev` render checked at 1280, 390 and 375 px: one H1, no horizontal overflow, FAQ text equals FAQPage JSON-LD (7 of 7), valid breadcrumb, canonical query-free, internal links all 200, 39 keyboard stops all with a visible focus indicator, no failed requests, no non-local requests, no POSTs, no console errors apart from the dev-server HMR websocket. Production-only checks remain pending (H8).

**PR #572** head `9378a008153eafc36cb4b96dfd3fabc40c26beef`: see the final report in the session; CI status is recorded there at the time of the last check.
