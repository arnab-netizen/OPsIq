-- Add hash chain columns and workspace isolation
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS workspace_id UUID;

-- Add indexes for efficient workspace-scoped audit queries
CREATE INDEX IF NOT EXISTS idx_audit_events_workspace_occurred_at ON audit_events(workspace_id, occurred_at);
