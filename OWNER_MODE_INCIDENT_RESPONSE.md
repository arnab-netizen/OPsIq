# OpsIQ Owner Mode — Incident Response Runbook

**Version:** 1.0  
**Applies to:** All Owner Mode production and pilot environments  
**Owner:** Platform engineering + product safety

---

## 1. Purpose

This runbook defines what happens when OpsIQ harms, leaks, or misleads. It covers:
- Incident classification and severity
- Containment steps (feature flag shutdown, rollback)
- Owner notification requirements
- Circuit breaker triggers
- Post-incident review requirements

---

## 2. Incident Classes

| Class | Code | Description |
|---|---|---|
| Harmful recommendation | `harmful_recommendation` | A recommendation, when followed, caused material harm to the business |
| Privacy leak | `privacy_leak` | Business or owner data exposed to unauthorized party or external system |
| Cross-tenant exposure | `cross_tenant_exposure` | Data from one workspace accessed or visible to a different workspace |
| Learning gate bypass | `learning_gate_bypass` | An ineligible outcome was used for learning without passing all eligibility gates |
| Wrong high-confidence advice | `wrong_high_confidence_advice` | Advice with confidence ≥80 was materially incorrect and acted upon |
| Dashboard misreporting | `dashboard_misreporting` | Dashboard displayed incorrect stage status or outcome that influenced owner decision |
| Evidence verification bypass | `evidence_verification_bypass` | Evidence was treated as verified without owner confirmation |
| DB migration data loss | `db_migration_data_loss` | A database migration destroyed or corrupted owner or business records |
| Prompt injection success | `prompt_injection_success` | Adversarial input altered AI output in a way that bypassed intended constraints |
| Security gate failure | `security_gate_failure` | An auth or workspace enforcement gate failed to block an unauthorized operation |

---

## 3. Severity Levels

| Severity | Code | Examples | SLA |
|---|---|---|---|
| Critical | `critical` | Cross-tenant exposure, DB data loss, prompt injection success | Contain within 1 hour; notify owner within 2 hours |
| High | `high` | Severe harm, learning gate bypass with acted-upon outcome | Contain within 4 hours; notify owner within 8 hours |
| Medium | `medium` | Moderate harm, wrong high-confidence advice | Contain within 24 hours; notify owner within 24 hours |
| Low | `low` | Dashboard display error (no decision made on it), minor misreporting | Fix within 72 hours; notify owner if affected |

---

## 4. Incident Fields

Every incident record must contain:

| Field | Required | Description |
|---|---|---|
| `incident_id` | ✓ | Unique identifier |
| `severity` | ✓ | `critical`, `high`, `medium`, or `low` |
| `trigger` | ✓ | Incident class code from Section 2 |
| `detected_at` | ✓ | ISO 8601 timestamp of detection |
| `affected_workspace_id` | ✓ | Workspace where the incident occurred |
| `affected_business_id` | ✓ | Business affected (may be `*` for platform-wide) |
| `containment_step` | ✓ | What was done to contain the incident |
| `feature_flag_shutdown` | ✓ | Whether a feature flag was tripped to halt the affected capability |
| `rollback_step` | ✓ | What rollback was applied (or `none` with reason) |
| `owner_notification_required` | ✓ | Boolean — whether the affected owner must be notified |
| `post_incident_review_required` | ✓ | Boolean — whether a PIR must be scheduled |
| `status` | ✓ | `open`, `contained`, `resolved`, `closed` |
| `created_at` | ✓ | Record creation timestamp |
| `updated_at` | ✓ | Last update timestamp |

---

## 5. Circuit Breaker Triggers

A circuit breaker halts a specific capability to prevent further harm while the incident is investigated. Circuit breakers must be set by a human operator; they are never autonomously tripped by AI.

| Trigger | Capability Halted | Automatic or Manual |
|---|---|---|
| Harm severity `high` or `critical` | New recommendations in affected workspace | Manual |
| Learning gate bypass detected | Learning eligibility processing | Manual |
| Tenant isolation failure | All cross-workspace queries | Manual (platform-wide) |
| Prompt injection success | AI advisory generation | Manual |
| Evidence verification bypass | Evidence verification workflow | Manual |
| Dashboard wrong outcome status | Dashboard publication | Manual |
| DB migration data loss risk | All DB write operations | Manual (platform-wide) |

**Circuit breaker states:**
- `open`: Capability is halted; no new operations permitted
- `half_open`: Capability allowed for a controlled test before full re-enable
- `closed`: Normal operation

---

## 6. Containment Steps by Incident Class

### `harmful_recommendation`
1. Identify the recommendation and the action taken by the owner
2. Log the incident with harm severity from the harm tracking system
3. Halt new recommendations for the affected workspace (circuit breaker: `open`)
4. Notify the affected owner immediately
5. Document what the recommendation was and what harm occurred
6. Schedule post-incident review
7. Reassessment workflow triggered for the affected cycle

