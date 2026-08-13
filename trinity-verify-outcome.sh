#!/usr/bin/env bash
# ============================================================
# TRINITY SERVICES — OWNER PILOT OUTCOME VERIFICATION
# Phase: Verify Cycle #3 → Cycle #4 Outcome (data completeness)
#
# Performs exactly ONE verification POST:
#   POST /api/owner/finance/actions/[actionId]/verify
#   body: { beforeValue:65, afterValue:75, targetDirection:"up",
#            targetValue:null, evidence:["<v2-snapshot-id>"],
#            disputed:false }
#
# Source-verified against:
#   - financeVerifySchema (src/domain/owner-finance/validation.ts)
#   - recordFinanceVerification (src/services/owner-finance/verification.service.ts)
#   - verifyOutcome (src/domain/founder-recovery/verification.ts)
#   - OwnerFinanceVerification model (prisma/schema.prisma)
#
# Run modes:
#   ./trinity-verify-outcome.sh --preflight-only   (reads only, NO POST)
#   ./trinity-verify-outcome.sh                    (requires owner authorization)
#
# PREREQUISITES (set in environment or prompted interactively):
#   export VERCEL_AUTOMATION_BYPASS_SECRET="..."
#   export OPSIQ_OWNER_PASSWORD="..."
#
# SECURITY RULES:
#   - Credentials never echoed or printed
#   - Cookie jar cleaned on EXIT trap
#   - POST performed exactly once — never retried
#   - Read-after-write on ambiguous HTTP outcome
#   - No unrelated mutations
#   - set -u + set -o pipefail; NOT set -e (ambiguous write must not auto-terminate)
# ============================================================
set -uo pipefail

# -----------------------------------------------------------
# SECTION 0 — CONSTANTS
# -----------------------------------------------------------
BASE_URL="https://o-ps-iq.vercel.app"
EXPECTED_WORKSPACE_ID="d0609f28-dbbd-4a29-a5d2-fd74a7bb4ce5"
ACTION_ID="2294733b-e0ad-488b-916f-a93e3c665cca"
CYCLE3_ID="87b81bea-a753-4131-b63f-e83050891534"
CYCLE4_ID="a3ccda30-63e3-4ecf-b4cd-ef752314d16a"
V1_SNAPSHOT_ID="fd2d4e07-5f7b-4253-be23-a07d351069b8"
V2_SNAPSHOT_ID="1cf66a33-c167-46c3-9c74-f558207d65e5"
# No email hard-coded. OPSIQ_OWNER_EMAIL is set from environment or prompted below.

# Verification inputs — source-verified:
#   beforeValue:     Cycle #3 dataConfidenceScore = 65
#   afterValue:      Cycle #4 dataConfidenceScore = 75
#   targetDirection: "up" — z.enum(["up","down"]); higher confidence = improvement
#   targetValue:     null — no stored targetValue on OwnerFinanceAction model;
#                    schema: z.number().nullable().optional(); null = no explicit bar
#   evidence:        [V2_SNAPSHOT_ID] — completionEvidence-style reference (service
#                    stores as-is when provided; falls back to [result.reason] if omitted)
#   disputed:        false
#
# verifyOutcome logic with these inputs (pure function, source-verified):
#   improvedVsBaseline = 75 > 65 = true (direction "up")
#   reachedTarget      = false (targetValue is null → always false)
#   branch             = targetValue===null && improvedVsBaseline → "verified_improved"
#   reachedTarget=false → re-diagnosis hook in verification.service.ts will NOT fire
#   (re-diagnosis already fired on action completion → Cycle #4 a3ccda30 exists)
BEFORE_VALUE=65
AFTER_VALUE=75
TARGET_DIRECTION="up"
EVIDENCE_SNAPSHOT_ID="${V2_SNAPSHOT_ID}"

