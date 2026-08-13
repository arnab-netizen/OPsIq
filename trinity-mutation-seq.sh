#!/usr/bin/env bash
# ============================================================
# TRINITY SERVICES — OWNER PILOT CONTROLLED MUTATION SEQUENCE
# July Snapshot Amendment + Action Status Transitions + Cycle #4
#
# STATIC VALIDATION ONLY. DO NOT EXECUTE WITHOUT OWNER AUTH.
#
# Prerequisites (export before running):
#   export VERCEL_AUTOMATION_BYPASS_SECRET="..."
# Or the script will prompt securely for all credentials.
#
# Security rules:
#   - Passwords/cookies/bypass secret are NEVER echoed
#   - set -u enforced (no unbound variables)
#   - set -o pipefail enforced (pipeline failures propagate)
#   - set -e NOT used (transient HTTP failure must not terminate
#     after an ambiguous write without reading resulting state)
#   - NEVER auto-retry writes
#   - STOP immediately on WRITE_AMBIGUOUS
# ============================================================
set -u
set -o pipefail

# -----------------------------------------------------------
# SECTION 0 — CONSTANTS
# -----------------------------------------------------------
readonly BASE_URL="https://o-ps-iq.vercel.app"
readonly EXPECTED_WORKSPACE_ID="d0609f28-dbbd-4a29-a5d2-fd74a7bb4ce5"
readonly BUSINESS_ID="0d99e80e-dc3a-46c5-b0bf-23dd09f2ed8c"
readonly ORIGINAL_SNAPSHOT_ID="fd2d4e07-5f7b-4253-be23-a07d351069b8"
readonly EXPECTED_PERIOD_START="2026-07-01"
readonly EXPECTED_PERIOD_END="2026-07-31"
readonly CYCLE1_ID="7c729460-ca52-46b5-82b1-b65f538d891a"
readonly CYCLE2_ID="4bf5382c-b432-4051-b65a-1d13ca9dc5f4"
readonly CYCLE3_ID="87b81bea-a753-4131-b63f-e83050891534"
readonly ACTION_ID="2294733b-e0ad-488b-916f-a93e3c665cca"
readonly EXPECTED_SNAPSHOT_VERSION="1"
readonly EXPECTED_SNAPSHOT_SUPERSEDED="null"
readonly EXPECTED_CYCLE3_SEQ="3"
readonly EXPECTED_ACTION_STATUS_INITIAL="proposed"
readonly EXPECTED_ACTION_CYCLE="87b81bea-a753-4131-b63f-e83050891534"
readonly AMENDMENT_REASON="Owner Pilot Cycle #3 data-quality action — owner confirmed July-end receivables = INR 0 and payables = INR 0."
readonly AMEND_RECEIVABLES="0"
readonly AMEND_PAYABLES="0"

# Non-target fields in Prisma column names (returned by GET /snapshots/:id).
# These MUST be identical between v1 and v2.
#
# EXCLUDED from this list (intentional or recomputed differences):
#   id                — new UUID on v2
#   version           — incremented (v1=1, v2=2)
#   supersededById    — v1 stamped with v2 id; v2 is null
#   amendmentReason   — set only on v2
#   changedFields     — set only on v2 (["receivables","payables"])
#   amendedByActorId  — set only on v2
#   createdAt         — different row timestamp
#   updatedAt         — different row timestamp
#   receivables       — intended amendment target (→ 0)
#   payables          — intended amendment target (→ 0)
#   dataConfidenceScore — RECOMPUTED by calculateDataConfidence() from merged row;
#                         not copied from v1. Will change when receivables/payables change.
#   missingCriticalData — RECOMPUTED alongside dataConfidenceScore; not copied.
NON_TARGET_FIELDS=(
  "businessId"
  "workspaceId"
  "periodStart"
  "periodEnd"
  "currency"
  "businessModelType"
  "industryTemplate"
  "revenue"
  "b2bRevenue"
  "b2cRevenue"
  "costOfGoods"
  "fixedCosts"
  "variableCosts"
  "rent"
  "payroll"
  "utilities"
  "deliveryCost"
  "marketingSpend"
  "discountAmount"
  "refundReworkCost"
  "debtPayments"
  "totalDebtOutstanding"
  "cashOnHand"
  "overdueReceivables"
  "overduePayables"
  "ownerWithdrawals"
  "inventoryCashLock"
  "orderCount"
  "customerCount"
  "repeatCustomerCount"
  "notes"
)

# -----------------------------------------------------------
# SECTION 0b — STATE VARIABLES (all initialized for set -u)
# -----------------------------------------------------------
WRITE_COUNT=0
NEW_SNAPSHOT_ID=""
CYCLE4_ID=""
ACTOR_ID=""
ACTOR_EMAIL=""
HIGHEST_ROLE=""
RESOLVED_WORKSPACE_IDS=""
TARGET_WORKSPACE_AUTHORIZED="NO"

# Snapshots
SNAP_V1_BODY=""
SNAP_V2_BODY=""
V1_PERIOD_START=""
V1_PERIOD_END=""
V1_VERSION=""
V1_SUPERSEDED=""
V1_RECEIVABLES=""
V1_PAYABLES=""
V1_OVERDUE_RECEIVABLES=""
V1_OVERDUE_PAYABLES=""
NEW_SNAP_VERSION=""

# Action
ACTION_INITIAL_STATUS=""
ACTION_INITIAL_CYCLE_ID=""
ACTION_POST_ASSIGN_STATUS=""
ACTION_POST_IN_PROGRESS_STATUS=""
ACTION_POST_COMPLETED_STATUS=""

# Cycles
C3_SEQ=""
C3_STATUS=""
C3_CONFIDENCE=""
C3_SURVIVAL=""
C3_HEALTH=""
C3_RISK=""
C3_OPP=""
C3_SNAPSHOT_ID=""
CYCLE4_SEQ=""
CYCLE4_STATUS=""
CYCLE4_SNAPSHOT_ID=""
CYCLE4_CONFIDENCE=""
CYCLE4_SURVIVAL=""
CYCLE4_HEALTH=""
CYCLE4_RISK=""
CYCLE4_OPP=""
C1_SNAPSHOT_ID=""
C2_SNAPSHOT_ID=""

# Write classification results
ASSIGN_RESULT=""
IN_PROGRESS_RESULT=""
AMEND_RESULT=""
COMPLETE_RESULT=""

# Non-target field check
UNCHANGED_NON_TARGET_FIELDS="NOT_CHECKED"
NON_TARGET_MISMATCHES=""

# Curl state
LAST_HTTP_STATUS=""
LAST_BODY=""
CURL_EXIT=0

# Cycle #4 polling
POLL_ATTEMPT=0
CYCLE4_OBSERVED="NO"

# Final report values
AUTO_REASSESSMENT="AUTO_REASSESSMENT_NOT_OBSERVED"
CONF_DELTA="null"
AMENDMENT_VERIFIED="UNCHECKED"
ORIGINAL_SNAPSHOT_PRESERVED="UNCHECKED"
VERSION_2_CURRENT="UNCHECKED"
REPORTING_PERIOD_INTEGRITY="UNCHECKED"
CYCLE_HISTORY_SUMMARY=""

# -----------------------------------------------------------
# SECTION 0c — TEMP COOKIE JAR
# -----------------------------------------------------------
JAR="$(mktemp /tmp/opsiq-cjar-XXXXXX.txt)"
trap 'rm -f "$JAR"; echo "[cleanup] Cookie jar removed."' EXIT

