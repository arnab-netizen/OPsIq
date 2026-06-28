-- Jarvis 360 Slice 12 — deterministic memory key for runtime do-not-repeat matching.
ALTER TABLE "owner_decision_memories" ADD COLUMN IF NOT EXISTS "memory_key" TEXT;
CREATE INDEX IF NOT EXISTS "owner_decision_memories_ws_key_idx"
  ON "owner_decision_memories" ("workspace_id", "memory_key");
