-- Add hash chain for audit integrity
ALTER TABLE audit_events ADD COLUMN previous_hash VARCHAR(64);
CREATE INDEX idx_audit_events_workspace_occurred_at ON audit_events(workspace_id, occurred_at);
