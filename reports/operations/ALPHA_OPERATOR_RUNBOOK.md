# OpsIQ Alpha: Operator Runbook

**Target Audience**: Non-technical SMB operators  
**Reading Level**: High school / general business  
**Use Case**: Day-to-day workflow guidance + emergency procedures

---

## SECTION 1: GETTING STARTED

### Login Instructions

1. Open your browser
2. Navigate to: https://staging-alpha.opsiq.internal
3. Enter your email address
4. Click "Sign In"
5. Check your email for sign-in link (expires in 30 minutes)
6. Click the link in your email
7. You should see the OpsIQ dashboard

**If you don't get an email:**
- Wait 2 minutes (email can be slow)
- Check spam folder
- Contact support@opsiq: "I didn't receive sign-in email"

**If the link doesn't work:**
- Try again from step 1 (may have expired)
- If still stuck: Contact support with screenshot of error

### What You'll See First

The dashboard shows your **queue** - a list of business actions you need to make:

```
┌─────────────────────────────────────────┐
│ OpsIQ Dashboard - Alpha                  │
├─────────────────────────────────────────┤
│ Welcome, Sarah                          │
│ Workspace: Acme Corp                    │
│                                         │
│ Your Queue (5 items)                    │
├─────────────────────────────────────────┤
│ □ Review Q2 revenue (MEDIUM - Today)    │
│ □ Adjust staffing plan (HIGH - Today)   │
│ □ Approve vendor contract (LOW - Fri)   │
│ □ Schedule board meeting (MEDIUM - Fri) │
│ □ Finalize budget (HIGH - Tomorrow)     │
├─────────────────────────────────────────┤
│ 2 actions need your attention           │
└─────────────────────────────────────────┘
```

---

## SECTION 2: UNDERSTANDING YOUR QUEUE

### What is Priority?

Three levels control what matters most:

| Priority | Meaning | Do This | Urgency |
|----------|---------|---------|---------|
| **HIGH** | Blocks other decisions | Do today if possible | This week |
| **MEDIUM** | Important but flexible | Do this week | This week |
| **LOW** | Nice to do | Do when you can | This month |