# -----------------------------------------------------------
# SECTION 0d — PREFLIGHT-ONLY FLAG
# -----------------------------------------------------------
PREFLIGHT_ONLY=NO
if [[ "${1:-}" == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=YES
fi

# -----------------------------------------------------------
# SECTION 0e2 — CREDENTIAL PROMPTS (secure, never echoed)
# -----------------------------------------------------------
echo "============================================================"
echo "TRINITY SERVICES — OWNER PILOT MUTATION SEQUENCE"
echo "SCRIPT TIMESTAMP: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
if [[ "$PREFLIGHT_ONLY" == "YES" ]]; then
  echo "MODE=PREFLIGHT_ONLY (no production mutations will be performed)"
fi
echo "============================================================"
echo ""
echo "[credentials] All inputs are read silently. Nothing will be echoed."
echo ""

printf 'OpsIQ owner email: '
read -r OWNER_EMAIL
if [[ -z "$OWNER_EMAIL" ]]; then
  echo "ABORT: OWNER_EMAIL cannot be empty."
  exit 1
fi

printf 'OpsIQ owner password: '
read -rs OWNER_PASSWORD
echo
if [[ -z "$OWNER_PASSWORD" ]]; then
  echo "ABORT: OWNER_PASSWORD cannot be empty."
  exit 1
fi

if [[ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]]; then
  VERCEL_BYPASS="${VERCEL_AUTOMATION_BYPASS_SECRET}"
else
  printf 'Vercel automation bypass secret: '
  read -rs VERCEL_BYPASS
  echo
fi
if [[ -z "$VERCEL_BYPASS" ]]; then
  echo "ABORT: VERCEL_BYPASS cannot be empty."
  exit 1
fi

# Unset password immediately after capturing (will be sent once, then cleared)
# We need it for the login call below; it will be unset right after.

# -----------------------------------------------------------
# SECTION 0e — HTTP HELPERS
# -----------------------------------------------------------

# GET: reads cookies from JAR, appends bypass header
# Sets LAST_HTTP_STATUS, LAST_BODY, CURL_EXIT
do_get() {
  local url="$1"
  local tmpf
  tmpf="$(mktemp /tmp/opsiq-tmp-XXXXXX.json)"
  CURL_EXIT=0
  LAST_HTTP_STATUS="$(
    curl --silent --show-error \
      --connect-timeout 15 \
      --max-time 60 \
      -b "$JAR" \
      -H "x-vercel-protection-bypass: ${VERCEL_BYPASS}" \
      -H "Accept: application/json" \
      -w "%{http_code}" \
      -o "$tmpf" \
      "$url" 2>/tmp/opsiq-curl-err.txt
  )" || CURL_EXIT=$?
  LAST_BODY="$(cat "$tmpf" 2>/dev/null || printf '')"
  rm -f "$tmpf"
  if [[ $CURL_EXIT -ne 0 ]]; then
    LAST_HTTP_STATUS="CURL_ERROR_${CURL_EXIT}"
    LAST_BODY="$(cat /tmp/opsiq-curl-err.txt 2>/dev/null || printf '')"
  fi
}

# PATCH: sends JSON body, reads cookies from JAR
do_patch() {
  local url="$1"
  local body="$2"
  local tmpf
  tmpf="$(mktemp /tmp/opsiq-tmp-XXXXXX.json)"
  CURL_EXIT=0
  LAST_HTTP_STATUS="$(
    curl --silent --show-error \
      --connect-timeout 15 \
      --max-time 60 \
      -b "$JAR" \
      -H "x-vercel-protection-bypass: ${VERCEL_BYPASS}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -X PATCH \
      -d "$body" \
      -w "%{http_code}" \
      -o "$tmpf" \
      "$url" 2>/tmp/opsiq-curl-err.txt
  )" || CURL_EXIT=$?
  LAST_BODY="$(cat "$tmpf" 2>/dev/null || printf '')"
  rm -f "$tmpf"
  if [[ $CURL_EXIT -ne 0 ]]; then
    LAST_HTTP_STATUS="CURL_ERROR_${CURL_EXIT}"
    LAST_BODY="$(cat /tmp/opsiq-curl-err.txt 2>/dev/null || printf '')"
  fi
}

# POST: sends JSON body, reads cookies from JAR
do_post() {
  local url="$1"
  local body="$2"
  local tmpf
  tmpf="$(mktemp /tmp/opsiq-tmp-XXXXXX.json)"
  CURL_EXIT=0
  LAST_HTTP_STATUS="$(
    curl --silent --show-error \
      --connect-timeout 15 \
      --max-time 60 \
      -b "$JAR" \
      -H "x-vercel-protection-bypass: ${VERCEL_BYPASS}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -X POST \
      -d "$body" \
      -w "%{http_code}" \
      -o "$tmpf" \
      "$url" 2>/tmp/opsiq-curl-err.txt
  )" || CURL_EXIT=$?
  LAST_BODY="$(cat "$tmpf" 2>/dev/null || printf '')"
  rm -f "$tmpf"
  if [[ $CURL_EXIT -ne 0 ]]; then
    LAST_HTTP_STATUS="CURL_ERROR_${CURL_EXIT}"
    LAST_BODY="$(cat /tmp/opsiq-curl-err.txt 2>/dev/null || printf '')"
  fi
}

# -----------------------------------------------------------
# SECTION 0f — ABORT HELPER
# -----------------------------------------------------------
abort_with_report() {
  local reason="$1"
  echo ""
  echo "============================================================"
  echo "ABORT: ${reason}"
  echo "PRODUCTION_WRITES_PERFORMED=${WRITE_COUNT}"
  echo "============================================================"
  echo ""
  echo "TRINITY_JULY_AMENDMENT_AND_CYCLE4_RESULT:"
  echo "  VERDICT=TRINITY_JULY_AMENDMENT_WRITE_AMBIGUOUS"
  echo "  ABORT_REASON=${reason}"
  echo "  PRODUCTION_WRITES_PERFORMED=${WRITE_COUNT}"
  exit 1
}

# -----------------------------------------------------------
# SECTION 1 — PRE-WRITE HARD GATE (OWNER AUTH)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 1 — OWNER AUTHENTICATION"
echo "============================================================"
echo "LOGIN_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

LOGIN_BODY="{\"email\":\"${OWNER_EMAIL}\",\"password\":\"${OWNER_PASSWORD}\"}"
unset OWNER_PASSWORD  # Clear immediately after building body

CURL_EXIT=0
LOGIN_STATUS="$(
  curl --silent --show-error \
    --connect-timeout 15 \
    --max-time 60 \
    -c "$JAR" \
    -H "x-vercel-protection-bypass: ${VERCEL_BYPASS}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -X POST \
    -d "$LOGIN_BODY" \
    -w "%{http_code}" \
    -o /dev/null \
    "${BASE_URL}/api/auth/login" 2>/tmp/opsiq-curl-err.txt
)" || CURL_EXIT=$?
unset LOGIN_BODY

echo "LOGIN_HTTP_STATUS=${LOGIN_STATUS}"
if [[ $CURL_EXIT -ne 0 ]]; then
  echo "LOGIN=FAIL (curl error ${CURL_EXIT})"
  abort_with_report "Login curl error ${CURL_EXIT}"
fi
if [[ "$LOGIN_STATUS" != "200" ]]; then
  echo "LOGIN=FAIL — HTTP ${LOGIN_STATUS}"
  abort_with_report "Login returned HTTP ${LOGIN_STATUS}"
fi
echo "LOGIN=OK"

# -----------------------------------------------------------
# SECTION 1b — IDENTITY GATE
# -----------------------------------------------------------
echo ""
echo "--- Identity and role gate ---"
do_get "${BASE_URL}/api/me"
ME_BODY="$LAST_BODY"

if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  abort_with_report "GET /api/me returned HTTP ${LAST_HTTP_STATUS}"
fi

ACTOR_ID="$(echo "$ME_BODY" | jq -r '.user.id // empty')"
ACTOR_EMAIL="$(echo "$ME_BODY" | jq -r '.user.email // empty')"
HIGHEST_ROLE="$(echo "$ME_BODY" | jq -r '.highestRole // empty')"
# Workspace IDs come from role assignments (scope="workspace", scopeId=workspaceId).
# /api/me returns .roles[] from getRolesForUser() which selects scope="workspace" rows.
# .memberships[] comes from getMembershipsForUser() which returns engagement memberships
# (fields: id, engagementId, role, addedAt, addedBy) — NO workspaceId field. Do NOT use.
RESOLVED_WORKSPACE_IDS="$(echo "$ME_BODY" | jq -r '[.roles[]? | select(.scope == "workspace") | .scopeId] | unique | join(",")')"
TARGET_WORKSPACE_AUTHORIZED="NO"
if echo "$RESOLVED_WORKSPACE_IDS" | grep -qF "$EXPECTED_WORKSPACE_ID"; then
  TARGET_WORKSPACE_AUTHORIZED="YES"
fi

echo "ACTOR_ID=${ACTOR_ID}"
echo "ACTOR_EMAIL=${ACTOR_EMAIL}"
echo "HIGHEST_ROLE=${HIGHEST_ROLE}"
echo "RESOLVED_WORKSPACE_IDS=${RESOLVED_WORKSPACE_IDS}"
echo "TARGET_WORKSPACE_AUTHORIZED=${TARGET_WORKSPACE_AUTHORIZED}"

if [[ -z "$ACTOR_ID" ]]; then
  abort_with_report "GATE_FAIL: could not resolve actorId from /api/me"
fi

if [[ "$HIGHEST_ROLE" != "admin_or_portfolio_manager" ]]; then
  abort_with_report "GATE_FAIL: highestRole='${HIGHEST_ROLE}' — required 'admin_or_portfolio_manager'"
fi

if [[ "$TARGET_WORKSPACE_AUTHORIZED" != "YES" ]]; then
  abort_with_report "GATE_FAIL: expected workspace '${EXPECTED_WORKSPACE_ID}' not found in authenticated role scopes: '${RESOLVED_WORKSPACE_IDS}'"
