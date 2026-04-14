# Open issues

## Fixed (recovery slice)
- ✅ Optimistic locking for lead updates
- ✅ Idempotency for linkLeadToEngagement, removeMember
- ✅ Missing audit event constants (CLIENT_CONTACT_UPDATED, DEACTIVATED)
- ✅ Re-evaluation triggers for createEngagement, linkLeadToEngagement
- ✅ Weak validation in linkLeadToEngagement (now validates client match)
- ✅ UI properly uses API layer (no direct fetches)
- ✅ Internal/client visibility fields present

## Pending
- Database partial unique index on BusinessConditionProfile(engagement_id) WHERE is_current
- Enum validation for ClientAccount.size (deferred to schema slice)
- Engagement member management API routes (deferred to UI slice)