# -----------------------------------------------------------
# SECTION 0b — PREFLIGHT-ONLY FLAG
# -----------------------------------------------------------
PREFLIGHT_ONLY=NO
if [[ "${1:-}" == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=YES
fi

# -----------------------------------------------------------
# SECTION 0c — STATE VARS
# -----------------------------------------------------------
ACTOR_ID=""
ACTOR_EMAIL_VAL=""
HIGHEST_ROLE=""
RESOLVED_WORKSPACE_IDS=""
TARGET_WORKSPACE_AUTHORIZED="NO"
OWNER_AUTH_STATUS="UNKNOWN"
ACTION_STATUS_VAL=""
ACTION_VERIFICATION_METRIC=""
ACTION_CONFIDENCE=""
EXISTING_VERIF_COUNT=0
CYCLE3_CONFIDENCE_VAL=""
CYCLE4_CONFIDENCE_VAL=""
CYCLE4_SNAPSHOT_ID_VAL=""
V1_SUPERSEDED_BY=""
V2_SUPERSEDED_BY=""
PRODUCTION_WRITES_PERFORMED=0
VERIFY_PAYLOAD=""
VERIF_ID="null"
VERIF_STATUS="null"
RESULT_STATUS="null"
RESULT_REACHED="null"
RESULT_MOVEMENT="null"

# -----------------------------------------------------------
# COOKIE JAR + CLEANUP
# -----------------------------------------------------------
JAR="$(mktemp /tmp/opsiq-verify-cjar-XXXXXX.txt)"
CURL_ERR_FILE="/tmp/trinity-verify-curl-err.tmp"
TMPBODY_POST="/tmp/trinity-verify-post-body.tmp"
trap 'rm -f "$JAR" "$CURL_ERR_FILE" "$TMPBODY_POST"; echo "[cleanup] Cookie jar removed."' EXIT

# -----------------------------------------------------------
# HELPERS
# -----------------------------------------------------------
abort_with_report() {
  echo ""
  echo "ABORT: $1"
  echo "PRODUCTION_WRITES_PERFORMED=${PRODUCTION_WRITES_PERFORMED}"
  echo "PREFLIGHT_RESULT=FAIL"
  exit 1
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    abort_with_report "jq is required but not installed."
  fi
}

# GET: returns body via stdout; transport errors go to stderr.
# No --fail or --fail-with-body — HTTP status is not checked here;
# callers gate on extracted field values. Matches trinity-mutation-seq.sh do_get().
api_get() {
  local url="$1"
  local tmpf curl_rc http_status body
  tmpf="$(mktemp /tmp/trinity-verify-get-XXXXXX.tmp)"
  curl_rc=0
  http_status="$(curl --silent --show-error \
    --connect-timeout 15 \
    --max-time 60 \
    -o "$tmpf" \
    -w "%{http_code}" \
    -b "$JAR" \
    -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
    -H "Accept: application/json" \
    "$url" 2>"$CURL_ERR_FILE")" || curl_rc=$?
  body="$(cat "$tmpf" 2>/dev/null || printf '')"
  rm -f "$tmpf"
  if [[ $curl_rc -ne 0 ]]; then
    printf '[api_get transport error rc=%s url=%s] %s\n' \
      "$curl_rc" "$url" "$(cat "$CURL_ERR_FILE" 2>/dev/null)" >&2
    return 1
  fi
  printf '%s' "$body"
}

# GET: saves body to TMPBODY_POST area and returns HTTP status code.
# Used only for the read-after-write path after an ambiguous POST.
api_get_with_status() {
  local url="$1"
  local tmpf curl_rc
  tmpf="$(mktemp /tmp/trinity-verify-raw-XXXXXX.tmp)"
  curl_rc=0
  local status
  status="$(curl --silent --show-error \
    --connect-timeout 15 \
    --max-time 60 \
    -o "$tmpf" \
    -w "%{http_code}" \
    -b "$JAR" \
    -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
    -H "Accept: application/json" \
    "$url" 2>"$CURL_ERR_FILE")" || curl_rc=$?
  cp "$tmpf" "$TMPBODY_POST" 2>/dev/null || true
  rm -f "$tmpf"
  if [[ $curl_rc -ne 0 ]]; then
    printf 'CURL_ERROR_%s' "$curl_rc"
    return 0
  fi
  printf '%s' "$status"
}

# POST: saves body to TMPBODY_POST, returns HTTP status code.
# Called exactly once — caller must NOT retry.
api_post_once() {
  local url="$1"
  local body="$2"
  local tmpf curl_rc
  tmpf="$(mktemp /tmp/trinity-verify-post-XXXXXX.tmp)"
  curl_rc=0
  local status
  status="$(curl --silent --show-error \
    --connect-timeout 15 \
    --max-time 60 \
    -o "$tmpf" \
    -w "%{http_code}" \
    -b "$JAR" \
    -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -X POST \
    -d "$body" \
    "$url" 2>"$CURL_ERR_FILE")" || curl_rc=$?
  cp "$tmpf" "$TMPBODY_POST" 2>/dev/null || true
  rm -f "$tmpf"
  if [[ $curl_rc -ne 0 ]]; then
    printf 'CURL_ERROR_%s' "$curl_rc"
    return 0
  fi
  printf '%s' "$status"
}

