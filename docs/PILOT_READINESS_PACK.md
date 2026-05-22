# PILOT READINESS PACK

**Document:** Pilot program guidance for first serious/paid users  
**Created:** 2026-05-22  
**Audience:** Sales, Customer Success, Product Leadership  
**Status:** Ready for pilot enrollment  

---

## EXECUTIVE SUMMARY

OpsIQ is **code-ready for pilot deployment** but **not production-ready** for general availability. This pack defines:

- Who should be invited to pilot
- Who should wait
- What to show them
- What success looks like
- How to support them
- How to manage failure

**Pilot Goal:** Validate product-market fit with 3-5 paying customers, iterate rapidly, prepare for GA.

---

## SECTION 1: PILOT PROGRAM DEFINITION

### 1.1 What is a Pilot?

**Not:**
- Free trial for tire-kickers
- Perpetual freemium tier
- Beta testing (we're past that)
- Full production support

**Is:**
- Paid commitment (minimum $X/month or $Y upfront)
- 3-6 month engagement
- Weekly check-ins
- Rapid feedback loops
- Direct access to product team
- Custom onboarding (not self-serve)

---

## SECTION 2: IDEAL PILOT CUSTOMER

### 2.1 Profile: Who to Invite

**Company Size:**
- 50-500 employees
- Mid-market preferred (more budget, real problems)
- Remote-first or distributed (understands async ops)

**Industry:**
- Professional services (consulting, audit, advisory)
- Operations & transformation
- Program/project management
- Internal audit, compliance
- Private equity/portfolio operations
- Preferred: B2B services, not B2C/retail

**Problem:**
- **Primary:** "We track business interventions in spreadsheets and Slack"
- **Secondary:** "We're losing track of action items / accountabilities"
- **Tertiary:** "We want to prove ROI to leadership"

**Budget:**
- $2,500-10,000 annual budget (willing to pay for solution)
- Have signed off on purchase (not just "interested")
- Not price-sensitive (not shopping on cost alone)

**Technical:**
- Has IT support (can manage integrations if needed)
- Comfortable with SaaS (not on-premise requirements)
- Not requiring 99.95% SLA yet
- Willing to work with new vendor

**Organizational:**
- Single point of contact (champion/buyer)
- Clear problem statement
- Willing to dedicate 2-3 hours/week for 6 months
- Not in crisis (can focus on learning tool)

### 2.2 Red Flags: Who NOT to Invite Yet

❌ **DO NOT invite:**
- Fortune 500 enterprises (need more features, compliance, SLA)
- Solo/freelance consultants (wrong use case, no team)
- Price-sensitive buyers (will churn on cost)
- "Just exploring" buyers (not committed, waste time)
- Competitors or vendors analyzing pricing
- Those requiring on-premise, air-gapped, or HIPAA/FedRAMP
- Those needing 24/7 support or SLA guarantees
- Excel/spreadsheet lovers who refuse to change
- Those requiring integrations we don't have yet (Salesforce, HubSpot, etc.)

---

## SECTION 3: PILOT OFFERING

### 3.1 What You're Offering

**Product:**
- Full OpsIQ feature set (workspaces, engagements, interventions, blockers, actions, metrics)
- Single workspace (can upgrade later)
- Up to 10 team members included
- Email support (48-hour SLA)
- Weekly check-in calls (you + 1 customer success person)

**What's NOT Included:**
- Custom development
- 24/7 support
- SLA guarantees
- On-premise deployment
- Advanced reporting/BI integration (yet)
- API access (yet)
- SSO/advanced auth (yet)

### 3.2 Suggested Pricing

**Option A: Monthly**
- $500/month (includes 10 seats)
- 3-month minimum commitment
- Total: $1,500 pilot investment

**Option B: Annual**
- $5,000/year (includes 10 seats)
- 6-month evaluation period, then annual renewal
- Total: $5,000 one-time, then $5,000 annually

**Option C: Hybrid**
- $250/month for first 3 months (discount to start)
- $500/month months 4-12
- Lock in early pricing, reward commitment

**Recommendation:** Option B (annual prepay) for cash flow and commitment signal.

### 3.3 What You Include

**Onboarding:**
- 2-hour setup call (help them create workspace, add team, import initial data)
- Documentation walkthrough
- Admin training (1 hour)
- End-user training (1 hour group session)

**Support During Pilot:**
- Email support (reply within 48 hours)
- Weekly 30-minute check-in call (you + CSM)
- Slack channel for quick questions
- Product feedback sessions (monthly)
- Bug fixes prioritized over feature work
- Feature requests documented (may be built if common)

**Post-Pilot:**
- Monthly business review
- Roadmap preview
- Renewal discussion (month 5 of 6)

---

## SECTION 4: SUCCESS CRITERIA

**Pilot is successful if:**

✓ Customer completes onboarding without significant issues  
✓ At least 3 engagements created (not just demo data)  
✓ At least 5 team members actively using (2+ logins per week)  
✓ At least 2 interventions/blockers added per engagement  
✓ Weekly check-in meetings have customer attendance  
✓ Customer provides positive feedback in month 2  
✓ Customer reports internal adoption (team using without prompting)  
✓ Customer willing to renew for year 2  
✓ Customer willing to serve as reference/case study  
✓ NPS score ≥ 7 (Net Promoter Score: "Would you recommend OpsIQ?")

**Threshold for success:** 7/10 criteria met = continue with customer beyond pilot  
**Threshold for failure:** <5/10 criteria met = exit gracefully, understand why

---

## SECTION 5: FAILURE CRITERIA (When to Exit)

**Exit pilot if:**

✗ Zero engagements created by week 4 (not using it)  
✗ Fewer than 2 team members logging in per week (no adoption)  
✗ Customer requesting 5+ features not on roadmap (wrong fit)  
✗ Customer has pricing objections after 2 weeks (not serious)  
✗ Customer missing 2+ weekly check-in calls without reason (disengaged)  
✗ Critical bug discovered that affects their workflow (stability issue)  
✗ Customer requesting on-premise/air-gapped deployment (scope creep)  
✗ Customer NPS < 5 at month 2 (unhappy, not likely to refer)  
✗ Unresolved support issue lasting 2+ weeks (capability gap)  

**Exit process:**
1. Give 2-week notice: "Pilot not the right fit, let's discuss alternatives"
2. Offer: Full refund OR month-to-month pricing (lower commitment)
3. Document: What went wrong, lessons learned
4. Maintain relationship: "We'd love to work with you when X is ready"

---

## SECTION 6: RISK DISCLAIMERS

**Tell customers upfront:**

### 6.1 Data & Security

> "OpsIQ is pilot software. We have industry-standard security (SSL, encrypted at rest), but we are not SOC 2 certified yet. Do not store data subject to HIPAA, PCI-DSS, or FedRAMP compliance requirements."

### 6.2 Availability & Uptime

> "We target 99.5% uptime, but do not guarantee SLA. During pilot, we may perform maintenance with < 24 hours notice. Production-grade infrastructure coming in Q3 2026."

### 6.3 Support

> "Support is during business hours (9am-5pm EST, M-F). We aim for 48-hour response time, not 1-hour. For critical incidents, contact your CSM directly."

### 6.4 Feature Roadmap

> "Features may change based on customer feedback. We reserve the right to remove beta features or change pricing after pilot period. We will give 30 days notice for pricing changes."

### 6.5 Data Export & Retention

> "You can export your data at any time (CSV, JSON). If you cancel, we will retain your data for 30 days, then delete it. No backups guaranteed."

### 6.6 Scope Boundaries

> "OpsIQ is not a substitute for: project management (use Asana), CRM (use Salesforce), financial planning (use FP&A tools). It's focused on governance of business interventions."

---

## SECTION 7: CUSTOMER SUPPORT PROCESS

### 7.1 First Week (Onboarding)

**Day 1:** Send welcome email with login link, 2-hour setup call scheduled  
**Day 2:** Setup call (admin + 1 executive sponsor)  
**Day 3:** Admin training (1 hour, admin role only)  
**Day 5:** End-user training (1 hour, all team members)  
**Day 7:** Check-in call: "How's it going? Any blockers?"

### 7.2 Weeks 2-4 (Ramp-Up)

**Weekly call (30 min):**
- What are they working on?
- Any blockers or issues?
- Feature requests/feedback?
- How's adoption going?

**Expected behavior:**
- First engagements created
- Team members logging in
- Learning curve (normal questions)
- Feature requests start arriving

### 7.3 Weeks 5-12 (Steady State)

**Bi-weekly calls** (reduce to every other week if going well)  
**Expected:**
- Regular usage (3+ engagements)
- Fewer onboarding questions
- More sophisticated feature requests
- Ideas for their business

### 7.4 Months 4-6 (Evaluation & Renewal)

**Monthly business reviews:**
- Usage metrics
- Customer feedback
- Feature wishlist
- Renewal conversation (month 5)

**Decision points:**
- Will they renew? (Decision should be clear by week 20)
- What's needed for renewal? (More features? Better support? Price change?)

---

## SECTION 8: METRICS TO TRACK

**For each pilot customer, track:**

| Metric | Target | Timing | Owner |
|--------|--------|--------|-------|
| Workspace creation | Day 1 | Setup call | CSM |
| Team member invites | Week 1 | By training | CSM |
| First engagement | Week 2 | By end | CSM |
| Active users (2+ logins/week) | ≥5 | Week 3 | Analytics |
| Engagements created | ≥3 | Month 2 | Analytics |
| Interventions added | ≥2 per engagement | Month 2 | Analytics |
| Support tickets | <5 | Ongoing | Support |
| Feature requests | Document | Ongoing | Product |
| NPS score | ≥7 | Month 2 | CSM |
| Attendance at check-ins | ≥80% | Ongoing | CSM |
| Renewal decision | Yes/No | Month 5 | Sales/CSM |

---

## SECTION 9: SALES PITCH (30 seconds)

> "OpsIQ helps consulting and operations teams track and govern business interventions at scale. Instead of sprawled spreadsheets and Slack, you get a single source of truth for who's doing what, what's blocked, and what's the business impact. We've built this with real consulting teams. We're looking for 5 pilot customers to validate the product and prepare for launch. You'd get access to the full product, dedicated support, and direct input on the roadmap. We're offering a 6-month pilot at $5,000/year. Are you interested in a demo?"

---

## SECTION 10: OBJECTIONS & RESPONSES

### "Why should I pay for pilot software?"

> "Fair question. We ask payment for three reasons: (1) ensures commitment — we're finding pilots with real problems, not just curiosity seekers; (2) gives us budget for support — we assign a CSM and iterate based on your feedback; (3) helps us understand value — paid pilots tell us how much the product is worth. If you're not serious, that's fine, but pilot is for committed customers."

### "What if there's a critical bug?"

> "We prioritize bugs affecting pilot customers. If something breaks your workflow, email us and we'll diagnose within 24 hours. That said, we're not a production system yet. If you need 99.95% uptime, we're not ready. But the bugs will get fixed."

### "Can you customize it for us?"

> "We'd love to, but that's not part of the pilot. Pilot is to validate the product as-is. If we build custom features, we can't learn what the core product should be. But we take all feature requests and build them if multiple customers ask. We review these in our monthly product meetings."

### "What happens when the pilot ends?"

> "Three options: (1) Renew at standard pricing; (2) Switch to month-to-month if you want to keep exploring; (3) Exit if it's not the right fit. We're not trying to trap you. But we do need a commitment decision by month 5."

### "Can I get a discount?"

> "This is our pilot pricing — $5,000/year is already discounted vs. where we'll price at GA (~$7,500-10,000). If you need a different term (e.g., $200/month instead of $5k annual), we can discuss, but we need upfront commitment."

---

## SECTION 11: FIRST CUSTOMER HANDOFF

**After customer signs pilot agreement:**

1. **Sales → CSM:** Send customer contact info, contract terms, expected start date
2. **CSM:** Send welcome email within 24 hours
3. **CSM + Admin:** Schedule 2-hour setup call
4. **Product:** Create account in production environment
5. **Engineering:** Monitor for bugs during customer ramp-up
6. **Support:** Join customer Slack channel (or use email)

**Weekly:**
- CSM: Weekly check-in call (30 min)
- CSM: Email summary of usage metrics
- Engineering: Monitor error logs (proactive bug detection)

**Monthly:**
- CSM: Business review call
- Product: Feature request review (what customers asked for)
- Sales: Renewal assessment (on track? at risk?)

---

## SECTION 12: CASE STUDY / REFERENCE TEMPLATE

**After customer has success, ask for case study:**

> "We'd love to share your story with other companies. Would you be willing to be a reference? Here's what we'd ask:
> 
> - Logo/company name on website
> - 1-page case study (problem, solution, result)
> - Testimonial quote (1-2 sentences)
> - Willingness to take customer calls (2-3 per year)
> 
> In exchange: Priority feature requests, dedicated support, discounted renewal pricing."

**Incentive:** Offer them 20% off renewal if they participate in case study + willing to be reference.

---

## SECTION 13: SCALING FROM PILOTS TO GA

**Gate for moving to general availability:**

✓ **5+ pilots signed** (not required to be successful, just enrolled)  
✓ **3+ successful pilots** (meet success criteria)  
✓ **Case study** (at least 1 willing to be public reference)  
✓ **$50k+ ARR** (from pilots)  
✓ **Product stable** (< 1 P0 bug per month during pilot period)  
✓ **Documentation complete** (onboarding guides, video training)  
✓ **Support process defined** (tickets, SLA, escalation)  
✓ **Pricing clear** (standard pricing tiers, not custom)  

**After these gates pass:** Open to general trial/freemium (with limits)

---

## SECTION 14: PILOT COHORT PLAN

**Suggested enrollment by month:**

| Month | Pilots | Focus | Outcome |
|-------|--------|-------|---------|
| Jun 2026 | 1 | Learn (direct founder/CEO selling) | Refine pitch |
| Jul 2026 | 2 | Validate (repeat process) | Document what works |
| Aug 2026 | 2 | Scale (hire CSM, delegate) | Pilot process documented |
| Sep 2026 | 2 | Grow ARR | $30-50k ARR |
| Oct 2026 | 2 | Case studies | References for GA |
| Nov 2026 | 1 | Gather feedback | Plan for GA |

**By end of Q4 2026:** Ready for general availability (GA) launch

---

## SECTION 15: SUCCESS STORIES TO CAPTURE

**For each pilot, document:**

1. **How they found you** (referral? search? outreach?)
2. **What problem they had** (before state)
3. **How they use OpsIQ now** (after state)
4. **Time saved** (spreadsheet time → tool time)
5. **Team adoption** (% of team using weekly)
6. **Business impact** (faster decisions? better tracking?)
7. **Worst moment** (what almost made them churn?)
8. **Best moment** (what made them love it?)
9. **Feature they requested** (that should be standard?)
10. **Would they recommend?** (NPS, quotable quote?)

---

**Document End**

**Pilot program owner:** _____________________  
**First pilot customer:** _____________________ (TBD)  
**Target enrollment:** 5 pilots by Oct 2026  
**Success definition:** 3+ paying renewals by Jan 2027

---

## Quick Links

- Sales Demo Script: `docs/SALES_DEMO_SCRIPT.md`
- Customer Onboarding: `docs/FIRST_CUSTOMER_ONBOARDING_CHECKLIST.md`
- Buyer Proof Packet: `docs/BUYER_PROOF_PACKET.md`
