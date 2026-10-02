# Directory, backlink and IndexNow research, first pass (2026-10-02)

Method: three WebSearch queries plus a repository read. Search snippets only; no directory site was opened, no account created, nothing submitted. Third-party blog and aggregator claims below are SECONDARY and must be re-checked on each directory's own page before any submission.

## Directories (all submissions are external publication: owner account and approval needed)

| Directory | Status | Evidence (secondary) | Fit for OpsIQ |
|---|---|---|---|
| BetaList | NOT SUBMITTED, QUALIFICATION UNVERIFIED | Aggregator posts say free submissions wait about 2 months, paid priority about $130, and the site targets beta / pre-launch products | Plausible: OpsIQ is a free, invite-only controlled beta. Confirm on betalist.com that an invite-only beta is accepted |
| Uneed | NOT SUBMITTED, QUALIFICATION UNVERIFIED | Free; all fields required: name, live URL, 60-char tagline, 250-char description, 512 px square logo, 2-3 screenshots, pricing model | Product-launch directory for indie makers; fit unknown |
| PeerPush | NOT SUBMITTED, QUALIFICATION UNVERIFIED | Free and paid listings (paid for faster publication) | Same |
| SaaSHub | NOT SUBMITTED, QUALIFICATION UNVERIFIED | No eligibility detail found | Typically wants a live public product; OpsIQ is invite-only. Likely NOT QUALIFIED until verified |
| G2 | NOT QUALIFIED (inference) | Not researched this pass | G2 requires a product with real user reviews; not applicable to a private beta |

Classification rule held: none is marked QUALIFIED until the directory's own rules are read. Directory count is not a KPI.

## Backlink prospects (resource pages)

- **Observed:** the searches for "free small business calculators" roundups returned vendor tool hubs (Upmetrics, Wave, SoloBizKit, Business Initiative, Phoenix Strategy, invoicer.ai, NAB, Countingup). These are the calculator's competitors and publish their own tools. They are not independent pages that list third-party tools.
- **Inference:** none is a credible link prospect from this pass. The search found competitors, not curators.
- **UNKNOWN:** whether independent roundup or curated "tools for small business" pages exist that link to third-party calculators. That needs a different query set (library and university business guides, small-business-development-centre resource pages, accountant resource lists) and a page-by-page check that each page is maintained and has a contact route. Not started.
- No outreach drafted; none sent.

## IndexNow feasibility (repository read)

- **Observed:** static files in `public/` are served (`public/llms.txt` exists) and `middleware.ts` passes every request through, so an IndexNow key file at `/<key>.txt` would be served.
- **Observed:** deploys go through Vercel's Git integration. There is no existing deploy hook that could submit URLs.
- **Inference:** the smallest safe design is a `public/<key>.txt` key file plus a manually triggered (`workflow_dispatch`) script that POSTs an explicit URL list to the IndexNow endpoint after a production deploy is live. A key must be public by design, so it is not a secret. Submit only added, updated or deleted URLs.
- **Limits:** IndexNow is read by Bing, Yandex, Naver, Seznam and others; Google does not use it, and the calculator's open problem is Google indexing. A submission is DISCOVERY REQUESTED, never INDEXED. Bing Webmaster Tools (BROWSER_HANDOFF H3) is a prerequisite for seeing any result.
- **Decision:** feasible but low priority. Build after #566 and #572 are merged and Bing is verified, as its own PR.
