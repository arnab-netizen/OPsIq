#!/bin/bash

# For tests, copy SQLite schema to main location
if [ "$NODE_ENV" = "test" ] || [ -f ".env.test" ] && grep -q "file:.*test.db" .env.test; then
  cp prisma/schema.test.prisma prisma/schema.prisma 2>/dev/null || true
fi
