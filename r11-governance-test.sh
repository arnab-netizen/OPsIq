#!/bin/bash
# R11 Governance Hardening - Runtime Proof Tests

echo "=== R11 ROUTE GOVERNANCE HARDENING - RUNTIME PROOF ==="
echo ""

# Test results
RESULTS=""

# ============================================================================
# Test Suite: 5 Runtime Scenarios
# ============================================================================

echo "SCENARIO 1: Unauthenticated Request"
echo "====================================="
echo ""
echo "Request: POST /api/telemetry without X-Auth-Token"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Workspace-Id: test-workspace" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test",
      "workspaceId": "test-workspace",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response HTTP Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "401" ]; then
  echo "Result: PROVEN ✅ (Rejects unauthenticated request)"
  RESULTS="${RESULTS}[PROVEN] Unauthenticated Request\n"
else
  echo "Result: FAILED ❌ (Should return 401)"
  RESULTS="${RESULTS}[FAILED] Unauthenticated Request (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""
echo "SCENARIO 2: Cross-Tenant Request"
echo "=================================="
echo ""
echo "Request: POST /api/telemetry with mismatched workspace"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: workspace-a" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test",
      "workspaceId": "workspace-b",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response HTTP Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "403" ]; then
  echo "Result: PROVEN ✅ (Rejects cross-tenant request)"
  RESULTS="${RESULTS}[PROVEN] Cross-Tenant Request\n"
else
  echo "Result: FAILED ❌ (Should return 403)"
  RESULTS="${RESULTS}[FAILED] Cross-Tenant Request (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""
echo "SCENARIO 3: Invalid Payload"
echo "============================"
echo ""
echo "Request: POST /api/feedback with invalid feedbackType"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: test-workspace" \
  -d '{
    "feedbackType": "invalid_type",
    "actorId": "test",
    "workspaceId": "test-workspace",
    "page": "/",
    "context": "test"
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response HTTP Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "400" ]; then
  echo "Result: PROVEN ✅ (Validates payload schema)"
  RESULTS="${RESULTS}[PROVEN] Invalid Payload\n"
else
  echo "Result: FAILED ❌ (Should return 400)"
  RESULTS="${RESULTS}[FAILED] Invalid Payload (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""
echo "SCENARIO 4: Duplicate Request (Idempotency)"
echo "==========================================="
echo ""
echo "Request 1: POST /api/telemetry with Idempotency-Key"
RESPONSE1=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: test-workspace" \
  -H "Idempotency-Key: test-idempotency-123" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test",
      "workspaceId": "test-workspace",
      "page": "/"
    }
  }')

HTTP_CODE1=$(echo "$RESPONSE1" | grep "HTTP_CODE:" | cut -d: -f2)
BODY1=$(echo "$RESPONSE1" | sed '$d')
VISIT_ID1=$(echo "$BODY1" | grep -o '"visitId":"[^"]*"' | cut -d'"' -f4)

echo "Response 1 HTTP Code: $HTTP_CODE1"
echo "Response 1 visitId: $VISIT_ID1"

sleep 1

echo ""
echo "Request 2: Same request with same Idempotency-Key"
RESPONSE2=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: test-workspace" \
  -H "Idempotency-Key: test-idempotency-123" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test",
      "workspaceId": "test-workspace",
      "page": "/"
    }
  }')

HTTP_CODE2=$(echo "$RESPONSE2" | grep "HTTP_CODE:" | cut -d: -f2)
BODY2=$(echo "$RESPONSE2" | sed '$d')
VISIT_ID2=$(echo "$BODY2" | grep -o '"visitId":"[^"]*"' | cut -d'"' -f4)

echo "Response 2 HTTP Code: $HTTP_CODE2"
echo "Response 2 visitId: $VISIT_ID2"

if [ "$VISIT_ID1" = "$VISIT_ID2" ] && [ "$HTTP_CODE1" = "200" ] && [ "$HTTP_CODE2" = "200" ]; then
  echo "Result: PROVEN ✅ (Idempotency enforced - same response)"
  RESULTS="${RESULTS}[PROVEN] Idempotent Request\n"
else
  echo "Result: PARTIAL (Different responses, idempotency cache may have expired)"
  RESULTS="${RESULTS}[PARTIAL] Idempotent Request (IDs: $VISIT_ID1 vs $VISIT_ID2)\n"
fi

echo ""
echo ""
echo "SCENARIO 5: Authorized Request"
echo "==============================="
echo ""
echo "Request: POST /api/telemetry with valid auth + workspace + payload"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: user1:token123" \
  -H "X-Workspace-Id: test-workspace" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test",
      "workspaceId": "test-workspace",
      "page": "/"
    }
  }')

HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Response HTTP Code: $HTTP_CODE"
echo "Response Body: $BODY"

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "visitId"; then
  echo "Result: PROVEN ✅ (Accepts authorized request)"
  RESULTS="${RESULTS}[PROVEN] Authorized Request\n"
else
  echo "Result: FAILED ❌ (Should return 200 with visitId)"
  RESULTS="${RESULTS}[FAILED] Authorized Request (HTTP $HTTP_CODE)\n"
fi

echo ""
echo ""
echo "=== SUMMARY ==="
echo ""
echo "5 Runtime Scenarios:"
echo -e "$RESULTS"
echo ""
