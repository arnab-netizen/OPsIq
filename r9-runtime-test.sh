#!/bin/bash
# R9 Closed-Loop Runtime Proof - Test Script

set -e

echo "=== R9 CLOSED-LOOP RUNTIME PROOF TEST SUITE ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
RESULTS=""

# ============================================================================
# PHASE A: TELEMETRY PROOF
# ============================================================================
echo "PHASE A: TELEMETRY PROOF"
echo "========================"

echo ""
echo "Step 1: Page Visit Tracking"
echo "---"

# Make a page visit request
VISIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pageVisit",
    "payload": {
      "actorId": "test-operator-1",
      "workspaceId": "test-workspace",
      "page": "/my-day"
    }
  }')

echo "Request: POST /api/telemetry (pageVisit)"
echo "Response: $VISIT_RESPONSE"

# Extract visitId
VISIT_ID=$(echo "$VISIT_RESPONSE" | grep -o '"visitId":"[^"]*"' | cut -d'"' -f4)
echo "Extracted visitId: $VISIT_ID"

if [ -z "$VISIT_ID" ]; then
  echo -e "${RED}FAILED: No visitId returned${NC}"
  RESULTS="${RESULTS}[FAILED] Telemetry Page Visit\n"
else
  echo -e "${GREEN}PASSED: visitId received${NC}"
  RESULTS="${RESULTS}[PASSED] Telemetry Page Visit\n"
fi

echo ""
echo "Step 2: Action Tracking"
echo "---"

# Track action
ACTION_RESPONSE=$(curl -s -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "action": "trackAction",
    "payload": {
      "actorId": "test-operator-1",
      "workspaceId": "test-workspace",
      "actionType": "action_in_progress",
      "result": "success",
      "page": "/my-day"
    }
  }')

echo "Request: POST /api/telemetry (trackAction success)"
echo "Response: $ACTION_RESPONSE"

if echo "$ACTION_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Action tracked successfully${NC}"
  RESULTS="${RESULTS}[PASSED] Telemetry Action Tracking\n"
else
  echo -e "${RED}FAILED: Action tracking failed${NC}"
  RESULTS="${RESULTS}[FAILED] Telemetry Action Tracking\n"
fi

echo ""
echo "Step 3: Page Exit Tracking"
echo "---"

# Track page exit
EXIT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "action": "pageExit",
    "payload": {
      "actorId": "test-operator-1",
      "workspaceId": "test-workspace",
      "page": "/my-day",
      "visitId": "'$VISIT_ID'",
      "actionCount": 1,
      "errorCount": 0
    }
  }')

echo "Request: POST /api/telemetry (pageExit)"
echo "Response: $EXIT_RESPONSE"

if echo "$EXIT_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Page exit tracked${NC}"
  RESULTS="${RESULTS}[PASSED] Telemetry Page Exit\n"
else
  echo -e "${RED}FAILED: Page exit tracking failed${NC}"
  RESULTS="${RESULTS}[FAILED] Telemetry Page Exit\n"
fi

# ============================================================================
# PHASE B: FEEDBACK PROOF
# ============================================================================
echo ""
echo ""
echo "PHASE B: FEEDBACK PROOF"
echo "======================"

echo ""
echo "Step 1: Confusing Feedback"
echo "---"

FEEDBACK1=$(curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackType": "confusing",
    "actorId": "test-operator-1",
    "workspaceId": "test-workspace",
    "page": "/my-day",
    "context": "Queue interface unclear"
  }')

echo "Request: POST /api/feedback (confusing)"
echo "Response: $FEEDBACK1"

if echo "$FEEDBACK1" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Feedback captured${NC}"
  RESULTS="${RESULTS}[PASSED] Feedback Capture (confusing)\n"
else
  echo -e "${RED}FAILED: Feedback capture failed${NC}"
  RESULTS="${RESULTS}[FAILED] Feedback Capture (confusing)\n"
fi

echo ""
echo "Step 2: Not Sure Feedback"
echo "---"