fi

echo "GATE_AUTH=PASS"

# -----------------------------------------------------------
# SECTION 1c — SNAPSHOT STATE GATE
# -----------------------------------------------------------
echo ""
echo "--- Snapshot state gate ---"
do_get "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  abort_with_report "GATE_FAIL: GET snapshot returned HTTP ${LAST_HTTP_STATUS}"
fi

SNAP_V1_BODY="$LAST_BODY"
V1_VERSION="$(echo "$SNAP_V1_BODY" | jq -r '.version // empty')"
V1_SUPERSEDED="$(echo "$SNAP_V1_BODY" | jq -r '.supersededById // "null"')"
V1_PERIOD_START="$(echo "$SNAP_V1_BODY" | jq -r '.periodStart // empty')"
V1_PERIOD_END="$(echo "$SNAP_V1_BODY" | jq -r '.periodEnd // empty')"
V1_RECEIVABLES="$(echo "$SNAP_V1_BODY" | jq -r '.receivables // "null"')"
V1_PAYABLES="$(echo "$SNAP_V1_BODY" | jq -r '.payables // "null"')"
V1_OVERDUE_RECEIVABLES="$(echo "$SNAP_V1_BODY" | jq -r '.overdueReceivables // "null"')"
V1_OVERDUE_PAYABLES="$(echo "$SNAP_V1_BODY" | jq -r '.overduePayables // "null"')"

echo "SNAPSHOT_VERSION=${V1_VERSION}"
echo "SNAPSHOT_SUPERSEDED_BY=${V1_SUPERSEDED}"
echo "SNAPSHOT_PERIOD_START=${V1_PERIOD_START}"
echo "SNAPSHOT_PERIOD_END=${V1_PERIOD_END}"
echo "SNAPSHOT_RECEIVABLES=${V1_RECEIVABLES}"
echo "SNAPSHOT_PAYABLES=${V1_PAYABLES}"

if [[ "$V1_VERSION" != "$EXPECTED_SNAPSHOT_VERSION" ]]; then
  abort_with_report "GATE_FAIL: snapshot version='${V1_VERSION}' — expected '${EXPECTED_SNAPSHOT_VERSION}'"
fi

if [[ "$V1_SUPERSEDED" != "null" ]]; then
  abort_with_report "GATE_FAIL: snapshot supersededById='${V1_SUPERSEDED}' — expected null (snapshot already amended)"
fi

# Validate period (check date prefix, not exact ISO string, since time component may vary)
if [[ "$V1_PERIOD_START" != "${EXPECTED_PERIOD_START}"* ]]; then
  abort_with_report "GATE_FAIL: periodStart='${V1_PERIOD_START}' — expected to start with '${EXPECTED_PERIOD_START}'"
fi

if [[ "$V1_PERIOD_END" != "${EXPECTED_PERIOD_END}"* ]] && [[ "$V1_PERIOD_END" != "2026-08-01"* ]]; then
  abort_with_report "GATE_FAIL: periodEnd='${V1_PERIOD_END}' — expected July 2026 end"
fi

echo "GATE_SNAPSHOT=PASS"

# -----------------------------------------------------------
# SECTION 1d — CYCLE #3 STATE GATE
# -----------------------------------------------------------
echo ""
echo "--- Cycle #3 state gate ---"
do_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE3_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  abort_with_report "GATE_FAIL: GET Cycle #3 returned HTTP ${LAST_HTTP_STATUS}"
fi

C3_BODY="$LAST_BODY"
C3_SEQ="$(echo "$C3_BODY" | jq -r '.sequenceNumber // empty')"
C3_STATUS="$(echo "$C3_BODY" | jq -r '.status // empty')"
C3_CONFIDENCE="$(echo "$C3_BODY" | jq -r '.dataConfidenceScore // "null"')"
C3_SURVIVAL="$(echo "$C3_BODY" | jq -r '.survivalState // "null"')"
C3_HEALTH="$(echo "$C3_BODY" | jq -r '.overallHealthScore // "null"')"
C3_RISK="$(echo "$C3_BODY" | jq -r '.survivalRiskScore // "null"')"
C3_OPP="$(echo "$C3_BODY" | jq -r '.growthOpportunityScore // "null"')"
C3_SNAPSHOT_ID="$(echo "$C3_BODY" | jq -r '.snapshotId // empty')"

echo "CYCLE3_SEQ=${C3_SEQ}"
echo "CYCLE3_STATUS=${C3_STATUS}"
echo "CYCLE3_CONFIDENCE=${C3_CONFIDENCE}"
echo "CYCLE3_SURVIVAL=${C3_SURVIVAL}"
echo "CYCLE3_SNAPSHOT_ID=${C3_SNAPSHOT_ID}"

if [[ "$C3_SEQ" != "$EXPECTED_CYCLE3_SEQ" ]]; then
  abort_with_report "GATE_FAIL: Cycle #3 sequenceNumber='${C3_SEQ}' — expected '${EXPECTED_CYCLE3_SEQ}'"
fi

if [[ "$C3_CONFIDENCE" != "65" ]]; then
  abort_with_report "GATE_FAIL: Cycle #3 dataConfidenceScore='${C3_CONFIDENCE}' — expected 65"
fi

if [[ "$C3_SURVIVAL" != "WATCH" ]]; then
  abort_with_report "GATE_FAIL: Cycle #3 survivalState='${C3_SURVIVAL}' — expected WATCH"
fi

echo "GATE_CYCLE3=PASS"

# -----------------------------------------------------------
# SECTION 1e — ACTION STATE GATE
# -----------------------------------------------------------
echo ""
echo "--- Action state gate ---"
do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  abort_with_report "GATE_FAIL: GET action returned HTTP ${LAST_HTTP_STATUS}"
fi

ACTION_BODY="$LAST_BODY"
ACTION_INITIAL_STATUS="$(echo "$ACTION_BODY" | jq -r '.status // empty')"
ACTION_INITIAL_CYCLE_ID="$(echo "$ACTION_BODY" | jq -r '.cycleId // empty')"

echo "ACTION_STATUS=${ACTION_INITIAL_STATUS}"
echo "ACTION_CYCLE_ID=${ACTION_INITIAL_CYCLE_ID}"

if [[ "$ACTION_INITIAL_STATUS" != "$EXPECTED_ACTION_STATUS_INITIAL" ]]; then
  abort_with_report "GATE_FAIL: action status='${ACTION_INITIAL_STATUS}' — expected '${EXPECTED_ACTION_STATUS_INITIAL}'"
fi

if [[ "$ACTION_INITIAL_CYCLE_ID" != "$EXPECTED_ACTION_CYCLE" ]]; then
  abort_with_report "GATE_FAIL: action cycleId='${ACTION_INITIAL_CYCLE_ID}' — expected '${EXPECTED_ACTION_CYCLE}'"
fi

echo "GATE_ACTION=PASS"
echo ""
echo "ALL PRE-WRITE GATES PASSED."
echo "WRITE_COUNT_BEFORE_MUTATIONS=${WRITE_COUNT}"
echo ""

# -----------------------------------------------------------
# PREFLIGHT-ONLY EXIT (if --preflight-only flag was passed)
# -----------------------------------------------------------
if [[ "$PREFLIGHT_ONLY" == "YES" ]]; then
  echo "============================================================"
  echo "PREFLIGHT_ONLY=YES"
  echo "PRECONDITIONS=PASS"
  echo "TARGET_WORKSPACE_AUTHORIZED=${TARGET_WORKSPACE_AUTHORIZED}"
  echo "PRODUCTION_WRITES_PERFORMED=0"
  echo "PREFLIGHT_RESULT=PASS"
  echo "Exiting before any production mutation. Script complete."
  echo "============================================================"
  exit 0
fi

# -----------------------------------------------------------
# SECTION 2 — WRITE 1: proposed → assigned
# -----------------------------------------------------------
echo "============================================================"
echo "SECTION 2 — WRITE 1: proposed → assigned"
echo "============================================================"

ASSIGN_BODY="{\"status\":\"assigned\",\"assignedTo\":\"${ACTOR_ID}\"}"
do_patch "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}" "$ASSIGN_BODY"

ASSIGN_HTTP="${LAST_HTTP_STATUS}"
echo "PATCH_STATUS=${ASSIGN_HTTP}"

