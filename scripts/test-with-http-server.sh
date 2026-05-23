#!/bin/bash
# Test runner with HTTP server support
# Starts Next.js dev server, waits for readiness, runs tests, and cleans up

set -e

PORT=${TEST_PORT:-3000}
SERVER_URL="http://localhost:$PORT/api/health"
MAX_RETRIES=60
RETRY_DELAY=500

echo "🚀 Starting Next.js dev server on port $PORT..."

# Start the dev server in the background
npm run dev -- -p $PORT > /tmp/dev-server.log 2>&1 &
SERVER_PID=$!

echo "  Server PID: $SERVER_PID"

# Function to cleanup on exit
cleanup() {
  echo "Cleaning up..."
  if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
    wait $SERVER_PID 2>/dev/null || true
  fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Wait for server to be ready
echo "⏳ Waiting for server to be ready at $SERVER_URL..."
retry_count=0

while [ $retry_count -lt $MAX_RETRIES ]; do
  if curl -s -f "$SERVER_URL" > /dev/null 2>&1 || curl -s "$SERVER_URL" > /dev/null 2>&1; then
    echo "✓ Server is ready!"
    break
  fi

  retry_count=$((retry_count + 1))
  if [ $((retry_count % 10)) -eq 0 ]; then
    echo "  Still waiting... ($retry_count/$MAX_RETRIES)"
  fi
  sleep $(echo "scale=3; $RETRY_DELAY / 1000" | bc)s
done

if [ $retry_count -ge $MAX_RETRIES ]; then
  echo "✗ Server failed to start in time"
  cat /tmp/dev-server.log
  exit 1
fi

echo "🧪 Running tests with server at http://localhost:$PORT..."
TEST_API_URL="http://localhost:$PORT" npm run test:ci "$@"
