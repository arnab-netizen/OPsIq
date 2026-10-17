# MARKETPLACE_LAUNCH_READY — missing asset checklist (not built in this mission)

Verified against repo at base `e5749ff`: `/privacy`, `/terms`, `/about`, `/resources` pages exist; `beta` page exists.
Everything below is **missing or unverified**; none was built.

| # | Asset | Status | Owner action |
|---|---|---|---|
| 1 | Pricing copy (plan name, price, what is free vs paid, "free first diagnosis") | MISSING — no public pricing page | Write after price set in Paddle |
| 2 | Refund / cancellation copy (Paddle MoR refund window; "cancel anytime, access until period end") | MISSING | Write; link from checkout + `/owner/billing` |
| 3 | Terms of Service review for paid subscription, MoR (Paddle) clause, acceptable use | GAP — `/terms` exists, not reviewed for paid plans | Legal review |
| 4 | Privacy policy: payment processor (Paddle) disclosure, billing data | GAP — `/privacy` exists, no processor disclosure | Update |
| 5 | Support contact (monitored email + response SLA shown in app and listing) | UNVERIFIED | Decide address; put on site + Paddle account |
| 6 | Screenshots (onboarding, first diagnosis, cockpit, approval flow) | MISSING | Capture from staging with demo data |
| 7 | Demo (2–3 min walkthrough video or sandbox demo workspace) | MISSING | Record |
| 8 | Product Hunt pack: tagline, description, first comment, gallery (5 imgs), thumbnail, maker video, launch-day plan | MISSING | Produce |
| 9 | General marketplace listing pack: 1-line pitch, long description, category/tags, logo set, feature bullets, FAQ, changelog link | MISSING | Produce |
| 10 | Paddle domain-review pre-reqs: public pricing, ToS, privacy, refund policy on the live domain | MISSING (blocks live Paddle approval) | Publish pages 1–4 before applying |

`MARKETPLACE_ASSET_GAPS=10`