require_jq

# -----------------------------------------------------------
# SECTION 1 — MODE BANNER
# -----------------------------------------------------------
echo "============================================================"
echo "TRINITY SERVICES — OUTCOME VERIFICATION"
echo "SCRIPT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$PREFLIGHT_ONLY" == "YES" ]]; then
  echo "MODE=PREFLIGHT_ONLY (no production writes will be performed)"
else
  echo "MODE=FULL_VERIFICATION (will POST exactly once after all gates pass)"
  echo "WARNING: Full mode executes a production write. Proceed only with owner authorization."
fi
echo "============================================================"
echo ""

# -----------------------------------------------------------
# SECTION 2 — CREDENTIAL PROMPTS (secure, never echoed)
# -----------------------------------------------------------
echo "[credentials] All inputs are read silently. Nothing will be echoed."
echo ""

VERCEL_AUTOMATION_BYPASS_SECRET="${VERCEL_AUTOMATION_BYPASS_SECRET:-}"
if [[ -z "$VERCEL_AUTOMATION_BYPASS_SECRET" ]]; then
  read -rsp "Vercel automation bypass secret: " VERCEL_AUTOMATION_BYPASS_SECRET
  echo
fi

OPSIQ_OWNER_EMAIL="${OPSIQ_OWNER_EMAIL:-}"
if [[ -z "$OPSIQ_OWNER_EMAIL" ]]; then
  printf "OpsIQ owner email: "
  read -r OPSIQ_OWNER_EMAIL
fi
if [[ -z "$OPSIQ_OWNER_EMAIL" ]]; then
  abort_with_report "OPSIQ_OWNER_EMAIL cannot be empty."
fi

OPSIQ_OWNER_PASSWORD="${OPSIQ_OWNER_PASSWORD:-}"
if [[ -z "$OPSIQ_OWNER_PASSWORD" ]]; then
  read -rsp "OpsIQ owner password: " OPSIQ_OWNER_PASSWORD
  echo
fi

# -----------------------------------------------------------
# SECTION 3 — AUTHENTICATE
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 3 — AUTHENTICATE"
echo "============================================================"

LOGIN_HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -c "$JAR" \
  -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "{\"email\":\"${OPSIQ_OWNER_EMAIL}\",\"password\":\"${OPSIQ_OWNER_PASSWORD}\"}" \
  "${BASE_URL}/api/auth/login")
unset OPSIQ_OWNER_PASSWORD

echo "LOGIN_HTTP_STATUS=${LOGIN_HTTP_STATUS}"
if [[ "$LOGIN_HTTP_STATUS" != "200" ]]; then
  abort_with_report "LOGIN FAILED — HTTP ${LOGIN_HTTP_STATUS}"
fi
echo "LOGIN=OK"
echo ""

# -----------------------------------------------------------
# SECTION 4 — /api/me — WORKSPACE + ROLE GATE
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 4 — /api/me — WORKSPACE + ROLE GATE"
echo "============================================================"

ME_BODY="$(api_get "${BASE_URL}/api/me")"
ACTOR_ID="$(echo "$ME_BODY" | jq -r '.user.id // empty')"
ACTOR_EMAIL_VAL="$(echo "$ME_BODY" | jq -r '.user.email // empty')"
HIGHEST_ROLE="$(echo "$ME_BODY" | jq -r '.highestRole // empty')"

# Workspace IDs from role assignments (scope="workspace", scopeId=workspaceId).
# getRolesForUser() returns {id, role, scope, scopeId, ...}.
# getMembershipsForUser() returns engagement memberships — NO workspaceId field.
RESOLVED_WORKSPACE_IDS="$(echo "$ME_BODY" | jq -r '[.roles[]? | select(.scope == "workspace") | .scopeId] | unique | join(",")')"
TARGET_WORKSPACE_AUTHORIZED="NO"
if echo "$RESOLVED_WORKSPACE_IDS" | grep -qF "$EXPECTED_WORKSPACE_ID"; then
  TARGET_WORKSPACE_AUTHORIZED="YES"
fi