### `privacy_leak`
1. Identify what data was exposed and to whom
2. Halt the capability that caused the leak (circuit breaker: `open`)
3. Notify affected owner within SLA
4. Assess regulatory notification requirements (GDPR, CCPA where applicable)
5. Log all details: data type, exposure window, recipient
6. Schedule post-incident review
7. Do not resume capability until root cause is fixed and reviewed

### `cross_tenant_exposure`
1. Identify source and destination workspaces
2. Immediately halt all cross-workspace query paths (platform-wide circuit breaker)
3. Audit what data was accessed
4. Notify both affected workspace owners
5. Platform-wide emergency review before resuming any cross-workspace operations
6. Root cause must be in an audit-traceable fix before re-enabling

### `learning_gate_bypass`
1. Identify which learning outcome bypassed the gate and why
2. Remove or quarantine the learning record
3. Halt learning eligibility processing (circuit breaker: `open`)
4. Audit all recent learning records for the same bypass pattern
5. Fix the gate before re-enabling
6. Post-incident review required

### `wrong_high_confidence_advice`
1. Identify the advice, the confidence score, and the owner action taken
2. Log the incident
3. If outcome was harmful: escalate to `harmful_recommendation` path
4. Audit similar advice generated with the same model/prompt version
5. Suspend high-confidence advice (confidence ≥80) until root cause is clear
6. Post-incident review required

### `dashboard_misreporting`
1. Identify which stage or metric was displayed incorrectly
2. Determine if the owner made a decision based on the incorrect display
3. If a decision was made: treat as `wrong_high_confidence_advice` or `harmful_recommendation` depending on outcome
4. Halt dashboard updates until the display bug is fixed
5. Notify affected owner if a material decision was made on incorrect data

### `evidence_verification_bypass`
1. Identify which evidence was marked verified without owner confirmation
2. Revert the verification status to `unverified`
3. Halt the evidence verification workflow (circuit breaker: `open`)
4. Audit all recent verifications for the same bypass
5. Notify the affected owner to re-verify
6. Post-incident review required

### `db_migration_data_loss`
1. Stop all write operations immediately (platform-wide circuit breaker)
2. Assess scope of data loss
3. Initiate backup restore if data loss confirmed
4. Notify all affected workspace owners
5. No resumption of writes until data integrity is confirmed
6. Post-incident review required; engineering sign-off before re-enabling

### `prompt_injection_success`
1. Identify the injected input and the AI output that was altered
2. Halt AI advisory generation (circuit breaker: `open`)
3. Audit all AI outputs since the earliest possible injection point
4. Notify affected owners if their recommendations may have been compromised
5. Fix input sanitization before re-enabling
6. Post-incident review required

### `security_gate_failure`
1. Identify which gate failed and what unauthorized operation was permitted
2. Halt the affected operation type (circuit breaker: `open`)
3. Audit all operations of the same type since the gate failure window
4. Notify affected owner(s)
5. Fix the gate; verify with targeted security tests
6. Post-incident review required

---

## 7. Owner Notification Requirements

Owners must be notified for ALL incidents where:
- Their workspace was directly affected
- A business decision was made on incorrect or harmful AI output
- Their data may have been exposed to another party

Notification must include:
- Plain-language description of what happened
- What OpsIQ did to contain it
- What the owner should do (if anything)
- Whether any of their data or decisions may have been affected
- Contact point for follow-up

Notification must NOT include:
- Internal system field names or model metadata
- Other tenants' workspace IDs or business data
- Speculation about root cause not yet confirmed

---

## 8. Post-Incident Review Requirements

A post-incident review (PIR) is required for all `high` or `critical` incidents and any incident where:
- An owner made a material decision based on incorrect AI output
- A circuit breaker was tripped
- Data was exposed outside its intended scope

PIR must document:
1. Timeline: when did it happen, when was it detected, when was it contained
2. Root cause: what failed and why
3. Impact: what was affected and who was harmed
4. Containment: what was done immediately
5. Resolution: what was fixed
6. Prevention: what changes prevent recurrence
7. Owner impact: what was communicated to owners and when

---

## 9. Stop Conditions (No Resumption Without Review)

The following conditions require explicit human sign-off before resuming:
- Circuit breaker tripped for `cross_tenant_exposure`
- Circuit breaker tripped for `db_migration_data_loss`
- Circuit breaker tripped for `prompt_injection_success`
- Any incident where owner data was confirmed exposed outside their workspace
- Any incident where an owner acted on AI output that was confirmed materially wrong at confidence ≥80

---

*This runbook is a controlled platform document. Update version number and review date when revised.*
