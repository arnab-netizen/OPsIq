# OpsIQ Alpha: Support Operations Runbook

**Audience**: Support Engineer (1 person, 40 hours/week)  
**Duration**: Full alpha period (2-4 weeks)  
**Escalation Path**: Support → Team Lead → Emergency On-Call  
**SLA**: 30 min response, <2 hour resolution target

---

## SECTION 1: SUPPORT ROLE DEFINITION

### Support Engineer Responsibilities

**During Business Hours** (9 AM - 5 PM, M-F):
- Monitor Slack #ops-alpha-support for incoming tickets
- Respond to all tickets within 30 minutes
- Investigate and resolve or escalate within 2 hours
- Update operator with status/resolution
- Log all tickets and outcomes
- Track emerging patterns

**Daily Tasks**:
- Morning: Review overnight logs for errors
- Hourly: Check Slack for new tickets (notifications on)
- EOD: Summarize daily support volume and patterns
- EOD: Prepare incident handoff if no evening coverage

**Weekly Tasks**:
- Monday: Review all feedback from weekend
- Friday: Prepare weekly support summary
- Bi-weekly (Fri): Attend alpha review meeting (report findings)

**Out of Hours** (5 PM - 9 AM + weekends):
- On-call rotation (emergency only)
- 15-minute response time for system failures
- Authorized to perform emergency rollback
- Log all incidents for next-day follow-up

---

## SECTION 2: SUPPORT TICKET TRIAGE

### Ticket Categories & Response Protocols

#### Category 1: CONFUSION (Most common)

**Indicators**:
- "I don't understand how to..."
- "What does this metric mean?"
- "Why can't I do X?"
- "How do I switch workspaces?"

**Response Time**: 30 min  
**Resolution Time**: <1 hour (usually guidance only)

**Support Action**:
1. Read the operator's description carefully
2. Check if it's in the ALPHA_OPERATOR_RUNBOOK
3. If yes → Quote relevant section + explain in own words
4. If no → Check with Team Lead for clarification
5. Respond with clear, jargon-free explanation
6. Ask: "Does that make sense?" (confirm understanding)

**Example Response**:
```
You're asking about "Confidence" - here's what it means in plain terms:

Confidence is how sure OpsIQ is that this recommendation is right.
- 90-100 = Very sure, do this
- 70-89 = Pretty sure, probably do this  
- 50-69 = Uncertain, might not work but worth trying

Think of it like weather: 95% confidence = "definitely going to rain"
vs 60% confidence = "might rain, bring an umbrella"

Does that help clarify? Ask if you want to know more.
```

---

#### Category 2: ERROR (System produced error message)

**Indicators**:
- "I got an error message: [error]"
- "System said [error] and nothing happened"
- "Got this error twice in a row: [error]"

**Response Time**: 30 min  
**Resolution Time**: <2 hours (may need investigation)

**Support Action**:
1. Ask operator for full error message (screenshot if possible)
2. Note: timestamp, action name, workspace
3. Check logs: `tail -100 /var/log/opsiq-app.log | grep [error code]`
4. Classify error:
   - **Network Error** (timeout, connection refused) → Retry guidance
   - **User Error** (permission, bad input) → Explain correct way
   - **System Bug** (unexpected error) → Escalate to Team Lead
5. Respond with explanation + next steps

**Common Errors & Solutions**:

**Error: "Action could not be recorded"**
- Likely cause: Network timeout
- Support response: "Try submitting again. If it keeps happening, take a screenshot and send to me. Usually just network hiccup."
- If repeats: Escalate to Team Lead (possible server issue)

**Error: "You don't have permission to do this"**
- Likely cause: Account not invited to workspace
- Support response: "It looks like you don't have access to [workspace]. I'm checking who manages that workspace - one sec."
- Follow up: Contact workspace owner to re-invite operator

**Error: "Workspace context invalid"**
- Likely cause: Session corruption (rare)
- Support response: "That's unusual. Try refreshing the page. If it happens again, log out and log back in. Let me know if it persists."
- If repeats: Escalate (may need session reset in database)

**Error: "This action took too long" (timeout)**
- Likely cause: Server overload or network issue
- Support response: "Sorry, that timed out. The good news is I can check if your action actually submitted. Let me look - one sec."
- Investigation: Check audit log for action (may be present despite error)
- If action present: "Good news - it actually recorded! You're all set."
- If action absent: "It didn't go through. Try again when you're ready."