echo "ACTOR_ID=${ACTOR_ID}"
echo "ACTOR_EMAIL=${ACTOR_EMAIL_VAL}"
echo "HIGHEST_ROLE=${HIGHEST_ROLE}"
echo "RESOLVED_WORKSPACE_IDS=${RESOLVED_WORKSPACE_IDS}"
echo "TARGET_WORKSPACE_AUTHORIZED=${TARGET_WORKSPACE_AUTHORIZED}"

if [[ -z "$ACTOR_ID" ]]; then
  abort_with_report "GATE_FAIL: could not resolve actorId from /api/me"
fi
# Identity gate: authenticated email must match the entered credential.
# Fail closed before any verification POST if mismatch.
if [[ "$ACTOR_EMAIL_VAL" != "$OPSIQ_OWNER_EMAIL" ]]; then
  abort_with_report "GATE_FAIL: /api/me email='${ACTOR_EMAIL_VAL}' does not match entered email '${OPSIQ_OWNER_EMAIL}'"
fi
echo "AUTH_EMAIL_RUNTIME_VERIFIED=YES"
if [[ "$HIGHEST_ROLE" != "admin_or_portfolio_manager" ]]; then
  abort_with_report "GATE_FAIL: highestRole='${HIGHEST_ROLE}' — required 'admin_or_portfolio_manager'"
fi
if [[ "$TARGET_WORKSPACE_AUTHORIZED" != "YES" ]]; then
  abort_with_report "GATE_FAIL: expected workspace '${EXPECTED_WORKSPACE_ID}' not found in role scopes: '${RESOLVED_WORKSPACE_IDS}'"
fi

OWNER_AUTH_STATUS="PASS"
echo "OWNER_AUTH=${OWNER_AUTH_STATUS}"
echo ""

# -----------------------------------------------------------
# SECTION 5 — READ ACTION (status + existing verifications)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 5 — READ ACTION ${ACTION_ID}"
echo "============================================================"

ACTION_BODY="$(api_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}")"
ACTION_STATUS_VAL="$(echo "$ACTION_BODY" | jq -r '.status // empty')"
ACTION_VERIFICATION_METRIC="$(echo "$ACTION_BODY" | jq -r '.verificationMetric // "null"')"
ACTION_CONFIDENCE="$(echo "$ACTION_BODY" | jq '.confidence // null')"
ACTION_FINDING_CODE="$(echo "$ACTION_BODY" | jq -r '.findingCode // "null"')"
ACTION_CYCLE_ID="$(echo "$ACTION_BODY" | jq -r '.cycleId // "null"')"
EXISTING_VERIF_COUNT="$(echo "$ACTION_BODY" | jq '.verifications | length')"

echo "ACTION_ID=${ACTION_ID}"
echo "ACTION_STATUS=${ACTION_STATUS_VAL}"
echo "ACTION_VERIFICATION_METRIC=${ACTION_VERIFICATION_METRIC}"
echo "ACTION_CONFIDENCE=${ACTION_CONFIDENCE}"
echo "ACTION_FINDING_CODE=${ACTION_FINDING_CODE}"
echo "ACTION_CYCLE_ID=${ACTION_CYCLE_ID}"
echo "EXISTING_VERIF_COUNT=${EXISTING_VERIF_COUNT}"

# Gate: check existing verifications BEFORE proceeding.
# The verify service has no idempotency guard — it creates a new record on every POST.
if [[ "$EXISTING_VERIF_COUNT" -gt 0 ]]; then
  echo "EXISTING_VERIFICATION=YES"
  echo ""
  echo "EXISTING_VERIFICATION_RECORDS:"
  echo "$ACTION_BODY" | jq -c '.verifications[] | {id, status, verificationMetric, beforeValue, afterValue, targetDirection, targetValue, verifiedAt, createdAt}'
  echo ""
  echo "NOTE: Verification already recorded. DO NOT POST again."
  echo "INSTRUCTION: Read the existing record above. Report to owner. Do not re-verify."
  echo "PRODUCTION_WRITES_PERFORMED=0"
  echo "PREFLIGHT_RESULT=EXISTING_VERIFICATION_FOUND"
  exit 0
fi

echo "EXISTING_VERIFICATION=NO"

if [[ "$ACTION_STATUS_VAL" != "completed" ]]; then
  abort_with_report "GATE_FAIL: action.status='${ACTION_STATUS_VAL}' — required 'completed'"
fi

echo "GATE_ACTION=PASS"
echo ""

# -----------------------------------------------------------
# SECTION 6 — READ CYCLE #3 (confirm confidence=65)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 6 — READ CYCLE #3 ${CYCLE3_ID}"
echo "============================================================"

