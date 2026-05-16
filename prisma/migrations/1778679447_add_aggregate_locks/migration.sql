-- Create aggregate locks table for serialized event number allocation
CREATE TABLE IF NOT EXISTS aggregate_locks (
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  workspace_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  PRIMARY KEY (aggregate_id, aggregate_type, workspace_id)
);

-- Index for workspace queries
CREATE INDEX IF NOT EXISTS idx_aggregate_locks_workspace ON aggregate_locks(workspace_id);

-- Add unique constraint on canonical_events to prevent duplicate eventNumbers
ALTER TABLE canonical_events 
ADD CONSTRAINT unique_event_number_per_aggregate 
UNIQUE (aggregate_id, aggregate_type, workspace_id, event_number);
