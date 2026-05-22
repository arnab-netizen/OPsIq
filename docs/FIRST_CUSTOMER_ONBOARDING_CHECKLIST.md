# FIRST CUSTOMER ONBOARDING CHECKLIST

**Document:** Step-by-step checklist to onboard first pilot customer  
**Duration:** 5-7 days (setup) + 6 months (pilot period)  
**Owner:** Customer Success Manager  
**Updated:** 2026-05-22  

---

## PRE-ONBOARDING (After contract signed)

### Step 1: Contract & Logistics (Day 0)

- [ ] Customer signs pilot agreement
- [ ] Contract reviewed by Legal/Finance
- [ ] Invoice sent (Net 30)
- [ ] Customer added to Slack channel: `#customer-[name]`
- [ ] Calendar invite sent: "Welcome call" (Day 1, 10am, 1 hour)
- [ ] Welcome email sent (with login link, video intro)
- [ ] Account created in production (workspace name: customer company name)
- [ ] Support ticket system set up (Zendesk/Intercom)

**Owner:** Sales  
- [ ] Signed: ______ Date: ______

### Step 2: Prepare Workspace (Day 1)

- [ ] Admin user created for customer (email: [their email])
- [ ] Initial workspace set up
- [ ] Sample engagement template created (for reference)
- [ ] Documentation uploaded to workspace (getting started guide)
- [ ] Test that login works (try it yourself)
- [ ] Performance verified (no 500 errors, response time <1s)
- [ ] Error tracking verified (Sentry showing no errors from their account)

**Owner:** Engineering/Product  
- [ ] Verified: ______ Date: ______

---

## DAY 1: WELCOME CALL (1 hour)

**Attendees:** CSM + Customer (ideally 2-3 from their team)

### Agenda & Script

**Intro (5 min)**

> "Thanks for choosing OpsIQ. We're excited to work with you. Over the next 6 months, we'll help you set this up, iterate based on your feedback, and ultimately, show you the value. Let me walk you through what that looks like."

**Their Situation (5 min)**

> "First, tell me — what's the biggest problem you're trying to solve with OpsIQ? And who on your team will be the main users?"

**Listen. Write down answers.**

**Demo the Workspace (10 min)**

> "Here's what you see when you log in. This is your workspace — your engagement hub. From here, you manage everything."