C3_BODY="$(api_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE3_ID}")"
CYCLE3_CONFIDENCE_VAL="$(echo "$C3_BODY" | jq '.dataConfidenceScore // null')"
CYCLE3_HEALTH="$(echo "$C3_BODY" | jq '.overallHealthScore // null')"
CYCLE3_SURVIVAL="$(echo "$C3_BODY" | jq -r '.survivalState // "null"')"
CYCLE3_SEQ="$(echo "$C3_BODY" | jq '.sequenceNumber // null')"
CYCLE3_SNAPSHOT_ID="$(echo "$C3_BODY" | jq -r '.snapshotId // "null"')"

echo "CYCLE3_ID=${CYCLE3_ID}"
echo "CYCLE3_SEQ=${CYCLE3_SEQ}"
echo "CYCLE3_CONFIDENCE=${CYCLE3_CONFIDENCE_VAL}"
echo "CYCLE3_HEALTH=${CYCLE3_HEALTH}"
echo "CYCLE3_SURVIVAL=${CYCLE3_SURVIVAL}"
echo "CYCLE3_SNAPSHOT_ID=${CYCLE3_SNAPSHOT_ID}"

CYCLE3_CONF_INT="$(echo "$CYCLE3_CONFIDENCE_VAL" | jq 'floor | tostring' 2>/dev/null || echo "-1")"
if [[ "$CYCLE3_CONF_INT" != "65" ]]; then
  abort_with_report "GATE_FAIL: Cycle3 dataConfidenceScore=${CYCLE3_CONFIDENCE_VAL} — expected 65"
fi

echo "GATE_CYCLE3_CONFIDENCE=PASS"
echo ""

# -----------------------------------------------------------
# SECTION 7 — READ CYCLE #4 (confirm confidence=75, snapshotId=v2)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 7 — READ CYCLE #4 ${CYCLE4_ID}"
echo "============================================================"

C4_BODY="$(api_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE4_ID}")"
CYCLE4_CONFIDENCE_VAL="$(echo "$C4_BODY" | jq '.dataConfidenceScore // null')"
CYCLE4_HEALTH="$(echo "$C4_BODY" | jq '.overallHealthScore // null')"
CYCLE4_SURVIVAL="$(echo "$C4_BODY" | jq -r '.survivalState // "null"')"
CYCLE4_SEQ="$(echo "$C4_BODY" | jq '.sequenceNumber // null')"
CYCLE4_SNAPSHOT_ID_VAL="$(echo "$C4_BODY" | jq -r '.snapshotId // "null"')"

echo "CYCLE4_ID=${CYCLE4_ID}"
echo "CYCLE4_SEQ=${CYCLE4_SEQ}"
echo "CYCLE4_CONFIDENCE=${CYCLE4_CONFIDENCE_VAL}"
echo "CYCLE4_HEALTH=${CYCLE4_HEALTH}"
echo "CYCLE4_SURVIVAL=${CYCLE4_SURVIVAL}"
echo "CYCLE4_SNAPSHOT_ID=${CYCLE4_SNAPSHOT_ID_VAL}"

CYCLE4_CONF_INT="$(echo "$CYCLE4_CONFIDENCE_VAL" | jq 'floor | tostring' 2>/dev/null || echo "-1")"
if [[ "$CYCLE4_CONF_INT" != "75" ]]; then
  abort_with_report "GATE_FAIL: Cycle4 dataConfidenceScore=${CYCLE4_CONFIDENCE_VAL} — expected 75"
fi

if [[ "$CYCLE4_SNAPSHOT_ID_VAL" != "$V2_SNAPSHOT_ID" ]]; then
  abort_with_report "GATE_FAIL: Cycle4.snapshotId='${CYCLE4_SNAPSHOT_ID_VAL}' — expected '${V2_SNAPSHOT_ID}' (v2)"
fi

echo "CYCLE4_POINTS_TO_V2=YES"
echo "GATE_CYCLE4=PASS"
echo ""

# -----------------------------------------------------------
# SECTION 8 — READ V1 SNAPSHOT (confirm supersededById=v2)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 8 — READ V1 SNAPSHOT ${V1_SNAPSHOT_ID}"
echo "============================================================"