FEEDBACK2=$(curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackType": "not_sure",
    "actorId": "test-operator-1",
    "workspaceId": "test-workspace",
    "page": "/my-day",
    "context": "Not clear what to do next"
  }')

echo "Request: POST /api/feedback (not_sure)"
echo "Response: $FEEDBACK2"

if echo "$FEEDBACK2" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Feedback captured${NC}"
  RESULTS="${RESULTS}[PASSED] Feedback Capture (not_sure)\n"
else
  echo -e "${RED}FAILED: Feedback capture failed${NC}"
  RESULTS="${RESULTS}[FAILED] Feedback Capture (not_sure)\n"
fi

echo ""
echo "Step 3: Need Help Feedback"
echo "---"

FEEDBACK3=$(curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackType": "need_help",
    "actorId": "test-operator-1",
    "workspaceId": "test-workspace",
    "page": "/my-day",
    "context": "Need guidance"
  }')

echo "Request: POST /api/feedback (need_help)"
echo "Response: $FEEDBACK3"

if echo "$FEEDBACK3" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Feedback captured${NC}"
  RESULTS="${RESULTS}[PASSED] Feedback Capture (need_help)\n"
else
  echo -e "${RED}FAILED: Feedback capture failed${NC}"
  RESULTS="${RESULTS}[FAILED] Feedback Capture (need_help)\n"
fi

echo ""
echo "Step 4: Unexpected Feedback"
echo "---"

FEEDBACK4=$(curl -s -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "feedbackType": "unexpected",
    "actorId": "test-operator-1",
    "workspaceId": "test-workspace",
    "page": "/my-day",
    "context": "Unexpected behavior"
  }')

echo "Request: POST /api/feedback (unexpected)"
echo "Response: $FEEDBACK4"

if echo "$FEEDBACK4" | grep -q '"success":true'; then
  echo -e "${GREEN}PASSED: Feedback captured${NC}"
  RESULTS="${RESULTS}[PASSED] Feedback Capture (unexpected)\n"
else
  echo -e "${RED}FAILED: Feedback capture failed${NC}"
  RESULTS="${RESULTS}[FAILED] Feedback Capture (unexpected)\n"
fi

# ============================================================================
# PHASE C: DAILY REPORT PROOF
# ============================================================================
echo ""
echo ""
echo "PHASE C: DAILY REPORT PROOF"
echo "==========================="

echo ""
echo "Step 1: Load Admin Dashboard"
echo "---"

DASHBOARD=$(curl -s http://localhost:3000/alpha/report)
echo "Request: GET /alpha/report"

if echo "$DASHBOARD" | grep -q "Alpha Daily Report"; then
  echo -e "${GREEN}PASSED: Dashboard loaded${NC}"
  RESULTS="${RESULTS}[PASSED] Daily Report Dashboard\n"
else
  echo -e "${RED}FAILED: Dashboard load failed${NC}"
  RESULTS="${RESULTS}[FAILED] Daily Report Dashboard\n"
fi

if echo "$DASHBOARD" | grep -q "Active Operators"; then
  echo -e "${GREEN}PASSED: Dashboard displays operators section${NC}"
else
  echo "Warning: Operators section not visible"
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo ""
echo "=== TEST SUMMARY ==="
echo -e "$RESULTS"

echo ""
echo "=== DATABASE VERIFICATION ==="
echo "Checking AuditEvent table for telemetry records..."
psql -U postgres -d opsiq -c "SELECT COUNT(*) as event_count FROM \"AuditEvent\" WHERE \"page\" = '/my-day' AND \"workspaceId\" = 'test-workspace';" 2>/dev/null || echo "(Database check skipped - DB not accessible)"

echo ""
echo "Checking OperatorFeedback table for feedback records..."
psql -U postgres -d opsiq -c "SELECT COUNT(*) as feedback_count FROM \"OperatorFeedback\" WHERE \"page\" = '/my-day' AND \"workspaceId\" = 'test-workspace';" 2>/dev/null || echo "(Database check skipped - DB not accessible)"

echo ""
echo "=== END OF R9 TEST SUITE ==="
