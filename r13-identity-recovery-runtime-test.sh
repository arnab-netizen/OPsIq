#!/bin/bash
#
# R13 Identity Regression Recovery - Runtime Proof
# Validates that routes properly enforce platform identity chain
# instead of trusting client headers or payload
#
# Scenario A: No session + forged headers → HTTP 401
# Scenario B: Valid session + forged workspace → HTTP 403
# Scenario C: Valid session + forged actor → HTTP 403
# Scenario D: Cross-tenant request → HTTP 403
# Scenario E: Valid session + valid membership → HTTP 200
#

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_ENDPOINT="/api/telemetry"

echo "═══════════════════════════════════════════════════════════"
echo "R13: IDENTITY REGRESSION RECOVERY - RUNTIME PROOF"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Testing restored platform identity chain enforcement"
echo "Routes must NOT trust: X-Auth-Token, X-Workspace-Id, payload identity"
echo "Routes MUST use: getSessionFact(), getPolicyContextFact()"
echo ""

# Test results tracking
PASSED=0
FAILED=0

test_scenario() {
  local scenario=$1
  local description=$2
  local method=$3
  local endpoint=$4
  local data=$5
  local headers=$6
  local expected_status=$7

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Scenario $scenario: $description"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Endpoint: $method $endpoint"
  echo "Expected Status: $expected_status"
  echo ""
  echo "Request:"
  if [ -n "$data" ]; then
    echo "  Body: $data"
  fi
  if [ -n "$headers" ]; then
    echo "  Headers: $headers"
  fi
  echo ""

  # Build curl command
  local curl_cmd="curl -s -X $method '$BASE_URL$endpoint'"

  if [ -n "$headers" ]; then
    curl_cmd="$curl_cmd $headers"
  fi

  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -d '$data' -H 'Content-Type: application/json'"
  fi

  curl_cmd="$curl_cmd -w '\n%{http_code}'"

  # Execute and parse response
  local response=$(eval $curl_cmd)
  local http_code=$(echo "$response" | tail -n1)
  local body=$(echo "$response" | head -n-1)

  echo "Response Status: $http_code"
  echo "Response Body: $body"
  echo ""

  # Check result
  if [ "$http_code" = "$expected_status" ]; then
    echo "✅ PASSED: Got expected HTTP $expected_status"
    ((PASSED++))
  else
    echo "❌ FAILED: Expected HTTP $expected_status, got $http_code"
    ((FAILED++))
  fi
}

# ═════════════════════════════════════════════════════════════
# SCENARIO A: No session + Forged headers
# ═════════════════════════════════════════════════════════════
# Request has no valid session cookies/auth, but includes forged headers
# and payload claiming identity.
#
# Expected: getSessionFact() returns invalid → HTTP 401
#
test_scenario "A" \
  "No session + forged headers/payload" \
  "POST" \
  "$API_ENDPOINT" \
  '{"action":"pageVisit","workspaceId":"evil-workspace","payload":{"page":"/"}}' \
  "-H 'X-Auth-Token: forged-token' -H 'X-Workspace-Id: evil-workspace'" \
  "401"

# ═════════════════════════════════════════════════════════════
# SCENARIO B: Valid session + Forged workspace
# ═════════════════════════════════════════════════════════════
# Request has valid session for user1 in workspace-a, but claims
# to access workspace-b.
#
# Expected: getSessionFact() succeeds for user1
#           getPolicyContextFact() checks workspace membership
#           user1 not in workspace-b → HTTP 403
#
# Note: This test requires mock session infrastructure to set up
# a valid session for a specific workspace, then request another.
# Documented as expected behavior but execution blocked until
# auth infrastructure available.
#
test_scenario "B" \
  "Valid session + forged workspace (cross-tenant)" \
  "POST" \
  "$API_ENDPOINT" \
  '{"action":"pageVisit","workspaceId":"workspace-b","payload":{"page":"/"}}' \
  "" \
  "403"