V1_BODY="$(api_get "${BASE_URL}/api/owner/finance/snapshots/${V1_SNAPSHOT_ID}")"
V1_VERSION="$(echo "$V1_BODY" | jq '.version // null')"
V1_SUPERSEDED_BY="$(echo "$V1_BODY" | jq -r '.supersededById // "null"')"
V1_PERIOD_START="$(echo "$V1_BODY" | jq -r '.periodStart // "null"')"
V1_PERIOD_END="$(echo "$V1_BODY" | jq -r '.periodEnd // "null"')"
V1_DATA_CONFIDENCE="$(echo "$V1_BODY" | jq '.dataConfidenceScore // null')"

echo "V1_SNAPSHOT_ID=${V1_SNAPSHOT_ID}"
echo "V1_VERSION=${V1_VERSION}"
echo "V1_SUPERSEDED_BY=${V1_SUPERSEDED_BY}"
echo "V1_PERIOD_START=${V1_PERIOD_START}"
echo "V1_PERIOD_END=${V1_PERIOD_END}"
echo "V1_DATA_CONFIDENCE=${V1_DATA_CONFIDENCE}"

if [[ "$V1_SUPERSEDED_BY" != "$V2_SNAPSHOT_ID" ]]; then
  abort_with_report "GATE_FAIL: v1.supersededById='${V1_SUPERSEDED_BY}' — expected '${V2_SNAPSHOT_ID}'"
fi

echo "GATE_V1_SUPERSEDED_BY_V2=PASS"
echo ""

# -----------------------------------------------------------
# SECTION 9 — READ V2 SNAPSHOT (confirm supersededById=null)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 9 — READ V2 SNAPSHOT ${V2_SNAPSHOT_ID}"
echo "============================================================"

V2_BODY="$(api_get "${BASE_URL}/api/owner/finance/snapshots/${V2_SNAPSHOT_ID}")"
V2_VERSION="$(echo "$V2_BODY" | jq '.version // null')"
V2_SUPERSEDED_BY="$(echo "$V2_BODY" | jq -r '.supersededById // "null"')"
V2_DATA_CONFIDENCE="$(echo "$V2_BODY" | jq '.dataConfidenceScore // null')"
V2_PERIOD_START="$(echo "$V2_BODY" | jq -r '.periodStart // "null"')"
V2_PERIOD_END="$(echo "$V2_BODY" | jq -r '.periodEnd // "null"')"

echo "V2_SNAPSHOT_ID=${V2_SNAPSHOT_ID}"
echo "V2_VERSION=${V2_VERSION}"
echo "V2_SUPERSEDED_BY=${V2_SUPERSEDED_BY}"
echo "V2_PERIOD_START=${V2_PERIOD_START}"
echo "V2_PERIOD_END=${V2_PERIOD_END}"
echo "V2_DATA_CONFIDENCE=${V2_DATA_CONFIDENCE}"

if [[ "$V2_SUPERSEDED_BY" != "null" ]]; then
  abort_with_report "GATE_FAIL: v2.supersededById='${V2_SUPERSEDED_BY}' — expected null (v2 must be current head)"
fi

echo "GATE_V2_IS_HEAD=PASS"
echo ""

# -----------------------------------------------------------
# SECTION 10 — BUILD + VALIDATE VERIFICATION PAYLOAD
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 10 — PROPOSED VERIFICATION PAYLOAD"
echo "============================================================"
echo ""
echo "Source-verified field names (financeVerifySchema):"
echo "  beforeValue:     z.number().nullable()           — Cycle3 dataConfidenceScore"
echo "  afterValue:      z.number().nullable()           — Cycle4 dataConfidenceScore"
echo "  targetDirection: z.enum([\"up\",\"down\"])          — up (higher score = improvement)"
echo "  targetValue:     z.number().nullable().optional() — null (no stored target on action)"
echo "  evidence:        z.array(z.string()).optional()  — [V2 snapshot UUID]"
echo "  disputed:        z.boolean().optional()          — false"
echo ""

VERIFY_PAYLOAD="$(jq -n \
  --argjson bv "$BEFORE_VALUE" \
  --argjson av "$AFTER_VALUE" \
  --arg td "$TARGET_DIRECTION" \
  --arg ev "$EVIDENCE_SNAPSHOT_ID" \
  '{
    beforeValue: $bv,
    afterValue: $av,
    targetDirection: $td,
    targetValue: null,
    evidence: [$ev],
    disputed: false
  }')"

echo "VERIFICATION_PAYLOAD:"
echo "$VERIFY_PAYLOAD"
echo ""