if [[ "$ASSIGN_HTTP" != "200" ]]; then
  # Not 200 — check if it was already applied (idempotency check)
  do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    ACTION_POST_ASSIGN_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
    if [[ "$ACTION_POST_ASSIGN_STATUS" == "assigned" ]]; then
      echo "ASSIGN_RESULT=WRITE_CONFIRMED (PATCH returned ${ASSIGN_HTTP} but read confirms status=assigned)"
    else
      ASSIGN_RESULT="WRITE_AMBIGUOUS (PATCH=${ASSIGN_HTTP}, current status=${ACTION_POST_ASSIGN_STATUS})"
      abort_with_report "ASSIGN: ${ASSIGN_RESULT}"
    fi
  else
    ASSIGN_RESULT="WRITE_AMBIGUOUS (PATCH=${ASSIGN_HTTP}, read-after-write GET=${LAST_HTTP_STATUS})"
    abort_with_report "ASSIGN: ${ASSIGN_RESULT}"
  fi
fi

# PATCH returned 200 — read-after-write to confirm
do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  ASSIGN_RESULT="WRITE_AMBIGUOUS (PATCH=200 but read-after-write GET=${LAST_HTTP_STATUS})"
  abort_with_report "ASSIGN: ${ASSIGN_RESULT}"
fi

ACTION_POST_ASSIGN_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
if [[ "$ACTION_POST_ASSIGN_STATUS" == "assigned" ]]; then
  ASSIGN_RESULT="WRITE_CONFIRMED"
  WRITE_COUNT=1
  echo "ACTION_STATUS_POST_ASSIGN=${ACTION_POST_ASSIGN_STATUS}"
  echo "ASSIGN_RESULT=${ASSIGN_RESULT}"
elif [[ "$ACTION_POST_ASSIGN_STATUS" == "proposed" ]]; then
  ASSIGN_RESULT="WRITE_NOT_APPLIED (status still proposed)"
  echo "ASSIGN_RESULT=${ASSIGN_RESULT}"
  abort_with_report "ASSIGN: ${ASSIGN_RESULT}"
else
  ASSIGN_RESULT="WRITE_AMBIGUOUS (unexpected status=${ACTION_POST_ASSIGN_STATUS})"
  abort_with_report "ASSIGN: ${ASSIGN_RESULT}"
fi

# -----------------------------------------------------------
# SECTION 3 — WRITE 2: assigned → in_progress
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 3 — WRITE 2: assigned → in_progress"
echo "============================================================"

IN_PROGRESS_BODY='{"status":"in_progress"}'
do_patch "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}" "$IN_PROGRESS_BODY"

IN_PROGRESS_HTTP="${LAST_HTTP_STATUS}"
echo "PATCH_STATUS=${IN_PROGRESS_HTTP}"

if [[ "$IN_PROGRESS_HTTP" == "409" ]]; then
  echo "GATE_BLOCKED_BY_SAFETY_GATE=YES"
  abort_with_report "in_progress transition blocked by owner-action gate (HTTP 409). DO NOT WEAKEN THE GATE."
fi

if [[ "$IN_PROGRESS_HTTP" != "200" ]]; then
  do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    ACTION_POST_IN_PROGRESS_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
    if [[ "$ACTION_POST_IN_PROGRESS_STATUS" == "in_progress" ]]; then
      echo "IN_PROGRESS_RESULT=WRITE_CONFIRMED (PATCH=${IN_PROGRESS_HTTP} but read confirms status=in_progress)"
    else
      IN_PROGRESS_RESULT="WRITE_AMBIGUOUS (PATCH=${IN_PROGRESS_HTTP}, current status=${ACTION_POST_IN_PROGRESS_STATUS})"
      abort_with_report "IN_PROGRESS: ${IN_PROGRESS_RESULT}"
    fi
  else
    IN_PROGRESS_RESULT="WRITE_AMBIGUOUS (PATCH=${IN_PROGRESS_HTTP}, read-after-write GET=${LAST_HTTP_STATUS})"
    abort_with_report "IN_PROGRESS: ${IN_PROGRESS_RESULT}"
  fi
fi

# PATCH returned 200 — read-after-write
do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  IN_PROGRESS_RESULT="WRITE_AMBIGUOUS (PATCH=200 but read-after-write GET=${LAST_HTTP_STATUS})"
  abort_with_report "IN_PROGRESS: ${IN_PROGRESS_RESULT}"
fi

ACTION_POST_IN_PROGRESS_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
if [[ "$ACTION_POST_IN_PROGRESS_STATUS" == "in_progress" ]]; then
  IN_PROGRESS_RESULT="WRITE_CONFIRMED"
  WRITE_COUNT=2
  echo "ACTION_STATUS_POST_IN_PROGRESS=${ACTION_POST_IN_PROGRESS_STATUS}"
  echo "IN_PROGRESS_RESULT=${IN_PROGRESS_RESULT}"
elif [[ "$ACTION_POST_IN_PROGRESS_STATUS" == "assigned" ]]; then
  IN_PROGRESS_RESULT="WRITE_NOT_APPLIED (status still assigned)"
  echo "IN_PROGRESS_RESULT=${IN_PROGRESS_RESULT}"
  abort_with_report "IN_PROGRESS: ${IN_PROGRESS_RESULT}"
else
  IN_PROGRESS_RESULT="WRITE_AMBIGUOUS (unexpected status=${ACTION_POST_IN_PROGRESS_STATUS})"
  abort_with_report "IN_PROGRESS: ${IN_PROGRESS_RESULT}"
fi

# Gate check: survivalState at in_progress time (gate ALLOWS WATCH)
echo "GATE_ALLOWED_SURVIVAL_STATE=${C3_SURVIVAL} (WATCH does not block finance domain; severity=1 < threshold=3)"

# -----------------------------------------------------------
# SECTION 4 — WRITE 3: POST /amend (receivables=0, payables=0)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 4 — WRITE 3: POST /amend"
echo "============================================================"
echo "AMEND_FIELDS=receivables=${AMEND_RECEIVABLES}, payables=${AMEND_PAYABLES}"

AMEND_PAYLOAD="{\"amendmentReason\":\"${AMENDMENT_REASON}\",\"receivables\":${AMEND_RECEIVABLES},\"payables\":${AMEND_PAYABLES}}"
do_post "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}/amend" "$AMEND_PAYLOAD"

AMEND_HTTP="${LAST_HTTP_STATUS}"
AMEND_RESPONSE="$LAST_BODY"
echo "POST_STATUS=${AMEND_HTTP}"

if [[ "$AMEND_HTTP" == "CURL_ERROR_"* ]]; then
  # Timeout or network error — DO NOT POST AGAIN. Read the chain first.
  echo "AMEND_TIMEOUT_OR_CURL_ERROR=YES (${AMEND_HTTP})"
  echo "Resolving current snapshot chain before any retry decision..."

  do_get "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}"
  if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (curl error on POST, read of original snapshot returned ${LAST_HTTP_STATUS})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi

  V1_BODY_AFTER="$LAST_BODY"
  V1_SUPERSEDED_AFTER="$(echo "$V1_BODY_AFTER" | jq -r '.supersededById // "null"')"

  if [[ "$V1_SUPERSEDED_AFTER" == "null" ]]; then
    # Amendment did not apply
    AMEND_RESULT="WRITE_NOT_APPLIED (curl error and original snapshot still not superseded)"
    echo "AMEND_RESULT=${AMEND_RESULT}"
    abort_with_report "AMEND: ${AMEND_RESULT} — DO NOT POST AGAIN without owner re-authorization"
  else
    # supersededById is set — amendment may have applied, verify v2
    NEW_SNAPSHOT_ID="$V1_SUPERSEDED_AFTER"
    echo "V1_SUPERSEDED_BY=${NEW_SNAPSHOT_ID}"
    do_get "${BASE_URL}/api/owner/finance/snapshots/${NEW_SNAPSHOT_ID}"
    if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
      AMEND_RESULT="WRITE_AMBIGUOUS (curl error on POST, v2 GET returned ${LAST_HTTP_STATUS})"
      abort_with_report "AMEND: ${AMEND_RESULT}"
    fi
    SNAP_V2_BODY="$LAST_BODY"
    V2_RECEIVABLES="$(echo "$SNAP_V2_BODY" | jq -r '.receivables // "null"')"
    V2_PAYABLES="$(echo "$SNAP_V2_BODY" | jq -r '.payables // "null"')"
    if [[ "$V2_RECEIVABLES" == "$AMEND_RECEIVABLES" ]] && [[ "$V2_PAYABLES" == "$AMEND_PAYABLES" ]]; then
      AMEND_RESULT="WRITE_CONFIRMED (curl error on POST, v2 exists with correct values)"
      WRITE_COUNT=3
      echo "AMEND_RESULT=${AMEND_RESULT}"
    else
      AMEND_RESULT="WRITE_AMBIGUOUS (v2 exists but receivables=${V2_RECEIVABLES}, payables=${V2_PAYABLES} — expected 0,0)"
      abort_with_report "AMEND: ${AMEND_RESULT}"
    fi
  fi