**Rule**: Always do HIGH priority actions first (they're usually blocking something).

### What is the Status?

Each action shows where it is in the workflow:

| Status | Meaning | Your Action |
|--------|---------|-------------|
| **Ready** | Waiting for your decision | Click it and make a choice |
| **Pending** | Waiting for someone else | Check back tomorrow |
| **Completed** | Done and locked | Read the notes, nothing to do |
| **Stalled** | Stuck for >30 min | Contact support |

### Finding Overdue Actions

**Overdue actions** are shown in RED on the dashboard. Always address red items first.

```
RED = URGENT - Do today
```

---

## SECTION 3: EXECUTING AN ACTION

### Step-by-Step: How to Complete an Action

1. **Click on the action** in your queue
2. **Read the context** - this explains WHY you're making this decision
3. **Review the metrics** (numbers in blue boxes):
   - **Confidence**: How sure are we about this recommendation? (0-100)
   - **Priority**: How urgent? (LOW/MEDIUM/HIGH)
   - **Impact**: If you do this, how much will it improve things? (LOW/MEDIUM/HIGH)
4. **Make your choice** - click the button for your decision
5. **Add notes** (optional) - explain your reasoning if it's unusual
6. **Click Submit**
7. **Wait for confirmation** - you'll see "Action recorded ✓"

### Important: What Happens After You Submit?

After you submit an action:
- **Immediately**: OpsIQ updates the system
- **Automatically**: Other team members see the change
- **Logged forever**: Your decision is recorded (can't be changed)
- **Status changes**: The action moves to "Completed" or "Pending next step"

---

## SECTION 4: WHAT THOSE METRICS MEAN

### Confidence (0-100)

**What it means**: How sure are we this is the right move?

- **90-100**: Very sure (do this)
- **70-89**: Pretty sure (probably do this)
- **50-69**: Uncertain (might not work, but worth trying)
- **Below 50**: Low confidence (do this only if forced)

**Why it matters**: High confidence = your decision will likely work. Low confidence = might need a backup plan.

---

### Priority (LOW / MEDIUM / HIGH)

**What it means**: How urgently do you need to decide?

- **HIGH**: Blocks something else (do today)
- **MEDIUM**: Important but flexible (do this week)
- **LOW**: Nice to have (do when convenient)

**Why it matters**: HIGH actions unlock progress. LOW actions can wait.

---

### Impact (LOW / MEDIUM / HIGH)

**What it means**: How much will this improve things?

- **HIGH**: Major change in business metrics
- **MEDIUM**: Noticeable improvement
- **LOW**: Incremental improvement

**Why it matters**: HIGH impact = worth the effort even if slightly risky.

---

## SECTION 5: UNDERSTANDING ERRORS

### Common Error Messages (What They Actually Mean)

#### Error: "Action could not be recorded"
**What happened**: Your decision didn't save (usually network issue)

**What to do**:
1. Check your internet connection
2. Refresh the page (Ctrl+R)
3. Try submitting again
4. If it says the action is already done, you're good (it saved on first try)

---

#### Error: "You don't have permission to do this"
**What happened**: Your account isn't authorized for this action

**What to do**:
1. Are you in the right workspace? (Check top-left corner)
2. Ask support: "I got permission error on [action name]"

---

#### Error: "Workspace context invalid"
**What happened**: Your session got confused about which workspace you're in

**What to do**:
1. Click "Refresh" button on the error message
2. If that doesn't work, logout and log back in
3. Contact support if it happens repeatedly

---

#### Error: "This action took too long"
**What happened**: Your submission took >5 minutes to process (unusual)

**What to do**:
1. Refresh the page
2. Check if your action is already completed
3. If not, try again
4. Contact support: "Action timeout on [action name]"

---

### If You're Stuck

**First**: Try these in order:
1. Refresh the page (Ctrl+R)
2. Check the error message - read it carefully
3. Re-read the "Common Error Messages" section above
4. Wait 1 minute and try again

**Then**: If still stuck:
- Take a screenshot of the error
- Write down what you were trying to do
- Contact support@opsiq with screenshot
- Support will respond within 30 minutes (business hours)

---

## SECTION 6: WORKSPACE SWITCHING

### What is a Workspace?

A **workspace** is a separate business or client. Each workspace has:
- Its own queue
- Its own data
- Its own team
- Its own settings

### How to Switch Workspaces

1. Look at top-left corner of dashboard
2. Click the workspace name
3. Choose the workspace you want
4. Click to switch
5. Dashboard reloads with new workspace

### Important: Workspace Switching Gotchas

⚠ **Only see one workspace?**
- You've only been invited to one workspace
- Contact your admin to add you to others

⚠ **Data looks wrong?**
- Check top-left - are you in the right workspace?
- Many operators accidentally work in the wrong workspace

⚠ **Workspace won't load?**
- Logout and log back in
- Try a different workspace first
- Contact support if multiple workspaces are broken

---

## SECTION 7: RECOVERY PROCEDURES

### Recovery 1: "I Submitted the Wrong Action"

**Problem**: You clicked Submit on the wrong action.

**Can you undo it?** NO - actions cannot be undone (they're locked immediately).

**What to do**:
1. Contact support immediately: "I submitted wrong action at [time]"
2. Include the action name and your wrong decision
3. Support will investigate and may reset if it's safe
4. Do NOT submit another action to "fix" it

**How to prevent**:
- Read the action name twice before clicking Submit
- Review your answer before submitting
- Use the note field to explain unusual decisions

---

### Recovery 2: "I Got Logged Out"

**Problem**: You were working and suddenly got logged out.

**What happened**: Your session expired (normally after 8 hours of inactivity).

**What to do**:
1. Click "Sign In Again"
2. Log in with your email
3. Return to the action you were on
4. Your work should be where you left it

**Why this happens**: Security - sessions don't stay alive forever.

---

### Recovery 3: "The System is Broken"

**Problem**: Dashboard won't load, or everything looks wrong.

**What to do**:
1. Try refreshing the page (Ctrl+R)
2. Close the browser tab completely
3. Open https://staging-alpha.opsiq.internal in a fresh tab
4. If still broken: Contact support immediately
5. Let them know: "Dashboard won't load, I see [error/blank/spinning]"

---

### Recovery 4: "I Need to Rollback an Action"

**Problem**: You submitted an action but now realize it was wrong.

**Important**: Submitted actions CANNOT be undone automatically.

**What to do**:
1. Contact support IMMEDIATELY: "I need to rollback [action name]"
2. Explain why it was wrong
3. Support will review logs and may reset if appropriate
4. If approved, support will guide you to resubmit correctly

**This is rare**: Emergency rollback takes support involvement.

---

## SECTION 8: GETTING HELP

### When Should You Contact Support?

**Contact support for**:
- Errors you can't fix by refreshing
- Unusual behavior (same error twice)
- Permission problems
- Stuck actions (in progress >30 min)
- Needing to rollback a decision
- Confusion about metrics

**Do NOT contact support for**:
- General workflow questions (use the runbook)
- Strategy advice (ask your manager)
- Complaints about business decisions (not their job)

### How to Contact Support

**Best way**: Slack #ops-alpha-support
- Tag @alpha-support
- Include screenshot if there's an error
- Response time: 30 minutes

**Alternative**: Email support@opsiq
- Subject: "OpsIQ Alpha Support - [issue type]"
- Include: What you were doing, error message, workspace name
- Response time: 1 hour

**Emergency**: Phone [number in separate document]
- Only for "system is completely broken"
- Not for general questions
- Response time: 15 minutes

---

## SECTION 9: METRIC DEFINITIONS (FOR ALPHA)

These metrics might be unfamiliar. Here's what they mean in plain language:

### Confidence: "How Sure Are We?"
- **Low**: We're guessing based on limited data
- **Medium**: We're fairly sure but could be wrong
- **High**: Strong evidence supports this recommendation

**Your role**: Trust high confidence scores, but also use your judgment.

### Priority: "How Urgent?"
- **Low**: This can wait weeks
- **Medium**: This should happen this week
- **High**: This blocks something else today

**Your role**: Focus on HIGH first, then MEDIUM.

### Impact: "How Much Does This Matter?"
- **Low**: Small improvement, nice to have
- **Medium**: Real improvement, worth doing
- **High**: Major change in business metrics

**Your role**: HIGH impact + HIGH confidence = definitely do it.

---

## SECTION 10: SAFETY GUARDRAILS (What Can't Go Wrong)

### Guardrail 1: Duplicate Prevention
**What it prevents**: Accidentally submitting the same action twice

**How it works**: If you click Submit twice quickly, only one goes through.

**What you'll see**: "Action already submitted - click to view status"

---

### Guardrail 2: Session Protection
**What it prevents**: Using a stale/corrupted session to make wrong decisions

**How it works**: System validates your session on each action

**What you'll see**: If corrupted, you'll be asked to log in again (rare)

---

### Guardrail 3: Audit Lock
**What it prevents**: Silent changes to locked decisions

**How it works**: Once you submit, your decision is locked forever

**What you'll see**: "Action locked - cannot edit" if you try to change it

---

### Guardrail 4: Stalled Action Detection
**What it prevents**: Actions getting stuck silently

**How it works**: If action is "in progress" >30 min, support is alerted

**What you'll see**: Support contacts you with options

---

## SECTION 11: DAILY WORKFLOW CHECKLIST

**Start of day**:
- [ ] Log in to OpsIQ
- [ ] Check workspace (correct one?)
- [ ] Look for RED (overdue) items
- [ ] Read notes from previous day

**During day**:
- [ ] Complete HIGH priority actions first
- [ ] If stuck >5 min, contact support
- [ ] Add notes explaining unusual decisions
- [ ] Check back after others complete their work

**End of day**:
- [ ] Any stalled actions? Ask support
- [ ] Report confusion via feedback system
- [ ] Log out when done

---

## SECTION 12: FREQUENTLY ASKED QUESTIONS

**Q: Can I undo an action I submitted?**
A: No. Actions are locked immediately. Contact support only if it's wrong.

**Q: What if I don't know what something means?**
A: Find it in this runbook. If not here, ask support.

**Q: Can I work on multiple actions at once?**
A: No. Complete one, then start the next.

**Q: What if I disagree with a recommendation?**
A: You can choose differently. Use the notes field to explain why.

**Q: How long should actions take?**
A: Most take 2-5 minutes. If >15 min, take a break.

**Q: Can I skip an action?**
A: Sometimes. Read the context - it explains if skipping is allowed.

**Q: What's the feedback system?**
A: A button in the top-right that lets you report confusion and problems.

**Q: Who sees my decisions?**
A: Your team and support staff. Not external.

**Q: What happens to my data?**
A: Stored securely. Audit log shows every change. Visible to support only.

---

## SECTION 13: GETTING PRODUCTIVE QUICKLY

### Your First 5 Actions (Learning Phase)

1. **Action 1**: Read all context carefully, ask questions
2. **Action 2**: Practice the workflow, pay attention to metrics
3. **Action 3**: Start faster, trust your judgment
4. **Action 4**: Combine multiple small decisions
5. **Action 5**: Work independently

### What's Normal?

- ✓ First action takes 15 minutes
- ✓ Second action takes 10 minutes
- ✓ By action 5, you're doing 3-5 minutes each
- ✓ Getting confused is normal (ask support)
- ✓ Taking notes is helpful (builds muscle memory)

---

## SECTION 14: WHAT TO DO EACH WEEK

### Weekly Workflow

**Monday Morning**:
- Review last week's decisions
- Check any stalled actions
- Preview this week's queue

**Tuesday-Thursday**:
- Execute queue normally
- Report confusion via feedback
- Help other operators if possible

**Friday Afternoon**:
- Complete remaining HIGH/MEDIUM actions
- Don't start new HIGH actions (finish Mon)
- Prepare handoff notes for Monday

**Weekly Feedback Meeting** (15 min):
- Share: What was confusing?
- Share: What worked well?
- Share: What felt unsafe?
- Ask: Questions about next week?

---

## CRITICAL: Emergency Contact

**If system is completely broken:**
- [ ] Call: [emergency number in separate doc]
- [ ] Slack: @alpha-support URGENT
- [ ] Say: "OpsIQ is completely broken, describe what I see..."

**Response time**: 15 minutes on-call

---

**Operator Runbook Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR OPERATOR USE

If something isn't in this runbook, ask support - don't guess.
