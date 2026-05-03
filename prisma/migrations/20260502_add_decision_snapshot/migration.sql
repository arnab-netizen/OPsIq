-- Add decision snapshot for determinism validation
CREATE TABLE decision_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL,
  decision_input JSONB NOT NULL,
  decision_output JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE
);

CREATE INDEX idx_decision_snapshots_engagement_id ON decision_snapshots(engagement_id);
CREATE INDEX idx_decision_snapshots_created_at ON decision_snapshots(created_at);