elif [[ "$AMEND_HTTP" == "409" ]]; then
  # Concurrency conflict — snapshot already superseded. Read chain.
  echo "AMEND_409_CONFLICT=YES"
  do_get "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}"
  if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=409, original snapshot GET=${LAST_HTTP_STATUS})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi
  V1_BODY_AFTER="$LAST_BODY"
  V1_SUPERSEDED_AFTER="$(echo "$V1_BODY_AFTER" | jq -r '.supersededById // "null"')"
  if [[ "$V1_SUPERSEDED_AFTER" == "null" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=409 but original snapshot not superseded)"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi
  NEW_SNAPSHOT_ID="$V1_SUPERSEDED_AFTER"
  do_get "${BASE_URL}/api/owner/finance/snapshots/${NEW_SNAPSHOT_ID}"
  if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=409, v2 GET returned ${LAST_HTTP_STATUS})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi
  SNAP_V2_BODY="$LAST_BODY"
  V2_RECEIVABLES="$(echo "$SNAP_V2_BODY" | jq -r '.receivables // "null"')"
  V2_PAYABLES="$(echo "$SNAP_V2_BODY" | jq -r '.payables // "null"')"
  if [[ "$V2_RECEIVABLES" == "$AMEND_RECEIVABLES" ]] && [[ "$V2_PAYABLES" == "$AMEND_PAYABLES" ]]; then
    AMEND_RESULT="WRITE_CONFIRMED (POST=409, v2 already has correct values)"
    WRITE_COUNT=3
    echo "AMEND_RESULT=${AMEND_RESULT}"
  else
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=409, v2 has receivables=${V2_RECEIVABLES}, payables=${V2_PAYABLES})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi

elif [[ "$AMEND_HTTP" == "201" ]]; then
  # Success — extract newSnapshotId from response
  NEW_SNAPSHOT_ID="$(echo "$AMEND_RESPONSE" | jq -r '.newSnapshotId // empty')"
  NEW_SNAP_VERSION="$(echo "$AMEND_RESPONSE" | jq -r '.version // empty')"
  PREVIOUS_SNAPSHOT_ID="$(echo "$AMEND_RESPONSE" | jq -r '.previousSnapshotId // empty')"
  echo "NEW_SNAPSHOT_ID=${NEW_SNAPSHOT_ID}"
  echo "PREVIOUS_SNAPSHOT_ID=${PREVIOUS_SNAPSHOT_ID}"
  echo "NEW_SNAP_VERSION=${NEW_SNAP_VERSION}"

  if [[ -z "$NEW_SNAPSHOT_ID" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=201 but newSnapshotId missing from response)"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi

  # Read-after-write: verify v2
  do_get "${BASE_URL}/api/owner/finance/snapshots/${NEW_SNAPSHOT_ID}"
  if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=201, v2 GET=${LAST_HTTP_STATUS})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi
  SNAP_V2_BODY="$LAST_BODY"
  V2_RECEIVABLES="$(echo "$SNAP_V2_BODY" | jq -r '.receivables // "null"')"
  V2_PAYABLES="$(echo "$SNAP_V2_BODY" | jq -r '.payables // "null"')"
  V2_VERSION="$(echo "$SNAP_V2_BODY" | jq -r '.version // "null"')"
  V2_SUPERSEDED="$(echo "$SNAP_V2_BODY" | jq -r '.supersededById // "null"')"

  if [[ "$V2_RECEIVABLES" == "$AMEND_RECEIVABLES" ]] && [[ "$V2_PAYABLES" == "$AMEND_PAYABLES" ]]; then
    AMEND_RESULT="WRITE_CONFIRMED"
    WRITE_COUNT=3
    AMENDMENT_VERIFIED="YES"
    echo "V2_RECEIVABLES=${V2_RECEIVABLES}"
    echo "V2_PAYABLES=${V2_PAYABLES}"
    echo "V2_VERSION=${V2_VERSION}"
    echo "V2_SUPERSEDED=${V2_SUPERSEDED}"
    echo "AMEND_RESULT=${AMEND_RESULT}"
  else
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=201, v2 has receivables=${V2_RECEIVABLES}, payables=${V2_PAYABLES})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi

else
  # Unexpected HTTP status — read chain before any further decision
  echo "AMEND_UNEXPECTED_HTTP=${AMEND_HTTP}"
  do_get "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    V1_BODY_AFTER="$LAST_BODY"
    V1_SUPERSEDED_AFTER="$(echo "$V1_BODY_AFTER" | jq -r '.supersededById // "null"')"
    if [[ "$V1_SUPERSEDED_AFTER" == "null" ]]; then
      AMEND_RESULT="WRITE_NOT_APPLIED (POST=${AMEND_HTTP}, original snapshot still not superseded)"
      echo "AMEND_RESULT=${AMEND_RESULT}"
      abort_with_report "AMEND: ${AMEND_RESULT}"
    else
      NEW_SNAPSHOT_ID="$V1_SUPERSEDED_AFTER"
      AMEND_RESULT="WRITE_AMBIGUOUS (POST=${AMEND_HTTP}, snapshot superseded but POST was not 201)"
      abort_with_report "AMEND: ${AMEND_RESULT}"
    fi
  else
    AMEND_RESULT="WRITE_AMBIGUOUS (POST=${AMEND_HTTP}, chain read also failed: ${LAST_HTTP_STATUS})"
    abort_with_report "AMEND: ${AMEND_RESULT}"
  fi
fi

# -----------------------------------------------------------
# SECTION 5 — NON-TARGET FIELD EQUALITY CHECK
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 5 — NON-TARGET FIELD EQUALITY CHECK"
echo "============================================================"
echo "Comparing v1 vs v2 for all fields except receivables and payables..."

NON_TARGET_MISMATCHES=""
for field in "${NON_TARGET_FIELDS[@]}"; do
  v1_val="$(echo "$SNAP_V1_BODY" | jq -r --arg f "$field" '.[$f] // "null"')"
  v2_val="$(echo "$SNAP_V2_BODY" | jq -r --arg f "$field" '.[$f] // "null"')"
  if [[ "$v1_val" != "$v2_val" ]]; then
    NON_TARGET_MISMATCHES="${NON_TARGET_MISMATCHES} MISMATCH:${field}(v1=${v1_val},v2=${v2_val})"
    echo "MISMATCH: ${field} | v1='${v1_val}' | v2='${v2_val}'"
  fi
done

if [[ -z "$NON_TARGET_MISMATCHES" ]]; then
  UNCHANGED_NON_TARGET_FIELDS="ALL_MATCH"
  echo "UNCHANGED_NON_TARGET_FIELDS=ALL_MATCH"
else
  UNCHANGED_NON_TARGET_FIELDS="MISMATCH_DETECTED:${NON_TARGET_MISMATCHES}"
  echo "UNCHANGED_NON_TARGET_FIELDS=MISMATCH_DETECTED"
  echo "MISMATCH_DETAILS=${NON_TARGET_MISMATCHES}"
fi

# -----------------------------------------------------------
# SECTION 6 — READ v1 AGAIN (verify preserved and superseded)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 6 — ORIGINAL SNAPSHOT PRESERVATION CHECK"
echo "============================================================"

do_get "${BASE_URL}/api/owner/finance/snapshots/${ORIGINAL_SNAPSHOT_ID}"
if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
  echo "ORIGINAL_SNAPSHOT_READ=FAIL (HTTP ${LAST_HTTP_STATUS})"
  ORIGINAL_SNAPSHOT_PRESERVED="READ_FAIL"
else
  V1_FINAL_BODY="$LAST_BODY"
  V1_FINAL_SUPERSEDED="$(echo "$V1_FINAL_BODY" | jq -r '.supersededById // "null"')"
  V1_FINAL_VERSION="$(echo "$V1_FINAL_BODY" | jq -r '.version // "null"')"
  echo "V1_FINAL_SUPERSEDED_BY=${V1_FINAL_SUPERSEDED}"
  echo "V1_FINAL_VERSION=${V1_FINAL_VERSION}"
  if [[ "$V1_FINAL_SUPERSEDED" == "$NEW_SNAPSHOT_ID" ]]; then
    ORIGINAL_SNAPSHOT_PRESERVED="YES_SUPERSEDED_BY_V2"
    echo "ORIGINAL_SNAPSHOT_PRESERVED=${ORIGINAL_SNAPSHOT_PRESERVED}"
  else
    ORIGINAL_SNAPSHOT_PRESERVED="UNEXPECTED (supersededById=${V1_FINAL_SUPERSEDED})"
    echo "ORIGINAL_SNAPSHOT_PRESERVED=${ORIGINAL_SNAPSHOT_PRESERVED}"
  fi
fi