echo "Expected verifyOutcome result (pure function, source-verified):"
echo "  baselineValue=65, afterValue=75, targetValue=null, direction=up"
echo "  improvedVsBaseline: 75 > 65 = true"
echo "  reachedTarget: targetValue===null → false"
echo "  branch: targetValue===null && improvedVsBaseline → status=verified_improved"
echo "  reachedTarget=false → re-diagnosis hook will NOT auto-fire"
echo "  (Cycle #4 a3ccda30 already exists from action_completed trigger)"
echo ""
echo "VERIFICATION_PAYLOAD_VALID=YES"
echo ""

# -----------------------------------------------------------
# PREFLIGHT-ONLY EXIT
# -----------------------------------------------------------
if [[ "$PREFLIGHT_ONLY" == "YES" ]]; then
  echo "============================================================"
  echo "PREFLIGHT_ONLY=YES"
  echo "OWNER_AUTH=PASS"
  echo "ACTION_STATUS=completed"
  echo "EXISTING_VERIFICATION=NO"
  echo "CYCLE3_CONFIDENCE=${CYCLE3_CONFIDENCE_VAL}"
  echo "CYCLE4_CONFIDENCE=${CYCLE4_CONFIDENCE_VAL}"
  echo "CYCLE4_POINTS_TO_V2=YES"
  echo "V1_SUPERSEDED_BY_V2=YES"
  echo "V2_IS_HEAD=YES"
  echo "VERIFICATION_PAYLOAD_VALID=YES"
  echo "PRODUCTION_WRITES_PERFORMED=0"
  echo "PREFLIGHT_RESULT=PASS"
  echo "Exiting before verification POST. Await owner authorization to proceed."
  echo "============================================================"
  exit 0
fi

# -----------------------------------------------------------
# SECTION 11 — VERIFICATION POST (exactly once, no retry)
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 11 — VERIFICATION POST"
echo "============================================================"
echo "Posting verification to:"
echo "  POST ${BASE_URL}/api/owner/finance/actions/${ACTION_ID}/verify"
echo ""
echo "NOTE: This POST will be executed exactly once. Retries are prohibited."
echo ""

POST_HTTP_STATUS="$(api_post_once \
  "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}/verify" \
  "$VERIFY_PAYLOAD")"
PRODUCTION_WRITES_PERFORMED=1

POST_BODY="$(cat "$TMPBODY_POST" 2>/dev/null || echo "")"

echo "POST_HTTP_STATUS=${POST_HTTP_STATUS}"
echo ""

# -----------------------------------------------------------
# SECTION 12 — POST RESULT HANDLING
# -----------------------------------------------------------
if [[ "$POST_HTTP_STATUS" == "201" ]]; then
  echo "POST_RESULT=SUCCESS"
  echo ""
  echo "VERIFICATION_RESPONSE:"
  echo "$POST_BODY" | jq '.'
  echo ""

  VERIF_ID="$(echo "$POST_BODY" | jq -r '.verification.id // "null"')"
  VERIF_STATUS="$(echo "$POST_BODY" | jq -r '.verification.status // "null"')"
  VERIF_METRIC="$(echo "$POST_BODY" | jq -r '.verification.verificationMetric // "null"')"
  VERIF_BEFORE="$(echo "$POST_BODY" | jq '.verification.beforeValue // null')"
  VERIF_AFTER="$(echo "$POST_BODY" | jq '.verification.afterValue // null')"
  VERIF_TARGET_DIR="$(echo "$POST_BODY" | jq -r '.verification.targetDirection // "null"')"
  VERIF_TARGET_VAL="$(echo "$POST_BODY" | jq '.verification.targetValue // null')"
  VERIF_CONFIDENCE="$(echo "$POST_BODY" | jq '.verification.confidence // null')"
  VERIF_AT="$(echo "$POST_BODY" | jq -r '.verification.verifiedAt // "null"')"
  RESULT_STATUS="$(echo "$POST_BODY" | jq -r '.result.status // "null"')"
  RESULT_REACHED="$(echo "$POST_BODY" | jq '.result.reachedTarget // null')"
  RESULT_MOVEMENT="$(echo "$POST_BODY" | jq '.result.actualMovement // null')"
  RESULT_REASON="$(echo "$POST_BODY" | jq -r '.result.reason // "null"')"

  echo "VERIFICATION_ID=${VERIF_ID}"
  echo "VERIFICATION_STATUS=${VERIF_STATUS}"
  echo "VERIFICATION_METRIC=${VERIF_METRIC}"
  echo "BEFORE_VALUE=${VERIF_BEFORE}"
  echo "AFTER_VALUE=${VERIF_AFTER}"
  echo "TARGET_DIRECTION=${VERIF_TARGET_DIR}"
  echo "TARGET_VALUE=${VERIF_TARGET_VAL}"
  echo "VERIFICATION_CONFIDENCE=${VERIF_CONFIDENCE}"
  echo "VERIFIED_AT=${VERIF_AT}"
  echo "RESULT_STATUS=${RESULT_STATUS}"
  echo "RESULT_REACHED_TARGET=${RESULT_REACHED}"
  echo "RESULT_ACTUAL_MOVEMENT=${RESULT_MOVEMENT}"
  echo "RESULT_REASON=${RESULT_REASON}"