**Action:** Share screen, show dashboard (don't click around, just overview)

**Define Success (10 min)**

> "By the end of 6 months, what would success look like for you? More specifically:
> - How many engagements would you be tracking?
> - How many team members using it?
> - What's the #1 metric that tells you it's working?"

**Listen. Write down answers. This is your success criteria.**

**Next Steps & Support (15 min)**

> "Here's the plan:
> 
> 1. You get login credentials (I'll send right after this call)
> 2. Admin training: Tomorrow, 1 hour. You'll learn setup, adding users, creating engagements.
> 3. Team training: Next week, 1 hour. All your users see the basics.
> 4. Ramp-up: Weeks 1-4, you create your first engagements.
> 5. Check-ins: Every week, I'll hop on a quick call — how's it going? Any blockers?
> 6. Feedback: Monthly, we review usage, you give feedback, we iterate.
> 
> You also have email support — shoot us a message, we'll respond in 48 hours. For urgent issues, Slack me directly.
> 
> Questions?"

**Checklist:**

- [ ] Call completed
- [ ] Customer success criteria noted
- [ ] Login credentials sent
- [ ] Admin training scheduled (Day 2)
- [ ] Team training scheduled (Week 1)
- [ ] Support channel (Slack/email) confirmed

**Owner:** CSM  
- [ ] Completed: ______ Date: ______

---

## DAY 2: ADMIN TRAINING (1 hour)

**Attendees:** CSM + Customer Admin (1-2 people)

### Agenda

**1. Login & Navigation (5 min)**

> "Log in with your credentials. Here's the workspace. Three main sections:
> - Engagements (what you're tracking)
> - Team (who's working on what)
> - Settings (admin controls)"

**2. Create Your First Engagement (10 min)**

> "Let's create an engagement together. This is what you'll do for every client/project."

**Action:** Create engagement together

- Name: "Demo Engagement - Operations Review"
- Business Condition: "Client wants to improve operations"
- Intervention Type: "Structured review"
- Timeline: "12 weeks"

> "Now this engagement exists. Everything else goes under it."

**3. Add Team Members (5 min)**

> "Who else needs access? Give me their emails."

**Action:** Invite 2-3 team members

> "They'll get an email, click the link, set password. They'll land here with access to this engagement."

**4. Add Blockers & Actions (10 min)**

> "Let's say you identify a blocker. Here's how:"

**Action:** Add blocker together

- Title: "Finance team lacks visibility"
- Severity: "High"
- Assigned to: (assign to one of their team)

> "Now assign an action to address it. Action is the thing someone actually does."

**Action:** Add action

- Description: "Implement cost center tracking"
- Owner: (assign to team member)
- Due: "Week 2"

> "Your team member will see this on their dashboard. When they complete it, they check it off."

**5. Check Dashboard (5 min)**

> "Here's what your dashboard looks like now — 1 engagement, 1 blocker, 1 action. As you add more, this grows. But it's always visible."

**6. Key Points (5 min)**

> - Everything is under an engagement
> - Blockers are big problems
> - Actions are what gets done about them
> - Owners are accountable
> - Check-ins happen weekly to see progress

**7. Questions & Next Steps (5 min)**

> "Any questions? Great. Tomorrow you'll add your real first engagement. By Friday, I want to see your first blocker logged. That's the goal. Email me when you have questions."

**Checklist:**

- [ ] Admin created engagement
- [ ] Team members invited (2+)
- [ ] Blocker created
- [ ] Action created
- [ ] Dashboard reviewed
- [ ] Admin confident with basics

**Owner:** CSM  
- [ ] Completed: ______ Date: ______

---

## DAY 3-7: RAMP-UP WEEK 1

### Daily Actions

**Day 3 (Wed):**
- [ ] Customer invites their team (check Slack for confirmation)
- [ ] CSM: Monitor for errors (check Sentry)
- [ ] CSM: Proactive Slack message: "How's login going? Questions?"

**Day 4 (Thu):**
- [ ] Team training call scheduled (if not done)
- [ ] CSM: "Have you created your first real engagement yet? Happy to help live if you want"

**Day 5 (Fri):**
- [ ] Customer confirms first engagement created
- [ ] CSM: "Great! Now create 1-2 blockers under it"
- [ ] Check Sentry for any errors during their usage

**Day 6-7 (Weekend):**
- [ ] CSM: Monitor support emails (if any)
- [ ] Engineering: Monitor uptime (ensure no weekend issues)

**Owner:** CSM  
- [ ] Week 1 completed: ______ Date: ______

---

## WEEK 2: TEAM TRAINING & RAMP

### Day 8-9: Team Training Call (1 hour)

**Attendees:** CSM + All team members (ideally 3-10 people)

**Agenda:**

1. **Intro (2 min):** "Welcome to OpsIQ. For the next 6 months, you'll use this to track and govern your engagements."

2. **Logging in (2 min):** "Go to opsiq.com, log in with your email."

3. **Your Dashboard (3 min):** "This is what you see. Your engagements. Your actions. Your blockers."

4. **How to Update an Action (5 min):**
   - Find your action
   - Click "Mark Complete"
   - Leave a comment if needed
   - Save

5. **How to Discuss Issues (5 min):**
   - Click on a blocker
   - Comment on it
   - That's how you collaborate (not Slack, not email, here)

6. **Key Rules (5 min):**
   - Log in at least 2x per week
   - Update your actions when done
   - Comment on blockers if you have ideas
   - If stuck, ask in the engagement (don't email)

7. **Q&A (10 min)**

8. **What's Next (3 min):** "By end of week, we want to see 3 blockers and 5 actions logged. That's your goal."

**Checklist:**

- [ ] Training call completed
- [ ] 80%+ attendance
- [ ] Recording sent to team
- [ ] Slack message: "Great training! See you next week."

**Owner:** CSM  
- [ ] Completed: ______ Date: ______

### Day 9-14: Early Usage

- [ ] Customer creates 3+ engagements
- [ ] Customer creates 5+ blockers
- [ ] Customer creates 10+ actions
- [ ] 5+ team members have logged in (at least once)
- [ ] CSM: Daily Slack check-ins (morale boost)
- [ ] Engineering: Daily error monitoring

**Owner:** CSM + Engineering  
- [ ] Week 2 completed: ______ Date: ______

---

## WEEK 3: FIRST CHECK-IN CALL

**Duration:** 30 minutes  
**Frequency:** Weekly for first month, then bi-weekly

**Agenda:**

1. **How's it going? (10 min)**
   - Blockers? (technical, usability, anything)
   - Wins? (what's working well?)
   - Confusion? (what's not clear?)

2. **Usage Metrics (5 min)**
   - Engagements created: ___ (target: 3+)
   - Actions created: ___ (target: 10+)
   - Team members active: ___ (target: 5+)
   - Logins per week per person: ___ (target: 2+)

3. **Feature Requests (5 min)**
   - Anything you want us to build?
   - Anything you want different?
   - Document these (we review monthly with product team)

4. **Next Week Goals (5 min)**
   - Keep logging blockers and actions
   - Get to 5 engagements
   - Get team to 2+ logins per week each

5. **Support (2 min)**
   - Any technical issues?
   - Anything we can help with?

**Checklist:**

- [ ] Call scheduled & held
- [ ] Metrics captured in spreadsheet
- [ ] Feature requests logged
- [ ] Next week goals clear

**Owner:** CSM  
- [ ] Week 3 completed: ______ Date: ______

---

## WEEK 4-6: SUSTAINED USAGE PHASE

**Goals:**

✓ 5+ engagements created  
✓ 20+ blockers logged  
✓ 50+ actions tracked  
✓ 5+ team members with 2+ logins/week  
✓ Positive feedback on at least 1 feature  

**CSM Activities (Weekly):**

- [ ] Check-in call (30 min)
- [ ] Usage metrics reviewed
- [ ] Proactive help offer ("Want to create that engagement together?")
- [ ] Recognition ("Great work this week!")

**Engineering Activities:**

- [ ] Error monitoring (flag any bugs immediately)
- [ ] Performance monitoring (alert if slow)
- [ ] Feature usage analysis (which features are they using?)

**Checklist:**

- [ ] Week 4: ______ Date: ______
- [ ] Week 5: ______ Date: ______
- [ ] Week 6: ______ Date: ______

**Owner:** CSM + Engineering  

---

## MONTH 2: FIRST BUSINESS REVIEW

**Duration:** 1 hour  
**Attendees:** CSM + Customer (ideally 2-3 from their team, including decision maker)

**Agenda:**

1. **Intro (2 min):** "Great to check in. How's OpsIQ been for you?"

2. **Metrics Review (10 min)**
   - Engagements: ___
   - Blockers: ___
   - Actions: ___
   - Team members active: ___
   - Average logins per person per week: ___
   - Target vs. actual

3. **What's Working? (10 min)**
   - What features are they using most?
   - What saves them time?
   - Any positive feedback from team?

4. **What's Hard? (10 min)**
   - Blockers (technical, usability)?
   - Missing features?
   - Pricing concerns?

5. **Roadmap Preview (5 min)**
   - "Here's what we're building next..."
   - "Based on your feedback, we're prioritizing..."

6. **Renewal Discussion (preview) (5 min)**
   - "How are you thinking about year 2?"
   - "Anything that would make it a yes/no?"

7. **Next 4 Months (3 min)**
   - Keep deepening usage
   - Prepare case study/testimonial
   - Plan for renewal decision in month 5

**Checklist:**

- [ ] Business review held
- [ ] Metrics documented
- [ ] Feedback captured
- [ ] Customer sentiment: Positive / Neutral / Negative
- [ ] Next steps clear

**Owner:** CSM  
- [ ] Completed: ______ Date: ______

---

## MONTH 3-4: OPTIMIZATION & DEEPENING

**CSM Activities:**

- [ ] Bi-weekly check-ins (reduce frequency, they're ramped)
- [ ] Advanced feature training (if new features available)
- [ ] Case study prep (ask if willing to participate)
- [ ] Reference program info (offer incentive)

**Success Indicators:**

✓ 10+ engagements created  
✓ 50+ blockers tracked  
✓ 200+ actions managed  
✓ 70%+ of invited team members actively using  
✓ NPS score (ask: "Would you recommend OpsIQ?" 0-10) ≥ 7  

**Risk Indicators (If any, plan intervention):**

✗ Usage declining (logins down)  
✗ Team members dropping off  
✗ Negative feedback without resolution  
✗ Missing promised features causing frustration  

**Checklist:**

- [ ] Month 3 check-in: ______ Date: ______
- [ ] Month 4 check-in: ______ Date: ______
- [ ] Adoption healthy (70%+ team active)
- [ ] NPS score captured (≥7 = good, <5 = risk)

**Owner:** CSM  

---

## MONTH 5: RENEWAL CONVERSATION

**Duration:** 1 hour  
**Attendees:** CSM + Customer decision maker

**Agenda:**

1. **Recap the Pilot (5 min)**
   - "Here's what we accomplished together..."
   - Metrics: [Show results]

2. **Impact (10 min)**
   - Time saved?
   - Decision velocity improved?
   - Team alignment better?
   - Anything you can quantify?

3. **The Renewal (15 min)**
   - "We'd love to have you continue."
   - "Here's the pricing for year 2: $5,000/year (or $400/month)"
   - "What questions do you have?"

4. **Decision (10 min)**
   - "Can you decide in the next 2 weeks?"
   - "What would make it a yes?"
   - Document decision (yes/no/maybe)

5. **If Yes: Roadmap (5 min)**
   - "Here's what we're building next..."
   - "We'd love your input..."

6. **If No: Exit Gracefully (5 min)**
   - "We understand. What would need to change?"
   - "Can we revisit in 6 months?"
   - "Can we stay in touch?"

**Checklist:**

- [ ] Renewal conversation held
- [ ] Decision captured: YES / NO / MAYBE
- [ ] If yes: Invoice sent for year 2
- [ ] If no: Exit plan documented
- [ ] Lessons learned captured

**Owner:** Sales / CSM  
- [ ] Completed: ______ Date: ______

---

## MONTH 6: FINAL CHECK & TRANSITION

**If Renewing:**

- [ ] Year 2 contract signed
- [ ] Continue monthly business reviews (not weekly)
- [ ] Plan case study/testimonial
- [ ] Add to reference program
- [ ] Capture success story

**If Churning:**

- [ ] Understand why (detailed feedback)
- [ ] Document lessons learned
- [ ] Stay in touch (reach out in 6 months)
- [ ] Share learning with product team

**Checklist:**

- [ ] Final status: RENEWING / CHURNING
- [ ] Success story captured (if renewing)
- [ ] Lessons documented (if churning)
- [ ] Next steps clear

**Owner:** Sales / CSM / Product  
- [ ] Completed: ______ Date: ______

---

## ONGOING: SUPPORT & ESCALATION

### Support Tiers

**Tier 1: Email Support (48-hour response)**
- How to questions
- Feature requests
- General usage

**Tier 2: Slack Support (24-hour response)**
- Urgent bugs
- Workflow blockers
- Data questions

**Tier 3: Escalation (CSM + Engineering)**
- Critical bugs (app down)
- Data loss/corruption
- Security concerns

### Support Process

1. Customer emails support@opsiq.com
2. CSM receives ticket, responds within 48 hours
3. If bug: Engineering gets ticket (4-hour response)
4. If feature request: Product team reviews (monthly)
5. If critical: Call engineering on-call (30-min response)

---

## ONBOARDING SUCCESS CHECKLIST (Month 6)

✓ Customer completed onboarding (admin trained)  
✓ Team completed training (5+ members active)  
✓ First engagement created by week 1  
✓ 10+ engagements by month 3  
✓ Team adoption ≥70% by month 3  
✓ Positive feedback in month 2 review  
✓ NPS ≥7 in month 2 review  
✓ Willing to be case study / reference  
✓ Renewal decision made by month 5  

**If 8/9 criteria met:** Onboarding successful, continue with customer

**If <6/9 criteria met:** Onboarding at risk, intervention needed

---

**Document Owner:** Customer Success Manager  
**Version:** 1.0  
**Last Updated:** 2026-05-22

---

## Template: Customer Onboarding Summary

**Customer Name:** _________________________________  
**Signed Date:** _________________________________  
**Admin Email:** _________________________________  
**Team Members:** _________________________________  

**Day 1 Call Completed:** Yes / No Date: _______  
**Admin Training:** Yes / No Date: _______  
**Team Training:** Yes / No Date: _______  

**Month 1 Usage:**
- Engagements: ___
- Blockers: ___
- Actions: ___
- Active users: ___

**Month 2 Business Review:**
- Date: _______
- Customer sentiment: Positive / Neutral / Negative
- NPS score: ___
- Renewal likelihood: High / Medium / Low

**Renewal Decision (Month 5):**
- Decision: YES / NO / UNDECIDED
- Date decided: _______
- Notes: _____________________________

**Case Study / Reference:**
- Willing? Yes / No
- Status: Not asked / Asked / Agreed / In progress
- Notes: _____________________________

---

End of checklist. Use this to onboard your first customer successfully.