# Verify v2 is current (not further superseded)
do_get "${BASE_URL}/api/owner/finance/snapshots/${NEW_SNAPSHOT_ID}"
if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
  V2_FINAL_SUPERSEDED="$(echo "$LAST_BODY" | jq -r '.supersededById // "null"')"
  if [[ "$V2_FINAL_SUPERSEDED" == "null" ]]; then
    VERSION_2_CURRENT="YES"
    echo "VERSION_2_CURRENT=YES (not further superseded)"
  else
    VERSION_2_CURRENT="NO (v2 has supersededById=${V2_FINAL_SUPERSEDED})"
    echo "VERSION_2_CURRENT=${VERSION_2_CURRENT}"
  fi
fi

# -----------------------------------------------------------
# SECTION 7 — WRITE 4: in_progress → completed
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 7 — WRITE 4: in_progress → completed"
echo "============================================================"

COMPLETION_NOTES="Owner confirmed July 2026 receivables = INR 0 and payables = INR 0 as part of Cycle #3 data-quality action. Amended snapshot ${NEW_SNAPSHOT_ID} is the verified record."
COMPLETE_BODY="{\"status\":\"completed\",\"completionNotes\":\"${COMPLETION_NOTES}\",\"completionEvidence\":[\"${NEW_SNAPSHOT_ID}\"]}"
do_patch "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}" "$COMPLETE_BODY"

COMPLETE_HTTP="${LAST_HTTP_STATUS}"
echo "PATCH_STATUS=${COMPLETE_HTTP}"

if [[ "$COMPLETE_HTTP" != "200" ]]; then
  do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    ACTION_POST_COMPLETED_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
    if [[ "$ACTION_POST_COMPLETED_STATUS" == "completed" ]]; then
      COMPLETE_RESULT="WRITE_CONFIRMED (PATCH=${COMPLETE_HTTP} but read confirms status=completed)"
      WRITE_COUNT=4
    else
      COMPLETE_RESULT="WRITE_AMBIGUOUS (PATCH=${COMPLETE_HTTP}, current status=${ACTION_POST_COMPLETED_STATUS})"
      abort_with_report "COMPLETE: ${COMPLETE_RESULT}"
    fi
  else
    COMPLETE_RESULT="WRITE_AMBIGUOUS (PATCH=${COMPLETE_HTTP}, read-after-write GET=${LAST_HTTP_STATUS})"
    abort_with_report "COMPLETE: ${COMPLETE_RESULT}"
  fi
fi

if [[ "$COMPLETE_HTTP" == "200" ]]; then
  # Read-after-write
  do_get "${BASE_URL}/api/owner/finance/actions/${ACTION_ID}"
  if [[ "$LAST_HTTP_STATUS" != "200" ]]; then
    COMPLETE_RESULT="WRITE_AMBIGUOUS (PATCH=200 but read-after-write GET=${LAST_HTTP_STATUS})"
    abort_with_report "COMPLETE: ${COMPLETE_RESULT}"
  fi
  ACTION_POST_COMPLETED_STATUS="$(echo "$LAST_BODY" | jq -r '.status // empty')"
  if [[ "$ACTION_POST_COMPLETED_STATUS" == "completed" ]]; then
    COMPLETE_RESULT="WRITE_CONFIRMED"
    WRITE_COUNT=4
    echo "ACTION_STATUS_POST_COMPLETE=${ACTION_POST_COMPLETED_STATUS}"
    echo "COMPLETE_RESULT=${COMPLETE_RESULT}"
  else
    COMPLETE_RESULT="WRITE_AMBIGUOUS (unexpected status=${ACTION_POST_COMPLETED_STATUS})"
    abort_with_report "COMPLETE: ${COMPLETE_RESULT}"
  fi
fi

echo "WRITE_COUNT_AFTER_ALL_MUTATIONS=${WRITE_COUNT}"

# -----------------------------------------------------------
# SECTION 8 — CYCLE #4 POLL (dashboard GET only, max 6 × 10s)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 8 — CYCLE #4 POLL (dashboard, read-only)"
echo "============================================================"
echo "Polling for auto-reassessment Cycle #4 (max 6 attempts, 10s apart)..."
echo "NOTE: Re-diagnosis is synchronous in PATCH handler — if action PATCH returned 200,"
echo "      Cycle #4 may already exist. Polling to confirm."

POLL_ATTEMPT=0
CYCLE4_ID=""
while [[ $POLL_ATTEMPT -lt 6 ]]; do
  POLL_ATTEMPT=$((POLL_ATTEMPT + 1))
  echo "POLL_ATTEMPT=${POLL_ATTEMPT}/6 at $(date -u +"%H:%M:%SZ")"

  do_get "${BASE_URL}/api/owner/finance/dashboard?businessId=${BUSINESS_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    POLL_LATEST_SEQ="$(echo "$LAST_BODY" | jq -r '.cycleHistory[0].sequenceNumber // "null"')"
    POLL_LATEST_ID="$(echo "$LAST_BODY" | jq -r '.cycleHistory[0].id // "null"')"
    echo "DASHBOARD_LATEST_SEQ=${POLL_LATEST_SEQ}"
    echo "DASHBOARD_LATEST_ID=${POLL_LATEST_ID}"

    if [[ "$POLL_LATEST_SEQ" == "4" ]]; then
      CYCLE4_ID="$POLL_LATEST_ID"
      CYCLE4_OBSERVED="YES"
      AUTO_REASSESSMENT="AUTO_REASSESSMENT_OBSERVED"
      echo "CYCLE4_OBSERVED=YES"
      echo "CYCLE4_ID=${CYCLE4_ID}"
      break
    fi
  else
    echo "DASHBOARD_POLL_HTTP=${LAST_HTTP_STATUS} (non-fatal, continuing)"
  fi

  if [[ $POLL_ATTEMPT -lt 6 ]]; then
    sleep 10
  fi
done

if [[ "$CYCLE4_OBSERVED" == "NO" ]]; then
  AUTO_REASSESSMENT="AUTO_REASSESSMENT_NOT_OBSERVED"
  echo "AUTO_REASSESSMENT=AUTO_REASSESSMENT_NOT_OBSERVED"
  echo "NOTE: Cycle #4 not visible after 6 polls. Re-diagnosis may have failed silently (advisory only)."
  echo "NOTE: DO NOT POST a diagnosis manually. This is expected behavior per spec."
fi

# -----------------------------------------------------------
# SECTION 9 — CYCLE #4 DETAIL (if observed)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 9 — CYCLE #4 DETAIL"
echo "============================================================"

if [[ -n "$CYCLE4_ID" ]]; then
  do_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE4_ID}"
  if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
    C4_BODY="$LAST_BODY"
    CYCLE4_SEQ="$(echo "$C4_BODY" | jq -r '.sequenceNumber // "null"')"
    CYCLE4_STATUS="$(echo "$C4_BODY" | jq -r '.status // "null"')"
    CYCLE4_SNAPSHOT_ID="$(echo "$C4_BODY" | jq -r '.snapshotId // "null"')"
    CYCLE4_CONFIDENCE="$(echo "$C4_BODY" | jq -r '.dataConfidenceScore // "null"')"
    CYCLE4_SURVIVAL="$(echo "$C4_BODY" | jq -r '.survivalState // "null"')"
    CYCLE4_HEALTH="$(echo "$C4_BODY" | jq -r '.overallHealthScore // "null"')"
    CYCLE4_RISK="$(echo "$C4_BODY" | jq -r '.survivalRiskScore // "null"')"
    CYCLE4_OPP="$(echo "$C4_BODY" | jq -r '.growthOpportunityScore // "null"')"
    echo "CYCLE4_SEQ=${CYCLE4_SEQ}"
    echo "CYCLE4_STATUS=${CYCLE4_STATUS}"
    echo "CYCLE4_SNAPSHOT_ID=${CYCLE4_SNAPSHOT_ID}"
    echo "CYCLE4_CONFIDENCE=${CYCLE4_CONFIDENCE}"
    echo "CYCLE4_SURVIVAL=${CYCLE4_SURVIVAL}"
    echo "CYCLE4_HEALTH=${CYCLE4_HEALTH}"
    echo "CYCLE4_RISK=${CYCLE4_RISK}"
    echo "CYCLE4_OPP=${CYCLE4_OPP}"

    # Verify Cycle #4 points to v2 snapshot
    if [[ "$CYCLE4_SNAPSHOT_ID" == "$NEW_SNAPSHOT_ID" ]]; then
      echo "CYCLE4_SNAPSHOT_POINTS_TO=V2 (CORRECT)"
    elif [[ "$CYCLE4_SNAPSHOT_ID" == "$ORIGINAL_SNAPSHOT_ID" ]]; then
      echo "CYCLE4_SNAPSHOT_POINTS_TO=V1 (UNEXPECTED — resolveCurrentSnapshotId should have returned v2)"
    else
      echo "CYCLE4_SNAPSHOT_POINTS_TO=UNKNOWN_${CYCLE4_SNAPSHOT_ID}"
    fi
  else
    echo "CYCLE4_GET_STATUS=${LAST_HTTP_STATUS}"
    CYCLE4_CONFIDENCE="null"
    CYCLE4_SURVIVAL="null"
  fi