**Error: "Invalid session"**
- Likely cause: Session expired or corrupted
- Support response: "Your session expired (normal after 8 hours). Click 'Sign In Again' and you'll be back where you left off."

---

#### Category 3: STALLED ACTION

**Indicators**:
- "I've been trying for 30 minutes, action won't complete"
- "Submitted my action 1 hour ago, it says 'Pending' but nothing happened"
- "Button is grayed out, can't move forward"
- Automated alert: Action in progress >30 minutes

**Response Time**: 15 min (urgent)  
**Resolution Time**: <1 hour

**Support Action**:
1. Acknowledge urgency: "I see you're stuck. Let me investigate."
2. Check system state:
   ```
   # In database:
   SELECT * FROM actions WHERE workspace_id = [WS] 
   AND operator_id = [OP] ORDER BY created_at DESC LIMIT 5;
   ```
3. Determine state:
   - **Action present**: Why is it not completing? (bug vs waiting for async)
   - **Action absent**: Where did it go? (lost in network?)
   - **Multiple same actions**: Duplicate somehow? (shouldn't happen)
4. Response options:
   - **Wait for async**: "It's still processing. Give it 2 more minutes."
   - **Manual remediation**: "I'm going to reset your session and have you try again."
   - **Rollback needed**: "We'll need to rollback this action. Give me 5 minutes."

**Example Support Conversation**:
```
Operator: "I submitted an action 30 minutes ago, it's still stuck on 'Pending'"
Support: "Let me check - what's the action name and what time did you submit?"
Operator: "Review Q2 Revenue, 2:15 PM"
Support: [checks logs] "Got it - I see it in our system. Looks like there's a processing delay. 
          Let me try to trigger it manually. Give me 2 minutes..."
Support: [after investigation] "Here's what happened - the action got stuck in processing. 
          I've manually completed it for you. You should see it marked 'Complete' in 10 seconds. 
          Refresh your browser if it doesn't update."
```

---

#### Category 4: PERMISSION / ACCESS

**Indicators**:
- "I can't see workspace X"
- "I got permission error on [action]"
- "I was invited to X but don't see it"
- "Someone else's actions appear in my queue"

**Response Time**: 30 min  
**Resolution Time**: <1 hour (may need admin action)

**Support Action**:
1. Confirm: What does operator expect to see?
2. Check database:
   ```
   SELECT * FROM workspace_memberships 
   WHERE operator_id = [OP];
   ```
3. If missing: "You haven't been invited to that workspace yet. I'm contacting the workspace owner."
4. If present: Check access levels - may be permission vs visibility issue
5. If unclear: Escalate to Team Lead (may be policy issue)

---

#### Category 5: SAFETY / TRUST CONCERN

**Indicators**:
- "Something felt unsafe with that operation"
- "Could my decision have been lost?"
- "I'm worried the system did something I didn't ask for"
- "Session seemed corrupted, not sure what happened"

**Response Time**: 5 min (immediate)  
**Resolution Time**: <30 min investigation

**Support Action**:
1. Acknowledge seriousness: "Thank you for reporting this. I'm investigating immediately."
2. Get details: Full context of what felt unsafe
3. Check audit log for the action:
   ```
   SELECT * FROM audit_events WHERE operator_id = [OP] 
   ORDER BY created_at DESC LIMIT 20;
   ```
4. Verify:
   - Action was recorded exactly as submitted
   - No silent changes occurred
   - Hash chain is intact
5. Respond:
   - If verified safe: "I checked the logs. Here's what actually happened: [details]. You're safe."
   - If potential issue: Escalate to Team Lead immediately
6. Escalate to Team Lead: Any genuine safety concern

**Critical**: Operator trust is paramount. Never dismiss a safety concern.

---

#### Category 6: FEATURE REQUEST / SUGGESTION

**Indicators**:
- "It would be better if..."
- "Can we add X feature?"
- "Why doesn't it work like [other system]?"

**Response Time**: Within 24 hours (not urgent)  
**Resolution Time**: Capture + categorize only

**Support Action**:
1. Acknowledge: "Good idea. Let me capture that."
2. DON'T commit to implementation
3. Capture: Feature idea + operator + date
4. Respond: "I've logged that suggestion. We'll review it when planning the next phase."
5. Store: `alpha_feedback_suggestions` table
6. Weekly: Share aggregated suggestions with Team Lead

---

### Ticket Severity Matrix

| Severity | Response | Resolution | Examples |
|----------|----------|-----------|----------|
| **CRITICAL** | 5 min | <30 min | System down, data loss, safety concern |
| **HIGH** | 15 min | <1 hour | Stalled action, permission error, repeated error |
| **MEDIUM** | 30 min | <2 hours | Confusion, basic error, feature request |
| **LOW** | 24 hours | <1 day | General questions, suggestions, observations |

---

## SECTION 3: SUPPORT WORKFLOW

### Daily Workflow

**9:00 AM - Start of Day**:
```
[ ] Review overnight logs (2 min)
[ ] Check Slack messages from off-hours (3 min)
[ ] Read yesterday's support summary (2 min)
[ ] Check if any stalled actions detected (automatic alert)
[ ] Status message to team: "Support online"
[ ] Open support dashboard on second monitor
```

**During Day**:
```
[ ] Monitor #ops-alpha-support continuously
[ ] Check every 5-10 minutes for new messages
[ ] Respond to all messages within 30 min SLA
[ ] Investigate tickets: open logs in terminal
[ ] Document resolution in support tracking sheet
[ ] Update operator with status/completion
```

**Hourly**:
```
[ ] Review new confusions (in-app feedback)
[ ] Check for any error spikes
[ ] Verify no stalled actions
[ ] Respond to Slack pings
```

**End of Day (4:45 PM)**:
```
[ ] Summarize daily ticket volume (count + categories)
[ ] List any unresolved tickets (escalate if needed)
[ ] Document patterns noticed
[ ] Prepare handoff for on-call (if applicable)
[ ] Close support for business hours
```

---

### Weekly Workflow

**Monday - Post-Weekend Review**:
```
[ ] Review logs from Fri EOD - Mon morning
[ ] Check for overnight incidents
[ ] Follow up on any tickets carried over
[ ] Read weekend feedback submissions
[ ] Prepare week's support alert list
```

**Friday - Weekly Summary**:
```
[ ] Aggregate support metrics:
    - Ticket count (total + by category)
    - Resolution time (avg + range)
    - Unresolved tickets
    - Patterns identified
[ ] Calculate support dependency ratio
[ ] List top 3 recurring issues
[ ] Prepare operator recommendations
[ ] Submit weekly summary to Team Lead
[ ] Archive current week's tickets
```

**Bi-Weekly Friday - Alpha Review**:
```
Attend 30-minute alpha review meeting
[ ] Report: Support volume and trends
[ ] Report: Top confusion topics
[ ] Report: Safety concerns (if any)
[ ] Report: Operator feedback synthesis
[ ] Listen: Feedback on support effectiveness
[ ] Discuss: Next week's priorities
```

---

## SECTION 4: ESCALATION PROCEDURES

### Escalation Level 1 → Team Lead

**Escalate When**:
- Any CRITICAL severity issue
- Suspected system bug (error not explained by user error)
- Safety or data integrity concern
- Permission/authorization issue
- Need to modify database for recovery
- Need to restart services

**How to Escalate**:
1. Slack in #ops-alpha-team: "@team-lead ESCALATION: [issue] from [operator]"
2. Include: What happened, what you tried, what you need
3. Wait for Team Lead acknowledgment
4. Don't proceed with fixes until approved (except emergency)

**Team Lead Response SLA**: 15 minutes during business hours

**Example Escalation**:
```
@team-lead ESCALATION: Possible data integrity issue

Operator Sarah reports: "I submitted action 'Review Revenue' 
but the confirmation shows different value than what I selected"

Investigation: Checked audit log - action recorded different value 
than what UI sent. Possible race condition or data corruption.

Status: Action incomplete, operator in contact, awaiting guidance.

Need: Clarification on whether this is known issue or new bug.
```

---

### Escalation Level 2 → Emergency On-Call

**Escalate When**:
- System is completely down / unavailable
- Data loss is happening actively
- Multiple operators unable to work
- Security breach suspected
- Need to perform emergency rollback
- Out of business hours and urgent

**How to Escalate** (Out of Hours Only):
1. Call emergency number: [from separate secure document]
2. Say: "OpsIQ system is [issue], I need emergency support"
3. Wait for on-call response (target: 15 minutes)
4. Brief: What failed, what impact, what you've done

**On-Call Response SLA**: 15 minutes

**Authorized Emergency Actions**:
- Service restart
- Database rollback (point-in-time)
- Session termination/reset
- Temporary feature disabling
- Operator account reset

---

## SECTION 5: KNOWN ISSUES TRACKING

### Known Issues Register

**Purpose**: Document issues operators are hitting so support can respond quickly

**Template**:
```
Issue ID: [ALPHA-001, ALPHA-002, etc]
Date Discovered: [date]
Operator(s) Affected: [who reported]
Severity: [CRITICAL / HIGH / MEDIUM / LOW]
Status: [OPEN / UNDER INVESTIGATION / WAITING FOR FIX / RESOLVED]

Description:
[What happens? When does it happen? What's the impact?]

Current Workaround:
[If any - what should support tell operators?]

Root Cause:
[If known - what's causing it?]

Fix Status:
[Who's working on it? When expected?]

Support Response:
[What do operators see? What do we tell them?]
```

**Active Issues (Start of Alpha)**:
```
None currently
```

**To be updated as issues are discovered**

---

## SECTION 6: SUPPORT COMMUNICATION TEMPLATES

### Response Template 1: Confusion / Misunderstanding

```
Hi [Operator Name],

Thanks for asking about [topic]. Here's what that means:

[Clear explanation in plain language]

Think of it like: [analogy]

Does that make sense? Feel free to ask follow-ups if you want more detail.
```

---

### Response Template 2: Error Investigation Complete

```
Hi [Operator],

I looked into the error you got. Here's what happened:

**Error**: [error message]
**Cause**: [what caused it]
**Status**: [Is it normal? Is it a bug?]

**What to do next**: [steps to proceed]

Let me know if you hit it again - I want to track if this is a broader issue.
```

---

### Response Template 3: Stalled Action Resolved

```
Hi [Operator],

I found your stalled action "[Action Name]" from [time].

**What I did**: [cleared session / manually triggered / reset workflow]
**Status now**: [It's recorded / Ready to retry / etc]

**Next step**: [Refresh your browser / Try again / etc]

Sorry for the delay. Let me know if you see anything unusual going forward.
```

---

### Response Template 4: Permission Issue Resolved

```
Hi [Operator],

I've added you to [Workspace Name]. You should now see it in your workspace switcher.

**What to do**: 
1. Refresh your browser or log out/back in
2. Click workspace switcher (top left)
3. You should see [Workspace Name]

Let me know if you still don't see it after refresh.
```

---

### Response Template 5: Safety Concern Investigated

```
Hi [Operator],

Thank you for reporting that concern. I investigated immediately.

**What you reported**: [description]
**What I found**: [investigation results]

**Verification**: [Hash chain is intact / Audit log matches / etc]

**Conclusion**: You are safe. Here's the evidence: [specific proof]

I take safety seriously. If you see anything else unusual, please report it immediately.
```

---

## SECTION 7: DATABASE RECOVERY PROCEDURES

### Procedure 1: Session Reset (operator corrupted session)

**Use When**: Operator reports "session invalid" or "workspace context corrupted"

**Authorized By**: Support engineer (no approval needed)

**Steps**:
```bash
# 1. Identify the session
psql opsiq-alpha -c "SELECT * FROM sessions WHERE operator_id = '[operator_id]';"

# 2. Terminate the session
psql opsiq-alpha -c "DELETE FROM sessions WHERE operator_id = '[operator_id]';"

# 3. Notify operator
# "I've reset your session. Log out and log back in - you'll be back where you left off."
```

**Verification**: Operator can log in fresh and sees workspace as expected

---

### Procedure 2: Action Rollback (action corrupted or wrong)

**Use When**: Action clearly executed wrong, or is stuck in bad state

**Authorized By**: Team Lead approval ONLY (except emergency)

**Steps**:
```bash
# 1. Get full action details
psql opsiq-alpha -c "SELECT * FROM actions WHERE id = '[action_id]';"

# 2. Mark as rollback-needed
psql opsiq-alpha -c "UPDATE actions SET status = 'rollback_requested' WHERE id = '[action_id]';"

# 3. Create new action to override
# Document in audit log why this was rolled back
# Create replacement action with operator notification

# 4. Verify
psql opsiq-alpha -c "SELECT * FROM audit_events WHERE action_id = '[action_id]' ORDER BY created_at DESC LIMIT 10;"
```

**Notification**: 
```
"I rolled back your action '[Action Name]' because [reason]. 
Your new action is '[New Name]'. Submit when ready."
```

---

### Procedure 3: Database Point-in-Time Rollback (emergency only)

**Use When**: System-wide data corruption or major bug affecting multiple operators

**Authorized By**: On-call engineer + Team Lead approval

**Steps**:
1. Determine rollback time (5-15 minutes before issue started)
2. Stop application server
3. Restore database from backup to point-in-time
4. Verify data integrity
5. Restart application server
6. Notify all operators: "System was restored from backup at [time]. Please refresh."
7. Log incident + post-mortem

---

## SECTION 8: SUPPORT METRICS & REPORTING

### Daily Metrics (Calculated EOD)

```
Daily Support Report - [DATE]:

📊 VOLUME:
- New tickets: [N]
- Resolved: [N]
- Carried over: [N]
- Avg response time: [mins]
- Avg resolution time: [mins]

📈 CATEGORIES:
- Confusion: [N] ([%])
- Errors: [N] ([%])
- Stalled actions: [N] ([%])
- Permissions: [N] ([%])
- Features/other: [N] ([%])

⚠️ ISSUES:
- Escalations: [N]
- Unresolved (>2h): [N]
- Critical concerns: [Y/N]

🎯 SUMMARY:
[1-2 sentence summary - is support operating normally?]
```

---

### Weekly Summary (Friday)

```
Weekly Support Summary - Week of [DATE]:

📊 VOLUME:
- Total tickets: [N]
- Avg tickets/day: [N]
- Support dependency: [%] (tickets / actions attempted)
- Operator satisfaction: [4.2]/5 avg

🔥 TOP ISSUES (What are people stuck on?):
1. [Most common issue] - [N] tickets
2. [2nd most common] - [N] tickets
3. [3rd most common] - [N] tickets

✨ PATTERNS:
- [Pattern 1: thing that came up multiple times]
- [Pattern 2: thing we should address]
- [Pattern 3: thing getting better/worse]

📈 TRENDS:
- Support volume: [increasing / stable / decreasing]
- Issue complexity: [getting easier / stable / getting harder]
- Operator confidence: [improving / stable / declining]

💡 RECOMMENDATIONS:
1. [Fix suggestion 1]
2. [Fix suggestion 2]
3. [Process improvement]

🎯 NEXT WEEK:
- Watch for: [what should support monitor?]
- Possible fixes coming: [if any]
```

---

## SECTION 9: SUPPORT DECISION POINTS

### When to Continue Alpha Unchanged
✓ <2 support tickets/day  
✓ All tickets resolved <1 hour  
✓ No escalations  
✓ No safety concerns  
✓ Operators reporting high confidence  

**Action**: "Continue alpha as planned"

---

### When to Increase Support / Training
⚠ 2-5 support tickets/day  
⚠ Multiple tickets on same topic  
⚠ Operators confused about documented features  
⚠ Repeated errors from operator training gap  

**Action**: "Provide targeted training on [topic]" or "Update runbook"

---

### When to Pause Alpha
✗ >5 support tickets/day  
✗ Safety concerns raised  
✗ System bugs affecting multiple operators  
✗ Data integrity issues  
✗ Operator abandonment  

**Action**: "Pause alpha, investigate, fix, resume"

---

## SECTION 10: SUPPORT SHIFT HANDOFF

### Shift Handoff (End of Business Hours)

**Format**: Slack message to on-call engineer

```
🌙 SUPPORT HANDOFF - EOD [DATE]

📋 OPEN TICKETS:
[ ] Ticket 1: [operator], [issue], [status]
[ ] Ticket 2: [operator], [issue], [status]

⚠️ WATCH FOR:
[Any issues that might flare up during evening?]

📊 TODAY'S VOLUME:
- Total: [N]
- Escalations: [Y/N]
- Unresolved: [N]

📝 NOTES:
[Anything on-call should know?]

📞 ON-CALL: Reach out if anything urgent. Emergency contact: [#]
```

---

**Support Operations Runbook Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR SUPPORT ENGINEER

Support engineer is fully equipped to operate alpha with clear procedures and decision criteria.