elif [[ "$POST_HTTP_STATUS" =~ ^5 ]] || [[ -z "$POST_HTTP_STATUS" ]]; then
  # Ambiguous outcome: 5xx or network failure after write attempt.
  # NOT retrying. Perform read-after-write to determine if the record was created.
  echo "POST_RESULT=AMBIGUOUS — HTTP '${POST_HTTP_STATUS}'"
  echo "NOT RETRYING. Performing read-after-write..."
  echo ""

  RAW_STATUS="$(api_get_with_status "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}")"
  RAW_BODY="$(cat "$TMPBODY_POST" 2>/dev/null || echo "")"

  echo "READ_AFTER_WRITE_HTTP_STATUS=${RAW_STATUS}"
  if [[ "$RAW_STATUS" == "200" ]]; then
    RAW_VERIF_COUNT="$(echo "$RAW_BODY" | jq '.verifications | length' 2>/dev/null || echo "PARSE_ERROR")"
    echo "READ_AFTER_WRITE_VERIF_COUNT=${RAW_VERIF_COUNT}"
    if [[ "$RAW_VERIF_COUNT" -gt 0 ]]; then
      echo "VERIFICATION_CREATED=YES (despite ambiguous HTTP status)"
      echo "$RAW_BODY" | jq -c '.verifications[0] | {id, status, verificationMetric, beforeValue, afterValue, verifiedAt}'
    else
      echo "VERIFICATION_CREATED=UNKNOWN (no verification found in read-after-write)"
    fi
  else
    echo "READ_AFTER_WRITE_FAILED — HTTP ${RAW_STATUS}"
  fi

  echo ""
  echo "PRODUCTION_WRITES_PERFORMED=${PRODUCTION_WRITES_PERFORMED} (ambiguous — manual check required)"
  exit 1

else
  echo "POST_RESULT=FAIL — HTTP ${POST_HTTP_STATUS}"
  echo ""
  echo "ERROR_BODY:"
  echo "$POST_BODY" | jq '.' 2>/dev/null || echo "$POST_BODY"
  echo ""
  echo "PRODUCTION_WRITES_PERFORMED=${PRODUCTION_WRITES_PERFORMED}"
  exit 1
fi

# -----------------------------------------------------------
# SECTION 13 — FINAL RESULT
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "TRINITY_OUTCOME_VERIFICATION_RESULT"
echo "============================================================"
echo "ACTION_ID=${ACTION_ID}"
echo "ACTION_STATUS=completed"
echo "EXISTING_VERIFICATION_AT_START=NO"
echo "CYCLE3_CONFIDENCE=${CYCLE3_CONFIDENCE_VAL}"
echo "CYCLE4_CONFIDENCE=${CYCLE4_CONFIDENCE_VAL}"
echo "CONFIDENCE_DELTA=10"
echo "VERIFICATION_METRIC=${ACTION_VERIFICATION_METRIC}"
echo "TARGET_DIRECTION=up"
echo "TARGET_VALUE=null"
echo "EVIDENCE_REFERENCE=${EVIDENCE_SNAPSHOT_ID}"
echo "VERIFICATION_ID=${VERIF_ID}"
echo "VERIFICATION_STATUS=${VERIF_STATUS}"
echo "RESULT_STATUS=${RESULT_STATUS}"
echo "RESULT_REACHED_TARGET=${RESULT_REACHED}"
echo "RESULT_MOVEMENT=${RESULT_MOVEMENT}"
echo "PRODUCTION_WRITES_PERFORMED=${PRODUCTION_WRITES_PERFORMED}"
echo ""
echo "VERDICT=TRINITY_OUTCOME_VERIFICATION_COMPLETE"
echo "============================================================"