else
  echo "CYCLE4_ID=NOT_OBSERVED"
fi

# -----------------------------------------------------------
# SECTION 10 — HISTORICAL AUDIT (Cycles #1-3 → v1, #4 → v2)
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 10 — HISTORICAL AUDIT: CYCLE → SNAPSHOT LINKAGE"
echo "============================================================"

do_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE1_ID}"
if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
  C1_SNAPSHOT_ID="$(echo "$LAST_BODY" | jq -r '.snapshotId // "null"')"
  C1_SEQ="$(echo "$LAST_BODY" | jq -r '.sequenceNumber // "null"')"
  echo "CYCLE1_SEQ=${C1_SEQ} SNAPSHOT=${C1_SNAPSHOT_ID} POINTS_TO_V1=$([ "$C1_SNAPSHOT_ID" = "$ORIGINAL_SNAPSHOT_ID" ] && echo YES || echo NO)"
else
  echo "CYCLE1_GET_STATUS=${LAST_HTTP_STATUS}"
  C1_SNAPSHOT_ID="READ_FAIL"
fi

do_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE2_ID}"
if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
  C2_SNAPSHOT_ID="$(echo "$LAST_BODY" | jq -r '.snapshotId // "null"')"
  C2_SEQ="$(echo "$LAST_BODY" | jq -r '.sequenceNumber // "null"')"
  echo "CYCLE2_SEQ=${C2_SEQ} SNAPSHOT=${C2_SNAPSHOT_ID} POINTS_TO_V1=$([ "$C2_SNAPSHOT_ID" = "$ORIGINAL_SNAPSHOT_ID" ] && echo YES || echo NO)"
else
  echo "CYCLE2_GET_STATUS=${LAST_HTTP_STATUS}"
  C2_SNAPSHOT_ID="READ_FAIL"
fi

do_get "${BASE_URL}/api/owner/finance/diagnoses/${CYCLE3_ID}"
if [[ "$LAST_HTTP_STATUS" == "200" ]]; then
  C3_SNAPSHOT_ID_RECHECK="$(echo "$LAST_BODY" | jq -r '.snapshotId // "null"')"
  echo "CYCLE3_SEQ=${C3_SEQ} SNAPSHOT=${C3_SNAPSHOT_ID_RECHECK} POINTS_TO_V1=$([ "$C3_SNAPSHOT_ID_RECHECK" = "$ORIGINAL_SNAPSHOT_ID" ] && echo YES || echo NO)"
else
  echo "CYCLE3_GET_RECHECK_STATUS=${LAST_HTTP_STATUS}"
fi

if [[ -n "$CYCLE4_ID" ]] && [[ -n "$CYCLE4_SNAPSHOT_ID" ]]; then
  echo "CYCLE4_SEQ=${CYCLE4_SEQ} SNAPSHOT=${CYCLE4_SNAPSHOT_ID} POINTS_TO_V2=$([ "$CYCLE4_SNAPSHOT_ID" = "$NEW_SNAPSHOT_ID" ] && echo YES || echo NO)"
else
  echo "CYCLE4=NOT_OBSERVED"
fi

# -----------------------------------------------------------
# SECTION 11 — CYCLE #3 vs #4 COMPARISON
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 11 — CYCLE #3 vs #4 COMPARISON (ACTUAL VALUES)"
echo "============================================================"

echo "CYCLE3_CONFIDENCE=${C3_CONFIDENCE}"
echo "CYCLE4_CONFIDENCE=${CYCLE4_CONFIDENCE}"

if [[ "$CYCLE4_CONFIDENCE" != "null" ]] && [[ "$C3_CONFIDENCE" != "null" ]]; then
  CONF_DELTA="$(echo "$CYCLE4_CONFIDENCE $C3_CONFIDENCE" | awk '{printf "%.0f", $1 - $2}')"
  echo "CONFIDENCE_DELTA=${CONF_DELTA} (Cycle#4 minus Cycle#3)"
else
  CONF_DELTA="null (Cycle #4 not observed or confidence unavailable)"
  echo "CONFIDENCE_DELTA=${CONF_DELTA}"
fi

echo "CYCLE3_SURVIVAL=${C3_SURVIVAL}"
echo "CYCLE4_SURVIVAL=${CYCLE4_SURVIVAL}"
echo "CYCLE3_HEALTH=${C3_HEALTH}"
echo "CYCLE4_HEALTH=${CYCLE4_HEALTH}"
echo "CYCLE3_RISK=${C3_RISK}"
echo "CYCLE4_RISK=${CYCLE4_RISK}"
echo "CYCLE3_OPPORTUNITY=${C3_OPP}"
echo "CYCLE4_OPPORTUNITY=${CYCLE4_OPP}"

# -----------------------------------------------------------
# SECTION 12 — SIGNAL COMPUTABILITY REPORT
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 12 — SIGNAL COMPUTABILITY REPORT"
echo "============================================================"

# Check key signals for computability gaps
echo "RECEIVABLES_AMENDED_TO_ZERO: The amendment sets receivables=0 and payables=0."
echo "PREVIOUS_RECEIVABLES (v1): ${V1_RECEIVABLES}"
echo "PREVIOUS_PAYABLES (v1): ${V1_PAYABLES}"
echo "RECEIVABLES_OVERDUE (v1): ${V1_OVERDUE_RECEIVABLES}"
echo "PAYABLES_OVERDUE (v1): ${V1_OVERDUE_PAYABLES}"
echo ""
echo "IMPACT_ON_SIGNALS:"
echo "  - Cash conversion cycle: receivables=0 may affect DSO computation"
echo "  - Working capital: receivables=0 and payables=0 reduces both sides"
echo "  - Liquidity signals: payables=0 reduces immediate obligation load"
echo "  - Confidence uplift: provenance=OWNER_CONFIRMED eliminates missing-data penalty"
echo "  - survivalState may improve if receivables/payables reduction changes risk model"
echo "NOTE: Confidence uplift expected because provenance transitions from missing/estimated to OWNER_CONFIRMED."
echo "NOTE: Whether survivalState improves from WATCH depends on Cycle #4 model output."

# -----------------------------------------------------------
# SECTION 13 — VERIFICATION PAYLOAD (PRINT ONLY — DO NOT POST)
#
# Metric: dataConfidenceScore (the action's measurable outcome is the
# confidence improvement that results from owner-confirming July data).
#
# Schema: financeVerifySchema
#   beforeValue: number | null
#   afterValue:  number | null
#   targetDirection: "up" | "down"
#   targetValue: number | null (optional)
#   evidence: string[] (optional)
#   disputed: boolean (optional)
#
# targetDirection="up" because higher dataConfidenceScore is the improvement
# direction (owner confirmation eliminates the missing-data penalty).
# beforeValue=65 (Cycle #3 dataConfidenceScore — the pre-action baseline).
# afterValue=CYCLE4_CONFIDENCE (runtime value from Cycle #4 GET; NOT hard-coded).
# If Cycle #4 was not observed, afterValue will be null.
#
# evidence=[newSnapshotId]: semantically valid — the action service requires
# a non-empty string[]; no canonical format is enforced. The snapshot UUID
# is the direct reference to the evidence record.
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 13 — PROPOSED VERIFICATION PAYLOAD (PRINT ONLY)"
echo "DO NOT POST THIS. AWAIT OWNER AUTHORIZATION."
echo "============================================================"

# afterValue is the actual Cycle #4 dataConfidenceScore (runtime, not hard-coded).
# If Cycle #4 was not observed, this will be the string "null" and must be
# treated as unknown — do not submit the payload until Cycle #4 is confirmed.
VERIFY_AFTER_VALUE="null"
if [[ "$CYCLE4_CONFIDENCE" != "null" ]] && [[ -n "$CYCLE4_CONFIDENCE" ]]; then
  VERIFY_AFTER_VALUE="${CYCLE4_CONFIDENCE}"
fi

echo "Metric: dataConfidenceScore"
echo "beforeValue (Cycle #3 confidence): 65"
echo "afterValue  (Cycle #4 confidence): ${VERIFY_AFTER_VALUE}"
echo "targetDirection: up (higher confidence = improvement)"
echo ""

cat <<EOF
POST /api/owner/finance/actions/${ACTION_ID}/verify
Content-Type: application/json