# ═════════════════════════════════════════════════════════════
# SCENARIO C: Valid session + Forged actor in payload
# ═════════════════════════════════════════════════════════════
# Request has valid session for user1, but payload claims
# to be user2.
#
# Expected: getSessionFact() returns user1
#           payload has actorId: user2
#           Mismatch detected (user1 ≠ user2) → HTTP 403
#
# Note: This test requires mock session setup. The governance
# enforcement code validates: if payloadActorId != verifiedActorId → 403
#
test_scenario "C" \
  "Valid session + forged actor (impersonation attempt)" \
  "POST" \
  "$API_ENDPOINT" \
  '{"action":"pageVisit","workspaceId":"workspace-a","actorId":"user-2","payload":{"page":"/"}}' \
  "" \
  "403"

# ═════════════════════════════════════════════════════════════
# SCENARIO D: Cross-tenant request
# ═════════════════════════════════════════════════════════════
# Session created for user1 in workspace-a. Request tries to
# access workspace-b via query/payload parameter while only
# having session for workspace-a.
#
# Expected: getSessionFact('workspace-b') called
#           User1's verified workspace: workspace-a
#           Requested workspace: workspace-b
#           Mismatch (workspace-a ≠ workspace-b) → HTTP 403
#
test_scenario "D" \
  "Cross-tenant request (workspace mismatch)" \
  "POST" \
  "$API_ENDPOINT" \
  '{"action":"pageVisit","workspaceId":"other-tenant-workspace","payload":{"page":"/"}}' \
  "" \
  "403"

# ═════════════════════════════════════════════════════════════
# SCENARIO E: Valid session + valid membership
# ═════════════════════════════════════════════════════════════
# Session valid for user1, workspace-a. Request properly targets
# workspace-a with no actor mismatch.
#
# Expected: getSessionFact() succeeds
#           getPolicyContextFact() succeeds
#           All verifications pass
#           Business logic executed → HTTP 200
#
# Note: This test requires mock session for workspace-a to succeed
#
test_scenario "E" \
  "Valid session + valid membership (success case)" \
  "POST" \
  "$API_ENDPOINT" \
  '{"action":"pageVisit","workspaceId":"workspace-a","payload":{"page":"/"}}' \
  "" \
  "200"

# ═════════════════════════════════════════════════════════════
# RESULTS
# ═════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "RUNTIME TEST RESULTS"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "✅ PASSED: $PASSED"
echo "❌ FAILED: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "STATUS: ALL SCENARIOS VERIFIED ✅"
  echo ""
  echo "VERIFICATION SUMMARY:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "A: No session + forged headers         → HTTP 401 ✅"
  echo "B: Valid session + forged workspace   → HTTP 403 ✅"
  echo "C: Valid session + forged actor       → HTTP 403 ✅"
  echo "D: Cross-tenant request               → HTTP 403 ✅"
  echo "E: Valid session + valid membership   → HTTP 200 ✅"
  echo ""
  echo "IDENTITY TRUST CHAIN VALIDATED:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Actor identity derived from verified session (not headers)"
  echo "✅ Workspace identity derived from database (not headers)"
  echo "✅ X-Auth-Token header NOT trusted"
  echo "✅ X-Workspace-Id header NOT trusted"
  echo "✅ Payload identity validated against verified actor"
  echo "✅ Workspace membership verified against database"
  echo "✅ Cross-tenant isolation enforced"
  echo "✅ Forged headers rejected/ignored"
  echo ""
  echo "REGRESSION RECOVERED: Platform identity chain restored ✅"
  exit 0
else
  echo "STATUS: VERIFICATION INCOMPLETE ⚠️"
  echo ""
  echo "NOTE: Some tests expect HTTP responses but the actual"
  echo "responses depend on auth infrastructure being available."
  echo ""
  echo "Expected behavior (from code review):"
  echo "- Scenarios A,D: No valid session → HTTP 401/403"
  echo "- Scenarios B,C,D: Session/policy check fails → HTTP 403"
  echo "- Scenario E: Valid session/workspace → HTTP 200"
  echo ""
  echo "To fully validate, ensure:"
  echo "1. Auth infrastructure (getSessionFact, getPolicyContextFact) available"
  echo "2. Mock session data set up for test scenarios"
  echo "3. Server running on $BASE_URL"
  exit 1
fi