{
  "beforeValue": 65,
  "afterValue": ${VERIFY_AFTER_VALUE},
  "targetDirection": "up",
  "targetValue": null,
  "evidence": ["${NEW_SNAPSHOT_ID}"],
  "disputed": false
}

NOTE: beforeValue=65 is Cycle #3 dataConfidenceScore (pre-action baseline, confirmed at gate).
      afterValue=${VERIFY_AFTER_VALUE} is Cycle #4 dataConfidenceScore (runtime, not hard-coded).
      targetDirection="up" because owner confirmation raises the confidence score.
      evidence=["${NEW_SNAPSHOT_ID}"] references the amended snapshot (semantically valid;
        action.service.ts requires non-empty string[] only — no format constraint).
      DO NOT POST. Awaiting owner authorization.
EOF

if [[ "$VERIFY_AFTER_VALUE" == "null" ]]; then
  echo ""
  echo "WARNING: afterValue=null because Cycle #4 was not observed."
  echo "         Do not submit this payload until Cycle #4 is confirmed and its"
  echo "         dataConfidenceScore is known."
fi

# -----------------------------------------------------------
# SECTION 14 — CYCLE HISTORY CHAIN CHECK
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "SECTION 14 — REPORTING PERIOD INTEGRITY"
echo "============================================================"

V2_PERIOD_START="$(echo "$SNAP_V2_BODY" | jq -r '.periodStart // "null"')"
V2_PERIOD_END="$(echo "$SNAP_V2_BODY" | jq -r '.periodEnd // "null"')"
echo "V1_PERIOD: ${V1_PERIOD_START} → ${V1_PERIOD_END}"
echo "V2_PERIOD: ${V2_PERIOD_START} → ${V2_PERIOD_END}"

if [[ "$V1_PERIOD_START" == "$V2_PERIOD_START" ]] && [[ "$V1_PERIOD_END" == "$V2_PERIOD_END" ]]; then
  REPORTING_PERIOD_INTEGRITY="PRESERVED"
  echo "REPORTING_PERIOD_INTEGRITY=PRESERVED (periods match between v1 and v2)"
else
  REPORTING_PERIOD_INTEGRITY="MISMATCH (v1: ${V1_PERIOD_START}/${V1_PERIOD_END}, v2: ${V2_PERIOD_START}/${V2_PERIOD_END})"
  echo "REPORTING_PERIOD_INTEGRITY=MISMATCH"
fi

CYCLE_HISTORY_SUMMARY="C1→v1, C2→v1, C3→v1, C4→v2"
if [[ "$CYCLE4_OBSERVED" == "NO" ]]; then
  CYCLE_HISTORY_SUMMARY="C1→v1, C2→v1, C3→v1, C4=NOT_OBSERVED"
fi

# -----------------------------------------------------------
# SECTION 15 — FINAL REPORT
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "TRINITY_JULY_AMENDMENT_AND_CYCLE4_RESULT"
echo "============================================================"

echo "OWNER_AUTH=YES (highestRole=${HIGHEST_ROLE}, workspaceIds=${RESOLVED_WORKSPACE_IDS}, targetWorkspaceAuthorized=${TARGET_WORKSPACE_AUTHORIZED})"
echo "PRECONDITIONS=ALL_PASSED"
echo "ACTION_ASSIGNED=${ASSIGN_RESULT}"
echo "ACTION_IN_PROGRESS=${IN_PROGRESS_RESULT}"
echo "OLD_SNAPSHOT_ID=${ORIGINAL_SNAPSHOT_ID}"
echo "OLD_VERSION=${V1_VERSION}"
echo "NEW_SNAPSHOT_ID=${NEW_SNAPSHOT_ID}"
echo "NEW_VERSION=${NEW_SNAP_VERSION:-2}"
echo "RECEIVABLES=0"
echo "RECEIVABLES_PROVENANCE=OWNER_CONFIRMED"
echo "PAYABLES=0"
echo "PAYABLES_PROVENANCE=OWNER_CONFIRMED"
echo "UNCHANGED_NON_TARGET_FIELDS=${UNCHANGED_NON_TARGET_FIELDS}"
echo "ACTION_COMPLETED=${COMPLETE_RESULT}"
echo "CYCLE_4_ID=${CYCLE4_ID:-NOT_OBSERVED}"
echo "CYCLE_4_SEQUENCE=${CYCLE4_SEQ:-NOT_OBSERVED}"
echo "CYCLE_4_SNAPSHOT_ID=${CYCLE4_SNAPSHOT_ID:-NOT_OBSERVED}"
echo "CYCLE_3_CONFIDENCE=65"
echo "CYCLE_4_CONFIDENCE=${CYCLE4_CONFIDENCE}"
echo "CONFIDENCE_DELTA=${CONF_DELTA}"
echo "CYCLE_3_SURVIVAL=WATCH"
echo "CYCLE_4_SURVIVAL=${CYCLE4_SURVIVAL}"
echo "ORIGINAL_SNAPSHOT_PRESERVED=${ORIGINAL_SNAPSHOT_PRESERVED}"
echo "VERSION_2_CURRENT=${VERSION_2_CURRENT}"
echo "CYCLE_HISTORY=${CYCLE_HISTORY_SUMMARY}"
echo "REPORTING_PERIOD_INTEGRITY=${REPORTING_PERIOD_INTEGRITY}"
echo "AUTO_REASSESSMENT=${AUTO_REASSESSMENT}"
echo "PROPOSED_VERIFICATION_PAYLOAD=PRINTED_ABOVE_DO_NOT_POST"
echo "PRODUCTION_WRITES_PERFORMED=${WRITE_COUNT}"
echo ""

# Compute verdict
if [[ "$WRITE_COUNT" -eq 4 ]] && \
   [[ "$ASSIGN_RESULT" == "WRITE_CONFIRMED" ]] && \
   [[ "$IN_PROGRESS_RESULT" == "WRITE_CONFIRMED" ]] && \
   [[ "$AMEND_RESULT" == "WRITE_CONFIRMED" ]] && \
   [[ "$COMPLETE_RESULT" == "WRITE_CONFIRMED" ]] && \
   [[ "$UNCHANGED_NON_TARGET_FIELDS" == "ALL_MATCH" ]] && \
   [[ "$ORIGINAL_SNAPSHOT_PRESERVED" == "YES_SUPERSEDED_BY_V2" ]] && \
   [[ "$VERSION_2_CURRENT" == "YES" ]] && \
   [[ "$REPORTING_PERIOD_INTEGRITY" == "PRESERVED" ]]; then
  VERDICT="TRINITY_JULY_AMENDMENT_AND_CYCLE4_VALIDATED"
else
  VERDICT="TRINITY_JULY_AMENDMENT_REMEDIATION_REQUIRED"
  echo "REMEDIATION_NOTES:"
  [[ "$WRITE_COUNT" -ne 4 ]] && echo "  - WRITE_COUNT=${WRITE_COUNT} (expected 4)"
  [[ "$ASSIGN_RESULT" != "WRITE_CONFIRMED" ]] && echo "  - ASSIGN_RESULT=${ASSIGN_RESULT}"
  [[ "$IN_PROGRESS_RESULT" != "WRITE_CONFIRMED" ]] && echo "  - IN_PROGRESS_RESULT=${IN_PROGRESS_RESULT}"
  [[ "$AMEND_RESULT" != "WRITE_CONFIRMED" ]] && echo "  - AMEND_RESULT=${AMEND_RESULT}"
  [[ "$COMPLETE_RESULT" != "WRITE_CONFIRMED" ]] && echo "  - COMPLETE_RESULT=${COMPLETE_RESULT}"
  [[ "$UNCHANGED_NON_TARGET_FIELDS" != "ALL_MATCH" ]] && echo "  - NON_TARGET_FIELDS=${UNCHANGED_NON_TARGET_FIELDS}"
  [[ "$ORIGINAL_SNAPSHOT_PRESERVED" != "YES_SUPERSEDED_BY_V2" ]] && echo "  - ORIGINAL_SNAPSHOT_PRESERVED=${ORIGINAL_SNAPSHOT_PRESERVED}"
  [[ "$VERSION_2_CURRENT" != "YES" ]] && echo "  - VERSION_2_CURRENT=${VERSION_2_CURRENT}"
  [[ "$REPORTING_PERIOD_INTEGRITY" != "PRESERVED" ]] && echo "  - REPORTING_PERIOD_INTEGRITY=${REPORTING_PERIOD_INTEGRITY}"
fi

echo "VERDICT=${VERDICT}"
echo ""
echo "============================================================"
echo "END OF TRINITY MUTATION SEQUENCE"
echo "SCRIPT_EXECUTED=YES"
echo "============================================================"
